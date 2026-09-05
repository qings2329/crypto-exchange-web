// 公共行情服务（REST + WebSocket，无需鉴权）。
// 仅访问公共市场数据端点；交易/账户类接口仍走本项目 src/api/client.ts（自建后端）。
//
// 行情来源策略：
// - 设置 VITE_MARKET_BASE（默认 /api/v1/market，经 Vite /api 代理转发到本项目 Go 网关
//   cmd/gateway internal/market）时，K 线/深度/成交/Ticker 全部走自建后端，不再直连 Binance；
// - 留空（VITE_MARKET_BASE=""）则回退直连 Binance；
// - 后端暂无对应端点的能力（合约 24h Ticker、premiumIndex 标记价、exchangeInfo 上线时间）
//   始终调用 Binance FAPI/REST。
//
// Go 网关行情端点返回裸 JSON（部分 mock 网关会用 {code,message,data} 包裹），
// 这里通过 unwrap 兼容两种形态，字段名按 internal/market/market.go 的 Go 结构适配。

import type { Kline, KlineInterval, OrderBook, PublicTrade, Ticker } from "../types";

const REST_BASE = "https://api.binance.com";
const FAPI_BASE = "https://fapi.binance.com";

/** 本地市场网关根路径；未显式置空时优先走自建后端。 */
const MARKET_BASE = (import.meta.env.VITE_MARKET_BASE as string | undefined) ?? "/api/v1/market";

/** mock 网关会用 {code,message,data} 包裹响应；Go 网关返回裸数据，此处兼容两者。 */
function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === "object" && "data" in raw && "code" in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

async function get<T>(
  path: string,
  params?: Record<string, string | number>,
  base: string = REST_BASE
): Promise<T> {
  const qs = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : "";
  const res = await fetch(`${base}${path}${qs}`);
  if (!res.ok) throw new Error(`Market API ${res.status}: ${path}`);
  return unwrap<T>(await res.json());
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

/** Go 网关 internal/market/market.go 的 Ticker 快照。 */
interface GoTicker {
  symbol: string;
  last: number;
  best_bid: number;
  best_ask: number;
  open_24h: number;
  high_24h: number;
  low_24h: number;
  volume_24h: number;
  timestamp: number;
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

/** 把 Go 网关 Ticker 适配为前端 Ticker。后端不提供 quote 成交额字段，按 last×volume 近似。 */
export function mapGoTicker(r: GoTicker): Ticker {
  const openPrice = r.open_24h > 0 ? r.open_24h : r.last;
  const priceChange = r.last - openPrice;
  return {
    symbol: r.symbol,
    lastPrice: r.last,
    openPrice,
    highPrice: r.high_24h,
    lowPrice: r.low_24h,
    volume: r.volume_24h,
    quoteVolume: r.last * r.volume_24h,
    priceChange,
    priceChangePercent: openPrice !== 0 ? (priceChange / openPrice) * 100 : 0,
  };
}

interface GoDepthLevel {
  price: number;
  volume: number;
}

interface GoRecentTrade {
  symbol: string;
  price: number;
  qty: number;
  side: "buy" | "sell";
  ts: number;
}

interface GoKline {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** 批量拉取 24h Ticker（网关模式走 /api/v1/market/ticker 全量后按 symbol 过滤）。 */
export async function fetchTickers(symbols: string[]): Promise<Ticker[]> {
  if (MARKET_BASE) {
    const raw = await get<GoTicker[]>(`${MARKET_BASE}/ticker`);
    const want = new Set(symbols);
    return raw.filter((r) => want.has(r.symbol)).map(mapGoTicker);
  }
  const raw = await get<RawTicker[]>("/api/v3/ticker/24hr", { symbols: JSON.stringify(symbols) });
  return raw.map(mapTicker);
}

/** 拉取现货全市场 24h Ticker（不传 symbols 参数即返回全部交易对） */
export async function fetchAllTickers(): Promise<Ticker[]> {
  if (MARKET_BASE) {
    const raw = await get<GoTicker[]>(`${MARKET_BASE}/ticker`);
    return raw.map(mapGoTicker);
  }
  const raw = await get<RawTicker[]>("/api/v3/ticker/24hr");
  return raw.map(mapTicker);
}

/** 拉取 U 本位合约全市场 24h Ticker（网关暂无合约行情端点，直连 Binance FAPI） */
export async function fetchAllFuturesTickers(): Promise<Ticker[]> {
  const raw = await get<RawTicker[]>("/fapi/v1/ticker/24hr", undefined, FAPI_BASE);
  return raw.map(mapTicker);
}

export interface PremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  interestRate: string;
  nextFundingTime: number;
  time: number;
}

/** 拉取 U 本位合约标记价/指数价/资金费率（premiumIndex）。网关暂无对应端点，直连 Binance FAPI。 */
export async function fetchPremiumIndex(symbol: string): Promise<PremiumIndex> {
  return get<PremiumIndex>("/fapi/v1/premiumIndex", { symbol }, FAPI_BASE);
}

interface RawExchangeInfo {
  symbols: { symbol: string; status: string; onboardDate?: number }[];
}

/** 各交易对上线时间（symbol -> onboardDate 毫秒），用于"新币上线"榜单。网关暂无 exchangeInfo，直连 Binance。 */
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
  if (MARKET_BASE) {
    // Go 网关 /api/v1/market/kline 兼容端点：返回 [{t,o,h,l,c,v}] 数组
    const rows = await get<GoKline[]>(`${MARKET_BASE}/kline`, { symbol, interval, limit });
    return rows.map((r) => ({
      time: r.t,
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }));
  }
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
  if (MARKET_BASE) {
    // Go 网关 /api/v1/market/depth：bids/asks 为 [{price,volume}] 档位数组
    const d = await get<{ symbol: string; bids: GoDepthLevel[]; asks: GoDepthLevel[]; ts: number }>(
      `${MARKET_BASE}/depth`,
      { symbol, limit }
    );
    const toLevels = (ls: GoDepthLevel[]) => ls.map((l) => [+l.price, +l.volume] as [number, number]);
    return { bids: toLevels(d.bids), asks: toLevels(d.asks) };
  }
  const d = await get<{ bids: [string, string][]; asks: [string, string][] }>("/api/v3/depth", {
    symbol,
    limit,
  });
  const toLevels = (ls: [string, string][]) =>
    ls.map(([p, q]) => [+p, +q] as [number, number]);
  return { bids: toLevels(d.bids), asks: toLevels(d.asks) };
}

/** 拉取最近公共成交（用于 RecentTrades 首屏种子数据。Go 网关成交无独立 id，用 ts 充当去重键） */
export async function fetchRecentTrades(symbol: string, limit = 30): Promise<PublicTrade[]> {
  if (MARKET_BASE) {
    const rows = await get<GoRecentTrade[]>(`${MARKET_BASE}/trades`, { symbol, limit });
    return rows.map((r) => ({
      id: r.ts,
      price: +r.price,
      qty: +r.qty,
      time: r.ts,
      isBuyerMaker: r.side === "sell",
    }));
  }
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

