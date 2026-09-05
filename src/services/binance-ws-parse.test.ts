import { describe, expect, it } from "vitest";
import { parseDepthEvent, parseKlineEvent, parseTickerEvent, parseTradeEvent } from "./binance";

describe("WS 解析器（Binance + Go 网关双格式）", () => {
  describe("parseKlineEvent", () => {
    it("解析 Binance WS kline 信封", () => {
      const result = parseKlineEvent({ e: "kline", k: { t: 1700000000000, o: "100", h: "102", l: "99", c: "101", v: "10", x: false } });
      expect(result).toEqual({ kline: { time: 1700000000000, open: 100, high: 102, low: 99, close: 101, volume: 10 }, closed: false });
    });

    it("解析 Go 网关 /market/kline/ws 的 BinanceKline 裸对象", () => {
      const result = parseKlineEvent({ t: 1700000000000, o: 100, h: 102, l: 99, c: 101, v: 10 });
      expect(result).toEqual({ kline: { time: 1700000000000, open: 100, high: 102, low: 99, close: 101, volume: 10 }, closed: false });
    });

    it("非 kline 格式返回 null", () => {
      expect(parseKlineEvent({ type: "trade", data: {} })).toBeNull();
    });
  });

  describe("parseDepthEvent", () => {
    it("解析 Binance WS depth 事件（[p,q] 数组）", () => {
      const result = parseDepthEvent({ lastUpdateId: 1, bids: [["100", "1"], ["99", "2"]], asks: [["101", "3"]] });
      expect(result).toEqual({ bids: [[100, 1], [99, 2]], asks: [[101, 3]] });
    });

    it("解析 Go 网关 depth 事件（[{price,volume}] 对象数组）", () => {
      const result = parseDepthEvent({ bids: [{ price: 100, volume: 1 }, { price: 99, volume: 2 }], asks: [{ price: 101, volume: 3 }] });
      expect(result).toEqual({ bids: [[100, 1], [99, 2]], asks: [[101, 3]] });
    });

    it("Go 信封包裹时剥出 data", () => {
      const result = parseDepthEvent({ type: "depth", symbol: "BTCUSDT", data: { bids: [{ price: 100, volume: 1 }], asks: [{ price: 101, volume: 2 }] } });
      expect(result?.bids).toEqual([[100, 1]]);
    });
  });

  describe("parseTradeEvent", () => {
    it("解析 Binance WS trade 事件", () => {
      const result = parseTradeEvent({ e: "trade", t: 12345, p: "100", q: "1.5", T: 1700000000000, m: true });
      expect(result).toEqual({ id: 12345, price: 100, qty: 1.5, time: 1700000000000, isBuyerMaker: true });
    });

    it("解析 Go 网关 trade 事件（侧边字段 + ts 作 id）", () => {
      const result = parseTradeEvent({ price: 100, qty: 1.5, side: "sell", ts: 1700000000001 });
      expect(result).toEqual({ id: 1700000000001, price: 100, qty: 1.5, time: 1700000000001, isBuyerMaker: true });
    });

    it("Go 信封包裹时剥出 data", () => {
      const result = parseTradeEvent({ type: "trade", symbol: "BTCUSDT", data: { price: 100, qty: 1, side: "buy", ts: 1 } });
      expect(result).toEqual({ id: 1, price: 100, qty: 1, time: 1, isBuyerMaker: false });
    });
  });

  describe("parseTickerEvent", () => {
    it("解析 Binance WS @ticker 事件", () => {
      const result = parseTickerEvent({ e: "24hrTicker", s: "BTCUSDT", c: "100", o: "95", h: "102", l: "94", v: "10", q: "1000", p: "5", P: "5.26" });
      expect(result).toEqual(expect.objectContaining({ symbol: "BTCUSDT", lastPrice: 100, openPrice: 95 }));
    });

    it("解析 Go 网关 ticker 事件（GoTicker 结构）", () => {
      const result = parseTickerEvent({ symbol: "BTCUSDT", last: 100, best_bid: 99.9, best_ask: 100.1, open_24h: 95, high_24h: 102, low_24h: 94, volume_24h: 10, timestamp: 1700000000000 });
      expect(result).toEqual(expect.objectContaining({ symbol: "BTCUSDT", lastPrice: 100, openPrice: 95 }));
    });

    it("Go 信封包裹时剥出 data", () => {
      const result = parseTickerEvent({ type: "ticker", symbol: "BTCUSDT", data: { symbol: "BTCUSDT", last: 100, best_bid: 99, best_ask: 101, open_24h: 95, high_24h: 102, low_24h: 94, volume_24h: 10, timestamp: 0 } });
      expect(result).toBeTruthy();
      expect(result!.symbol).toBe("BTCUSDT");
    });

    it("非 ticker 格式返回 null", () => {
      expect(parseTickerEvent({ type: "trade", data: {} })).toBeNull();
    });
  });
});
