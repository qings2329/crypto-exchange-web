// 最新成交（Binance trade 流）
// - REST /api/v3/trades 种子 + WS 增量前插，滚动窗口 30 条；
// - 主动买（m=false）绿色、主动卖（m=true）红色；
// - 行级 hover 高亮，价格随上一笔对比闪烁涨跌色。

import { useEffect, useRef, useState } from "react";
import { useTradesLive } from "../../hooks/use-trades-live";
import { fmtPrice, fmtQty, fmtTime } from "../../lib/format";
import { cn } from "../../lib/utils";
import { StreamDot } from "./StreamDot";

interface Props {
  symbol: string;
  max?: number;
}

export function RecentTrades({ symbol, max = 30 }: Props) {
  const { trades, status } = useTradesLive(symbol, max);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPriceRef = useRef<number | null>(null);

  // 价格变动方向闪烁提示
  useEffect(() => {
    const last = trades[0]?.price;
    if (last === undefined) return;
    const prev = prevPriceRef.current;
    prevPriceRef.current = last;
    if (prev === null || prev === last) return;
    setFlash(last > prev ? "up" : "down");
    const t = setTimeout(() => setFlash(null), 300);
    return () => clearTimeout(t);
  }, [trades]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <h3 className="text-[13px] font-semibold">Recent Trades</h3>
        <StreamDot status={status} />
      </div>

      {/* 表头 */}
      <div className="flex items-center px-3 py-1.5 text-[11px] text-muted">
        <span className="w-20">Time</span>
        <span className="flex-1 text-right">Price (USDT)</span>
        <span className="flex-1 text-right">Qty</span>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto font-mono text-xs tabular-nums transition-colors duration-300",
          flash === "up" && "bg-buy/5",
          flash === "down" && "bg-sell/5"
        )}
      >
        {trades.length === 0 ? (
          <div className="grid h-full place-items-center text-muted">Waiting for trades...</div>
        ) : (
          trades.map((t) => (
            <div key={t.id} className="flex items-center px-3 py-[3px] hover:bg-panel-2/40" data-testid="trade-row">
              <span className="w-20 text-muted">{fmtTime(t.time)}</span>
              <span className={`flex-1 text-right font-medium ${t.isBuyerMaker ? "text-sell" : "text-buy"}`}>
                {fmtPrice(t.price)}
              </span>
              <span className="flex-1 text-right text-foreground">{fmtQty(t.qty)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
