// 行情状态（Zustand）：自选列表 + 最新 Ticker 缓存。
// 高频 WS 推送只写 store，组件按 symbol 订阅切片，避免全局重渲染。

import { create } from "zustand";
import type { Ticker } from "../types";

interface MarketState {
  watchlist: string[];
  tickers: Record<string, Ticker>;
  toggleWatch: (symbol: string) => void;
  setTicker: (t: Ticker) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  watchlist: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"],
  tickers: {},
  toggleWatch: (symbol) =>
    set((s) => ({
      watchlist: s.watchlist.includes(symbol)
        ? s.watchlist.filter((x) => x !== symbol)
        : [...s.watchlist, symbol],
    })),
  setTicker: (t) => set((s) => ({ tickers: { ...s.tickers, [t.symbol]: t } })),
}));

/** 选择器：读取单个 symbol 的 Ticker（未收到推送前为 undefined） */
export const selectTicker =
  (symbol: string) =>
  (s: MarketState): Ticker | undefined =>
    s.tickers[symbol];
