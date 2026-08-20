import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AdminOverview } from "../api/client";
import { ApiTable } from "../components/ApiTable";
import { useI18n } from "../i18n";

// 管理总览：KPI 卡片 + 待办快捷视图 + 模块入口。
export function Dashboard() {
  const { t } = useI18n();
  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .adminOverview()
      .then(setOv)
      .catch((e) => setErr((e as Error).message));
  }, []);

  const cards: { label: string; value: number | string; tone?: string }[] = ov
    ? [
        { label: t("dash.usersTotal"), value: ov.users_total },
        { label: t("dash.usersToday"), value: ov.users_today },
        { label: t("dash.volume24h"), value: ov.trade_volume_24h.toLocaleString() },
        { label: t("dash.orders24h"), value: ov.orders_24h },
        { label: t("dash.pendingWithdraws"), value: ov.pending_withdraws, tone: ov.pending_withdraws ? "#f5a623" : undefined },
        { label: t("dash.pendingRisk"), value: ov.pending_risk_events, tone: ov.pending_risk_events ? "#e5484d" : undefined },
        { label: t("dash.openDisputes"), value: ov.open_disputes, tone: ov.open_disputes ? "#f5a623" : undefined },
        { label: t("dash.onlineUsers"), value: ov.online_users },
      ]
    : Array.from({ length: 8 }, () => ({ label: "—", value: "…" }));

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("page.dashboard")}</h2>
      </div>
      {err && <div className="error">{t("dash.overviewError", { err })}</div>}
      <div className="stat-row">
        {cards.map((c) => (
          <div className="card stat" key={c.label}>
            <div className="stat-value" style={c.tone ? { color: c.tone } : undefined}>
              {c.value}
            </div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <ApiTable title={t("dash.apiTableRisk")} endpoint="/api/v1/risk/events" searchable sortable pageSize={10} empty={t("dash.emptyRisk")} />
        <ApiTable title={t("dash.apiTableWithdraw")} endpoint="/api/v1/futures/wallet/withdraws" searchable sortable pageSize={10} empty={t("dash.emptyWithdraw")} />
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h3>{t("dash.moduleEntry")}</h3>
        </div>
        <div className="quick-links">
          {QUICK.map((q) => (
            <a key={q.path} className="btn" href={`#${q.path}`}>
              {t(q.key)}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

const QUICK = [
  { path: "/risk", key: "nav.risk" },
  { path: "/notifications", key: "nav.notifications" },
  { path: "/otc", key: "nav.otc" },
  { path: "/futures", key: "nav.futures" },
  { path: "/margin", key: "nav.margin" },
  { path: "/options", key: "nav.options" },
  { path: "/monitor", key: "nav.monitor" },
  { path: "/announcements", key: "nav.announcements" },
];
