// 实时订单簿（Binance depth10 部分深度流，100ms 推送）
// - 卖盘（红）在上、买盘（绿）在下，中间为价差行；
// - 每行右侧累计量渐变进度条（宽度按两侧最大累计量归一化，右对齐）；
// - tabular-nums 保证高频刷新不抖动。

import { useMemo } from "react";
import { useDepthLive } from "../../hooks/use-depth-live";
import { fmtPrice, fmtQty } from "../../lib/format";
import { Skeleton } from "../ui/skeleton";
import { StreamDot } from "./StreamDot";
import type { OrderBookLevel } from "../../types";

interface Props {
  symbol: string;
  rows?: number;
}

/** 计算单侧累计量序列 */
function cumulative(levels: OrderBookLevel[]): number[] {
  let sum = 0;
  return levels.map(([, qty]) => (sum += qty));
}

export function OrderBook({ symbol, rows = 10 }: Props) {
  const { book, status } = useDepthLive(symbol);

  const view = useMemo(() => {
    if (!book) return null;
    const asks = book.asks.slice(0, rows); // 价格升序
    const bids = book.bids.slice(0, rows); // 价格降序
    const askCum = cumulative(asks);
    const bidCum = cumulative(bids);
    const maxTotal = Math.max(askCum.at(-1) ?? 0, bidCum.at(-1) ?? 0, 1e-12);
    const spread = asks.length && bids.length ? asks[0][0] - bids[0][0] : null;
    return {
      // 卖盘倒序展示：最低卖价贴近中间价差行
      askRows: asks.map((lv, i) => ({ level: lv, total: askCum[i] })).reverse(),
      bidRows: bids.map((lv, i) => ({ level: lv, total: bidCum[i] })),
      maxTotal,
      spread,
    };
  }, [book, rows]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <h3 className="text-[13px] font-semibold">Order Book</h3>
        <StreamDot status={status} />
      </div>

      {/* 表头 */}
      <div className="flex items-center px-3 py-1.5 text-[11px] text-muted">
        <span className="flex-1">Price (USDT)</span>
        <span className="flex-1 text-right">Amount ({symbol.replace("USDT", "")})</span>
        <span className="w-20 text-right">Total</span>
      </div>

      {!view ? (
        <SkeletonRows rows={rows} />
      ) : (
        <div className="min-h-0 flex-1 font-mono text-xs tabular-nums">
          {/* 卖盘 */}
          <div className="flex flex-col justify-end">
            {view.askRows.map(({ level: [price, qty], total }) => (
              <Row
                key={`a-${price}`}
                price={price}
                qty={qty}
                total={total}
                maxTotal={view.maxTotal}
                side="ask"
              />
            ))}
          </div>

          {/* 价差行 */}
          <div className="my-0.5 flex items-center justify-between border-y border-border bg-panel-2/30 px-3 py-1.5">
            <span className="font-semibold text-foreground">{fmtPrice(view.spread ?? NaN)}</span>
            <span className="text-[11px] text-muted">Spread</span>
          </div>

          {/* 买盘 */}
          <div className="flex flex-col">
            {view.bidRows.map(({ level: [price, qty], total }) => (
              <Row
                key={`b-${price}`}
                price={price}
                qty={qty}
                total={total}
                maxTotal={view.maxTotal}
                side="bid"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  price,
  qty,
  total,
  maxTotal,
  side,
}: {
  price: number;
  qty: number;
  total: number;
  maxTotal: number;
  side: "ask" | "bid";
}) {
  const width = `${Math.min((total / maxTotal) * 100, 100)}%`;
  return (
    <div className="relative flex cursor-pointer items-center px-3 py-[3px] hover:bg-panel-2/40" data-testid={`ob-row-${side}`}>
      {/* 深度渐变进度条：右对齐背景填充 */}
      <div
        aria-hidden
        className={cnGradient(side)}
        style={{ width }}
        data-testid="ob-bar"
      />
      <span className={`relative flex-1 font-medium ${side === "ask" ? "text-sell" : "text-buy"}`}>
        {fmtPrice(price)}
      </span>
      <span className="relative flex-1 text-right text-foreground">{fmtQty(qty)}</span>
      <span className="relative w-20 text-right text-muted">{fmtQty(total)}</span>
    </div>
  );
}

function cnGradient(side: "ask" | "bid") {
  return [
    "absolute inset-y-0 right-0 transition-[width] duration-150 ease-out",
    side === "ask"
      ? "bg-gradient-to-l from-sell/25 to-sell/5"
      : "bg-gradient-to-l from-buy/25 to-buy/5",
  ].join(" ");
}

/** 深度流未就绪时的骨架屏：模拟卖盘/价差/买盘结构。 */
function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-hidden data-testid="ob-skeleton">
      <div className="flex flex-col justify-end gap-[5px] px-3 pb-1.5">
        {Array.from({ length: Math.min(rows, 5) }, (_, i) => (
          <Skeleton key={`sa-${i}`} className="ml-auto h-3 w-full max-w-[75%]" />
        ))}
      </div>
      <Skeleton className="mx-3 my-1 h-6 shrink-0" />
      <div className="flex flex-col gap-[5px] px-3 pt-1.5">
        {Array.from({ length: Math.min(rows, 5) }, (_, i) => (
          <Skeleton key={`sb-${i}`} className="ml-auto h-3 w-full max-w-[75%]" />
        ))}
      </div>
    </div>
  );
}
