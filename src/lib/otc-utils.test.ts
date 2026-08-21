import { describe, expect, it } from "vitest";
import { ADS } from "../store/otc-store";
import { filterAds, fmtCountdown, qtyFromTotal, sortAds, totalFromQty } from "./otc-utils";

const priced = new Map(ADS.map((a) => [a.id, a.premium])); // 用溢价代替单价做排序测试

describe("otc-utils", () => {
  it("filterAds：方向/币种/法币/支付方式/金额区间", () => {
    const r = filterAds(ADS, { side: "buy", coin: "USDT", fiat: "CNY", method: "all" });
    expect(r.length).toBe(4);
    expect(r.every((a) => a.side === "buy" && a.coin === "USDT" && a.fiat === "CNY")).toBe(true);

    const wechat = filterAds(ADS, { side: "buy", coin: "USDT", fiat: "CNY", method: "wechat" });
    expect(wechat.map((a) => a.id)).toEqual(["OTC-002", "OTC-004"]);

    const amt = filterAds(ADS, { side: "buy", coin: "USDT", fiat: "CNY", method: "all", amount: 300 });
    // OTC-001 [100,50000] ✓ / OTC-002 [500,…] ✗ / OTC-003 [1000,…] ✗ / OTC-004 [100,8000] ✓
    expect(amt.map((a) => a.id)).toEqual(["OTC-001", "OTC-004"]);
  });

  it("sortAds：买入升序、卖出降序", () => {
    const buys = sortAds(filterAds(ADS, { side: "buy", coin: "USDT", fiat: "CNY", method: "all" }), priced);
    expect(buys[0].id).toBe("OTC-001"); // -0.3 最低
    const sells = sortAds(filterAds(ADS, { side: "sell", coin: "USDT", fiat: "CNY", method: "all" }), priced);
    expect(sells[0].id).toBe("OTC-009"); // 0.8 最高
  });

  it("fmtCountdown：mm:ss 与过期钳零", () => {
    expect(fmtCountdown(14 * 60 * 1000 + 32_000)).toBe("14:32");
    expect(fmtCountdown(5_000)).toBe("00:05");
    expect(fmtCountdown(-1000)).toBe("00:00"); // 过期钳零
  });

  it("金额↔数量互算（qty 两位小数）", () => {
    expect(qtyFromTotal(71600, 7.16)).toBe(10000);
    expect(qtyFromTotal(100, 7.16)).toBe(13.96); // 向下取整
    expect(totalFromQty(2.5, 7.16)).toBe(17.89); // 浮点向下取整
    expect(qtyFromTotal(0, 7.16)).toBe(0);
    expect(totalFromQty(1, 0)).toBe(0);
  });
});
