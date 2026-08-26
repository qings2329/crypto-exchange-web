// 偏好同步性能测试（性能回归护栏）。
//
// 用「模拟后端延迟」测量交易偏好同步的时延与后端调用量，防止后续重构引入：
//   - hydrate 的串行放大（应为 1 次 GET + 1 次写回 PUT）
//   - 改偏好时的冗余回查 GET（serverSnapshot 建立后应只 PUT、不再 GET）
//   - 突发改动的读放大（每次改动 1 次写，绝不额外回查）
// 时延断言留足余量，目标是「回归护栏」而非压测精确值。

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const { getUserPreferences, updateUserPreferences } = vi.hoisted(() => ({
  getUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
}));

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      userGetPreferences: (...args: any[]) => getUserPreferences(...args),
      userUpdatePreferences: (...args: any[]) => updateUserPreferences(...args),
    },
  };
});

async function loadStore() {
  const mod = await import("./trade-prefs-store");
  return mod.useTradePrefs;
}

// 模拟后端 RTT（真实定时器），用于测量同步时延。
const LATENCY = 12;
const delayed = <T>(v: T): Promise<T> =>
  new Promise((res) => setTimeout(() => res(v), LATENCY));
const flush = (ms = 60) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => {
  vi.resetModules();
});

function login() {
  localStorage.setItem("cx_access_token", "test-token");
}

describe("trade-prefs 同步性能", () => {
  it("hydrate：1 次 GET + 1 次写回 PUT，时延受后端延迟约束（无串行放大）", async () => {
    login();
    getUserPreferences.mockImplementation(() => delayed({ trade_interval: "1h", change_basis: "today" }));
    updateUserPreferences.mockImplementation(() => delayed({ ok: true }));

    const store = await loadStore();
    const t0 = Date.now();
    await store.getState().hydrate();
    const dt = Date.now() - t0;

    // 顺序为 GET(rtt) → PUT(rtt)，留足余量护栏
    expect(dt).toBeLessThan(LATENCY * 2 + 250);
    expect(getUserPreferences).toHaveBeenCalledTimes(1);
    expect(updateUserPreferences).toHaveBeenCalledTimes(1);
  });

  it("改偏好：仅 1 次 PUT，且不再回查 GET（避免冗余读）", async () => {
    login();
    getUserPreferences.mockImplementation(() => delayed({}));
    updateUserPreferences.mockImplementation(() => delayed({ ok: true }));

    const store = await loadStore();
    await store.getState().hydrate();
    getUserPreferences.mockClear();
    updateUserPreferences.mockClear();

    const t0 = Date.now();
    store.getState().setInterval("15m"); // 触发 fire-and-forget push
    await flush();
    const dt = Date.now() - t0;

    expect(dt).toBeLessThan(LATENCY + 250);
    expect(updateUserPreferences).toHaveBeenCalledTimes(1);
    expect(getUserPreferences).not.toHaveBeenCalled(); // serverSnapshot 已建立，无冗余 GET
  });

  it("连续改动突发：写次数 = 改动次数，且无额外 GET（不放大读）", async () => {
    login();
    getUserPreferences.mockImplementation(() => delayed({}));
    updateUserPreferences.mockImplementation(() => delayed({ ok: true }));

    const store = await loadStore();
    await store.getState().hydrate();
    getUserPreferences.mockClear();
    updateUserPreferences.mockClear();

    const K = 20;
    const t0 = Date.now();
    for (let i = 0; i < K; i++) store.getState().setInterval(i % 2 ? "15m" : "1h");
    await flush(150);
    const dt = Date.now() - t0;

    // 性能护栏：20 次突发写入应并发完成（远小于串行 20*rtt）
    expect(dt).toBeLessThan(LATENCY * 4 + 400);
    expect(getUserPreferences).not.toHaveBeenCalled(); // 无冗余读放大
    expect(updateUserPreferences).toHaveBeenCalledTimes(K); // 每次改动一次写（基线护栏）
  });
});
