// Binance 公共行情服务（REST + WebSocket，无需鉴权）。
// 仅访问公共市场数据端点；交易/账户类接口仍走本项目 src/api/client.ts（自建后端）。
//
// 注意：浏览器直连 binance.com 可能受地区网络限制，生产环境建议由后端/网关代理转发。

import type { Kline, KlineInterval, OrderBook, PublicTrade, Ticker } from "../types";

const REST_BASE = "https://api.binance.com";
const FAPI_BASE = "https://fapi.binance.com";

async function get<T>(
  path: string,
  params?: Record<string, string | number>,
  base: string = REST_BASE
): Promise<T> {
  const qs = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : "";
  const res = await fetch(`${base}${path}${qs}`);
  if (!res.ok) throw new Error(`Binance API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

/* ------------------------------ REST ------------------------------ */

interface RawTicker {
  symbol: string;
  lastPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  priceChange: string;
  priceChangePercent: string;
}

function mapTicker(r: RawTicker): Ticker {
  return {
    symbol: r.symbol,
    lastPrice: +r.lastPrice,
    openPrice: +r.openPrice,
    highPrice: +r.highPrice,
    lowPrice: +r.lowPrice,
    volume: +r.volume,
    quoteVolume: +r.quoteVolume,
    priceChange: +r.priceChange,
    priceChangePercent: +r.priceChangePercent,
  };
}

/** 批量拉取 24h Ticker */
export async function fetchTickers(symbols: string[]): Promise<Ticker[]> {
  const raw = await get<RawTicker[]>("/api/v3/ticker/24hr", { symbols: JSON.stringify(symbols) });
  return raw.map(mapTicker);
}

/** 拉取现货全市场 24h Ticker（不传 symbols 参数即返回全部交易对） */
export async function fetchAllTickers(): Promise<Ticker[]> {
  const raw = await get<RawTicker[]>("/api/v3/ticker/24hr");
  return raw.map(mapTicker);
}

/** 拉取 U 本位合约全市场 24h Ticker（字段名与现货 REST 一致） */
export async function fetchAllFuturesTickers(): Promise<Ticker[]> {
  const raw = await get<RawTicker[]>("/fapi/v1/ticker/24hr", undefined, FAPI_BASE);
  return raw.map(mapTicker);
}

interface RawExchangeInfo {
  symbols: { symbol: string; status: string; onboardDate?: number }[];
}

/** 各交易对上线时间（symbol -> onboardDate 毫秒），用于"新币上线"榜单。数据量大但基本不变，调用方应长缓存。 */
export async function fetchOnboardDates(): Promise<Record<string, number>> {
  const info = await get<RawExchangeInfo>("/api/v3/exchangeInfo");
  const out: Record<string, number> = {};
  for (const s of info.symbols) {
    if (s.status === "TRADING" && s.onboardDate) out[s.symbol] = s.onboardDate;
  }
  return out;
}

/** 拉取 K 线（默认最近 limit 根） */
export async function fetchKlines(
  symbol: string,
  interval: KlineInterval = "1m",
  limit = 500
): Promise<Kline[]> {
  const rows = await get<unknown[][]>("/api/v3/klines", { symbol, interval, limit });
  return rows.map((r) => ({
    time: r[0] as number,
    open: +(r[1] as string),
    high: +(r[2] as string),
    low: +(r[3] as string),
    close: +(r[4] as string),
    volume: +(r[5] as string),
  }));
}

/** 拉取盘口深度 */
export async function fetchDepth(symbol: string, limit = 20): Promise<OrderBook> {
  const d = await get<{ bids: [string, string][]; asks: [string, string][] }>("/api/v3/depth", {
    symbol,
    limit,
  });
  const toLevels = (ls: [string, string][]) =>
    ls.map(([p, q]) => [+p, +q] as [number, number]);
  return { bids: toLevels(d.bids), asks: toLevels(d.asks) };
}

/** 拉取最近公共成交（用于 RecentTrades 首屏种子数据，时间倒序） */
export async function fetchRecentTrades(symbol: string, limit = 30): Promise<PublicTrade[]> {
  const rows = await get<{ id: number; price: string; qty: string; time: number; isBuyerMaker: boolean }[]>(
    "/api/v3/trades",
    { symbol, limit }
  );
  return rows.map((r) => ({
    id: r.id,
    price: +r.price,
    qty: +r.qty,
    time: r.time,
    isBuyerMaker: r.isBuyerMaker,
  }));
}

/* --------------------------- WebSocket --------------------------- */

/** 流名构造器（Binance 组合流小写规则） */
export const klineStream = (symbol: string, interval: string) =>
  `${symbol.toLowerCase()}@kline_${interval}`;
export const depthStream = (symbol: string) => `${symbol.toLowerCase()}@depth10@100ms`;
export const tradeStream = (symbol: string) => `${symbol.toLowerCase()}@trade`;
export const tickerStream = (symbol: string) => `${symbol.toLowerCase()}@ticker`;

/* ------------------------- WS 事件解析器 ------------------------- */

interface RawKlineEvent {
  e: "kline";
  k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean };
}

export function parseKlineEvent(d: unknown): { kline: Kline; closed: boolean } | null {
  const e = d as RawKlineEvent;
  if (!e || e.e !== "kline" || !e.k) return null;
  return {
    kline: {
      time: e.k.t,
      open: +e.k.o,
      high: +e.k.h,
      low: +e.k.l,
      close: +e.k.c,
      volume: +e.k.v,
    },
    closed: Boolean(e.k.x),
  };
}

interface RawDepthEvent {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
}

export function parseDepthEvent(d: unknown): OrderBook | null {
  const e = d as RawDepthEvent;
  if (!e || !Array.isArray(e.bids) || !Array.isArray(e.asks)) return null;
  const toLevels = (ls: [string, string][]) => ls.map(([p, q]) => [+p, +q] as [number, number]);
  return { bids: toLevels(e.bids), asks: toLevels(e.asks) };
}

interface RawTradeEvent {
  e: "trade";
  t: number;
  p: string;
  q: string;
  T: number;
  m: boolean; // true=买方是挂单方（主动卖，红）；false=主动买（绿）
}

export function parseTradeEvent(d: unknown): PublicTrade | null {
  const e = d as RawTradeEvent;
  if (!e || e.e !== "trade") return null;
  return { id: e.t, price: +e.p, qty: +e.q, time: e.T, isBuyerMaker: e.m };
}

export function parseTickerEvent(d: unknown): Ticker | null {
  const e = d as Record<string, unknown>;
  if (!e || typeof e !== "object" || e.e !== "24hrTicker") return null;
  // WS @ticker 推送为短字段名（s/c/o/h/l/v/q/p/P），REST 为长字段名；此处归一化
  const r: RawTicker = {
    symbol: String(e.s ?? e.symbol ?? ""),
    lastPrice: String(e.c ?? e.lastPrice ?? ""),
    openPrice: String(e.o ?? e.openPrice ?? ""),
    highPrice: String(e.h ?? e.highPrice ?? ""),
    lowPrice: String(e.l ?? e.lowPrice ?? ""),
    volume: String(e.v ?? e.volume ?? ""),
    quoteVolume: String(e.q ?? e.quoteVolume ?? ""),
    priceChange: String(e.p ?? e.priceChange ?? ""),
    priceChangePercent: String(e.P ?? e.priceChangePercent ?? ""),
  };
  return mapTicker(r);
}

