// Binance 公共行情服务（REST + WebSocket，无需鉴权）。
// 仅访问公共市场数据端点；交易/账户类接口仍走本项目 src/api/client.ts（自建后端）。
//
// 注意：浏览器直连 binance.com 可能受地区网络限制，生产环境建议由后端/网关代理转发。

import type { Kline, KlineInterval, OrderBook, Ticker } from "../types";

const REST_BASE = "https://api.binance.com";
const WS_BASE = "wss://stream.binance.com:9443/stream";

async function get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const qs = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}` : "";
  const res = await fetch(`${REST_BASE}${path}${qs}`);
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

/* --------------------------- WebSocket --------------------------- */

export interface StreamHandlers {
  onTicker?: (t: Ticker) => void;
  onKline?: (k: Kline, isClosed: boolean) => void;
}

export interface MarketStream {
  close: () => void;
}

/**
 * 订阅组合行情流（ticker + kline），带指数退避自动重连。
 * @param streams 形如 ["btcusdt@ticker", "ethusdt@ticker", "btcusdt@kline_1m"]
 */
export function subscribeStreams(streams: string[], handlers: StreamHandlers): MarketStream {
  const url = `${WS_BASE}?streams=${streams.join("/")}`;
  let ws: WebSocket | null = null;
  let retry = 0;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen = () => (retry = 0);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { data?: Record<string, unknown>; stream?: string };
        const d = msg.data;
        if (!d) return;
        if (d.e === "24hrTicker") {
          handlers.onTicker?.(mapTicker(d as unknown as RawTicker));
        } else if (d.e === "kline") {
          const k = d.k as Record<string, unknown>;
          handlers.onKline?.(
            {
              time: k.t as number,
              open: +(k.o as string),
              high: +(k.h as string),
              low: +(k.l as string),
              close: +(k.c as string),
              volume: +(k.v as string),
            },
            Boolean(k.x)
          );
        }
      } catch {
        /* 忽略无法解析的报文 */
      }
    };
    ws.onclose = () => {
      if (closed) return;
      const delay = Math.min(1000 * 2 ** retry++, 30_000);
      timer = setTimeout(connect, delay);
    };
    ws.onerror = () => ws?.close();
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    },
  };
}
