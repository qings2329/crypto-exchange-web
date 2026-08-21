// 最新成交（Binance trade 流）
// - REST /api/v3/trades 种子 + WS 增量前插，滚动窗口 max 条（数据层 100ms 节流刷出）；
// - 主动买（m=false）绿色、主动卖（m=true）红色；
// - @tanstack/react-virtual 虚拟列表：仅渲染可视区行，长列表（数百条）渲染成本恒定；
// - 行级 hover 高亮，价格随上一笔对比闪烁涨跌色。

import { memo, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTradesLive } from "../../hooks/use-trades-live";
import { fmtPrice, fmtQty, fmtTime } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";
import { StreamDot } from "./StreamDot";
import type { PublicTrade } from "../../types";

const ROW_HEIGHT = 22;

interface Props {
  symbol: string;
  max?: number;
}

export function RecentTrades({ symbol, max = 30 }: Props) {
  const { trades, status } = useTradesLive(symbol, max);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPriceRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // 虚拟列表：容器高度自适应 + 固定行高
  const virtualizer = useVirtualizer({
    count: trades.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

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
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto font-mono text-xs tabular-nums transition-colors duration-300",
          flash === "up" && "bg-buy/5",
          flash === "down" && "bg-sell/5"
        )}
        data-testid="trades-list"
      >
        {trades.length === 0 ? (
          <div className="flex-1 space-y-[7px] p-3" aria-hidden data-testid="trades-skeleton">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className={cn("ml-auto h-3", i % 3 === 0 ? "w-full" : i % 3 === 1 ? "w-11/12" : "w-10/12")} />
            ))}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const t = trades[vi.index];
              return (
                <TradeRow
                  key={t.id}
                  trade={t}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** 行组件 memo 化：列表前插时仅新行与可视区变化行重渲染。 */
const TradeRow = memo(function TradeRow({ trade: t, style }: { trade: PublicTrade; style: React.CSSProperties }) {
  return (
    <div style={style} className="flex items-center px-3 py-[3px] hover:bg-panel-2/40" data-testid="trade-row">
      <span className="w-20 text-muted">{fmtTime(t.time)}</span>
      <span className={`flex-1 text-right font-medium ${t.isBuyerMaker ? "text-sell" : "text-buy"}`}>
        {fmtPrice(t.price)}
      </span>
      <span className="flex-1 text-right text-foreground">{fmtQty(t.qty)}</span>
    </div>
  );
});
