// 交易大厅（/trade/BTCUSDT）—— 币安桌面端全宽终端布局
// CSS Grid 模板区域（lg+ 双栏，移动端单列堆叠）：
//   ┌────────────────────────┬──────────────┐
//   │ K 线图 (chart)          │ 订单簿+成交    │
//   ├────────────────────────┤ (book)       │
//   │ 我的委托/历史 (orders)   ├──────────────┤
//   │                        │ 下单面板(panel)│
//   └────────────────────────┴──────────────┘
// - 顶栏：交易对 + 最新价 + 24h 统计；
// - WS 断连时顶部显示告警横幅（重连中=黄 / 离线=红）；
// - 限价挂单随行情穿越自动撮合（orders-store.fillMatching）。

import { useEffect, useState } from "react";
import { TradingViewChart, type ChartInterval } from "../components/trade/TradingViewChart";
import { OrderBook } from "../components/trade/OrderBook";
import { RecentTrades } from "../components/trade/RecentTrades";
import { OrderPanel } from "../components/trade/OrderPanel";
import { OrdersPanel } from "../components/trade/OrdersPanel";
import { StreamDot } from "../components/trade/StreamDot";
import { Badge } from "../components/ui/badge";
import { useTickerLive } from "../hooks/use-ticker-live";
import { useOrdersStore } from "../store/orders-store";
import { fmtPercent, fmtPrice, fmtQty } from "../lib/format";

interface Props {
  symbol: string; // 形如 BTCUSDT
}

export function TradeHall({ symbol }: Props) {
  const [interval, setInterval] = useState<ChartInterval>("1m");
  const { ticker, status } = useTickerLive(symbol);
  const fillMatching = useOrdersStore((s) => s.fillMatching);

  const base = symbol.replace(/USDT$/, "");
  const quote = symbol.slice(base.length);
  const rising = (ticker?.priceChangePercent ?? 0) >= 0;
  const last = ticker?.lastPrice;

  // 行情驱动撮合：最新价每次变动都检查 open 单是否可成交
  useEffect(() => {
    if (last !== undefined) fillMatching(symbol, last);
  }, [symbol, last, fillMatching]);

  const degraded = status === "reconnecting" || status === "closed";

  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col gap-2 p-2">
      {/* WS 断连告警横幅 */}
      {degraded && (
        <div
          role="alert"
          className={`flex items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-medium ${
            status === "closed" ? "bg-sell/10 text-sell" : "bg-tag-bg text-accent"
          }`}
        >
          <span className={`size-1.5 animate-pulse rounded-full ${status === "closed" ? "bg-sell" : "bg-accent"}`} />
          {status === "closed"
            ? "行情连接已断开 · Market feed disconnected"
            : "行情连接中断，正在重连… · Reconnecting to market feed"}
        </div>
      )}

      {/* 行情顶栏 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5">
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

      {/* 主区：grid-template-areas 双栏终端布局 */}
      <div className="grid flex-1 items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_336px] lg:[grid-template-areas:'chart_book'_'orders_panel'] lg:[grid-template-rows:minmax(420px,1fr)_auto]">
        {/* 左上：K 线 */}
        <section className="h-[clamp(380px,52vh,640px)] lg:h-auto lg:min-h-0 lg:[grid-area:chart]">
          <TradingViewChart
            symbol={symbol}
            interval={interval}
            onIntervalChange={setInterval}
          />
        </section>

        {/* 右上：订单簿 + 最新成交 */}
        <aside className="flex h-[520px] flex-col gap-2 lg:h-auto lg:min-h-0 lg:[grid-area:book]">
          <div className="min-h-0 flex-1">
            <OrderBook symbol={symbol} />
          </div>
          <div className="h-[216px] shrink-0">
            <RecentTrades symbol={symbol} />
          </div>
        </aside>

        {/* 左下：我的当前委托 / 历史订单 */}
        <section className="h-[300px] lg:h-auto lg:min-h-[260px] lg:[grid-area:orders]">
          <OrdersPanel symbol={symbol} />
        </section>

        {/* 右下：下单面板 */}
        <section className="lg:[grid-area:panel]">
          <OrderPanel symbol={symbol} lastPrice={last} />
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
