// 最新成交实时流：REST 种子 + WS 增量前插，滚动窗口保留最近 max 条。
// 性能：WS 报文先累积到 ref（含去重），经 100ms 节流窗口合并刷出一次 setState。

import { useEffect, useRef } from "react";
import { useState } from "react";
import { useBinanceStream } from "./use-binance-stream";
import { useThrottledState } from "./use-throttled-state";
import { fetchRecentTrades, tradeStream, parseTradeEvent } from "../services/binance";
import type { PublicTrade } from "../types";

export function useTradesLive(symbol: string, max = 30) {
  const [trades, setTrades] = useThrottledState<PublicTrade[]>([], 100);
  const [seeding, setSeeding] = useState(true);
  // ref 镜像当前列表：报文到达时同步累积，节流刷出时批量提交
  const listRef = useRef<PublicTrade[]>([]);

  // REST 种子（时间倒序 → 反转为正序便于前插）
  useEffect(() => {
    let alive = true;
    setSeeding(true);
    listRef.current = [];
    setTrades([]);
    fetchRecentTrades(symbol, max)
      .then((rows) => {
        if (!alive) return;
        const seeded = rows.slice().reverse();
        listRef.current = seeded;
        setTrades(seeded);
      })
      .catch(() => undefined) // 地区限制等场景静默降级为纯 WS 增量
      .finally(() => alive && setSeeding(false));
    return () => {
      alive = false;
    };
  }, [symbol, max]);

  const status = useBinanceStream(tradeStream(symbol), (data) => {
    const t = parseTradeEvent(data);
    if (!t) return;
    const prev = listRef.current;
    if (prev.some((x) => x.id === t.id)) return; // 去重
    const next = [t, ...prev];
    listRef.current = next.length > max ? next.slice(0, max) : next;
    setTrades(listRef.current);
  });

  return { trades, seeding, status };
}
