// 交易大厅（/trade/BTCUSDT）
// 布局（grid-cols-12，币安高密度风格）：
// - 顶栏：交易对 + 最新价 + 24h 涨跌幅/高/低/量；
// - 左 6 列：K 线图（周期切换 + WS 实时）；
// - 中 3 列：订单簿 / 最新成交 上下堆叠；
// - 右 3 列：下单面板（钱包连接 + 模拟撮合）。

import { useState } from "react";
import { TradingViewChart, type ChartInterval } from "../components/trade/TradingViewChart";
import { OrderBook } from "../components/trade/OrderBook";
import { RecentTrades } from "../components/trade/RecentTrades";
import { OrderPanel, type SimulatedOrder } from "../components/trade/OrderPanel";
import { StreamDot } from "../components/trade/StreamDot";
import { Badge } from "../components/ui/badge";
import { useTickerLive } from "../hooks/use-ticker-live";
import { fmtPercent, fmtPrice, fmtQty } from "../lib/format";

interface Props {
  symbol: string; // 形如 BTCUSDT
}

export function TradeHall({ symbol }: Props) {
  const [interval, setInterval] = useState<ChartInterval>("1m");
  const [lastOrder, setLastOrder] = useState<SimulatedOrder | null>(null);
  const { ticker, status } = useTickerLive(symbol);

  const base = symbol.replace(/USDT$/, "");
  const quote = symbol.slice(base.length);
  const rising = (ticker?.priceChangePercent ?? 0) >= 0;
  const last = ticker?.lastPrice;

  return (
    <div className="mx-auto max-w-[1400px] space-y-3 p-3">
      {/* 行情顶栏 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold">
            {base}
            <span className="text-muted">/{quote}</span>
          </h1>
          <Badge variant="secondary">Spot</Badge>
        </div>

        <span
          className={`font-mono text-2xl font-bold tabular-nums ${rising ? "text-buy" : "text-sell"}`}
        >
          {last !== undefined ? fmtPrice(last) : "--"}
        </span>
        <Badge variant={rising ? "success" : "danger"}>{fmtPercent(ticker?.priceChangePercent ?? NaN)}</Badge>

        <StreamDot status={status} />

        <dl className="ml-auto hidden gap-6 text-xs md:flex">
          <Stat label="24h High" value={ticker ? fmtPrice(ticker.highPrice) : "--"} />
          <Stat label="24h Low" value={ticker ? fmtPrice(ticker.lowPrice) : "--"} />
          <Stat label={`24h Volume (${base})`} value={ticker ? fmtQty(ticker.volume) : "--"} />
        </dl>
      </div>

      {/* 主区：左图 / 中盘口 / 右下单 */}
      <div className="grid grid-cols-12 items-start gap-3">
        <section className="col-span-12 h-[560px] xl:col-span-6">
          <TradingViewChart
            symbol={symbol}
            interval={interval}
            onIntervalChange={setInterval}
          />
        </section>

        <aside className="col-span-12 flex flex-col gap-3 md:col-span-6 xl:col-span-3">
          <div className="min-h-[300px]">
            <OrderBook symbol={symbol} />
          </div>
          <div className="min-h-[240px]">
            <RecentTrades symbol={symbol} />
          </div>
        </aside>

        <section className="col-span-12 md:col-span-6 xl:sticky xl:top-[72px] xl:col-span-3">
          <div className="min-h-[520px]">
            <OrderPanel
              symbol={symbol}
              lastPrice={last}
              onPlaced={setLastOrder}
            />
          </div>
          {lastOrder && (
            <p className="mt-2 truncate rounded-lg border border-buy/30 bg-buy-bg px-3 py-2 font-mono text-[11px] tabular-nums text-buy">
              ✓ {lastOrder.side.toUpperCase()} {fmtQty(lastOrder.qty)} {base} @ {fmtPrice(lastOrder.price)} · {lastOrder.id}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
