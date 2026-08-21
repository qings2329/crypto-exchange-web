// 24h Ticker 实时流：REST 种子 + WS 增量替换。

import { useEffect, useState } from "react";
import { useBinanceStream } from "./use-binance-stream";
import { fetchTickers, parseTickerEvent, tickerStream } from "../services/binance";
import type { BinanceWsStatus } from "../services/binance-ws";
import type { Ticker } from "../types";

export function useTickerLive(symbol: string): { ticker: Ticker | null; status: BinanceWsStatus } {
  const [ticker, setTicker] = useState<Ticker | null>(null);

  // REST 种子
  useEffect(() => {
    let alive = true;
    setTicker(null);
    fetchTickers([symbol])
      .then((rows) => alive && rows[0] && setTicker(rows[0]))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [symbol]);

  const status = useBinanceStream(tickerStream(symbol), (data) => {
    const t = parseTickerEvent(data);
    if (t) setTicker(t);
  });

  return { ticker, status };
}
