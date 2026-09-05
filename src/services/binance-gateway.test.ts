import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchDepth,
  fetchKlines,
  fetchRecentTrades,
  mapGoTicker,
} from "./binance";

// 网关适配层测试：验证 Go 网关（internal/market/market.go）返回结构经适配后
// 能被前端 Ticker/Kline/OrderBook/PublicTrade 直接消费。
// VITE_MARKET_BASE 默认 /api/v1/market，因此以下调用走的都是网关分支（不回直连 Binance）。

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => json,
    })
  );
}

describe("mapGoTicker", () => {
  it("映射 Go Ticker 字段并派生价格涨跌", () => {
    const t = mapGoTicker({
      symbol: "BTCUSDT",
      last: 100,
      best_bid: 99.9,
      best_ask: 100.1,
      open_24h: 95,
      high_24h: 101,
      low_24h: 94,
      volume_24h: 10,
      timestamp: 1700000000000,
    });
    expect(t.symbol).toBe("BTCUSDT");
    expect(t.lastPrice).toBe(100);
    expect(t.openPrice).toBe(95);
    expect(t.highPrice).toBe(101);
    expect(t.lowPrice).toBe(94);
    expect(t.volume).toBe(10);
    expect(t.priceChange).toBeCloseTo(5);
    expect(t.priceChangePercent).toBeCloseTo(5.263, 2);
    // quoteVolume 后端不提供，按 last*volume 近似
    expect(t.quoteVolume).toBeCloseTo(1000);
  });

  it("open_24h 为 0 时回退用 last 兜底避免除零", () => {
    const t = mapGoTicker({
      symbol: "BTCUSDT",
      last: 100,
      best_bid: 99.9,
      best_ask: 100.1,
      open_24h: 0,
      high_24h: 0,
      low_24h: 0,
      volume_24h: 0,
      timestamp: 0,
    });
    expect(t.priceChange).toBe(0);
    expect(t.priceChangePercent).toBe(0);
  });
});

describe("网关 REST 分支", () => {
  it("fetchKlines 解析 Go 的 {t,o,h,l,c,v} 对象数组", async () => {
    stubFetch([
      { t: 1700000000000, o: 100, h: 101, l: 99, c: 100.5, v: 12 },
      { t: 1700000060000, o: 100.5, h: 102, l: 100, c: 101, v: 20 },
    ]);
    const kl = await fetchKlines("BTCUSDT", "1m", 2);
    expect(kl).toEqual([
      { time: 1700000000000, open: 100, high: 101, low: 99, close: 100.5, volume: 12 },
      { time: 1700000060000, open: 100.5, high: 102, low: 100, close: 101, volume: 20 },
    ]);
  });

  it("fetchDepth 解析 Go 的 {price,volume} 档位数组", async () => {
    stubFetch({
      symbol: "BTCUSDT",
      bids: [{ price: 100, volume: 1 }, { price: 99, volume: 2 }],
      asks: [{ price: 101, volume: 3 }],
      ts: 1700000000000,
    });
    const d = await fetchDepth("BTCUSDT", 20);
    expect(d).toEqual({
      bids: [[100, 1], [99, 2]],
      asks: [[101, 3]],
    });
  });

  it("fetchRecentTrades 用 ts 充当无 id 成交的去重键", async () => {
    stubFetch([
      { symbol: "BTCUSDT", price: 100, qty: 1, side: "sell", ts: 1700000000001 },
      { symbol: "BTCUSDT", price: 100.5, qty: 2, side: "buy", ts: 1700000000002 },
    ]);
    const trades = await fetchRecentTrades("BTCUSDT", 10);
    expect(trades).toEqual([
      { id: 1700000000001, price: 100, qty: 1, time: 1700000000001, isBuyerMaker: true },
      { id: 1700000000002, price: 100.5, qty: 2, time: 1700000000002, isBuyerMaker: false },
    ]);
  });

  it("兼容 mock 网关的 {code,message,data} 包裹形态", async () => {
    // mock 网关 ok() 用的即是 {code:0,message:'ok',data}，Go 网关则返回裸数组
    stubFetch({ code: 0, message: "ok", data: [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }] });
    const kl = await fetchKlines("BTCUSDT", "1m", 1);
    expect(kl).toHaveLength(1);
    expect(kl[0].time).toBe(1);
  });

  it("网关异常时抛出带状态的错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({}),
      })
    );
    await expect(fetchKlines("BTCUSDT", "1m", 1)).rejects.toThrow("Market API 502");
  });
});