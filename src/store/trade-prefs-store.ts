// 交易偏好：图表默认周期 + 涨跌幅基准。
// 持久化策略：localStorage（zustand persist）作为离线 / 未登录缓存；
// 登录后通过后端 /api/v1/user/preferences 读写（hydrate 拉取、改动即 push 合并），
// 实现跨设备同步。未登录时仅本地生效，登录后自动与后端对齐。
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChartInterval } from "../components/trade/TradingViewChart";
import { api, tokenStore, type UserPreferences } from "../api/client";

/** 涨跌幅计算基准：24h（交易所原生） / 1h 前 / 今日 00:00 UTC 开盘 */
export type ChangeBasis = "24h" | "1h" | "today";

// 最近一次从后端拉取的完整偏好快照（仅内存，不持久化）：push 时合并其它字段，
// 避免 PUT 全量覆盖 language / theme / notify_* 等。
let serverSnapshot: UserPreferences | null = null;

interface TradePrefsState {
  interval: ChartInterval;
  changeBasis: ChangeBasis;
  /** 登录后从后端拉取偏好并覆盖本地（仅当后端有值），随后把本地值写回保证一致 */
  hydrate: () => Promise<void>;
  setInterval: (i: ChartInterval) => void;
  setChangeBasis: (b: ChangeBasis) => void;
}

export const useTradePrefs = create<TradePrefsState>()(
  persist(
    (set) => ({
      interval: "1m",
      changeBasis: "24h",

      hydrate: async () => {
        if (!tokenStore.access) return; // 未登录不拉取
        try {
          const prefs = await api.userGetPreferences();
          serverSnapshot = prefs;
          const patch: Partial<TradePrefsState> = {};
          if (prefs.trade_interval) patch.interval = prefs.trade_interval as ChartInterval;
          if (prefs.change_basis) patch.changeBasis = prefs.change_basis as ChangeBasis;
          if (Object.keys(patch).length) set(patch);
          void pushTradePrefs(); // 把本地（可能未被后端覆盖的）当前值同步回后端
        } catch {
          // 忽略：保持本地值
        }
      },

      setInterval: (interval) => {
        set({ interval });
        void pushTradePrefs();
      },

      setChangeBasis: (changeBasis) => {
        set({ changeBasis });
        void pushTradePrefs();
      },
    }),
    {
      name: "cx_trade_prefs",
      partialize: (s) => ({ interval: s.interval, changeBasis: s.changeBasis }),
    }
  )
);

// 把当前交易偏好合并回后端（保留 language / theme / notify_* 等其它字段）。
async function pushTradePrefs() {
  if (!tokenStore.access) return; // 未登录：仅本地持久化
  const { interval, changeBasis } = useTradePrefs.getState();
  try {
    let base = serverSnapshot;
    if (!base) base = await api.userGetPreferences();
    const updated: UserPreferences = { ...base, trade_interval: interval, change_basis: changeBasis };
    await api.userUpdatePreferences(updated);
    serverSnapshot = updated;
  } catch {
    // 忽略：下次改动再尝试
  }
}
