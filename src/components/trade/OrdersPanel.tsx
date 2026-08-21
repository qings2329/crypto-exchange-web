// 我的订单面板：当前委托 / 历史订单 双 Tab。
// - 当前委托：限价单挂单列表，可撤单；行情穿越限价时由 store.fillMatching 自动成交；
// - 历史订单：已成交 + 已撤销；
// - 币安表格规范：粘性表头、行 hover 高亮、tabular-nums、买卖红绿。

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrdersStore, type TradeOrder } from "../../store/orders-store";
import { useToast } from "../Toast";
import { fmtPrice, fmtQty, fmtTime } from "../../lib/format";
import { cn } from "../../lib/utils";

interface Props {
  symbol: string; // BTCUSDT
  /** 初始 Tab（永续模式底部容器切换到委托/历史时使用） */
  initialTab?: Tab;
}

type Tab = "open" | "history";

export function OrdersPanel({ symbol, initialTab = "open" }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(initialTab);
  // 注意：选择器必须返回稳定引用（Zustand v5），过滤放到组件内 useMemo
  const orders = useOrdersStore((s) => s.orders);
  const cancel = useOrdersStore((s) => s.cancel);
  const toast = useToast();

  const base = symbol.replace(/USDT$/, "");
  const openOrders = useMemo(
    () => orders.filter((o) => o.symbol === symbol && o.status === "open"),
    [orders, symbol]
  );
  const history = useMemo(
    () => orders.filter((o) => o.symbol === symbol && o.status !== "open"),
    [orders, symbol]
  );
  const rows = tab === "open" ? openOrders : history;

  const onCancel = (o: TradeOrder) => {
    cancel(o.id);
    toast.info(`${t("ordersPanel.cancel")} · ${o.id}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Tab 头：下划线式，激活币安黄 */}
      <div className="flex items-center gap-4 border-b border-border px-3">
        {(
          [
            ["open", t("ordersPanel.openOrders", { count: openOrders.length })],
            ["history", t("ordersPanel.orderHistory", { count: history.length })],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "relative cursor-pointer py-2.5 text-[13px] transition-colors",
              tab === key ? "font-semibold text-accent" : "text-muted hover:text-foreground"
            )}
          >
            {label}
            {tab === key && <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted">{t("ordersPanel.simulated")}</span>
      </div>

      {/* 表格 */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-xs tabular-nums">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="text-[11px] text-muted">
              <th className="px-3 py-2 text-left font-medium">{t("ordersPanel.time")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("ordersPanel.side")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("ordersPanel.type")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("orderPanel.price")}</th>
              <th className="px-3 py-2 text-right font-medium">{`${t("orderPanel.amount")} (${base})`}</th>
              <th className="px-3 py-2 text-right font-medium">{`${t("orderPanel.total")} (USDT)`}</th>
              <th className="px-3 py-2 text-center font-medium">{t("ordersPanel.status")}</th>
              <th className="px-3 py-2 text-right font-medium">{tab === "open" ? t("ordersPanel.action") : ""}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center font-sans text-muted">
                  {tab === "open" ? t("ordersPanel.noOpenOrders") : t("ordersPanel.noHistory")}
                </td>
              </tr>
            ) : (
              rows.map((o) => (
                <tr key={o.id} className="border-t border-border/60 hover:bg-panel-2/30">
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted">{fmtTime(o.ts)}</td>
                  <td className={cn("px-3 py-1.5 font-semibold", o.side === "buy" ? "text-buy" : "text-sell")}>
                    {o.side.toUpperCase()}
                  </td>
                  <td className="px-3 py-1.5 capitalize text-muted">{o.type}</td>
                  <td className="px-3 py-1.5 text-right text-foreground">{fmtPrice(o.price)}</td>
                  <td className="px-3 py-1.5 text-right text-foreground">{fmtQty(o.qty)}</td>
                  <td className="px-3 py-1.5 text-right text-foreground">{fmtQty(o.total)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {o.status === "open" && (
                      <button
                        onClick={() => onCancel(o)}
                        className="cursor-pointer rounded-md border border-border px-2 py-0.5 text-[11px] text-muted transition-colors hover:border-sell hover:text-sell"
                      >
                        {t("ordersPanel.cancel")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TradeOrder["status"] }) {
  const { t } = useTranslation();
  const cls =
    status === "open"
      ? "bg-tag-bg text-accent"
      : status === "filled"
        ? "bg-buy-bg text-buy"
        : "bg-panel-2 text-muted";
  return (
    <span className={cn("inline-block rounded px-1.5 py-0.5 text-[11px] font-medium", cls)}>
      {t(`orderStatus.${status}`)}
    </span>
  );
}
