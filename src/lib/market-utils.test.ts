import { describe, expect, it } from "vitest";
import { baseAsset, coinName, fuzzyFilter, sortTickers } from "./market-utils";
import type { Ticker } from "../types";

const t = (symbol: string, lastPrice: number, priceChangePercent: number, quoteVolume: number): Ticker => ({
  symbol,
  lastPrice,
  openPrice: lastPrice / (1 + priceChangePercent / 100),
  highPrice: lastPrice * 1.01,
  lowPrice: lastPrice * 0.99,
  volume: quoteVolume / lastPrice,
  quoteVolume,
  priceChange: lastPrice - lastPrice / (1 + priceChangePercent / 100),
  priceChangePercent,
});

const ROWS = [
  t("BTCUSDT", 75000, 2.5, 1_000_000_000),
  t("ETHUSDT", 3500, -1.2, 500_000_000),
  t("SOLUSDT", 180, 8.8, 300_000_000),
  t("PEPEUSDT", 0.00001, 15.0, 50_000_000),
];

describe("baseAsset / coinName", () => {
  it("剥离常见计价资产", () => {
    expect(baseAsset("BTCUSDT")).toBe("BTC");
    expect(baseAsset("ETHFDUSD")).toBe("ETH");
    expect(baseAsset("XYZABC")).toBe("XYZABC");
  });

  it("有映射返回全名，无映射回退代码", () => {
    expect(coinName("BTCUSDT")).toBe("Bitcoin");
    expect(coinName("ZZZUSDT")).toBe("ZZZ");
  });
});

describe("fuzzyFilter", () => {
  it("按代码子串匹配（大小写不敏感）", () => {
    expect(fuzzyFilter(ROWS, "btc").map((r) => r.symbol)).toEqual(["BTCUSDT"]);
    expect(fuzzyFilter(ROWS, "USDT")).toHaveLength(4);
  });

  it("按代币全名匹配", () => {
    expect(fuzzyFilter(ROWS, "bitcoin").map((r) => r.symbol)).toEqual(["BTCUSDT"]);
  });

  it("空串/空白返回全部", () => {
    expect(fuzzyFilter(ROWS, "  ")).toHaveLength(4);
  });
});

describe("sortTickers", () => {
  it("涨跌幅降序：涨幅榜", () => {
    const out = sortTickers(ROWS, { key: "change", dir: -1 });
    expect(out.map((r) => r.symbol)).toEqual(["PEPEUSDT", "SOLUSDT", "BTCUSDT", "ETHUSDT"]);
  });

  it("价格升序", () => {
    const out = sortTickers(ROWS, { key: "price", dir: 1 });
    expect(out[0].symbol).toBe("PEPEUSDT");
    expect(out[out.length - 1].symbol).toBe("BTCUSDT");
  });

  it("成交额降序且不修改入参", () => {
    const out = sortTickers(ROWS, { key: "volume", dir: -1 });
    expect(out[0].symbol).toBe("BTCUSDT");
    expect(ROWS[0].symbol).toBe("BTCUSDT");
  });
});
