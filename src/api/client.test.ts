import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, tokenStore, ApiError } from "./client";

function mockFetch(resolved: unknown) {
  const fn = vi.fn().mockResolvedValue(resolved);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const okJson = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({ code: 0, message: "ok", data }),
});

const errJson = (code: number, status: number, message: string) => ({
  ok: false,
  status,
  statusText: "ERR",
  json: async () => ({ code, message }),
});

describe("api client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    if (typeof location !== "undefined") location.hash = "";
  });

  it("ApiError 携带 code / status / message", () => {
    const e = new ApiError("m", 40001, 500);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe(40001);
    expect(e.status).toBe(500);
    expect(e.message).toBe("m");
  });

  it("tokenStore 存取、setRole 与 clear", () => {
    tokenStore.set("a", "r", "3", "user");
    expect(tokenStore.access).toBe("a");
    expect(tokenStore.refresh).toBe("r");
    expect(tokenStore.uid).toBe("3");
    expect(tokenStore.role).toBe("user");
    tokenStore.setRole("admin");
    expect(tokenStore.role).toBe("admin");
    tokenStore.clear();
    expect(tokenStore.access).toBeNull();
  });

  it("spotOrders 解包 data，并拼装查询参数与鉴权头", async () => {
    tokenStore.set("tok", "r");
    const fetchMock = mockFetch(okJson({ orders: [{ id: 1, symbol: "BTC_USDT" }] }));
    const orders = await api.spotOrders({ symbol: "BTC_USDT" });
    expect(orders).toEqual([{ id: 1, symbol: "BTC_USDT" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/spot/orders?symbol=BTC_USDT");
    expect(opts.headers.get("Authorization")).toBe("Bearer tok");
  });

  it("spotOrders 忽略 undefined / 空串 查询参数", async () => {
    const fetchMock = mockFetch(okJson({ orders: [] }));
    await api.spotOrders({ symbol: "", status: undefined });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/spot/orders");
  });

  it("placeOrder 以 POST + JSON body 发送", async () => {
    const fetchMock = mockFetch(okJson({ order_id: 7, status: "open" }));
    const r = await api.placeOrder("BTC_USDT", "buy", 100, 1);
    expect(r).toEqual({ order_id: 7, status: "open" });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/spot/order");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({ symbol: "BTC_USDT", side: "buy", price: 100, qty: 1 });
  });

  it("401 且无 refresh_token 时抛出 ApiError；受保护页跳转登录页", async () => {
    location.hash = "#/wallet"; // 受保护路由
    const fetchMock = mockFetch(errJson(401, 401, "未授权"));
    await expect(api.spotOrders({})).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBeNull();
    expect(location.hash).toBe("#/login");
  });

  it("401 在公开页（首页/合约）不强制跳转登录", async () => {
    location.hash = "#/home"; // 公开路由
    mockFetch(errJson(401, 401, "未授权"));
    await expect(api.spotOrders({})).rejects.toBeInstanceOf(ApiError);
    expect(location.hash).toBe("#/home");
  });
});
