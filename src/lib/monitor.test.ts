import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError } from "../api/client";
import {
  report,
  reportApiError,
  reportVital,
  reportWsDrop,
  reportCustom,
  getRecentEvents,
  getMonitorSummary,
  subscribeEvents,
  initMonitor,
  type MonitorEvent,
} from "../lib/monitor";

describe("monitor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // 静音 report 在未启用时的 console.debug，保持测试输出干净。
    vi.spyOn(console, "debug").mockImplementation(() => {});
    // 全局桩 fetch：避免上报触发真实网络请求；enabled 时的 flush 也走此桩。
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    localStorage.clear();
  });

  it("report 写入本地缓冲，getRecentEvents / getMonitorSummary 可读", () => {
    report({ type: "error", message: "boom" });
    const events = getRecentEvents();
    expect(events.some((e) => e.type === "error" && e.message === "boom")).toBe(true);
    expect(getMonitorSummary().errors).toBeGreaterThanOrEqual(1);
  });

  it("reportApiError(ApiError) 上报 api_error 并携带 code/status", () => {
    reportApiError(new ApiError("bad", 40001, 500));
    const last = getRecentEvents().filter((e) => e.type === "api_error").pop() as MonitorEvent;
    expect(last).toMatchObject({ type: "api_error", code: 40001, status: 500, message: "bad" });
  });

  it("reportApiError(普通 Error) 上报 api_error 携带 message，无 code", () => {
    reportApiError(new Error("plain"));
    const last = getRecentEvents().filter((e) => e.type === "api_error").pop() as MonitorEvent;
    expect(last?.message).toBe("plain");
    expect(last?.code).toBeUndefined();
  });

  it("reportVital 记录 vital 数值并进入 summary", () => {
    reportVital("LCP", 1234.5);
    expect(getRecentEvents().some((e) => e.type === "vital" && e.name === "LCP" && e.value === 1234.5)).toBe(true);
    expect(getMonitorSummary().vitals.LCP).toBe(1234.5);
  });

  it("reportWsDrop 记录 ws_drop", () => {
    reportWsDrop("BTC_USDT");
    expect(getRecentEvents().some((e) => e.type === "ws_drop" && e.name === "BTC_USDT")).toBe(true);
    expect(getMonitorSummary().wsDrops).toBeGreaterThanOrEqual(1);
  });

  it("reportCustom 记录 custom 与 meta", () => {
    reportCustom("ping", { a: 1 });
    expect(getRecentEvents().some((e) => e.type === "custom" && e.name === "ping")).toBe(true);
  });

  it("subscribeEvents 立即推送当前缓冲，退订后停止", () => {
    const cb = vi.fn();
    const unsub = subscribeEvents(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    const before = cb.mock.calls.length;
    report({ type: "custom", name: "x" });
    expect(cb.mock.calls.length).toBe(before + 1);
    unsub();
    const after = cb.mock.calls.length;
    report({ type: "custom", name: "y" });
    expect(cb.mock.calls.length).toBe(after);
  });

  it("initMonitor(enabled) 时 api_error 通过 fetch(keepalive) 上报并带鉴权头", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    localStorage.setItem("cx_access_token", "tok");
    initMonitor({ enabled: true, endpoint: "/api/v1/monitor/report" });
    reportApiError(new ApiError("e", 1, 500));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalled();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/monitor/report");
    expect(opts.headers.Authorization).toBe("Bearer tok");
    expect(opts.keepalive).toBe(true);
  });
});
