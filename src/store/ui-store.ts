// 全局 UI 状态（Zustand）。

import { create } from "zustand";

interface UiState {
  headerTickerVisible: boolean; // 顶栏行情跑马灯开关
  toggleHeaderTicker: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  headerTickerVisible: true,
  toggleHeaderTicker: () => set((s) => ({ headerTickerVisible: !s.headerTickerVisible })),
}));
