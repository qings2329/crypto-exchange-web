// 最新成交实时流：REST 种子 + WS 增量前插，滚动窗口保留最近 max 条。

import { useEffect, useState } from "react";
import { useBinanceStream } from "./use-binance-stream";
import { fetchRecentTrades, tradeStream, parseTradeEvent } from "../services/binance";
import type { PublicTrade } from "../types";

export function useTradesLive(symbol: string, max = 30) {
  const [trades, setTrades] = useState<PublicTrade[]>([]);
  const [seeding, setSeeding] = useState(true);

  // REST 种子（时间倒序 → 反转为正序便于前插）
  useEffect(() => {
    let alive = true;
    setSeeding(true);
    setTrades([]);
    fetchRecentTrades(symbol, max)
      .then((rows) => alive && setTrades(rows.slice().reverse()))
      .catch(() => undefined) // 地区限制等场景静默降级为纯 WS 增量
      .finally(() => alive && setSeeding(false));
    return () => {
      alive = false;
    };
  }, [symbol, max]);

  const status = useBinanceStream(tradeStream(symbol), (data) => {
    const t = parseTradeEvent(data);
    if (!t) return;
    setTrades((prev) => {
      if (prev.some((x) => x.id === t.id)) return prev; // 去重
      const next = [t, ...prev];
      return next.length > max ? next.slice(0, max) : next;
    });
  });

  return { trades, seeding, status };
}
