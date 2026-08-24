// 期货专属交易页（#/futures/:SYMBOL）：合约永续终端。
// 与现货大厅的差异：无 Spot/Perp 模式切换；顶栏为合约专属条带
// （指数价 / 标记价 / 资金费率 + 结算倒计时）；底部为 持仓/委托/历史 Tab。

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchPremiumIndex } from "../services/binance";
import { TradingViewChart, type ChartInterval } from "../components/trade/TradingViewChart";
import { OrderBook } from "../components/trade/OrderBook";
import { RecentTrades } from "../components/trade/RecentTrades";
import { OrderPanel } from "../components/trade/OrderPanel";
import { OrdersPanel } from "../components/trade/OrdersPanel";
import { PositionsPanel } from "../components/trade/PositionsPanel";
import { StreamDot } from "../components/trade/StreamDot";
import { MobileSwipeViews } from "../components/trade/MobileSwipeViews";
import { SymbolSelect } from "../components/trade/SymbolSelect";
import { Badge } from "../components/ui/badge";
import { useTickerLive } from "../hooks/use-ticker-live";
import { useMediaQuery } from "../hooks/use-media-query";
import { useOrdersStore } from "../store/orders-store";
import { useTradeDraft } from "../store/trade-draft-store";
import { fmtPercent, fmtPrice, fmtQty } from "../lib/format";
import { hallRoute } from "../lib/routes";
import { cn } from "../lib/utils";

interface Props {
  symbol: string; // 形如 BTCUSDT
}

type BottomTab = "positions" | "orders" | "history";

export function FuturesPage({ symbol }: Props) {
  const { t } = useTranslation();
  const [interval, setInterval] = useState<ChartInterval>("1m");
  const [bottomTab, setBottomTab] = useState<BottomTab>("positions");
  const { ticker, status } = useTickerLive(symbol);

  // 合约专属：指数价/标记价/资金费率（真实 Binance premiumIndex，30s 轮询）
  const { data: funding } = useQuery({
    queryKey: ["futures-funding", symbol],
    queryFn: async () => {
      const p = await fetchPremiumIndex(symbol);
      return {
        index_price: Number(p.indexPrice),
        mark_price: Number(p.markPrice),
        funding_rate: Number(p.lastFundingRate),
        nextFundingTime: p.nextFundingTime,
      };
    },
    refetchInterval: 30_000,
  });
  // 倒计时每秒跳动（本地计时兜底冷清市场行情不推送）
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const fillMatching = useOrdersStore((s) => s.fillMatching);

  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const base = symbol.replace(/USDT$/, "");
  const quote = symbol.slice(base.length);
  const rising = (ticker?.priceChangePercent ?? 0) >= 0;
  const last = ticker?.lastPrice;
  const degraded = status === "reconnecting" || status === "closed";

  // 行情驱动撮合：最新价每次变动都检查 open 单是否可成交
  useEffect(() => {
    if (last !== undefined) fillMatching(symbol, last);
  }, [symbol, last, fillMatching]);

  // 切换交易对保持在 /futures 前缀下；返回现货走 hallRoute
  const onSymbolChange = (s: string) => {
    location.hash = `#/futures/${s}`;
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

  const ordersSection = (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex gap-5 border-b border-border px-4 pt-2" role="tablist">
        {(
          [
            { key: "positions", label: t("ordersPanel.positions") },
            { key: "orders", label: t("ordersPanel.tabOpenOrders") },
            { key: "history", label: t("ordersPanel.tabHistory") },
          ] as const
        ).map((tb) => (
          <button
            key={tb.key}
            role="tab"
            aria-selected={bottomTab === tb.key}
            onClick={() => setBottomTab(tb.key)}
            data-testid={`bottom-tab-${tb.key}`}
            className={cn(
              "relative cursor-pointer pb-2 text-xs font-medium transition-colors",
              bottomTab === tb.key ? "font-semibold text-foreground" : "text-muted hover:text-foreground"
            )}
          >
            {tb.label}
            {bottomTab === tb.key && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {bottomTab === "positions" ? (
          <PositionsPanel symbol={symbol} />
        ) : (
          <OrdersPanel symbol={symbol} market="perp" initialTab={bottomTab === "history" ? "history" : "open"} />
        )}
      </div>
    </div>
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

      {/* 行情顶栏（合约专属条带：指数/标记/资金费率） */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <SymbolSelect value={symbol} onChange={onSymbolChange} />
          <h1 className="text-lg font-bold">
            {base}
            <span className="text-muted">/{quote}</span>
          </h1>
          <Badge variant="default">Perp</Badge>
          <button
            onClick={() => (location.hash = hallRoute("spot", symbol))}
            data-testid="futures-to-spot"
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
          <Stat label="Mark Price" value={funding ? fmtPrice(funding.mark_price) : "--"} testId="mark-price" />
          <Stat label="Index Price" value={funding ? fmtPrice(funding.index_price) : "--"} testId="index-price" />
          <Stat label={`24h Volume (${base})`} value={ticker ? fmtQty(ticker.volume) : "--"} />
          <Stat
            label="Funding / Countdown"
            value={
              funding
                ? `${(funding.funding_rate * 100).toFixed(4)}% · ${fundingCountdown(funding.nextFundingTime, nowMs)}`
                : "--"
            }
            tone={(funding?.funding_rate ?? 0) >= 0 ? "buy" : "sell"}
            testId="funding-rate"
          />
        </dl>
      </div>

      {isDesktop ? (
        <div className="grid flex-1 items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_336px] lg:[grid-template-areas:'chart_book'_'orders_panel'] lg:[grid-template-rows:minmax(420px,1fr)_auto]">
          <section className="min-h-0 [grid-area:chart]">{chartNode}</section>
          <div className="min-h-0 [grid-area:book]">{bookNode}</div>
          <section className="min-h-[260px] [grid-area:orders]">{ordersSection}</section>
          <section className="[grid-area:panel]">
            <OrderPanel symbol={symbol} lastPrice={last} variant="perp" />
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <MobileSwipeViews
            className="h-[440px] rounded-xl border border-border bg-card"
            slides={[
              { key: "chart", label: t("mobile.chart"), node: chartNode },
              { key: "book", label: t("mobile.book"), node: bookNode },
            ]}
          />
          <section className="h-[320px]">{ordersSection}</section>
          <section>
            <OrderPanel symbol={symbol} lastPrice={last} variant="perp" />
          </section>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: "buy" | "sell";
  testId?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="whitespace-nowrap text-muted">{label}</dt>
      <dd
        className={cn(
          "font-mono font-semibold tabular-nums",
          tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : ""
        )}
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

// 资金费率倒计时：nextFundingTime 为 Binance 下个结算时刻（epoch ms）。
function fundingCountdown(nextFundingTime: number, now: number): string {
  const ms = Math.max(0, nextFundingTime - now);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
