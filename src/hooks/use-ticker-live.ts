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
      .then((rows) => {
        if (alive && rows[0]) setTicker(rows[0]);
      })
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

/**
 * 批量最新价：symbol → 价格。用于全仓模式下跨交易对聚合持仓风险。
 * 全仓共享池只是账户级估算，精度要求低于单仓位行内行情，故走 REST 轮询而非逐 symbol 订阅 WS。
 */
export function useMarkPrices(symbols: string[]): Record<string, number> {
  const key = symbols.join(",");
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) {
      setPrices({});
      return;
    }
    let alive = true;
    const pull = () => {
      fetchTickers(list)
        .then((rows) => {
          if (!alive) return;
          const next: Record<string, number> = {};
          for (const r of rows) next[r.symbol] = r.lastPrice;
          setPrices(next);
        })
        .catch(() => undefined);
    };
    void pull();
    const t = setInterval(pull, 5_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [key]);

  return prices;
}
