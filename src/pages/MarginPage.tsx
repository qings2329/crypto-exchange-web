// 杠杆交易页（#/margin/:SYMBOL）：现货杠杆终端。
// 布局复用大厅骨架（K线/订单簿/成交 + 下单面板），新增 MarginPanel（借币/还款/强平价）。
// 交易本身走现货下单（借入资产到账后即可卖出），抵押与债务由 margin 服务管理。

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TradingViewChart, type ChartInterval } from "../components/trade/TradingViewChart";
import { OrderBook } from "../components/trade/OrderBook";
import { RecentTrades } from "../components/trade/RecentTrades";
import { OrderPanel } from "../components/trade/OrderPanel";
import { OrdersPanel } from "../components/trade/OrdersPanel";
import { StreamDot } from "../components/trade/StreamDot";
import { MobileSwipeViews } from "../components/trade/MobileSwipeViews";
import { SymbolSelect } from "../components/trade/SymbolSelect";
import { Badge } from "../components/ui/badge";
import { MarginPanel } from "../components/margin/MarginPanel";
import { useTickerLive } from "../hooks/use-ticker-live";
import { useMediaQuery } from "../hooks/use-media-query";
import { useTradeDraft } from "../store/trade-draft-store";
import { fmtPercent, fmtPrice, fmtQty } from "../lib/format";
import { hallRoute } from "../lib/routes";
import { cn } from "../lib/utils";

interface Props {
  symbol: string; // 形如 BTCUSDT
}

export function MarginPage({ symbol }: Props) {
  const { t } = useTranslation();
  const [interval, setInterval] = useState<ChartInterval>("1m");
  const { ticker, status } = useTickerLive(symbol);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const base = symbol.replace(/USDT$/, "");
  const quote = symbol.slice(base.length);
  const rising = (ticker?.priceChangePercent ?? 0) >= 0;
  const last = ticker?.lastPrice;
  const degraded = status === "reconnecting" || status === "closed";

  // 切换交易对：保持在 /margin 前缀下
  const onSymbolChange = (s: string) => {
    location.hash = `#/margin/${s}`;
  };

  const chartNode = (
    <TradingViewChart symbol={symbol} interval={interval} onIntervalChange={setInterval} />
  );
  const bookNode = (
    <aside className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1">
        <OrderBook
          symbol={symbol}
          lastPrice={last}
          rising={rising}
          onPriceClick={(p) => useTradeDraft.getState().setPrice(symbol, p)}
        />
      </div>
      <div className="h-[216px] shrink-0">
        <RecentTrades symbol={symbol} />
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-[calc(100vh-57px)] flex-col gap-2 p-2">
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
          <SymbolSelect value={symbol} onChange={onSymbolChange} />
          <h1 className="text-lg font-bold">
            {base}
            <span className="text-muted">/{quote}</span>
          </h1>
          <Badge variant="default">{t("margin.title")}</Badge>
          {/* 返回现货 */}
          <button
            onClick={() => (location.hash = hallRoute("spot", symbol))}
            data-testid="margin-to-spot"
            className="cursor-pointer text-[13px] font-semibold capitalize text-muted transition-colors hover:text-foreground"
          >
            Spot
          </button>
        </div>

        <span className={`font-mono text-2xl font-bold tabular-nums ${rising ? "text-buy" : "text-sell"}`}>
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

      {isDesktop ? (
        <div className="grid flex-1 items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_336px] lg:[grid-template-areas:'chart_book'_'orders_margin'] lg:[grid-template-rows:minmax(420px,1fr)_auto]">
          <section className="min-h-0 [grid-area:chart]">{chartNode}</section>
          <div className="min-h-0 [grid-area:book]">{bookNode}</div>
          <section className="min-h-[260px] [grid-area:orders]">
            <OrdersPanel symbol={symbol} market="spot" />
          </section>
          {/* 右下：杠杆账户面板（借币/还款/强平价） */}
          <section className="[grid-area:margin] max-h-[520px] overflow-hidden rounded-xl border border-border bg-card">
            <MarginPanel defaultAsset={base} />
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* K线/盘口/杠杆账户 三滑切换（币安 App 交互）；MarginPanel 仅挂载一处避免双份请求 */}
          <MobileSwipeViews
            className="h-[440px] rounded-xl border border-border bg-card"
            slides={[
              { key: "chart", label: t("mobile.chart"), node: chartNode },
              { key: "book", label: t("mobile.book"), node: bookNode },
              { key: "margin", label: t("margin.title"), node: <MarginPanel defaultAsset={base} /> },
            ]}
          />
          <section>
            <OrderPanel symbol={symbol} lastPrice={last} variant="spot" />
          </section>
          <section className="h-[300px]">
            <OrdersPanel symbol={symbol} market="spot" />
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("font-mono font-semibold tabular-nums")}>{value}</dd>
    </div>
  );
}
