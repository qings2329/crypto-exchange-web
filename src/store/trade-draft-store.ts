// 下单草稿（Zustand，模拟）：订单簿点击价回填到下单面板。
// - 按交易对隔离，避免切换交易对时残留价格误填；
// - 仅承载“从盘口选价”的单向信号，下单面板读取后本地镜像，不回写，无循环。

import { create } from "zustand";

interface TradeDraftState {
  priceBySymbol: Record<string, number | null>;
  /** 订单簿点击回填：写入某交易对的选中价格 */
  setPrice: (symbol: string, price: number) => void;
  /** 切换交易对后清空草稿，防止旧价误填 */
  clear: (symbol: string) => void;
}

export const useTradeDraft = create<TradeDraftState>((set) => ({
  priceBySymbol: {},
  setPrice: (symbol, price) =>
    set((s) => ({ priceBySymbol: { ...s.priceBySymbol, [symbol]: price } })),
  clear: (symbol) =>
    set((s) => ({ priceBySymbol: { ...s.priceBySymbol, [symbol]: null } })),
}));
