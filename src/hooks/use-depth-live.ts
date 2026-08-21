// 盘口深度实时流：depth10 部分深度快照（100ms 推送），直接整表替换。

import { useState } from "react";
import { useBinanceStream } from "./use-binance-stream";
import { depthStream, parseDepthEvent } from "../services/binance";
import type { BinanceWsStatus } from "../services/binance-ws";
import type { OrderBook } from "../types";

export function useDepthLive(symbol: string): { book: OrderBook | null; status: BinanceWsStatus } {
  const [book, setBook] = useState<OrderBook | null>(null);

  const status = useBinanceStream(depthStream(symbol), (data) => {
    const parsed = parseDepthEvent(data);
    if (parsed) setBook(parsed);
  });

  return { book, status };
}
