import { describe, expect, it } from "vitest";
import {
  MMR,
  calcLiquidationPrice,
  calcMaintenanceMargin,
  calcMarginRatio,
  calcPnl,
  calcPositionRisk,
  calcRoe,
  maintenanceMarginRate,
  parseMarginMode,
  parsePosSide,
} from "./futures-math";
import { DEFAULT_LEVERAGE, crossPoolOf, leverageOf, marginModeOf, useFuturesStore } from "../store/futures-store";

describe("futures-math", () => {
  it("calcPnl：多头/空头方向正确", () => {
    expect(calcPnl("long", 50_000, 52_000, 1)).toBe(2_000);
    expect(calcPnl("short", 50_000, 52_000, 1)).toBe(-2_000);
    expect(calcPnl("long", 0, 52_000, 1)).toBe(0);
  });

  it("calcRoe：杠杆放大收益率", () => {
    // 多头 50000 -> 55000 = +10% 现货，20x 杠杆 ROE = +200%
    expect(calcRoe("long", 50_000, 55_000, 20)).toBeCloseTo(200, 6);
    // 空头 50000 -> 45000 = +10% 现货
    expect(calcRoe("short", 50_000, 45_000, 10)).toBeCloseTo(100, 6);
    expect(calcRoe("long", 50_000, 45_000, 20)).toBeCloseTo(-200, 6);
  });

  it("maintenanceMarginRate：按名义价值分档", () => {
    expect(maintenanceMarginRate(50_000)).toBe(0.005);
    expect(maintenanceMarginRate(100_000)).toBe(0.005);
    expect(maintenanceMarginRate(100_001)).toBe(0.01);
    expect(maintenanceMarginRate(5_000_000)).toBe(0.02);
    expect(maintenanceMarginRate(5_000_001)).toBe(0.025);
    expect(maintenanceMarginRate(0)).toBe(MMR);
  });

  it("calcMaintenanceMargin：维持保证金随档位跃升", () => {
    expect(calcMaintenanceMargin(100_000)).toBeCloseTo(500, 6);
    expect(calcMaintenanceMargin(200_000)).toBeCloseTo(2_000, 6);
  });

  it("calcLiquidationPrice：多头低于开仓价、空头高于开仓价", () => {
    // 20x、名义 50000（<100k，MMR=0.5%）；保证金 = 50000/20 = 2500
    const liqLong = calcLiquidationPrice("long", 50_000, 1, 2_500);
    const liqShort = calcLiquidationPrice("short", 50_000, 1, 2_500);
    // long: (50000 - 2500)/(1-0.005) = 47738.69
    expect(liqLong).toBeCloseTo(47_738.693, 2);
    // short: (2500 + 50000)/(1+0.005) = 52238.81
    expect(liqShort).toBeCloseTo(52_238.806, 2);
    // 保证金越厚越难被强平
    expect(calcLiquidationPrice("long", 50_000, 1, 10_000)).toBeLessThan(liqLong);
    expect(calcLiquidationPrice("short", 50_000, 1, 10_000)).toBeGreaterThan(liqShort);
  });

  it("calcLiquidationPrice：强平价处保证金率恰好为 100%", () => {
    const entry = 50_000;
    const qty = 1;
    const margin = 2_500;
    for (const side of ["long", "short"] as const) {
      const liq = calcLiquidationPrice(side, entry, qty, margin);
      const pnl = calcPnl(side, entry, liq, qty);
      const ratio = calcMarginRatio(calcMaintenanceMargin(liq * qty), margin + pnl);
      expect(ratio).toBeCloseTo(100, 6);
    }
  });

  it("calcMarginRatio：盈利降低保证金率，爆仓时为 Infinity", () => {
    const im = 2_500; // 50000*1/20
    const mm = calcMaintenanceMargin(50_000); // 250
    expect(calcMarginRatio(mm, im)).toBeCloseTo((50_000 * 0.005) / im * 100, 6);
    expect(calcMarginRatio(mm, im + 2_500)).toBeLessThan(calcMarginRatio(mm, im));
    expect(calcMarginRatio(mm, 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("parsePosSide / parseMarginMode：兼容 Go 数字枚举与 mock 字符串", () => {
    expect(parsePosSide(0)).toBe("long");
    expect(parsePosSide(1)).toBe("short");
    expect(parsePosSide("long")).toBe("long");
    expect(parsePosSide("short")).toBe("short");
    expect(parseMarginMode(0)).toBe("isolated");
    expect(parseMarginMode(1)).toBe("cross");
    expect(parseMarginMode("cross")).toBe("cross");
    expect(parseMarginMode("isolated")).toBe("isolated");
    expect(parseMarginMode(undefined)).toBe("isolated");
  });
});

describe("futures-math：逐仓 vs 全仓", () => {
  const base = {
    side: "long" as const,
    entryPrice: 50_000,
    qty: 1,
    markPrice: 50_000,
    leverage: 20,
  };

  it("全仓余额池越厚，强平价越远离开仓价（逐仓不受影响）", () => {
    const isolated = calcPositionRisk({ ...base, positionMargin: 2_500, mode: "isolated", crossPool: 0, otherPnl: 0, otherNotional: 0 });
    const crossSmall = calcPositionRisk({ ...base, positionMargin: 0, mode: "cross", crossPool: 2_500, otherPnl: 0, otherNotional: 0 });
    const crossBig = calcPositionRisk({ ...base, positionMargin: 0, mode: "cross", crossPool: 20_000, otherPnl: 0, otherNotional: 0 });

    // 池余额与逐仓保证金相同时，两者结果一致
    expect(crossSmall.liquidationPrice).toBeCloseTo(isolated.liquidationPrice, 6);
    // 池更厚 → 多头强平价更低（更抗跌）
    expect(crossBig.liquidationPrice).toBeLessThan(crossSmall.liquidationPrice);
    expect(crossBig.marginRatio).toBeLessThan(crossSmall.marginRatio);
  });

  it("同池其他腿的浮亏会恶化本腿强平价，浮盈则改善", () => {
    const solo = calcPositionRisk({ ...base, positionMargin: 0, mode: "cross", crossPool: 5_000, otherPnl: 0, otherNotional: 0 });
    const withLoss = calcPositionRisk({ ...base, positionMargin: 0, mode: "cross", crossPool: 5_000, otherPnl: -3_000, otherNotional: 10_000 });
    const withProfit = calcPositionRisk({ ...base, positionMargin: 0, mode: "cross", crossPool: 5_000, otherPnl: 3_000, otherNotional: 10_000 });

    expect(withLoss.liquidationPrice).toBeGreaterThan(solo.liquidationPrice);
    expect(withProfit.liquidationPrice).toBeLessThan(solo.liquidationPrice);
  });

  it("其他腿的名义价值会计入维持保证金", () => {
    const solo = calcPositionRisk({ ...base, positionMargin: 0, mode: "cross", crossPool: 5_000, otherPnl: 0, otherNotional: 0 });
    const hedged = calcPositionRisk({ ...base, positionMargin: 0, mode: "cross", crossPool: 5_000, otherPnl: 0, otherNotional: 50_000 });
    expect(hedged.maintenanceMargin).toBeGreaterThan(solo.maintenanceMargin);
    expect(hedged.marginRatio).toBeGreaterThan(solo.marginRatio);
  });

  it("逐仓忽略 crossPool 与 otherPnl，仓位之间互不影响", () => {
    const a = calcPositionRisk({ ...base, positionMargin: 2_500, mode: "isolated", crossPool: 99_999, otherPnl: -99_999, otherNotional: 99_999 });
    const b = calcPositionRisk({ ...base, positionMargin: 2_500, mode: "isolated", crossPool: 0, otherPnl: 0, otherNotional: 0 });
    expect(a.liquidationPrice).toBeCloseTo(b.liquidationPrice, 6);
    expect(a.marginRatio).toBeCloseTo(b.marginRatio, 6);
  });

  it("全仓池缺失时回退到杠杆反推保证金，而非算出立即强平", () => {
    // 全仓 Position.Margin 恒为 0，若直接用 0 会得到荒谬结果
    const fallback = calcPositionRisk({ ...base, positionMargin: 0, mode: "cross", crossPool: 0, otherPnl: 0, otherNotional: 0 });
    const isolated = calcPositionRisk({ ...base, positionMargin: 2_500, mode: "isolated", crossPool: 0, otherPnl: 0, otherNotional: 0 });
    expect(fallback.liquidationPrice).toBeCloseTo(isolated.liquidationPrice, 6);
    expect(Number.isFinite(fallback.marginRatio)).toBe(true);
  });

  it("空头全仓：池越厚强平价越高", () => {
    const small = calcPositionRisk({ ...base, side: "short", positionMargin: 0, mode: "cross", crossPool: 2_500, otherPnl: 0, otherNotional: 0 });
    const big = calcPositionRisk({ ...base, side: "short", positionMargin: 0, mode: "cross", crossPool: 20_000, otherPnl: 0, otherNotional: 0 });
    expect(big.liquidationPrice).toBeGreaterThan(small.liquidationPrice);
  });
});

describe("futures-store", () => {
  it("open/close 持仓流转", () => {
    const s0 = useFuturesStore.getState();
    s0.open({ userId: 1, symbol: "BTCUSDT", side: "long", leverage: 20, marginMode: "isolated", entryPrice: 50_000, qty: 0.1, margin: 250 });
    const s1 = useFuturesStore.getState();
    expect(s1.positions).toHaveLength(s0.positions.length + 1);
    const id = s1.positions[0].id;
    s1.close(id);
    expect(useFuturesStore.getState().positions.find((p) => p.id === id)).toBeUndefined();
  });

  it("setLeverage 夹取 1-125 并按交易对记忆", () => {
    useFuturesStore.getState().setLeverage("ETHUSDT", 300);
    expect(useFuturesStore.getState().leverageBySymbol["ETHUSDT"]).toBe(125);
    useFuturesStore.getState().setLeverage("ETHUSDT", 0);
    expect(useFuturesStore.getState().leverageBySymbol["ETHUSDT"]).toBe(1);
  });

  it("缺省杠杆 20x / 缺省逐仓", () => {
    const st = useFuturesStore.getState();
    expect(leverageOf(st, "XYZUSDT")).toBe(DEFAULT_LEVERAGE);
    expect(marginModeOf(st, "XYZUSDT")).toBe("isolated");
  });

  it("crossPoolOf 按 userID 取共享池（Go 的 key 是 userID 字符串）", () => {
    useFuturesStore.getState().setCrossBalances({ "1001": 8_000 });
    const st = useFuturesStore.getState();
    expect(crossPoolOf(st, 1001)).toBe(8_000);
    expect(crossPoolOf(st, "1001")).toBe(8_000);
    expect(crossPoolOf(st, 1002)).toBe(0);
    expect(crossPoolOf(st, null)).toBe(0);
    useFuturesStore.getState().setCrossBalances({});
  });

  it("setTpSl 更新止盈止损", () => {
    const st = useFuturesStore.getState();
    st.open({ userId: 1, symbol: "BTCUSDT", side: "short", leverage: 10, marginMode: "cross", entryPrice: 60_000, qty: 0.05, margin: 300 });
    const pos = useFuturesStore.getState().positions[0];
    st.setTpSl(pos.id, 55_000, 63_000);
    const updated = useFuturesStore.getState().positions.find((p) => p.id === pos.id)!;
    expect(updated.tp).toBe(55_000);
    expect(updated.sl).toBe(63_000);
    useFuturesStore.getState().close(pos.id);
  });
});
