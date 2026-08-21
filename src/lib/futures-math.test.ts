import { describe, expect, it } from "vitest";
import { calcLiquidationPrice, calcMarginRatio, calcPnl, calcRoe } from "./futures-math";
import { DEFAULT_LEVERAGE, leverageOf, marginModeOf, useFuturesStore } from "../store/futures-store";

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

  it("calcLiquidationPrice：多头低于开仓价、空头高于开仓价", () => {
    const liqLong = calcLiquidationPrice("long", 50_000, 20);
    const liqShort = calcLiquidationPrice("short", 50_000, 20);
    // long: 50000*(1-0.05+0.005)=47750；short: 50000*(1+0.05-0.005)=52250
    expect(liqLong).toBeCloseTo(47_750, 6);
    expect(liqShort).toBeCloseTo(52_250, 6);
    // 杠杆越高强平价越接近开仓价
    expect(calcLiquidationPrice("long", 50_000, 125)).toBeGreaterThan(calcLiquidationPrice("long", 50_000, 20));
  });

  it("calcMarginRatio：盈利降低保证金率，爆仓时为 Infinity", () => {
    const im = 2_500; // 50000*1/20
    const mmNotional = 50_000;
    expect(calcMarginRatio(0, im, mmNotional)).toBeCloseTo((mmNotional * 0.005) / im * 100, 6);
    expect(calcMarginRatio(2_500, im, mmNotional)).toBeLessThan(calcMarginRatio(0, im, mmNotional));
    expect(calcMarginRatio(-2_500, im, mmNotional)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("futures-store", () => {
  it("open/close 持仓流转", () => {
    const s0 = useFuturesStore.getState();
    s0.open({ symbol: "BTCUSDT", side: "long", leverage: 20, marginMode: "isolated", entryPrice: 50_000, qty: 0.1, margin: 250 });
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

  it("setTpSl 更新止盈止损", () => {
    const st = useFuturesStore.getState();
    st.open({ symbol: "BTCUSDT", side: "short", leverage: 10, marginMode: "cross", entryPrice: 60_000, qty: 0.05, margin: 300 });
    const pos = useFuturesStore.getState().positions[0];
    st.setTpSl(pos.id, 55_000, 63_000);
    const updated = useFuturesStore.getState().positions.find((p) => p.id === pos.id)!;
    expect(updated.tp).toBe(55_000);
    expect(updated.sl).toBe(63_000);
    useFuturesStore.getState().close(pos.id);
  });
});
