// K 线数据获取（TanStack Query）：REST 首屏 + WS 增量由图表组件自行合并。

import { useQuery } from "@tanstack/react-query";
import { fetchKlines } from "../services/binance";
import type { KlineInterval } from "../types";

export function useKlines(symbol: string, interval: KlineInterval = "1m", limit = 500) {
  return useQuery({
    queryKey: ["klines", symbol, interval, limit],
    queryFn: () => fetchKlines(symbol, interval, limit),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
