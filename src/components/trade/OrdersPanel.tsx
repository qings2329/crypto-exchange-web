// 我的订单面板：当前委托 / 历史订单 双 Tab。
// - 当前委托：限价单挂单列表，可撤单；行情穿越限价时由 store.fillMatching 自动成交；
// - 历史订单：已成交 + 已撤销；
// - 币安表格规范：粘性表头、行 hover 高亮、tabular-nums、买卖红绿。

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { useOrdersStore, type TradeOrder } from "../../store/orders-store";
import { useToast } from "../Toast";
import { fmtPrice, fmtQty, fmtTime } from "../../lib/format";
import { cn } from "../../lib/utils";

interface Props {
  symbol: string; // BTCUSDT
  /** 初始 Tab（永续模式底部容器切换到委托/历史时使用） */
  initialTab?: Tab;
  /** 市场类型：决定拉取现货/合约订单服务端数据（缺省 spot） */
  market?: "spot" | "perp";
}

type Tab = "open" | "history";

/** 服务端订单 → 本地镜像结构（market 由调用方按当前面板标注，供撤单路由到对应服务端） */
function toLocalOrder(
  o: {
    id: number | string;
    symbol: string;
    side: string;
    price: number;
    qty: number;
    status: string;
    created_at?: number;
  },
  market: "spot" | "perp"
): TradeOrder {
  const status: TradeOrder["status"] =
    o.status === "filled"
      ? "filled"
      : o.status === "canceled" || o.status === "cancelled" || o.status === "rejected"
        ? "canceled"
        : "open"; // open / partial / new / 未知均视为活动委托
  return {
    id: `SRV-${o.id}`,
    symbol: o.symbol,
    side: o.side === "sell" ? "sell" : "buy",
    type: "limit",
    price: Number(o.price) || 0,
    qty: Number(o.qty) || 0,
    total: (Number(o.price) || 0) * (Number(o.qty) || 0),
    ts: o.created_at ? Number(o.created_at) : Date.now(),
    status,
    settledTs: status !== "open" ? (o.created_at ? Number(o.created_at) : undefined) : undefined,
    market,
  };
}

export function OrdersPanel({ symbol, initialTab = "open", market = "spot" }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(initialTab);
  // 注意：选择器必须返回稳定引用（Zustand v5），过滤放到组件内 useMemo
  const orders = useOrdersStore((s) => s.orders);
  const hydrate = useOrdersStore((s) => s.hydrate);

  // 服务端为真相源：挂载即拉取，之后每 5s 轮询对账（本地乐观更新仅作即时反馈）
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        if (market === "perp") {
          const list = await api.futuresOrders({ symbol });
          if (!alive) return;
          hydrate(symbol, (list ?? []).map((o) => toLocalOrder(o, "perp")));
        } else {
          const list = await api.spotOrders({ symbol });
          if (!alive) return;
          hydrate(symbol, (list ?? []).map((o) => toLocalOrder(o, "spot")));
        }
      } catch {
        /* 未登录/网络失败时保留本地镜像 */
      }
    };
    void pull();
    const timer = setInterval(pull, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [symbol, market, hydrate]);
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

  const onCancel = async (o: TradeOrder) => {
    const srvId = Number(o.id.startsWith("SRV-") ? o.id.slice(4) : o.id);
    cancel(o.id); // 本地乐观标记 + 记入已撤集合，避免轮询重现
    toast.info(`${t("ordersPanel.cancel")} · ${o.symbol}`);
    if (market === "spot") {
      try {
        await api.spotCancelOrder({ symbol, orderId: srvId });
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : t("common.requestFailed"));
      }
    } else {
      try {
        await api.futuresCancelOrder({ symbol, orderId: srvId });
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : t("common.requestFailed"));
      }
    }
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
