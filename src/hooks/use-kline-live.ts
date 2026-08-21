// K 线实时流：把 WS 增量转发给回调（图表组件用 series.update() 合并最后一根）。

import { useBinanceStream } from "./use-binance-stream";
import { klineStream, parseKlineEvent } from "../services/binance";
import type { Kline } from "../types";

export function useKlineLive(
  symbol: string,
  interval: string,
  onKline: (k: Kline) => void
) {
  return useBinanceStream(klineStream(symbol, interval), (data) => {
    const parsed = parseKlineEvent(data);
    if (parsed) onKline(parsed.kline);
  });
}
