import { useCallback, useEffect, useMemo, useState } from "react";
import { api, tokenStore, type OrderView, type TradeView } from "../api/client";
import { useI18n } from "../i18n";
import { formatDateTime } from "../lib/timezone";
import { InlineError } from "../components/InlineError";

// 订单状态 -> 文案 key（对齐 history.status.*）。
const ORDER_STATUS_KEY: Record<string, string> = {
  open: "history.status.open",
  partial: "history.status.partial",
  filled: "history.status.filled",
  canceled: "history.status.canceled",
  rejected: "history.status.rejected",
};

// 后端 created_at/updated_at/time 为 Unix 纳秒；兼容毫秒/秒；统一按时区格式化。
function fmtTime(ts: number): string {
  return formatDateTime(ts);
}

// 价格：0 表示市价单。
function fmtPrice(p: number, market: string): string {
  return p > 0 ? p.toLocaleString() : market;
}

function SideBadge({ side, t }: { side: "buy" | "sell"; t: (k: string) => string }) {
  const cls = side === "buy" ? "btn buy" : "btn sell";
  const label = side === "buy" ? t("trade.buy") : t("trade.sell");
  return <span className={cls}>{label}</span>;
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const label = t(ORDER_STATUS_KEY[status] ?? `history.status.${status}`);
  return <span className={`ostatus ${status}`}>{label}</span>;
}

type TabKey = "spot-orders" | "spot-trades" | "futures-orders" | "futures-trades";

const TABS: { key: TabKey; labelKey: string }[] = [
  { key: "spot-orders", labelKey: "history.tab.spotOrders" },
  { key: "spot-trades", labelKey: "history.tab.spotTrades" },
  { key: "futures-orders", labelKey: "history.tab.futuresOrders" },
  { key: "futures-trades", labelKey: "history.tab.futuresTrades" },
];

// 订单表格（现货 / 合约共用）。
function OrdersTable({ rows, t }: { rows: OrderView[]; t: (k: string) => string }) {
  if (rows.length === 0) return <div className="muted">{t("history.noOrders")}</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("history.col.orderId")}</th>
            <th>{t("history.col.side")}</th>
            <th>{t("history.col.symbol")}</th>
            <th>{t("history.col.type")}</th>
            <th>{t("history.col.price")}</th>
            <th>{t("history.col.qty")}</th>
            <th>{t("history.col.filled")}</th>
            <th>{t("history.col.status")}</th>
            <th>{t("history.col.time")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>
                <SideBadge side={o.side} t={t} />
              </td>
              <td>{o.symbol}</td>
              <td>
                {o.is_margin ? `${o.leverage > 0 ? o.leverage + "x" : t("history.leverage")}` : t("history.spot")}
              </td>
              <td>{fmtPrice(o.price, t("history.market"))}</td>
              <td>{o.qty.toLocaleString()}</td>
              <td>{o.filled.toLocaleString()}</td>
              <td>
                <StatusBadge status={o.status} t={t} />
              </td>
              <td>{fmtTime(o.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 成交流水表格（现货 / 合约共用）。
function TradesTable({ rows, t }: { rows: TradeView[]; t: (k: string) => string }) {
  const me = Number(tokenStore.uid);
  if (rows.length === 0) return <div className="muted">{t("history.noTrades")}</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("history.col.tradeId")}</th>
            <th>{t("history.col.side")}</th>
            <th>{t("history.col.symbol")}</th>
            <th>{t("history.col.price")}</th>
            <th>{t("history.col.qty")}</th>
            <th>{t("history.col.role")}</th>
            <th>{t("history.col.time")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t2) => {
            const iAmTaker = t2.taker_id === me;
            const role = iAmTaker ? t("history.taker") : t("history.maker");
            return (
              <tr key={t2.id}>
                <td>{t2.id}</td>
                <td>
                  <SideBadge side={t2.taker_side} t={t} />
                </td>
                <td>{t2.symbol}</td>
                <td>{t2.price.toLocaleString()}</td>
                <td>{t2.qty.toLocaleString()}</td>
                <td>
                  {role}
                  {t2.is_margin ? ` · ${t2.leverage > 0 ? t2.leverage + "x" : t("history.leverage")}` : ""}
                </td>
                <td>{fmtTime(t2.time)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// 交易记录：现货 / 合约的「我的订单 / 成交」统一查询页。
export function History() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>("spot-orders");
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState<OrderView[] | undefined>(undefined);
  const [trades, setTrades] = useState<TradeView[] | undefined>(undefined);

  const isOrders = tab === "spot-orders" || tab === "futures-orders";
  const isSpot = tab === "spot-orders" || tab === "spot-trades";

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const params = symbol.trim()
        ? { symbol: symbol.trim() }
        : {};
      if (isOrders) {
        const data = isSpot
          ? await api.spotOrders(params)
          : await api.futuresOrders(params);
        setOrders(data);
        setTrades(undefined);
      } else {
        const data = isSpot
          ? await api.spotTrades(params)
          : await api.futuresTrades(params);
        setTrades(data);
        setOrders(undefined);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isOrders, isSpot, symbol]);

  // 切换 Tab 或筛选条件时重新加载。
  useEffect(() => {
    load();
  }, [load]);

  const ready = useMemo(() => {
    if (isOrders) return Array.isArray(orders);
    return Array.isArray(trades);
  }, [isOrders, orders, trades]);

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("history.title")}</h2>
        <button className="refresh" onClick={load} disabled={loading}>
          {loading ? t("common.loading") : t("common.refresh")}
        </button>
      </div>

      <div className="tabs">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.key}
            className={tab === tabDef.key ? "tab active" : "tab"}
            onClick={() => setTab(tabDef.key)}
          >
            {t(tabDef.labelKey)}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="filter-bar">
          <input
            className="filter"
            placeholder={t("history.filterPlaceholder")}
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
        </div>
      </div>

      {err ? (
        <InlineError err={err} />
      ) : !ready ? (
        <div className="muted">{t("common.loading")}</div>
      ) : isOrders ? (
        <OrdersTable rows={orders ?? []} t={t} />
      ) : (
        <TradesTable rows={trades ?? []} t={t} />
      )}
    </div>
  );
}
