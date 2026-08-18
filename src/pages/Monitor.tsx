import { useEffect, useState } from "react";
import { api, type MonitorSummaryRemote, type MonitorEventItem } from "../api/client";
import {
  subscribeEvents,
  getMonitorSummary,
  type MonitorEvent,
  type MonitorSummary,
} from "../lib/monitor";
import { useI18n } from "../i18n";

// 事件类型 -> 文案 key（对齐 monitor.type.*）。
const TYPE_KEY: Record<MonitorEvent["type"], string> = {
  error: "monitor.type.error",
  api_error: "monitor.type.apiError",
  vital: "monitor.type.vital",
  ws_drop: "monitor.type.wsDrop",
  custom: "monitor.type.custom",
};

const VITAL_UNIT: Record<string, string> = {
  LCP: "ms",
  CLS: "",
  INP: "ms",
  FCP: "ms",
  TTFB: "ms",
};

function fmtTime(ts?: number) {
  if (!ts) return "--";
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function Card({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="card stat">
      <div className="stat-value" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// 监控看板：展示「当前会话本地采集」+「服务端聚合（需后端实现）」两部分。
export function Monitor() {
  const { t } = useI18n();
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [summary, setSummary] = useState<MonitorSummary>({
    errors: 0,
    apiErrors: 0,
    wsDrops: 0,
    vitals: {},
    total: 0,
  });

  // 服务端聚合数据（后端 /api/v1/monitor/*，未实现时 error 非空属正常）
  const [remote, setRemote] = useState<{
    summary?: MonitorSummaryRemote;
    events: MonitorEventItem[];
    error?: string;
  }>({ events: [] });

  useEffect(() => {
    setSummary(getMonitorSummary());
    return subscribeEvents((evs) => {
      setEvents(evs.slice().reverse()); // 最新在前
      setSummary(getMonitorSummary());
    });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, evs] = await Promise.all([api.monitorSummary(), api.monitorEvents(50)]);
        if (alive) setRemote({ summary: s, events: evs });
      } catch (e) {
        if (alive) setRemote({ events: [], error: (e as Error).message });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="monitor">
      <h2>{t("monitor.title")}</h2>
      <p className="muted">{t("monitor.intro", { n: events.length })}</p>

      <div className="stat-row">
        <Card label={t("monitor.errors")} value={summary.errors} tone={summary.errors ? "#e5484d" : undefined} />
        <Card label={t("monitor.apiErrors")} value={summary.apiErrors} tone={summary.apiErrors ? "#f5a623" : undefined} />
        <Card label={t("monitor.wsDrops")} value={summary.wsDrops} tone={summary.wsDrops ? "#f5a623" : undefined} />
        <Card label={t("monitor.total")} value={summary.total} />
      </div>

      <section className="card">
        <h3>{t("monitor.vitals")}</h3>
        {Object.keys(summary.vitals).length === 0 ? (
          <div className="muted">{t("monitor.noVitals")}</div>
        ) : (
          <table className="vt">
            <thead>
              <tr>
                <th>{t("monitor.col.metric")}</th>
                <th>{t("monitor.col.value")}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.vitals).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>
                    {v.toFixed(2)}
                    {VITAL_UNIT[k] ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>{t("monitor.events")}</h3>
        {events.length === 0 ? (
          <div className="muted">{t("monitor.noEvents")}</div>
        ) : (
          <table className="evt">
            <thead>
              <tr>
                <th>{t("monitor.col.time")}</th>
                <th>{t("monitor.col.type")}</th>
                <th>{t("monitor.col.name")}</th>
                <th>{t("monitor.col.info")}</th>
                <th>{t("monitor.col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td className="mono">{fmtTime(e.ts)}</td>
                  <td>{t(TYPE_KEY[e.type])}</td>
                  <td>{e.name ?? "--"}</td>
                  <td className="msg-cell">{e.message ?? "--"}</td>
                  <td className="mono">
                    {e.type === "vital"
                      ? `${(e.value ?? 0).toFixed(2)}${VITAL_UNIT[e.name ?? ""] ?? ""}`
                      : [e.status, e.code].filter((x) => x !== undefined).join(" / ") || "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h3>{t("monitor.remote")}</h3>
        {remote.error ? (
          <div className="error">
            {t("monitor.remoteErr", { err: remote.error })}
            <br />
            <span className="muted">{t("monitor.remoteHint")}</span>
          </div>
        ) : !remote.summary ? (
          <div className="muted">{t("monitor.remoteLoading")}</div>
        ) : (
          <>
            <div className="stat-row">
              <Card
                label={`${t("monitor.errors")} (${remote.summary.range ?? t("monitor.all")})`}
                value={remote.summary.errors}
                tone={remote.summary.errors ? "#e5484d" : undefined}
              />
              <Card
                label={t("monitor.apiErrors")}
                value={remote.summary.apiErrors}
                tone={remote.summary.apiErrors ? "#f5a623" : undefined}
              />
              <Card
                label={t("monitor.wsDrops")}
                value={remote.summary.wsDrops}
                tone={remote.summary.wsDrops ? "#f5a623" : undefined}
              />
              <Card label={t("monitor.total")} value={remote.summary.total} />
            </div>
            {remote.events.length === 0 ? (
              <div className="muted">{t("monitor.noRemoteEvents")}</div>
            ) : (
              <table className="evt">
                <thead>
                  <tr>
                    <th>{t("monitor.col.time")}</th>
                    <th>{t("monitor.col.type")}</th>
                    <th>{t("monitor.col.name")}</th>
                    <th>{t("monitor.col.info")}</th>
                    <th>{t("monitor.col.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {remote.events.map((e, i) => (
                    <tr key={i}>
                      <td className="mono">{fmtTime(e.ts)}</td>
                      <td>{t(TYPE_KEY[e.type])}</td>
                      <td>{e.name ?? "--"}</td>
                      <td className="msg-cell">{e.message ?? "--"}</td>
                      <td className="mono">
                        {e.type === "vital"
                          ? `${(e.value ?? 0).toFixed(2)}${VITAL_UNIT[e.name ?? ""] ?? ""}`
                          : [e.status, e.code].filter((x) => x !== undefined).join(" / ") || "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </div>
  );
}
