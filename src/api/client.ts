// 后端 API 客户端。
// 通过 Vite 代理（/api -> 网关 :8787）访问所有微服务；统一注入 Bearer Token，
// 遇到 401 自动用 refresh_token 刷新并重试一次；统一解包 {code,message,data} 响应体。

const ACCESS = "cx_access_token";
const REFRESH = "cx_refresh_token";
const UID = "cx_user_id";
const ROLE = "cx_role";

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
  // 角色：后端登录/刷新时写入；缺失时返回 null（由 RBAC 守卫按最小权限处理）。
  get role() {
    return localStorage.getItem(ROLE);
  },
  set(access: string, refresh: string, uid?: string, role?: string) {
    localStorage.setItem(ACCESS, access);
    localStorage.setItem(REFRESH, refresh);
    if (uid) localStorage.setItem(UID, uid);
    if (role) localStorage.setItem(ROLE, role);
  },
  // 登录后由 /user/me 或刷新接口补全角色时使用。
  setRole(role: string) {
    localStorage.setItem(ROLE, role);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
    localStorage.removeItem(UID);
    localStorage.removeItem(ROLE);
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
      // 刷新失败：会话已失效，清除并跳转登录（对接网关后的标准过期处理）。
      tokenStore.clear();
      if (typeof location !== "undefined") location.hash = "/login";
      throw new ApiError("登录已过期，请重新登录", 401, 401);
    }
  }

  // 无刷新令牌却收到 401（未登录态访问受保护资源）：跳转登录页重新鉴权。
  // 登录接口自身的 401（凭证错误）除外，避免打断登录错误提示。
  if (res.status === 401 && !tokenStore.refresh && !path.includes("/user/login")) {
    if (typeof location !== "undefined") location.hash = "/login";
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }
  if (!res.ok) {
    const msg = body?.message || res.statusText || "请求失败";
    const err = new ApiError(msg, body?.code ?? -1, res.status);
    // 集中上报接口异常（动态导入避免与 monitor 模块形成静态循环依赖）。
    import("../lib/monitor")
      .then((m) => m.reportApiError(err, { path }))
      .catch(() => {});
    throw err;
  }
  if (body && typeof body === "object" && "data" in body) return body.data as T;
  return body as T;
}

// 拼接可选查询参数（忽略 undefined / 空串）。
function withQuery(path: string, params?: Record<string, string | number | undefined>): string {
  if (!params) return path;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

export const api = {
  // ---- 认证 ----
  // 登录成功返回双令牌；网关在 data 中附带 role（admin/operator/user），供客户端 RBAC 使用。
  login: (target: string, password: string) =>
    request<{ access_token: string; refresh_token: string; user_id: number; role?: string }>(
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

  // ---- 用户与设置 ----
  // GET /api/v1/user/me 返回的档案（data 解包后的扁平结构）。
  userMe: () =>
    request<UserProfile>("/api/v1/user/me"),
  // PUT /api/v1/user/me 更新昵称/头像（字段可选，传 undefined 表示不修改）。
  userUpdateProfile: (payload: { nickname?: string; avatar?: string }) =>
    request<{ ok: boolean }>("/api/v1/user/me", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  // POST /api/v1/user/password 登录态改密。
  userChangePassword: (old_password: string, new_password: string) =>
    request<{ ok: boolean; message: string }>("/api/v1/user/password", {
      method: "POST",
      body: JSON.stringify({ old_password, new_password }),
    }),
  userGetPreferences: () =>
    request<UserPreferences>("/api/v1/user/preferences"),
  userUpdatePreferences: (payload: UserPreferences) =>
    request<{ ok: boolean }>("/api/v1/user/preferences", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  // ---- 两步验证 (TFA) ----
  // POST /api/v1/user/tfa/setup 生成 TOTP 密钥（尚未启用）。
  userTfaSetup: () =>
    request<{ secret: string; otpauth_uri: string; message: string }>(
      "/api/v1/user/tfa/setup",
      { method: "POST" }
    ),
  // POST /api/v1/user/tfa/enable 用动态码启用 2FA。
  userTfaEnable: (code: string) =>
    request<{ tfa_enabled: boolean }>("/api/v1/user/tfa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  // POST /api/v1/user/tfa/disable 用动态码关闭 2FA。
  userTfaDisable: (code: string) =>
    request<{ tfa_enabled: boolean }>("/api/v1/user/tfa/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  // ---- KYC ----
  // POST /api/v1/user/kyc/submit 提交 KYC 材料。
  userKycSubmit: (payload: KycPayload) =>
    request<{ kyc_level: number; message: string }>("/api/v1/user/kyc/submit", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // GET /api/v1/user/kyc 获取已提交的 KYC 材料与状态。
  userKycGet: () => request<{ kyc: UserKyc | null }>("/api/v1/user/kyc"),

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
  // GET /api/v1/spot/orders 本人现货订单（后端返回 {orders:[]}，此处解包为数组）。
  spotOrders: async (params?: { symbol?: string; status?: string; limit?: number }) => {
    const d = await request<{ orders: OrderView[] }>(
      withQuery("/api/v1/spot/orders", params as Record<string, string | number | undefined>)
    );
    return d.orders ?? [];
  },
  // GET /api/v1/spot/trades 本人现货成交流水（后端返回 {trades:[]}）。
  spotTrades: async (params?: { symbol?: string; limit?: number }) => {
    const d = await request<{ trades: TradeView[] }>(
      withQuery("/api/v1/spot/trades", params as Record<string, string | number | undefined>)
    );
    return d.trades ?? [];
  },

  // ---- 合约 ----
  futuresPositions: () => request<any[]>("/api/v1/futures/positions"),
  futuresFunding: () => request("/api/v1/futures/funding"),
  futuresIndex: () => request("/api/v1/futures/index"),
  futuresWalletBalance: () => request("/api/v1/futures/wallet/balance"),
  futuresWithdraws: () => request<any[]>("/api/v1/futures/wallet/withdraws"),
  // POST /api/v1/futures/wallet/withdraws/:id/review 提现审核（需 admin 角色）。
  futuresReviewWithdraw: (id: number, action: "approve" | "reject") =>
    request<{ ok: boolean }>(`/api/v1/futures/wallet/withdraws/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),
  // POST /api/v1/futures/wallet/withdraws/batch/review 批量提现审核（需 admin 角色）。
  futuresBatchReviewWithdraw: (ids: number[], action: "approve" | "reject") =>
    request<{ ok: boolean; count: number }>("/api/v1/futures/wallet/withdraws/batch/review", {
      method: "POST",
      body: JSON.stringify({ ids, action }),
    }),
  // POST /api/v1/futures/positions/:id/liquidate 强制平仓（需 admin 角色）。
  futuresLiquidatePosition: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/futures/positions/${id}/liquidate`, { method: "POST" }),
  // POST /api/v1/futures/positions/batch/liquidate 批量强制平仓（需 admin 角色）。
  futuresBatchLiquidatePosition: (ids: number[]) =>
    request<{ ok: boolean; count: number }>("/api/v1/futures/positions/batch/liquidate", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  // GET /api/v1/futures/wallet/ledger 本人资金流水（后端返回 {entries:[]}）。
  walletLedger: async (params?: { asset?: string; limit?: number }) => {
    const d = await request<{ entries: LedgerEntry[] }>(
      withQuery("/api/v1/futures/wallet/ledger", params as Record<string, string | number | undefined>)
    );
    return d.entries ?? [];
  },
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
  // GET /api/v1/futures/orders 本人合约订单（后端返回 {orders:[]}）。
  futuresOrders: async (params?: { symbol?: string; status?: string; limit?: number }) => {
    const d = await request<{ orders: OrderView[] }>(
      withQuery("/api/v1/futures/orders", params as Record<string, string | number | undefined>)
    );
    return d.orders ?? [];
  },
  // GET /api/v1/futures/trades 本人合约成交流水（后端返回 {trades:[]}）。
  futuresTrades: async (params?: { symbol?: string; limit?: number }) => {
    const d = await request<{ trades: TradeView[] }>(
      withQuery("/api/v1/futures/trades", params as Record<string, string | number | undefined>)
    );
    return d.trades ?? [];
  },

  // ---- 期权 ----
  optionContracts: () => request<any[]>("/api/v1/options/contracts"),
  optionPositions: () => request<any[]>("/api/v1/options/positions"),
  // POST /api/v1/options/contracts 上架合约（需 admin 角色）。
  optionCreateContract: (payload: { underlying: string; quote: string; expiry: string; strike?: number }) =>
    request<{ ok: boolean }>("/api/v1/options/contracts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // PUT /api/v1/options/contracts/:id 上/下架切换（需 admin 角色）。
  optionSetContractStatus: (id: number, status: "open" | "closed") =>
    request<{ ok: boolean }>(`/api/v1/options/contracts/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  // POST /api/v1/options/positions/:id/close 强平持仓（需 admin 角色）。
  optionClosePosition: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/options/positions/${id}/close`, { method: "POST" }),
  // POST /api/v1/options/positions/batch/close 批量强平持仓（需 admin 角色）。
  optionBatchClosePosition: (ids: number[]) =>
    request<{ ok: boolean; count: number }>("/api/v1/options/positions/batch/close", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  // ---- OTC ----
  // 列表接口后端返回 {advertisements:[]}/{orders:[]}/{counterparties:[]}，此处解包为数组。
  otcAds: async () => {
    const d = await request<{ advertisements: OtcAd[] }>("/api/v1/otc/advertisements");
    return d.advertisements ?? [];
  },
  otcOrders: async () => {
    const d = await request<{ orders: OtcOrder[] }>("/api/v1/otc/orders");
    return d.orders ?? [];
  },
  otcCounterparties: async () => {
    const d = await request<{ counterparties: OtcCounterparty[] }>("/api/v1/otc/counterparties");
    return d.counterparties ?? [];
  },
  // 发布广告（字段对齐后端：fiat_currency / payment_methods 为逗号分隔字符串）
  otcCreateAd: (payload: OtcCreateAdPayload) =>
    request<OtcAd>("/api/v1/otc/advertisements", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // taker 吃单：按法币金额成交，后端换算 crypto 数量
  otcTakeOrder: (payload: OtcTakeOrderPayload) =>
    request<OtcOrder>("/api/v1/otc/orders/take", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // 状态流转（后端为分散动作接口）
  otcMarkPaid: (orderId: number) =>
    request<{ ok: boolean }>(`/api/v1/otc/orders/${orderId}/pay`, { method: "POST" }),
  otcCompleteOrder: (orderId: number, rating?: number) =>
    request<{ ok: boolean }>(`/api/v1/otc/orders/${orderId}/complete`, {
      method: "POST",
      body: JSON.stringify(rating != null ? { rating } : {}),
    }),
  otcCancelOrder: (orderId: number) =>
    request<{ ok: boolean }>(`/api/v1/otc/orders/${orderId}/cancel`, { method: "POST" }),
  otcOpenDispute: (orderId: number, reason?: string) =>
    request<{ ok: boolean }>(`/api/v1/otc/orders/${orderId}/dispute`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    }),
  // 订单沟通：列表后端返回 {messages:[]}，凭证列表返回 {proofs:[]}，此处解包为数组。
  otcMessages: async (orderId: number) => {
    const d = await request<{ messages: OtcMessage[] }>(`/api/v1/otc/orders/${orderId}/messages`);
    return d.messages ?? [];
  },
  otcSendMessage: (orderId: number, content: string) =>
    request<OtcMessage>(`/api/v1/otc/orders/${orderId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),
  otcProofs: async (orderId: number) => {
    const d = await request<{ proofs: OtcProof[] }>(`/api/v1/otc/orders/${orderId}/proofs`);
    return d.proofs ?? [];
  },
  otcUploadProof: (orderId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<OtcProof>(`/api/v1/otc/orders/${orderId}/proofs`, {
      method: "POST",
      body: fd,
    });
  },

  // ---- 杠杆 ----
  marginAccounts: () => request<any[]>("/api/v1/margin/accounts"),
  marginLiqPrice: () => request("/api/v1/margin/liq-price"),
  // POST /api/v1/margin/accounts/:id/adjust 调整账户余额（需 admin 角色）。
  marginAdjustAccount: (id: number, delta: number, reason?: string) =>
    request<{ ok: boolean }>(`/api/v1/margin/accounts/${id}/adjust`, {
      method: "POST",
      body: JSON.stringify({ delta, reason }),
    }),
  // POST /api/v1/margin/accounts/:id/liquidate 强制平仓（需 admin 角色）。
  marginLiquidate: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/margin/accounts/${id}/liquidate`, { method: "POST" }),
  // POST /api/v1/margin/accounts/batch/liquidate 批量强制平仓（需 admin 角色）。
  marginBatchLiquidate: (ids: number[]) =>
    request<{ ok: boolean; count: number }>("/api/v1/margin/accounts/batch/liquidate", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  // ---- 理财 ----
  wealthProducts: () => request("/api/v1/wealth/products"),
  wealthHoldings: () => request("/api/v1/wealth/holdings"),
  // POST /api/v1/wealth/subscribe 认购（需登录）。返回新建持仓。
  wealthSubscribe: (productId: number, amount: number) =>
    request<WealthHolding>("/api/v1/wealth/subscribe", {
      method: "POST",
      body: JSON.stringify({ product_id: productId, amount }),
    }),
  // POST /api/v1/wealth/redeem 赎回（需登录）。返回赎回后的持仓（终态）。
  wealthRedeem: (holdingId: number) =>
    request<WealthHolding>("/api/v1/wealth/redeem", {
      method: "POST",
      body: JSON.stringify({ holding_id: holdingId }),
    }),

  // ---- 风控 ----
  riskRules: () => request<RiskRule[]>("/api/v1/risk/rules"),
  riskCreateRule: (payload: RiskRuleInput) =>
    request<RiskRule>("/api/v1/risk/rules", { method: "POST", body: JSON.stringify(payload) }),
  riskUpdateRule: (id: number, payload: RiskRuleInput) =>
    request<RiskRule>(`/api/v1/risk/rules/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  riskDeleteRule: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/risk/rules/${id}`, { method: "DELETE" }),
  // DELETE /api/v1/risk/rules/batch 批量删除规则（需 admin 角色）。
  riskBatchDeleteRules: (ids: number[]) =>
    request<{ ok: boolean; count: number }>("/api/v1/risk/rules/batch", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    }),
  riskBlacklist: () => request<BlacklistItem[]>("/api/v1/risk/blacklist"),
  riskCreateBlacklist: (payload: BlacklistInput) =>
    request<BlacklistItem>("/api/v1/risk/blacklist", { method: "POST", body: JSON.stringify(payload) }),
  riskDeleteBlacklist: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/risk/blacklist/${id}`, { method: "DELETE" }),
  // DELETE /api/v1/risk/blacklist/batch 批量移除黑名单（需 admin 角色）。
  riskBatchDeleteBlacklist: (ids: number[]) =>
    request<{ ok: boolean; count: number }>("/api/v1/risk/blacklist/batch", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    }),
  riskEvents: () => request<RiskEvent[]>("/api/v1/risk/events"),
  // POST /api/v1/risk/events/:id/resolve 处置事件（resolve=已处理 / ignore=忽略）。
  riskResolveEvent: (id: number, status: "resolved" | "ignored") =>
    request<{ ok: boolean }>(`/api/v1/risk/events/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),
  // POST /api/v1/risk/events/batch/resolve 批量处置事件（需 admin 角色）。
  riskBatchResolveEvents: (ids: number[], status: "resolved" | "ignored") =>
    request<{ ok: boolean; count: number }>("/api/v1/risk/events/batch/resolve", {
      method: "POST",
      body: JSON.stringify({ ids, status }),
    }),

  // ---- 通知 ----
  notifications: () => request<NotificationItem[]>("/api/v1/notification/admin/list"),
  // POST /api/v1/notification/admin 发布通知（需 admin 角色）。
  notificationCreate: (payload: NotificationInput) =>
    request<NotificationItem>("/api/v1/notification/admin", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // POST /api/v1/notification/admin/:id/recall 撤回已发通知（需 admin 角色）。
  notificationRecall: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/notification/admin/${id}/recall`, { method: "POST" }),
  // DELETE /api/v1/notification/admin/:id 删除通知记录（需 admin 角色）。
  notificationDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/notification/admin/${id}`, { method: "DELETE" }),
  // DELETE /api/v1/notification/admin/batch 批量删除通知（需 admin 角色）。
  notificationBatchDelete: (ids: number[]) =>
    request<{ ok: boolean; count: number }>("/api/v1/notification/admin/batch", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    }),

  // ---- 管理总览 ----
  // GET /api/v1/admin/overview 后台总览 KPI（需 admin 角色）。
  adminOverview: () => request<AdminOverview>("/api/v1/admin/overview"),
  // GET /api/v1/admin/audit 后台操作审计日志（需 admin 角色）。
  adminAudit: () => request<AuditLog[]>("/api/v1/admin/audit"),

  // ---- 监控（服务端聚合，需后端实现 /api/v1/monitor/*）----
  monitorSummary: () => request<MonitorSummaryRemote>("/api/v1/monitor/summary"),
  monitorEvents: (limit = 50) =>
    request<MonitorEventItem[]>("/api/v1/monitor/events?limit=" + limit),

  // ---- API 密钥 ----
  // GET /api/v1/user/api-keys 本人密钥列表（后端返回 {api_keys, total}），支持分页与筛选。
  // q: 关键字（匹配备注/公钥）；status: "active"|"disabled"；permission: "read"|"trade"|"withdraw"。
  apiKeys: async (params?: {
    limit?: number;
    offset?: number;
    q?: string;
    status?: string;
    permission?: string;
  }) => {
    const d = await request<{ api_keys: ApiKey[]; total: number }>(
      withQuery("/api/v1/user/api-keys", params as Record<string, string | number | undefined>)
    );
    return { api_keys: d.api_keys ?? [], total: d.total ?? 0 };
  },
  // POST /api/v1/user/api-keys 创建密钥（需登录）。返回密钥元数据与仅展示一次 secret。
  apiKeyCreate: (payload: ApiKeyCreatePayload) =>
    request<ApiKeyCreated>("/api/v1/user/api-keys", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // PUT /api/v1/user/api-keys/:id 更新密钥（当前仅支持状态启用/禁用）。
  apiKeyUpdate: (id: number, payload: { status: "active" | "disabled" }) =>
    request<{ ok: boolean }>(`/api/v1/user/api-keys/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  // DELETE /api/v1/user/api-keys/:id 撤销密钥（不可恢复）。
  apiKeyDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/user/api-keys/${id}`, { method: "DELETE" }),

  // ---- 公告 ----
  // GET /api/v1/announcement/list 公开列表（仅已发布），解包为数组。
  listAnnouncements: async () => {
    const d = await request<{ announcements: Announcement[] }>("/api/v1/announcement/list");
    return d.announcements ?? [];
  },
  // GET /api/v1/announcement/admin 管理后台全量列表（含草稿），解包为数组。
  adminListAnnouncements: async () => {
    const d = await request<{ announcements: Announcement[] }>("/api/v1/announcement/admin");
    return d.announcements ?? [];
  },
  // POST /api/v1/announcement/admin 创建公告（管理后台，需 admin 角色）。
  adminCreateAnnouncement: (payload: AnnouncementInput) =>
    request<Announcement>("/api/v1/announcement/admin", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // PUT /api/v1/announcement/admin/:id 更新公告（管理后台，需 admin 角色）。
  adminUpdateAnnouncement: (id: number, payload: AnnouncementInput) =>
    request<Announcement>(`/api/v1/announcement/admin/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  // DELETE /api/v1/announcement/admin/:id 删除公告（管理后台，需 admin 角色）。
  adminDeleteAnnouncement: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/announcement/admin/${id}`, { method: "DELETE" }),
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

// ---- OTC 领域类型（对齐 /api/v1/otc 后端契约）----
export type OtcSide = "buy" | "sell";

// OTC 订单状态机（后端 OrderStatus）：待付款 -> 已付款 -> 已完成；或走向取消/申诉。
export type OtcOrderStatus = "pending" | "paid" | "completed" | "cancelled" | "disputed";

// 发布 OTC 广告的载荷（后端字段：fiat_currency，payment_methods 为逗号分隔字符串）。
export interface OtcCreateAdPayload {
  side: OtcSide;
  asset: string; // 交易币种，如 USDT
  fiat_currency: string; // 法币，如 CNY
  price: number; // 单笔单价（法币/币）
  min_amount: number; // 单笔最小数量
  max_amount: number; // 单笔最大数量
  payment_methods: string; // 支持的支付方式（逗号分隔）
}

// 针对某条广告吃单的载荷（后端 /orders/take）。按法币金额成交，可选支付方式。
export interface OtcTakeOrderPayload {
  ad_id: number;
  fiat_amount: number; // 本次法币成交金额（由后端换算 crypto 数量）
  payment_method: string; // 选定的支付方式
}

// OTC 广告（maker 挂单）。
export interface OtcAd {
  id: number;
  user_id: number;
  side: OtcSide;
  asset: string;
  fiat_currency: string;
  price: number;
  min_amount: number;
  max_amount: number;
  payment_methods: string; // 逗号分隔
  status: string;
  created_at?: string;
  updated_at?: string;
}

// OTC 订单（taker 吃单后生成，crypto 在中央托管）。
export interface OtcOrder {
  id: number;
  ad_id: number;
  maker_id: number;
  taker_id: number;
  side: OtcSide;
  asset: string;
  fiat_currency: string;
  crypto_amount: number; // 后端按人类可读十进制数字序列化
  price: number;
  fiat_amount: number;
  payment_method: string;
  status: OtcOrderStatus;
  rating: number; // 0 表示未评分
  created_at?: string;
  paid_at?: string;
  completed_at?: string;
  updated_at?: string;
}

// OTC 对手方信用/声誉记录（每对用户一条）。
export interface OtcCounterparty {
  user_id: number;
  counterparty_id: number;
  trades_total: number;
  trades_completed: number;
  rating_sum: number;
  rating_count: number;
}

// OTC 订单沟通消息（订单参与方可见）。
export interface OtcMessage {
  id: number;
  order_id: number;
  sender_id: number;
  content: string;
  created_at?: string;
}

// OTC 付款凭证元数据（文件落本地磁盘，仅返回可访问 URL 与元信息）。
export interface OtcProof {
  id: number;
  order_id: number;
  uploader_id: number;
  file_name: string;
  content_type?: string;
  size?: number;
  url?: string;
  created_at?: string;
}

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

// 用户档案（GET /api/v1/user/me 解包后的结构）。
export interface UserProfile {
  user_id: number;
  email: string;
  phone: string;
  nickname?: string;
  avatar?: string;
  status: number;
  kyc_level: number;
  tfa_enabled: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  kyc?: unknown;
}

// 用户个人偏好设置（GET/PUT /api/v1/user/preferences）。
export interface UserPreferences {
  user_id: number;
  language: string; // zh-CN / en-US / zh-TW / ja-JP
  theme: string; // dark / light / midnight / forest / solar / system
  timezone: string; // IANA 时区；空字符串 "" 表示跟随系统
  notify_order: boolean;
  notify_security: boolean;
  notify_marketing: boolean;
  updated_at?: string;
}

// KYC 提交请求体（POST /api/v1/user/kyc/submit）。
export interface KycPayload {
  real_name: string;
  id_type: string; // id_card / passport / driver_license
  id_number: string;
  doc_front?: string; // 证件正面（URL/引用）
  doc_back?: string; // 证件背面
}

// KYC 提交材料与审核状态（GET /api/v1/user/kyc 的 kyc 字段）。
export interface UserKyc {
  user_id: number;
  real_name: string;
  id_type: string;
  id_number: string;
  doc_front?: string;
  doc_back?: string;
  status: number; // 0=None 1=Pending 2=Verified 3=Rejected
  reject_reason?: string;
  submitted_at?: string;
  reviewed_at?: string;
  reviewer?: string;
}

// ---------- API 密钥 ----------
// 密钥权限粒度（对齐交易所常见权限模型）。
export type ApiKeyPermission = "read" | "trade" | "withdraw";

// 一条 API 密钥的只读视图（GET /api/v1/user/api-keys）。
export interface ApiKey {
  id: number;
  user_id: number;
  label: string; // 用户自定义备注
  key: string; // 公钥（可安全展示）
  permissions: ApiKeyPermission[]; // 授权的操作集合
  ip_whitelist: string[]; // 允许调用的 IP / CIDR；空数组表示不限制
  status: "active" | "disabled"; // active=生效中，disabled=已禁用
  created_at?: string;
  last_used_at?: string; // 最近一次调用时间（从未调用为 null/缺失）
}

// 创建密钥的载荷（POST /api/v1/user/api-keys）。
export interface ApiKeyCreatePayload {
  label: string;
  permissions: ApiKeyPermission[];
  ip_whitelist?: string[]; // 可选；缺省/空表示不限制
}

// 创建密钥的返回（secret 仅在创建响应中出现一次，后续不可再获取）。
export interface ApiKeyCreated {
  api_key: ApiKey;
  secret: string;
}

// ---------- 公告 ----------
// 公告等级（影响前端展示样式）。
export type AnnouncementLevel = "info" | "warning" | "maintenance";

// 公告（GET /api/v1/announcement/list 与 /admin 返回的扁平结构）。
export interface Announcement {
  id: number;
  level: AnnouncementLevel;
  title: string;
  content: string;
  active: boolean;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
}

// 创建/更新公告的载荷（字段可选，传 undefined 表示不修改）。
export interface AnnouncementInput {
  level?: AnnouncementLevel;
  title?: string;
  content?: string;
  active?: boolean;
}

// ---------- 通知 ----------
// 通知等级。
export type NotificationLevel = "info" | "warning" | "critical";
// 通知接收范围。
export type NotificationTarget = "all" | "vip" | "user";

// 通知（GET /api/v1/notification/admin/list 返回）。
export interface NotificationItem {
  id: number;
  title: string;
  content: string;
  level: NotificationLevel;
  target: NotificationTarget;
  target_user?: string; // target=user 时指定的接收用户
  status: "sent" | "recalled";
  created_at?: string;
}

// 发布通知的载荷。
export interface NotificationInput {
  title: string;
  content: string;
  level: NotificationLevel;
  target: NotificationTarget;
  target_user?: string;
}

// ---------- 管理总览 ----------
// 后台总览 KPI（GET /api/v1/admin/overview 返回）。
export interface AdminOverview {
  users_total: number;
  users_today: number;
  trade_volume_24h: number;
  orders_24h: number;
  pending_withdraws: number;
  pending_risk_events: number;
  open_disputes: number;
  online_users: number;
}

// 后台操作审计日志（GET /api/v1/admin/audit 返回）。
export interface AuditLog {
  id: number;
  admin_id: number;
  admin_name?: string;
  action: string; // 如 risk.rule.create
  target?: string;
  detail?: string;
  ip?: string;
  created_at?: string;
}

// ---------- 风控 ----------
// 风控规则类型。
export type RiskRuleType = "trade" | "withdraw" | "login" | "api";
// 命中后的处置动作。
export type RiskAction = "block" | "review" | "limit";

// 风控规则（GET /api/v1/risk/rules 返回）。
export interface RiskRule {
  id: number;
  name: string;
  type: RiskRuleType;
  condition: string; // 触发条件描述，如 "单笔 > 100000"
  action: RiskAction;
  priority: number; // 越大越优先
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

// 创建/更新规则的载荷。
export interface RiskRuleInput {
  name: string;
  type: RiskRuleType;
  condition: string;
  action: RiskAction;
  priority?: number;
  enabled?: boolean;
}

// 黑名单目标类型。
export type BlacklistTargetType = "user" | "ip" | "address";

// 黑名单条目（GET /api/v1/risk/blacklist 返回）。
export interface BlacklistItem {
  id: number;
  target_type: BlacklistTargetType;
  target: string; // 用户ID / IP / 链上地址
  reason: string;
  expire_at?: string; // 为空表示永久
  created_at?: string;
}

// 添加黑名单的载荷。
export interface BlacklistInput {
  target_type: BlacklistTargetType;
  target: string;
  reason: string;
  expire_at?: string;
}

// 风控事件等级。
export type RiskEventLevel = "info" | "warning" | "critical";
// 风控事件状态。
export type RiskEventStatus = "open" | "resolved" | "ignored";

// 风控事件（GET /api/v1/risk/events 返回）。
export interface RiskEvent {
  id: number;
  rule_id?: number;
  type: string;
  level: RiskEventLevel;
  target: string;
  detail: string;
  status: RiskEventStatus;
  created_at?: string;
}

// ---------- 理财 ----------
// 理财产品类型。
export type WealthProductType = "current" | "fixed";
// 理财产品状态。
export type WealthProductStatus = "open" | "closed";
// 持仓状态。
export type WealthHoldingStatus = "active" | "funding" | "redeemed";

// 理财产品（GET /api/v1/wealth/products 返回）。
export interface WealthProduct {
  id: number;
  name: string;
  asset: string; // 底层资产，如 USDT
  type: WealthProductType;
  annual_rate: number; // 年化收益率，0.05 表示 5%
  duration_days: number; // 锁定期限（天）；活期为 0
  min_amount: number; // 起购金额
  status: WealthProductStatus;
  created_at?: string;
  updated_at?: string;
}

// 用户理财持仓（GET /api/v1/wealth/holdings 返回）。
// principal / accrued_yield 由后端按人类可读十进制数字序列化（JSON 数字）。
export interface WealthHolding {
  id: number;
  user_id: number;
  product_id: number;
  asset: string;
  principal: number; // 本金（人类单位）
  accrued_yield: number; // 已计收益（人类单位）
  status: WealthHoldingStatus;
  created_at?: string;
  last_accrual_at?: string;
  redeemed_at?: string;
  updated_at?: string;
}

// ---------- 订单 / 成交（现货 + 合约共享 matching.OrderView / TradeView）----------
// 订单状态（对齐后端 matching.OrderStatus）。
export type OrderViewStatus = "open" | "partial" | "filled" | "canceled" | "rejected";

// 一笔订单的只读视图（GET /api/v1/{spot,futures}/orders）。
export interface OrderView {
  id: number;
  user_id: number;
  symbol: string;
  market: string; // spot | futures
  is_margin: boolean; // 杠杆单（现货杠杆 / 合约均为 true）
  leverage: number; // 杠杆倍数（无杠杆为 0）
  side: "buy" | "sell";
  price: number; // 0 表示市价单
  qty: number;
  filled: number; // 已成交量
  status: OrderViewStatus;
  time_in_force?: string;
  created_at: number; // Unix 纳秒
  updated_at: number; // Unix 纳秒
}

// 一笔成交的只读视图（GET /api/v1/{spot,futures}/trades）。
export interface TradeView {
  id: number;
  symbol: string;
  market: string; // spot | futures
  is_margin: boolean;
  leverage: number;
  price: number;
  qty: number;
  taker_id: number;
  maker_id: number;
  taker_side: "buy" | "sell";
  taker_oid: number;
  maker_oid: number;
  time: number; // Unix 纳秒
}

// 用户侧资金流水条目（GET /api/v1/futures/wallet/ledger）。
// delta / balance 由后端按人类可读十进制数字序列化（JSON 数字，正负表示入账/出账）。
export interface LedgerEntry {
  id: number;
  user_id: number;
  asset: string;
  delta: number; // 变动额（+ 入账 / - 出账）
  balance: number; // 变动后可用余额
  biz_type: string; // deposit / withdraw / transfer / funding / liquidation / repay 等
  ref: string; // 关联单号（订单号 / 链上哈希 / 提现 hold_id）
  time: number; // Unix 纳秒
}

// ---------- WebSocket 助手 ----------
// 连接现货行情 WS：推送 {type:'depth',data} 与 {type:'trade',data}。
// 带指数退避自动重连的 WS 连接工厂：掉线后按 1s,2s,4s…（上限 10s）重试；
// 调用方主动关闭（返回的函数）时停止重连。onClose 在每次掉线（含最终用户关闭）时回调，
// 供上层切到轮询态；重连成功后首条消息会把上层 live 标记重新置真（见 Ticker/OrderBook）。
function connectWithRetry(
  url: string,
  onMessage: (ev: MessageEvent) => void,
  onClose?: () => void
): () => void {
  let ws: WebSocket | null = null;
  let closedByUser = false;
  let retries = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const open = () => {
    if (closedByUser) return;
    const sock = new WebSocket(url);
    ws = sock;
    sock.onmessage = onMessage;
    // 错误会紧接着触发 onclose，由 onclose 统一负责重连，这里无需额外处理。
    sock.onerror = () => {};
    sock.onclose = () => {
      if (closedByUser) {
        onClose?.();
        return;
      }
      onClose?.(); // 通知上层掉线（UI 切到轮询态）
      const delay = Math.min(1000 * 2 ** retries, 10000);
      retries++;
      timer = setTimeout(open, delay);
    };
  };

  open();

  return () => {
    closedByUser = true;
    clearTimer();
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    }
  };
}

export function connectSpotWS(
  symbol: string,
  onDepth: (d: Depth) => void,
  onTrade?: (t: any) => void,
  onClose?: () => void
): () => void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/api/v1/spot/ws?symbol=${encodeURIComponent(symbol)}`;
  const onMessage = (ev: MessageEvent) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "depth") onDepth(msg.data as Depth);
      else if (msg.type === "trade") onTrade?.(msg.data);
    } catch {
      /* ignore */
    }
  };
  return connectWithRetry(url, onMessage, onClose);
}

// 连接行情 WS：直接广播 Ticker 快照（即 ticker 对象本身）。
export function connectMarketWS(
  symbol: string,
  onTicker: (t: Ticker) => void,
  onClose?: () => void
): () => void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/api/v1/market/ws?symbol=${encodeURIComponent(symbol)}`;
  const onMessage = (ev: MessageEvent) => {
    try {
      onTicker(JSON.parse(ev.data) as Ticker);
    } catch {
      /* ignore */
    }
  };
  return connectWithRetry(url, onMessage, onClose);
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
  const url = `${proto}://${location.host}/api/v1/market/kline/ws?symbol=${encodeURIComponent(
    symbol
  )}&interval=${encodeURIComponent(interval)}`;
  const onMessage = (ev: MessageEvent) => {
    try {
      const msg = JSON.parse(ev.data);
      const k: Kline | undefined = msg && "t" in msg ? (msg as Kline) : msg?.data;
      if (k && typeof k.t === "number") onKline(k);
    } catch {
      /* ignore */
    }
  };
  return connectWithRetry(url, onMessage, onClose);
}
