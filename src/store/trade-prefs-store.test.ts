// 交易偏好后端同步：hydrate（登录拉取）与 push（改动合并写回）的单元测试。
// 通过 mock api.userGetPreferences / userUpdatePreferences，并复用真实 tokenStore（localStorage 驱动），
// 覆盖「未登录 / 已登录覆盖 / 后端缺字段 / 合并保留其它字段 / 无快照回查 / 接口失败不抛」等路径。

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

// 在 vi.mock 工厂可引用前，先用 hoisted 创建可被工厂包裹的 mock 函数。
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

// 每个用例重新加载 store 模块，隔离模块级 serverSnapshot 单例。
async function loadStore() {
  const mod = await import("./trade-prefs-store");
  return mod.useTradePrefs;
}

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

function logout() {
  localStorage.removeItem("cx_access_token");
}

describe("hydrate（登录后从后端拉取）", () => {
  it("未登录时不调用后端、本地值保持不变", async () => {
    logout();
    const store = await loadStore();
    store.setState({ interval: "1h", changeBasis: "today" });

    await store.getState().hydrate();

    expect(getUserPreferences).not.toHaveBeenCalled();
    expect(updateUserPreferences).not.toHaveBeenCalled();
    expect(store.getState().interval).toBe("1h");
    expect(store.getState().changeBasis).toBe("today");
  });

  it("已登录且后端有值：用后端覆盖本地，并写回（保证两端一致）", async () => {
    login();
    getUserPreferences.mockResolvedValue({
      language: "en",
      theme: "dark",
      trade_interval: "15m",
      change_basis: "1h",
    });
    updateUserPreferences.mockResolvedValue({ ok: true });

    const store = await loadStore();
    store.setState({ interval: "1m", changeBasis: "24h" });

    await store.getState().hydrate();

    expect(getUserPreferences).toHaveBeenCalledTimes(1);
    expect(store.getState().interval).toBe("15m");
    expect(store.getState().changeBasis).toBe("1h");
    expect(updateUserPreferences).toHaveBeenCalledTimes(1);
    const pushed = updateUserPreferences.mock.calls[0][0];
    expect(pushed.trade_interval).toBe("15m");
    expect(pushed.change_basis).toBe("1h");
  });

  it("后端缺交易字段：保留本地默认，仍把本地值同步回后端（补全空字段）", async () => {
    login();
    getUserPreferences.mockResolvedValue({ language: "zh", theme: "light" });
    updateUserPreferences.mockResolvedValue({ ok: true });

    const store = await loadStore(); // 默认 interval=1m changeBasis=24h

    await store.getState().hydrate();

    expect(store.getState().interval).toBe("1m");
    expect(store.getState().changeBasis).toBe("24h");
    expect(updateUserPreferences).toHaveBeenCalledTimes(1);
    const pushed = updateUserPreferences.mock.calls[0][0];
    expect(pushed.language).toBe("zh"); // 其它字段保留
    expect(pushed.theme).toBe("light");
    expect(pushed.trade_interval).toBe("1m");
    expect(pushed.change_basis).toBe("24h");
  });

  it("后端请求失败时不抛错、保持本地值", async () => {
    login();
    getUserPreferences.mockRejectedValue(new Error("network"));

    const store = await loadStore();
    store.setState({ interval: "1h", changeBasis: "today" });

    await expect(store.getState().hydrate()).resolves.toBeUndefined();
    expect(store.getState().interval).toBe("1h");
    expect(store.getState().changeBasis).toBe("today");
    expect(updateUserPreferences).not.toHaveBeenCalled();
  });
});

describe("setInterval / setChangeBasis（改动即推送）", () => {
  it("已登录：推送时合并 serverSnapshot 保留 language/theme 等其它字段", async () => {
    login();
    getUserPreferences.mockResolvedValue({ language: "ja", theme: "dark" });
    updateUserPreferences.mockResolvedValue({ ok: true });

    const store = await loadStore();
    await store.getState().hydrate(); // 建立 serverSnapshot

    store.getState().setInterval("1h");

    expect(updateUserPreferences).toHaveBeenCalledTimes(2); // hydrate 1 次 + 改动 1 次
    const pushed = updateUserPreferences.mock.calls[1][0];
    expect(pushed.language).toBe("ja");
    expect(pushed.theme).toBe("dark");
    expect(pushed.trade_interval).toBe("1h");
    expect(pushed.change_basis).toBe("24h"); // 默认未被后端覆盖
  });

  it("已登录：setChangeBasis 推送合并值", async () => {
    login();
    getUserPreferences.mockResolvedValue({});
    updateUserPreferences.mockResolvedValue({ ok: true });

    const store = await loadStore();
    store.setState({ interval: "15m", changeBasis: "24h" });

    store.getState().setChangeBasis("today");
    await new Promise((r) => setTimeout(r, 0)); // 让 push 的 await 链完成（无快照需先回查）

    expect(store.getState().changeBasis).toBe("today");
    const pushed = updateUserPreferences.mock.calls.at(-1)![0];
    expect(pushed.change_basis).toBe("today");
    expect(pushed.trade_interval).toBe("15m");
  });

  it("无 serverSnapshot 时推送先回查后端基底，再合并写入", async () => {
    login();
    // 第一次调用来自 push 内的回查基底；返回其它字段供合并。
    getUserPreferences.mockResolvedValue({ language: "en", notify_email: true });

    const store = await loadStore();
    store.getState().setInterval("15m"); // 未 hydrate，serverSnapshot 为 null
    await new Promise((r) => setTimeout(r, 0)); // flush：push 内会 await 回查基底

    expect(getUserPreferences).toHaveBeenCalledTimes(1); // push 内部回查
    expect(updateUserPreferences).toHaveBeenCalledTimes(1);
    const pushed = updateUserPreferences.mock.calls[0][0];
    expect(pushed.language).toBe("en");
    expect(pushed.notify_email).toBe(true);
    expect(pushed.trade_interval).toBe("15m");
  });

  it("未登录：只更新本地、不调用任何后端接口", async () => {
    logout();
    const store = await loadStore();

    store.getState().setInterval("1d");
    store.getState().setChangeBasis("1h");

    expect(getUserPreferences).not.toHaveBeenCalled();
    expect(updateUserPreferences).not.toHaveBeenCalled();
    expect(store.getState().interval).toBe("1d");
    expect(store.getState().changeBasis).toBe("1h");
  });

  it("推送接口失败时不抛错", async () => {
    login();
    getUserPreferences.mockResolvedValue({});
    updateUserPreferences.mockRejectedValue(new Error("500"));

    const store = await loadStore();
    store.setState({ interval: "1m", changeBasis: "24h" });

    await expect(
      new Promise<void>((resolve) => {
        store.getState().setInterval("15m");
        // push 是 fire-and-forget，给微任务一点时间消化 reject。
        setTimeout(resolve, 0);
      })
    ).resolves.toBeUndefined();
    // 本地值仍更新成功
    expect(store.getState().interval).toBe("15m");
  });
});
