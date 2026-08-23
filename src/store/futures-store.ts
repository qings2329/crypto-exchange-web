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
  /** 服务端水合：用后端持仓替换某交易对的本地镜像（id 稳定映射，避免行重挂载闪烁） */
  hydrate: (symbol: string, positions: Position[]) => void;
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

  hydrate: (symbol, positions) =>
    set((s) => {
      // 合并服务端持仓与本地镜像：服务端不回传 tp/sl，需保留本地已设置的止盈/止损，
      // 否则每 5s 轮询会把用户刚配置的 TP/SL 覆盖清空。
      const others = s.positions.filter((p) => p.symbol !== symbol);
      const merged = positions.map((sp) => {
        const local = s.positions.find((p) => p.id === sp.id);
        return local ? { ...sp, tp: local.tp, sl: local.sl } : sp;
      });
      return { positions: [...merged, ...others] };
    }),

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
