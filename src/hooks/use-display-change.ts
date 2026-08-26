// 顶栏涨跌幅：根据偏好基准计算展示用的涨跌幅 % 与方向。
// - 24h：直接使用 ticker 原生 priceChangePercent（交易所 24h 滚动统计）。
// - 1h / 今日开盘：以最新价为基准，除以 K 线 open 价得到涨跌幅（纯前端计算，
//   不依赖交易所额外字段；1h open = 当前小时 K 线开盘，今日 open = 当日 00:00 UTC 日 K 开盘）。
import { useQuery } from "@tanstack/react-query";
import { fetchKlines } from "../services/binance";
import type { Ticker } from "../types";
import type { ChangeBasis } from "../store/trade-prefs-store";

export interface DisplayChange {
  percent: number; // NaN 表示暂无数据
  rising: boolean;
}

export function useDisplayChange(
  symbol: string,
  basis: ChangeBasis,
  last: number | undefined,
  ticker: Ticker | null
): DisplayChange {
  // 仅在对应基准下才发请求，避免无谓网络开销；hooks 顺序固定（始终调用）。
  const q1h = useQuery({
    queryKey: ["basis-1h", symbol],
    queryFn: () => fetchKlines(symbol, "1h", 2),
    staleTime: 30_000,
    enabled: basis === "1h",
  });
  const qDay = useQuery({
    queryKey: ["basis-day", symbol],
    queryFn: () => fetchKlines(symbol, "1d", 2),
    staleTime: 5 * 60_000,
    enabled: basis === "today",
  });

  if (basis === "24h") {
    const p = ticker?.priceChangePercent ?? NaN;
    return { percent: p, rising: (ticker?.priceChangePercent ?? 0) >= 0 };
  }

  const rows = basis === "1h" ? q1h.data : qDay.data;
  if (!rows || rows.length === 0 || last === undefined) {
    return { percent: NaN, rising: true };
  }
  const base = rows[rows.length - 1]?.open;
  if (!base) return { percent: NaN, rising: true };
  const percent = ((last - base) / base) * 100;
  return { percent, rising: percent >= 0 };
}
