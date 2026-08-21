// 盘口深度实时流：depth10 部分深度快照（100ms 推送）。
// 性能：报文仅写入节流调度器，100ms 窗口尾沿合并刷出一次 setState，
// 将 OrderBook 重渲染频率从 ~10fps 报文驱动收敛为固定 100ms 一刷。

import { useBinanceStream } from "./use-binance-stream";
import { useThrottledState } from "./use-throttled-state";
import { depthStream, parseDepthEvent } from "../services/binance";
import type { BinanceWsStatus } from "../services/binance-ws";
import type { OrderBook } from "../types";

export function useDepthLive(symbol: string): { book: OrderBook | null; status: BinanceWsStatus } {
  const [book, setBook] = useThrottledState<OrderBook | null>(null, 100);

  const status = useBinanceStream(depthStream(symbol), (data) => {
    const parsed = parseDepthEvent(data);
    if (parsed) setBook(parsed);
  });

  return { book, status };
}
