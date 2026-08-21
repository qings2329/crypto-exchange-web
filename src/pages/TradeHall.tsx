// 交易大厅（/trade/BTCUSDT）—— 币安桌面端全宽终端布局
// 桌面（lg+）CSS Grid 模板区域双栏：
//   ┌────────────────────────┬──────────────┐
//   │ K 线图 (chart)          │ 订单簿+成交    │
//   ├────────────────────────┤ (book)       │
//   │ 我的委托/历史 (orders)   ├──────────────┤
//   │                        │ 下单面板(panel)│
//   └────────────────────────┴──────────────┘
// 移动端（<lg）：K 线与订单簿整合为可滑动切换视图（MobileSwipeViews，币安 App 交互），
//   委托区与下单面板纵向堆叠；组件按断点单实例挂载（避免隐藏分支重复订阅 WS）。
// - 顶栏：交易对 + 最新价 + 24h 统计；
// - WS 断连时顶部显示告警横幅（重连中=黄 / 离线=红）；
// - 限价挂单随行情穿越自动撮合（orders-store.fillMatching）。

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TradingViewChart, type ChartInterval } from "../components/trade/TradingViewChart";
import { OrderBook } from "../components/trade/OrderBook";
import { RecentTrades } from "../components/trade/RecentTrades";
import { OrderPanel } from "../components/trade/OrderPanel";
import { OrdersPanel } from "../components/trade/OrdersPanel";
import { PositionsPanel } from "../components/trade/PositionsPanel";
import { StreamDot } from "../components/trade/StreamDot";
import { MobileSwipeViews } from "../components/trade/MobileSwipeViews";
import { Badge } from "../components/ui/badge";
import { useTickerLive } from "../hooks/use-ticker-live";
import { useMediaQuery } from "../hooks/use-media-query";
import { useOrdersStore } from "../store/orders-store";
import { fmtPercent, fmtPrice, fmtQty } from "../lib/format";
import { cn } from "../lib/utils";

interface Props {
  symbol: string; // 形如 BTCUSDT
  /** 初始市场模式：/futures 路由进入永续，/trade 进入现货 */
  initialMode?: MarketMode;
}

type MarketMode = "spot" | "perp";
type BottomTab = "positions" | "orders" | "history";

export function TradeHall({ symbol, initialMode = "spot" }: Props) {
  const { t } = useTranslation();
  const [interval, setInterval] = useState<ChartInterval>("1m");
  const [mode, setMode] = useState<MarketMode>(initialMode);
  const [bottomTab, setBottomTab] = useState<BottomTab>("orders");
  const { ticker, status } = useTickerLive(symbol);
  const fillMatching = useOrdersStore((s) => s.fillMatching);
  // lg+ 桌面终端布局；以下单实例分支挂载，避免双份 WS 订阅
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const base = symbol.replace(/USDT$/, "");
  const quote = symbol.slice(base.length);
  const rising = (ticker?.priceChangePercent ?? 0) >= 0;
  const last = ticker?.lastPrice;

  // 行情驱动撮合：最新价每次变动都检查 open 单是否可成交
  useEffect(() => {
    if (last !== undefined) fillMatching(symbol, last);
  }, [symbol, last, fillMatching]);

  const degraded = status === "reconnecting" || status === "closed";

  // 委托区：永续=持仓/委托/历史 Tab；现货=我的当前委托/历史订单（桌面与移动端共用）
  const ordersSection = mode === "perp" ? (
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
              "relative pb-2 text-xs font-medium transition-colors",
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
          <OrdersPanel symbol={symbol} initialTab={bottomTab === "history" ? "history" : "open"} />
        )}
      </div>
    </div>
  ) : (
    <OrdersPanel symbol={symbol} />
  );

  // K 线图节点（桌面网格与移动端滑动视图共用同一实例位置，按断点二选一挂载）
  const chartNode = (
    <TradingViewChart symbol={symbol} interval={interval} onIntervalChange={setInterval} />
  );
  const bookNode = (
    <aside className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1">
        <OrderBook symbol={symbol} />
      </div>
      <div className="h-[216px] shrink-0">
        <RecentTrades symbol={symbol} />
      </div>
    </aside>
  );

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
          {/* 现货 / 永续合约模式切换 */}
          <div className="ml-1 flex gap-3 self-center" role="tablist" data-testid="mode-switch">
            {(["spot", "perp"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                data-testid={`mode-${m}`}
                className={cn(
                  "relative pb-0.5 text-[13px] font-semibold capitalize transition-colors",
                  mode === m ? "text-foreground" : "text-muted hover:text-foreground/80"
                )}
              >
                {m === "perp" ? "Perp" : "Spot"}
                {mode === m && <span className="absolute inset-x-1 -bottom-1 h-0.5 rounded-full bg-accent" />}
              </button>
            ))}
          </div>
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

      {/* 主区：桌面=grid-template-areas 双栏终端；移动=K线/盘口滑动切换 + 纵向堆叠 */}
      {isDesktop ? (
        <div className="grid flex-1 items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_336px] lg:[grid-template-areas:'chart_book'_'orders_panel'] lg:[grid-template-rows:minmax(420px,1fr)_auto]">
          {/* 左上：K 线 */}
          <section className="min-h-0 [grid-area:chart]">{chartNode}</section>

          {/* 右上：订单簿 + 最新成交 */}
          <div className="min-h-0 [grid-area:book]">{bookNode}</div>

          {/* 左下：委托/持仓 */}
          <section className="min-h-[260px] [grid-area:orders]">{ordersSection}</section>

          {/* 右下：下单面板 */}
          <section className="[grid-area:panel]">
            <OrderPanel symbol={symbol} lastPrice={last} variant={mode} />
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {/* K 线 / 订单簿 可滑动切换（币安 App 交互） */}
          <MobileSwipeViews
            className="h-[440px] rounded-xl border border-border bg-card"
            slides={[
              { key: "chart", label: t("mobile.chart"), node: chartNode },
              { key: "book", label: t("mobile.book"), node: bookNode },
            ]}
          />

          {/* 委托/持仓 */}
          <section className="h-[300px]">{ordersSection}</section>

          {/* 下单面板 */}
          <section>
            <OrderPanel symbol={symbol} lastPrice={last} variant={mode} />
          </section>
        </div>
      )}
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
