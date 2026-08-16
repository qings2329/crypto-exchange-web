// 后端 API 客户端。
// 通过 Vite 代理（/api -> 网关 :8080）访问所有微服务；统一注入 Bearer Token，
// 遇到 401 自动用 refresh_token 刷新并重试一次；统一解包 {code,message,data} 响应体。

const ACCESS = "cx_access_token";
const REFRESH = "cx_refresh_token";
const UID = "cx_user_id";

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS);
  },
  get refresh() {
    return localStorage.getItem(REFRESH);
  },
  get uid() {
    return localStorage.getItem(UID);
  },
  set(access: string, refresh: string, uid?: string) {
    localStorage.setItem(ACCESS, access);
    localStorage.setItem(REFRESH, refresh);
    if (uid) localStorage.setItem(UID, uid);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
    localStorage.removeItem(UID);
  },
};

export class ApiError extends Error {
  code: number;
  status: number;
  constructor(message: string, code: number, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let refreshing: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshing) return refreshing;
  const rt = tokenStore.refresh;
  if (!rt) return Promise.reject(new ApiError("未登录", 401, 401));
  refreshing = (async () => {
    const res = await fetch("/api/v1/user/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.access_token) throw new ApiError("刷新失败", body?.code ?? -1, res.status);
    tokenStore.set(body.access_token as string, rt, tokenStore.uid ?? undefined);
    return body.access_token as string;
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = async (token?: string): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  };

  let res = await doFetch(tokenStore.access ?? undefined);

  if (res.status === 401 && tokenStore.refresh) {
    try {
      const next = await refreshAccessToken();
      res = await doFetch(next);
    } catch {
      tokenStore.clear();
      throw new ApiError("登录已过期，请重新登录", 401, 401);
    }
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }
  if (!res.ok) {
    const msg = body?.message || res.statusText || "请求失败";
    throw new ApiError(msg, body?.code ?? -1, res.status);
  }
  if (body && typeof body === "object" && "data" in body) return body.data as T;
  return body as T;
}

export const api = {
  // ---- 认证 ----
  login: (target: string, password: string) =>
    request<{ access_token: string; refresh_token: string; user_id: number }>(
      "/api/v1/user/login",
      { method: "POST", body: JSON.stringify({ target, password }) }
    ),
  register: (target: string, password: string, code: string) =>
    request<{ user_id: number; message: string }>("/api/v1/user/register", {
      method: "POST",
      body: JSON.stringify({ target, password, code }),
    }),
  sendCode: (target: string, purpose: string) =>
    request<{ message: string }>("/api/v1/user/send-code", {
      method: "POST",
      body: JSON.stringify({ target, purpose }),
    }),
  logout: (refresh_token: string) =>
    request<{ message: string }>("/api/v1/user/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),

  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),

  // ---- 现货 ----
  getDepth: (symbol: string) =>
    request<{ bids: DepthRow[]; asks: DepthRow[] }>(
      `/api/v1/spot/depth?symbol=${encodeURIComponent(symbol)}`
    ),
  getTicker: (symbol: string) =>
    request<Ticker>(`/api/v1/market/ticker?symbol=${encodeURIComponent(symbol)}`),
  // ---- 行情 K 线 ----
  getKline: (symbol: string, interval = "1m", limit = 500) =>
    request<Kline[]>(
      `/api/v1/market/kline?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(
        interval
      )}&limit=${limit}`
    ),
  placeOrder: (symbol: string, side: "buy" | "sell", price: number, qty: number) =>
    request<{ order_id: number; status: string }>("/api/v1/spot/order", {
      method: "POST",
      body: JSON.stringify({ symbol, side, price, qty }),
    }),

  // ---- 合约 ----
  futuresPositions: () => request("/api/v1/futures/positions"),
  futuresFunding: () => request("/api/v1/futures/funding"),
  futuresIndex: () => request("/api/v1/futures/index"),
  futuresWalletBalance: () => request("/api/v1/futures/wallet/balance"),
  futuresWithdraws: () => request("/api/v1/futures/wallet/withdraws"),
  futuresWithdraw: (payload: {
    asset: string;
    address: string;
    amount: number;
    network?: string;
  }) =>
    request<{ order_id: number; status: string }>("/api/v1/futures/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ---- 期权 ----
  optionContracts: () => request("/api/v1/options/contracts"),
  optionPositions: () => request("/api/v1/options/positions"),

  // ---- OTC ----
  otcAds: () => request("/api/v1/otc/advertisements"),
  otcOrders: () => request("/api/v1/otc/orders"),
  otcCounterparties: () => request("/api/v1/otc/counterparties"),
  otcCreateAd: (payload: OtcAdPayload) =>
    request<{ ad_id: number; status: string }>("/api/v1/otc/advertisements", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  otcPlaceOrder: (payload: OtcOrderPayload) =>
    request<{ order_id: number; status: string }>("/api/v1/otc/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  otcUpdateOrderStatus: (orderId: number, status: OtcOrderStatus) =>
    request<{ order_id: number; status: string }>(`/api/v1/otc/orders/${orderId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  // ---- 杠杆 ----
  marginAccount: () => request("/api/v1/margin/account"),
  marginAccounts: () => request("/api/v1/margin/accounts"),
  marginLiqPrice: () => request("/api/v1/margin/liq-price"),

  // ---- 理财 ----
  wealthProducts: () => request("/api/v1/wealth/products"),
  wealthHoldings: () => request("/api/v1/wealth/holdings"),

  // ---- 风控 ----
  riskRules: () => request("/api/v1/risk/rules"),
  riskBlacklist: () => request("/api/v1/risk/blacklist"),
  riskEvents: () => request("/api/v1/risk/events"),

  // ---- 通知 ----
  notifications: () => request("/api/v1/notification/admin/list"),

  // ---- 监控（服务端聚合，需后端实现 /api/v1/monitor/*）----
  monitorSummary: () => request<MonitorSummaryRemote>("/api/v1/monitor/summary"),
  monitorEvents: (limit = 50) =>
    request<MonitorEventItem[]>("/api/v1/monitor/events?limit=" + limit),
};

// ---------- 类型 ----------
export interface DepthRow {
  price: number;
  volume: number;
}
export interface Depth {
  bids: DepthRow[];
  asks: DepthRow[];
}
export interface Ticker {
  symbol: string;
  last: number;
  best_bid: number;
  best_ask: number;
  timestamp: number;
}

// 单根 K 线（OHLCV）。t 为毫秒时间戳，o/h/l/c/v 分别为开/高/低/收/量。
export interface Kline {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// 发布 OTC 广告的载荷。side 为买卖方向，payment_methods 为支付方式列表。
export interface OtcAdPayload {
  side: "buy" | "sell";
  asset: string; // 交易币种，如 USDT
  fiat: string; // 法币，如 CNY
  price: number; // 单笔单价（法币/币）
  min_amount: number; // 单笔最小数量
  max_amount: number; // 单笔最大数量
  payment_methods: string[]; // 支持的支付方式
  remark?: string; // 备注（可选）
}

// 针对某条广告下单的载荷。amount 为本次成交数量。
export interface OtcOrderPayload {
  ad_id: number;
  amount: number;
}

// OTC 订单状态机：待付款 -> 已付款 -> 已完成；或走向取消/申诉。
export type OtcOrderStatus = "pending" | "paid" | "completed" | "cancelled" | "appeal";

// ---------- 监控查询（后端聚合接口返回结构）----------
export interface MonitorSummaryRemote {
  errors: number; // 全局错误总数
  apiErrors: number; // 接口异常总数
  wsDrops: number; // WS 掉线总数
  vitals: Record<string, number>; // 最新/聚合的核心指标
  total: number; // 事件总数
  range?: string; // 聚合窗口，例如 "24h"
}

export interface MonitorEventItem {
  ts: number;
  type: "error" | "api_error" | "vital" | "ws_drop" | "custom";
  name?: string;
  message?: string;
  code?: number;
  status?: number;
  value?: number;
  meta?: Record<string, unknown>;
}

// ---------- WebSocket 助手 ----------
// 连接现货行情 WS：推送 {type:'depth',data} 与 {type:'trade',data}。
export function connectSpotWS(
  symbol: string,
  onDepth: (d: Depth) => void,
  onTrade?: (t: any) => void,
  onClose?: () => void
): () => void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/api/v1/spot/ws?symbol=${encodeURIComponent(symbol)}`);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "depth") onDepth(msg.data as Depth);
      else if (msg.type === "trade") onTrade?.(msg.data);
    } catch {
      /* ignore */
    }
  };
  if (onClose) {
    ws.onclose = onClose;
    ws.onerror = onClose;
  }
  return () => ws.close();
}

// 连接行情 WS：直接广播 Ticker 快照（即 ticker 对象本身）。
export function connectMarketWS(
  symbol: string,
  onTicker: (t: Ticker) => void,
  onClose?: () => void
): () => void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/api/v1/market/ws?symbol=${encodeURIComponent(symbol)}`);
  ws.onmessage = (ev) => {
    try {
      onTicker(JSON.parse(ev.data) as Ticker);
    } catch {
      /* ignore */
    }
  };
  if (onClose) {
    ws.onclose = onClose;
    ws.onerror = onClose;
  }
  return () => ws.close();
}

// 连接 K 线 WS：按 symbol+interval 订阅，每次成交推送当前整根蜡烛（含量、自动翻根）。
// 消息体约定为 Kline 对象本身，或 {type:'kline',data} 包裹。
export function connectKlineWS(
  symbol: string,
  interval: string,
  onKline: (k: Kline) => void,
  onClose?: () => void
): () => void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(
    `${proto}://${location.host}/api/v1/market/kline/ws?symbol=${encodeURIComponent(
      symbol
    )}&interval=${encodeURIComponent(interval)}`
  );
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      const k: Kline | undefined = msg && "t" in msg ? (msg as Kline) : msg?.data;
      if (k && typeof k.t === "number") onKline(k);
    } catch {
      /* ignore */
    }
  };
  if (onClose) {
    ws.onclose = onClose;
    ws.onerror = onClose;
  }
  return () => ws.close();
}
