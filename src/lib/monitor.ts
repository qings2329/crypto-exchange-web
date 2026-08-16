// 前端监控与上报模块。
// 职责：全局错误捕获、接口异常上报、Web Vitals 采集、WS 掉线上报。
// 设计原则：零强制依赖、可降级——未启用或上报端点不可用时只在 console 输出，绝不向外抛错。
// web-vitals 为可选依赖：需自行 `npm i web-vitals`，缺失时性能采集自动跳过。

import { ApiError } from "../api/client";

export type MonitorEvent = {
  type: "error" | "api_error" | "vital" | "ws_drop" | "custom";
  name?: string; // vital 名 / 交易对 symbol / 自定义名
  message?: string;
  code?: number; // ApiError.code
  status?: number; // ApiError.status（HTTP）
  value?: number; // vital 数值（毫秒）
  stack?: string;
  meta?: Record<string, unknown>;
  ts?: number;
};

// ---- 配置 ----
let ENDPOINT = "/api/v1/monitor/report"; // 自定义上报端点（需后端实现，缺失也无碍）
let enabled = false;
let queue: MonitorEvent[] = [];

// ---- 本地缓冲（供监控看板页读取，独立于远程上报，开发环境也可用）----
const MAX_EVENTS = 200;
const buffer: MonitorEvent[] = [];
const subscribers = new Set<(events: MonitorEvent[]) => void>();

function pushLocal(e: MonitorEvent) {
  buffer.push(e);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
  subscribers.forEach((cb) => cb(buffer.slice()));
}

export function subscribeEvents(cb: (events: MonitorEvent[]) => void): () => void {
  subscribers.add(cb);
  cb(buffer.slice());
  return () => subscribers.delete(cb);
}

export function getRecentEvents(limit = MAX_EVENTS): MonitorEvent[] {
  return buffer.slice(-limit);
}

export interface MonitorSummary {
  errors: number;
  apiErrors: number;
  wsDrops: number;
  vitals: Record<string, number>;
  total: number;
}

export function getMonitorSummary(): MonitorSummary {
  const s: MonitorSummary = { errors: 0, apiErrors: 0, wsDrops: 0, vitals: {}, total: buffer.length };
  for (const e of buffer) {
    if (e.type === "error") s.errors++;
    else if (e.type === "api_error") s.apiErrors++;
    else if (e.type === "ws_drop") s.wsDrops++;
    else if (e.type === "vital" && e.name) s.vitals[e.name] = e.value ?? 0;
  }
  return s;
}

// ---- 上报传输：优先 sendBeacon（页面卸载不丢），回退 fetch(keepalive) ----
function flush() {
  if (!queue.length) return;
  const batch = queue;
  queue = [];
  const payload = JSON.stringify({ events: batch });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon(ENDPOINT, blob)) return;
  }
  if (typeof fetch !== "undefined") {
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* 上报失败不影响业务 */
    });
  }
}

export function report(e: MonitorEvent) {
  const full: MonitorEvent = { ts: Date.now(), ...e };
  // 本地缓冲始终记录，供看板展示（无论是否启用远程上报）
  pushLocal(full);
  if (!enabled) {
    // 降级：开发/未配置时打印，便于本地观察
    // eslint-disable-next-line no-console
    console.debug("[monitor]", full.type, full);
    return;
  }
  queue.push(full);
  // 错误类即时发送；常规事件攒批
  if (full.type === "error" || full.type === "api_error") flush();
  else if (queue.length >= 10) flush();
}

// ---- 业务侧便捷上报 ----

export function reportApiError(err: unknown, meta?: Record<string, unknown>) {
  if (err instanceof ApiError) {
    report({ type: "api_error", message: err.message, code: err.code, status: err.status, meta });
  } else {
    report({
      type: "api_error",
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      meta,
    });
  }
}

export function reportVital(name: string, value: number) {
  report({ type: "vital", name, value });
}

export function reportWsDrop(symbol: string) {
  report({ type: "ws_drop", name: symbol });
}

export function reportCustom(name: string, meta?: Record<string, unknown>) {
  report({ type: "custom", name, meta });
}

// ---- 全局错误捕获 ----
function onError(ev: ErrorEvent) {
  const err = ev.error;
  report({
    type: "error",
    message: ev.message,
    stack: err instanceof Error ? err.stack : undefined,
    meta: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
  });
}

function onReject(ev: PromiseRejectionEvent) {
  const reason = ev.reason;
  report({
    type: "error",
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    meta: { kind: "unhandledrejection" },
  });
}

// ---- 可选：Web Vitals（需安装 web-vitals）----
async function loadVitals() {
  try {
    // 用变量名 + @vite-ignore：构建期不解析缺失模块，运行时缺失由 catch 吞掉
    const spec = "web-vitals";
    const mod: any = await import(/* @vite-ignore */ spec);
    const cb = (m: { name: string; value: number }) => reportVital(m.name, m.value);
    mod.onLCP?.(cb);
    mod.onCLS?.(cb);
    mod.onINP?.(cb);
    mod.onFCP?.(cb);
    mod.onTTFB?.(cb);
  } catch {
    /* 未安装 web-vitals，跳过性能采集 */
  }
}

// ---- 初始化入口：在应用启动时调用一次 ----
export function initMonitor(opts?: { endpoint?: string; enabled?: boolean }) {
  if (opts?.endpoint) ENDPOINT = opts.endpoint;
  enabled = opts?.enabled ?? true;
  if (!enabled) return;

  if (typeof window !== "undefined") {
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
  }
  void loadVitals();
}
