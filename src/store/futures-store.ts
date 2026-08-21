// 永续合约持仓状态（Zustand，模拟）：持仓 + 逐仓/全仓 + 杠杆偏好（按交易对）。
// 标记价格不入库：由 PositionsPanel 用实时行情现算 PNL / 保证金率。

import { create } from "zustand";
import type { PerpSide } from "../lib/futures-math";

export type MarginMode = "isolated" | "cross";

export interface Position {
  id: string;
  symbol: string; // BTCUSDT
  side: PerpSide;
  leverage: number; // 1-125
  marginMode: MarginMode;
  entryPrice: number;
  qty: number;
  margin: number; // 初始保证金 = entry*qty/leverage
  ts: number;
  tp?: number; // 止盈触发价
  sl?: number; // 止损触发价
}

interface FuturesState {
  positions: Position[];
  leverageBySymbol: Record<string, number>;
  marginModeBySymbol: Record<string, MarginMode>;
  open: (pos: Omit<Position, "id" | "ts">) => void;
  close: (id: string) => void;
  setLeverage: (symbol: string, leverage: number) => void;
  setMarginMode: (symbol: string, mode: MarginMode) => void;
  setTpSl: (id: string, tp: number | undefined, sl: number | undefined) => void;
}

export const DEFAULT_LEVERAGE = 20;

export const useFuturesStore = create<FuturesState>((set) => ({
  positions: [],
  leverageBySymbol: {},
  marginModeBySymbol: {},

  open: (pos) =>
    set((s) => ({
      positions: [{ ...pos, id: `P-${Date.now().toString(36).toUpperCase()}`, ts: Date.now() }, ...s.positions],
    })),

  close: (id) => set((s) => ({ positions: s.positions.filter((p) => p.id !== id) })),

  setLeverage: (symbol, leverage) =>
    set((s) => ({
      leverageBySymbol: { ...s.leverageBySymbol, [symbol]: Math.min(125, Math.max(1, Math.round(leverage))) },
    })),

  setMarginMode: (symbol, mode) =>
    set((s) => ({ marginModeBySymbol: { ...s.marginModeBySymbol, [symbol]: mode } })),

  setTpSl: (id, tp, sl) =>
    set((s) => ({
      positions: s.positions.map((p) => (p.id === id ? { ...p, tp, sl } : p)),
    })),
}));

/** 读取某交易对的杠杆偏好（缺省 20x） */
export function leverageOf(state: FuturesState, symbol: string): number {
  return state.leverageBySymbol[symbol] ?? DEFAULT_LEVERAGE;
}

/** 读取某交易对的保证金模式（缺省逐仓） */
export function marginModeOf(state: FuturesState, symbol: string): MarginMode {
  return state.marginModeBySymbol[symbol] ?? "isolated";
}
