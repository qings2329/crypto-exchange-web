import { useEffect, useState } from "react";
import { api, type MonitorSummaryRemote, type MonitorEventItem } from "../api/client";
import {
  subscribeEvents,
  getMonitorSummary,
  type MonitorEvent,
  type MonitorSummary,
} from "../lib/monitor";

const TYPE_LABEL: Record<MonitorEvent["type"], string> = {
  error: "全局错误",
  api_error: "接口异常",
  vital: "性能指标",
  ws_drop: "WS 掉线",
  custom: "自定义",
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
      <h2>监控看板</h2>
      <p className="muted">
        当前会话本地采集（最近 {events.length} 条）。远程聚合需后端实现
        <code> /api/v1/monitor/report </code>
        并另提供查询接口。
      </p>

      <div className="stat-row">
        <Card label="全局错误" value={summary.errors} tone={summary.errors ? "#e5484d" : undefined} />
        <Card label="接口异常" value={summary.apiErrors} tone={summary.apiErrors ? "#f5a623" : undefined} />
        <Card label="WS 掉线" value={summary.wsDrops} tone={summary.wsDrops ? "#f5a623" : undefined} />
        <Card label="事件总数" value={summary.total} />
      </div>

      <section className="card">
        <h3>核心性能指标 (Web Vitals)</h3>
        {Object.keys(summary.vitals).length === 0 ? (
          <div className="muted">暂无数据（需安装 web-vitals 并触发采集）</div>
        ) : (
          <table className="vt">
            <thead>
              <tr>
                <th>指标</th>
                <th>数值</th>
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
        <h3>实时事件流</h3>
        {events.length === 0 ? (
          <div className="muted">暂无事件。试着切换交易对触发 WS 掉线，或访问受保护接口制造异常。</div>
        ) : (
          <table className="evt">
            <thead>
              <tr>
                <th>时间</th>
                <th>类型</th>
                <th>名称</th>
                <th>信息</th>
                <th>状态/数值</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i}>
                  <td className="mono">{fmtTime(e.ts)}</td>
                  <td>{TYPE_LABEL[e.type]}</td>
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
        <h3>服务端聚合（需后端实现 /api/v1/monitor/*）</h3>
        {remote.error ? (
          <div className="error">
            加载失败：{remote.error}
            <br />
            <span className="muted">后端未实现该接口时属正常现象，看板仍以「会话本地」数据为准。</span>
          </div>
        ) : !remote.summary ? (
          <div className="muted">加载中…</div>
        ) : (
          <>
            <div className="stat-row">
              <Card
                label={`全局错误 (${remote.summary.range ?? "全量"})`}
                value={remote.summary.errors}
                tone={remote.summary.errors ? "#e5484d" : undefined}
              />
              <Card
                label="接口异常"
                value={remote.summary.apiErrors}
                tone={remote.summary.apiErrors ? "#f5a623" : undefined}
              />
              <Card
                label="WS 掉线"
                value={remote.summary.wsDrops}
                tone={remote.summary.wsDrops ? "#f5a623" : undefined}
              />
              <Card label="事件总数" value={remote.summary.total} />
            </div>
            {remote.events.length === 0 ? (
              <div className="muted">暂无服务端事件。</div>
            ) : (
              <table className="evt">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>类型</th>
                    <th>名称</th>
                    <th>信息</th>
                    <th>状态/数值</th>
                  </tr>
                </thead>
                <tbody>
                  {remote.events.map((e, i) => (
                    <tr key={i}>
                      <td className="mono">{fmtTime(e.ts)}</td>
                      <td>{TYPE_LABEL[e.type]}</td>
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
