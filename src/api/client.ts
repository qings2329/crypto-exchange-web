// 后端 API 客户端。
// 通过 Vite 代理（/api -> 网关 :8787）访问所有微服务；统一注入 Bearer Token，
// 遇到 401 自动用 refresh_token 刷新并重试一次；统一解包 {code,message,data} 响应体。

import { isPublicRoute } from "../lib/routes";

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

// 错误语义分类：用于 Toast 层区分「未登录/会话过期(401)」与「已登录但权限不足(403)」，
// 避免把 403 误提示为「请先登录」。由 HTTP 状态码派生，无需调用方显式传递。
export type ApiErrorKind = "unauthorized" | "forbidden" | "other";

export class ApiError extends Error {
  code: number;
  status: number;
  kind: ApiErrorKind;
  constructor(message: string, code: number, status: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.kind =
      status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "other";
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
    // 后端响应体为 {code,message,data}，data 内含新签发的双令牌；
    // 旧 refresh_token 已被网关轮转失效，必须回写 data.refresh_token，否则下次刷新必然失败。
    const data = body?.data;
    if (!res.ok || !data?.access_token) throw new ApiError("刷新失败", body?.code ?? -1, res.status);
    tokenStore.set(data.access_token as string, data.refresh_token as string, tokenStore.uid ?? undefined, tokenStore.role ?? undefined);
    return data.access_token as string;
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

  // 鉴权流接口（登录/注册/发码）的 401 代表「账号或密码错误 / 验证码错误」等业务失败，
  // 不应触发 refresh 续期重试，也不应被统一失效处理覆盖成「登录已过期」。
  const isAuthFlow = /\/user\/(login|register|send-code)$/.test(path);

  let res = await doFetch(tokenStore.access ?? undefined);

  // 统一 401 处理：仅对受保护接口尝试 refresh 续期；
  // 无论「无刷新令牌 / 刷新失败 / 刷新成功但重试仍 401」，只要最终仍是 401，
  // 就判定会话失效——强制清登录态并跳登录页，杜绝「Header 仍显示已登录、
  // 钱包余额/提现记录却提示请先登录」的半死状态（修复偶发显示请先登录）。
  if (res.status === 401 && tokenStore.refresh && !isAuthFlow) {
    try {
      const next = await refreshAccessToken();
      res = await doFetch(next);
    } catch {
      // 刷新失败：落入下方统一失效处理
    }
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }

  if (res.status === 401) {
    if (!isPublicRoute() && !isAuthFlow) {
      tokenStore.clear();
      // 同步 React 登录态：仅清 localStorage 不足以让 Header 等消费 useAuth 的组件
      // 及时更新，否则会出现「顶栏仍显示已登录、接口却 401」的割裂。
      if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:expired"));
      if (typeof location !== "undefined") location.hash = "/login";
    }
    // 鉴权流接口保留后端原始报错（如「账号或密码错误」）；
    // 受保护接口会话确已失效，统一提示重新登录。
    const msg = isAuthFlow ? (body?.message || "登录失败") : "登录已过期，请重新登录";
    throw new ApiError(msg, res.status, res.status);
  }
  if (!res.ok) {
  // 403：用户前端无管理员/运营角色概念，此处按状态码构造错误，由 Toast / InlineError
  // 统一归为「会话失效」引导重新登录（而非「权限不足」）。
    const msg =
      res.status === 403
        ? body?.message || "权限不足"
        : body?.message || res.statusText || "请求失败";
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
  register: (target: string, password: string, code: string, referralCode?: string) =>
    request<{ user_id: number; message: string }>("/api/v1/user/register", {
      method: "POST",
      body: JSON.stringify({ target, password, code, referral_code: referralCode }),
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
  // GET /api/v1/user/kyc 获取 KYC 记录与等级权益（服务端惰性落审）。
  userKycGet: () =>
    request<{ kyc: UserKyc | null; limits: KycLimits }>("/api/v1/user/kyc"),

  // ---- 用户通知（站内信） ----
  userNotifications: async (params?: { limit?: number; unread_only?: boolean }) => {
    const d = await request<{ notifications: UserNotification[]; unread: number }>(
      withQuery("/api/v1/user/notifications", params as Record<string, string | number | undefined>)
    );
    return d;
  },
  userNotificationUnread: () =>
    request<{ count: number }>("/api/v1/user/notifications/unread-count"),
  userNotificationRead: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/user/notifications/${id}/read`, { method: "POST" }),
  userNotificationReadAll: () =>
    request<{ ok: boolean }>("/api/v1/user/notifications/read-all", { method: "POST" }),
  userNotificationDelete: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/user/notifications/${id}`, { method: "DELETE" }),

  // ---- 现货 ----
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
  // POST /api/v1/spot/cancel 撤销本人现货委托（服务端校验归属，释放预冻结）。
  spotCancelOrder: (body: { symbol: string; orderId: number }) =>
    request<{ symbol: string; order_id: number; canceled: boolean }>("/api/v1/spot/cancel", {
      method: "POST",
      body: JSON.stringify({ symbol: body.symbol, order_id: body.orderId }),
    }),
  // POST /api/v1/futures/cancel 撤销本人合约委托（服务端校验归属 + market=futures）。
  futuresCancelOrder: (body: { symbol: string; orderId: number }) =>
    request<{ symbol: string; order_id: number; canceled: boolean }>("/api/v1/futures/cancel", {
      method: "POST",
      body: JSON.stringify({ symbol: body.symbol, order_id: body.orderId }),
    }),
  // GET /api/v1/spot/trades 本人现货成交流水（后端返回 {trades:[]}）。
  spotTrades: async (params?: { symbol?: string; limit?: number }) => {
    const d = await request<{ trades: TradeView[] }>(
      withQuery("/api/v1/spot/trades", params as Record<string, string | number | undefined>)
    );
    return d.trades ?? [];
  },

  // ---- 合约 ----
  futuresWalletBalance: () => request("/api/v1/futures/wallet/balance"),
  // POST /api/v1/futures/wallet/deposit/self 用户侧自助充值（uid 取 token；单笔上限+频控）。
  // 管理端 faucet 为 POST /deposit（AdminGuard），二者并存。
  futuresDeposit: (payload: { asset: string; amount: number; network?: string }) =>
    request<{ status?: string; asset: string; available: number; frozen: number }>(
      "/api/v1/futures/wallet/deposit/self",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    ),
  // POST /api/v1/futures/wallet/transfer 内部划转：资金账户(可用) ⇄ 合约保证金(冻结)。
  futuresTransfer: (payload: { asset: string; amount: number; direction: "to_futures" | "to_funding" }) =>
    request<{ asset: string; available: number; frozen: number }>("/api/v1/futures/wallet/transfer", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ---- 杠杆（现货杠杆，契约对齐 Go internal/margin/handler.go）----
  // POST /api/v1/margin/borrow 借入 asset 数量 amount，杠杆 leverage（抵押 USDT = amount/leverage，冻结）。
  marginBorrow: (payload: { asset: string; amount: number; leverage: number }) =>
    request<MarginAccountRaw>("/api/v1/margin/borrow", {
      method: "POST",
      body: JSON.stringify(payload),
    }).then(normalizeMarginAccount),
  // POST /api/v1/margin/repay 还款（先冲本金后冲利息；超额自动截断；还清解冻抵押并关户）。
  marginRepay: (payload: { asset: string; amount: number }) =>
    request<{ ok: boolean }>("/api/v1/margin/repay", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // GET /api/v1/margin/account?asset= 本人单币种杠杆账户（无活跃账户 → 404 ApiError）。
  marginAccount: async (asset: string) => {
    const raw = await request<MarginAccountRaw>(withQuery("/api/v1/margin/account", { asset }));
    return normalizeMarginAccount(raw);
  },
  // GET /api/v1/margin/accounts 本人全部杠杆账户。
  marginAccounts: async () => {
    const d = await request<{ accounts: MarginAccountRaw[] }>("/api/v1/margin/accounts");
    return (d.accounts ?? []).map(normalizeMarginAccount);
  },
  // GET /api/v1/margin/liq-price?asset= 强平标记价（借入资产以抵押资产计价；无债务返回 0）。
  marginLiqPrice: async (asset: string) => {
    const d = await request<{ user_id: number; asset: string; liq_price: number }>(
      withQuery("/api/v1/margin/liq-price", { asset })
    );
    return Number(d.liq_price) || 0;
  },
  walletLedger: async (params?: { asset?: string; limit?: number }) => {
    const d = await request<{ entries: LedgerEntry[] }>(
      withQuery("/api/v1/futures/wallet/ledger", params as Record<string, string | number | undefined>)
    );
    return d.entries ?? [];
  },
  // 提现为三步流（对齐后端契约）：request 冻结资金进入冷静期 → 冷却结束后 finalize 链上放行，
  // 或 cancel 撤销解冻。finalize 在冷静期内会返回 HTTP 409。
  futuresWithdrawRequest: (payload: {
    asset: string;
    address: string;
    amount: number;
    network?: string;
  }) =>
    request<{
      status: string;
      hold_id: string;
      asset: string;
      amount: number;
      fee: number;
      hold_until: number;
      hold_seconds: number;
    }>("/api/v1/futures/wallet/withdraw/request", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  futuresWithdrawFinalize: (holdId: string) =>
    request<{ status: string; hold_id: string; tx_hash: string; amount: number; fee: number }>(
      "/api/v1/futures/wallet/withdraw/finalize",
      { method: "POST", body: JSON.stringify({ hold_id: holdId }) }
    ),
  futuresWithdrawCancel: (holdId: string) =>
    request<{ status: string; hold_id: string }>("/api/v1/futures/wallet/withdraw/cancel", {
      method: "POST",
      body: JSON.stringify({ hold_id: holdId }),
    }),

  // ---- 提现地址簿（白名单） ----
  // GET /api/v1/futures/wallet/address-book 白名单条目；whitelist_active 表示已启用白名单提现。
  addressBookList: () =>
    request<{ entries: AddressBookEntry[]; whitelist_active: boolean }>(
      "/api/v1/futures/wallet/address-book"
    ),
  // POST 新增地址（同地址重复返回 409）。
  addressBookAdd: (payload: { asset: string; network?: string; address: string; label?: string }) =>
    request<AddressBookEntry>("/api/v1/futures/wallet/address-book", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // DELETE 移除地址。
  addressBookRemove: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/futures/wallet/address-book/${id}`, { method: "DELETE" }),

  // POST /api/v1/futures/order 合约下单（契约对齐 Go futuresapi.handleOrder：open/close + pos_side）。
  futuresPlaceOrder: (p: {
    symbol: string;
    action: "open" | "close";
    pos_side: "long" | "short";
    margin_mode?: "isolated" | "cross";
    leverage?: number;
    price?: number;
    qty: number;
    margin?: number;
  }) =>
    request<{ order_id: string; status: string; realized_pnl?: number }>("/api/v1/futures/order", {
      method: "POST",
      body: JSON.stringify(p),
    }),
  // PUT /api/v1/futures/tpsl 设置/清除持仓止盈止损（服务端持久化）。
  futuresSetTpSl: (payload: { symbol: string; pos_side: "long" | "short"; tp?: number | null; sl?: number | null }) =>
    request<{ symbol: string; pos_side: string; tp: number | null; sl: number | null }>("/api/v1/futures/tpsl", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  // GET /api/v1/futures/positions 本人持仓（服务端结构 {mark_price, positions, cross_balances}，字段为 Go 导出名）。
  futuresPositions: async (symbol?: string) => {
    const d = await request<{
      mark_price: number | null;
      positions: Array<{
        UserID: number;
        Symbol: string;
        Side: "long" | "short";
        Size: number;
        EntryPrice: number;
        Margin: number;
        Leverage: number;
        Mode: string;
        OpenTime: number;
        LiqPriceVal: number;
        TP?: number | null;
        SL?: number | null;
      }>;
      cross_balances: Record<string, number>;
    }>(withQuery("/api/v1/futures/positions", symbol ? { symbol } : undefined));
    return d;
  },
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


  // ---- OTC ----
  // 列表接口后端返回 {advertisements:[]}/{orders:[]}/{counterparties:[]}，此处解包为数组。
  otcAds: async (params?: {
    side?: OtcSide;
    asset?: string;
    fiat?: string;
    method?: string;
    amount?: number;
  }) => {
    const d = await request<{ advertisements: OtcAdView[] }>(
      withQuery("/api/v1/otc/advertisements", params as Record<string, string | number | undefined>)
    );
    return d.advertisements ?? [];
  },
  otcPrices: (asset: string, fiat: string) =>
    request<OtcPrice>(withQuery("/api/v1/otc/prices", { asset, fiat })),
  otcOrders: async () => {
    const d = await request<{ orders: OtcOrder[] }>("/api/v1/otc/orders");
    return d.orders ?? [];
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

  // ---- 理财（Earn Hub）----
  earnProducts: (term?: "flexible" | "fixed" | string) =>
    request<{ products: EarnProduct[] }>(withQuery("/api/v1/earn/products", { term })).then((d) => d.products ?? []),
  earnSubscriptions: async () => {
    const d = await request<{ subscriptions: EarnSubscription[] }>("/api/v1/earn/subscriptions");
    return d.subscriptions ?? [];
  },
  earnSubscribe: (payload: { product_id: number; amount: number; agreed: boolean }) =>
    request<EarnSubscription>("/api/v1/earn/subscribe", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  earnRedeem: (id: number) =>
    request<EarnSubscription>(`/api/v1/earn/subscriptions/${id}/redeem`, { method: "POST" }),

  // ---- 新币挖矿（Launchpool）----
  launchProjects: async () => {
    const d = await request<{ projects: LaunchProject[] }>("/api/v1/launchpad/projects");
    return d.projects ?? [];
  },
  launchPositions: async () => {
    const d = await request<{ positions: LaunchPosition[] }>("/api/v1/launchpad/positions");
    return d.positions ?? [];
  },
  launchStake: (payload: { project_id: number; pool_id: string; amount: number }) =>
    request<LaunchPosition>("/api/v1/launchpad/stake", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  launchUnstake: (payload: { position_id: number; amount?: number }) =>
    request<LaunchPosition>("/api/v1/launchpad/unstake", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  launchHarvest: (position_id: number) =>
    request<LaunchPosition & { claimed: number }>("/api/v1/launchpad/harvest", {
      method: "POST",
      body: JSON.stringify({ position_id }),
    }),


  // ---- 借贷 ----
  lendingPools: async () => {
    const d = await request<{ pools: LendingPool[] }>("/api/v1/lending/pools");
    return d.pools ?? [];
  },
  lendingPoolInfo: (id: number) =>
    request<LendingPoolInfo>(`/api/v1/lending/pools/${id}`),
  lendingLend: (poolId: number, amount: string) =>
    request<LendOrder>("/api/v1/lending/lend", {
      method: "POST",
      body: JSON.stringify({ pool_id: poolId, amount }),
    }),
  lendingBorrow: (poolId: number, borrowAmount: string, collateral: string) =>
    request<BorrowOrder>("/api/v1/lending/borrow", {
      method: "POST",
      body: JSON.stringify({ pool_id: poolId, borrow_amount: borrowAmount, collateral }),
    }),
  lendingRepay: (id: number) =>
    request<BorrowOrder>(`/api/v1/lending/repay/${id}`, { method: "POST" }),
  lendingWithdraw: (id: number) =>
    request<LendOrder>(`/api/v1/lending/withdraw/${id}`, { method: "POST" }),
  lendingMyLends: async () => {
    const d = await request<{ lends: LendOrder[] }>("/api/v1/lending/my/lends");
    return d.lends ?? [];
  },
  lendingMyBorrows: async () => {
    const d = await request<{ borrows: BorrowOrder[] }>("/api/v1/lending/my/borrows");
    return d.borrows ?? [];
  },

  // ---- 交易机器人 ----
  botStrategies: async () => {
    const d = await request<{ strategies: BotStrategy[] }>("/api/v1/bot/strategies");
    return d.strategies ?? [];
  },
  botCreateStrategy: (payload: BotCreatePayload) =>
    request<BotStrategy>("/api/v1/bot/strategies", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  botStartStrategy: (id: number) =>
    request<{ id: number; status: string }>(`/api/v1/bot/strategies/${id}/start`, { method: "POST" }),
  botStopStrategy: (id: number) =>
    request<{ id: number; status: string }>(`/api/v1/bot/strategies/${id}/stop`, { method: "POST" }),
  botStrategyOrders: async (id: number) => {
    const d = await request<{ orders: BotOrder[] }>(`/api/v1/bot/strategies/${id}/orders`);
    return d.orders ?? [];
  },

  // ---- 管理总览 ----
  // GET /api/v1/admin/overview 后台总览 KPI（需 admin 角色）。
  // GET /api/v1/admin/audit 后台操作审计日志（需 admin 角色）。

  // ---- 监控（服务端聚合，需后端实现 /api/v1/monitor/*）----

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
  // POST /api/v1/announcement/admin 创建公告（管理后台，需 admin 角色）。
  // PUT /api/v1/announcement/admin/:id 更新公告（管理后台，需 admin 角色）。
  // DELETE /api/v1/announcement/admin/:id 删除公告（管理后台，需 admin 角色）。

  // ---- 邀请 ----
  referralCode: () =>
    request<{ referral_code: string }>("/api/v1/user/referral-code"),
  referrals: async () => {
    const d = await request<{ referrals: { user_id: number; nickname: string; email: string; created_at: string }[]; total: number }>("/api/v1/user/referrals");
    return d;
  },
  referralStats: () =>
    request<{ totals: Record<string, number> }>("/api/v1/referral/stats"),
  referralCommissions: async (params?: { limit?: number; offset?: number }) => {
    const d = await request<{ commissions: any[]; total: number }>(
      withQuery("/api/v1/referral/commissions", params as Record<string, string | number | undefined>)
    );
    return d;
  },

  // ---- 登录历史 ----
  loginHistory: async (params?: { limit?: number }) => {
    const d = await request<{ entries: LoginHistoryEntry[] }>(
      withQuery("/api/v1/user/login-history", params as Record<string, string | number | undefined>)
    );
    return d.entries ?? [];
  },

  // ---- 会话管理 ----
  sessions: async () => {
    const d = await request<{ sessions: UserSession[] }>("/api/v1/user/sessions");
    return d.sessions ?? [];
  },
  sessionRevoke: (id: string) =>
    request<{ ok: boolean }>(`/api/v1/user/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  sessionRevokeAll: () =>
    request<{ ok: boolean; revoked: number }>("/api/v1/user/sessions", { method: "DELETE" }),

  // ---- 防钓鱼码 ----
  antiPhishingGet: () =>
    request<{ code: string }>("/api/v1/user/anti-phishing"),
  antiPhishingSet: (code: string) =>
    request<{ ok: boolean; message: string }>("/api/v1/user/anti-phishing", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
};

// ---------- 类型 ----------
// 单根 K 线（OHLCV）。t 为毫秒时间戳，o/h/l/c/v 分别为开/高/低/收/量。
export interface Kline {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// ---- 理财（Earn）----
export interface EarnProduct {
  id: number;
  name: string;
  asset: string;
  term_days: number; // 0 = 活期
  apy: number; // 0.065 = 6.5%
  min_amount: number;
  max_amount: number;
  status: string;
}
export interface EarnSubscription {
  id: number;
  product_id: number;
  asset: string;
  amount: number;
  apy: number;
  term_days: number;
  start_at: string;
  status: "active" | "redeemed";
  accrued?: number; // 服务端按读取时刻实时累计
  redeemed_amount?: number;
}

// ---- 新币挖矿（Launchpool）----
export type LaunchStatus = "upcoming" | "ongoing" | "ended";
export interface LaunchPool {
  id: string; // "bnb" | "fdusd"
  asset: string;
  apy: number;
}
export interface LaunchProject {
  id: number;
  name: string;
  token: string;
  total_supply: string;
  starts_at: string;
  ends_at: string;
  status: LaunchStatus;
  pools: LaunchPool[];
}
export interface LaunchPosition {
  id: number;
  project_id: number;
  pool_id: string;
  staked: number;
  rewards: number;
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
  /** 15 分钟付款截止时间（ISO）；由服务端驱动超时取消 */
  expire_at?: string;
  /** 收款人信息（仅买方订单返回，账号掩码） */
  payee?: { name: string; bank?: string; account: string };
  /** 对手方昵称（列表视图附带） */
  counterparty_nickname?: string;
  dispute_reason?: string;
  cancel_reason?: string;
}

/** 广告视图（含商家画像与实时单价，公开接口返回） */
export interface OtcAdView extends OtcAd {
  available: number; // 可用数量（币）
  premium?: number; // 相对行情溢价 %
  merchant: { user_id: number; nickname: string; verified: boolean; trades: number; success_rate: number };
}

/** 法币报价 */
export interface OtcPrice {
  asset: string;
  fiat: string;
  base_price: number;
  fiat_rate: number;
  updated_at: string;
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

// 登录历史条目（GET /api/v1/user/login-history）。
export interface LoginHistoryEntry {
  id: string;
  ip: string;
  ua: string;
  location: string;
  success: boolean;
  created_at: string;
}

// 用户会话（GET /api/v1/user/sessions）。
export interface UserSession {
  id: string;
  ip: string;
  ua: string;
  location: string;
  current: boolean;
  created_at: string;
  last_active_at: string;
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
  /** 交易页 K 线默认周期：1m / 15m / 1h / 1d（前端新增，后端无此字段时忽略即可） */
  trade_interval?: string;
  /** 涨跌幅基准：24h / 1h / today（今日开盘），前端新增 */
  change_basis?: string;
  updated_at?: string;
}

// KYC 提交请求体（POST /api/v1/user/kyc/submit）。
export interface KycPayload {
  real_name: string;
  id_type: string; // id_card / passport / driver_license
  id_number: string;
  country?: string;
  doc_front_name?: string;
  doc_back_name?: string;
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
  country?: string;
  level?: number;
}

// KYC 等级权益（服务端下发，避免前端硬编码额度）。
export interface KycLimits {
  level: number;
  withdraw_daily_usdt: number;
  fiat_otc: boolean;
  futures: boolean;
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
// 用户侧站内信/通知（GET /api/v1/user/notifications 返回）。
export interface UserNotification {
  id: number;
  level: NotificationLevel; // 复用管理端等级枚举
  title: string;
  content: string;
  read: boolean;
  created_at: string;
}
// 通知等级。
export type NotificationLevel = "info" | "warning" | "critical";
// 通知接收范围。
export type NotificationTarget = "all" | "vip" | "user";

// 通知（GET /api/v1/notification/admin/list 返回）。

// 发布通知的载荷。
export interface NotificationInput {
  title: string;
  content: string;
  level: NotificationLevel;
  target: NotificationTarget;
  target_user?: string;
}

// ---------- 管理总览 ----------
// 提现地址簿条目（GET/POST /api/v1/futures/wallet/address-book）。
export interface AddressBookEntry {
  id: number;
  user_id: number;
  asset: string;
  network?: string;
  address: string;
  label: string;
  added_at?: string;
}

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

// 创建/更新规则的载荷。

// 黑名单目标类型。
export type BlacklistTargetType = "user" | "ip" | "address";

// 黑名单条目（GET /api/v1/risk/blacklist 返回）。

// 添加黑名单的载荷。

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
// ---- 杠杆（契约对齐 Go internal/margin/model.go MarginAccount）----
// 后端金额为定点 AssetAmount：{Value: <big.Int 整数>, Decimals: n}，人类值 = Value / 10^Decimals。
export interface AssetAmountRaw {
  Value: number | string;
  Decimals: number;
}

/** 服务端原始杠杆账户结构（未归一化）。 */
export interface MarginAccountRaw {
  user_id: number;
  asset: string; // 借入资产，如 BTC
  collateral_asset: string; // 抵押资产，固定 USDT
  collateral_amount: AssetAmountRaw;
  debt: AssetAmountRaw;
  interest_accrued: AssetAmountRaw;
  leverage: number;
  status: string; // active | liquidated
  last_accrual: string;
  created_at: string;
  updated_at: string;
}

/** 前端归一化后的杠杆账户（金额已转为人类可读浮点）。 */
export interface MarginAccount {
  asset: string;
  collateralAsset: string;
  collateral: number;
  debt: number;
  interest: number;
  totalOwed: number;
  leverage: number;
  status: string;
}

/** 定点金额 → 人类浮点（防御 Value 为字符串大整数的场景）。 */
function humanAmount(a: AssetAmountRaw | undefined): number {
  if (!a) return 0;
  const v = Number(a.Value ?? 0);
  if (!Number.isFinite(v)) return 0;
  return v / 10 ** (a.Decimals || 0);
}

function normalizeMarginAccount(raw: MarginAccountRaw): MarginAccount {
  const debt = humanAmount(raw.debt);
  const interest = humanAmount(raw.interest_accrued);
  return {
    asset: raw.asset,
    collateralAsset: raw.collateral_asset,
    collateral: humanAmount(raw.collateral_amount),
    debt,
    interest,
    totalOwed: debt + interest,
    leverage: raw.leverage ?? 1,
    status: raw.status ?? "active",
  };
}

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

// ---------- 借贷 ----------
export type LendingPoolStatus = "active" | "paused" | "closed";
export type LendOrderStatus = "active" | "withdrawn";
export type BorrowOrderStatus = "active" | "repaid" | "liquidated";

export interface LendingPool {
  id: number;
  asset: string;
  total_supply: string;
  total_borrow: string;
  available: string;
  interest_rate: number;
  collateral_req: number;
}

export interface LendingPoolInfo extends LendingPool {
  utilization: number;
  status: LendingPoolStatus;
  created_at: number;
}

export interface LendOrder {
  id: number;
  user_id: number;
  pool_id: number;
  amount: string;
  rate: number;
  status: LendOrderStatus;
  created_at: number;
}

export interface BorrowOrder {
  id: number;
  user_id: number;
  pool_id: number;
  amount: string;
  collateral: string;
  rate: number;
  interest_acc: string;
  status: BorrowOrderStatus;
  created_at: number;
  repaid_at: number;
}

// ---------- 交易机器人 ----------
export type BotMarket = "spot" | "futures";
export type BotStrategyType = "grid" | "dca" | "ma";
export type BotStrategyStatus = "active" | "stopped";

export interface BotStrategy {
  id: number;
  user_id: number;
  name: string;
  market: BotMarket;
  symbol: string;
  side: string;
  type: BotStrategyType;
  params: BotParams;
  status: BotStrategyStatus;
  grid_state?: GridState;
  created_at: number;
}

export interface BotParams {
  grid_lower?: number;
  grid_upper?: number;
  grid_num?: number;
  grid_step?: number;
  dca_interval_sec?: number;
  dca_amount?: number;
  ma_short?: number;
  ma_long?: number;
  max_position?: number;
  order_amount: number;
}

export interface GridState {
  levels?: GridLevel[];
  position: number;
  pnl: number;
  trade_count: number;
  last_price: number;
  prev_price: number;
  initialized: boolean;
}

export interface GridLevel {
  price: number;
  qty: number;
  side: string;
  placed: boolean;
  order_id: string;
  filled: boolean;
  fill_price: number;
}

export interface BotOrder {
  id: number;
  strategy_id: number;
  user_id: number;
  market: BotMarket;
  symbol: string;
  side: string;
  price: number;
  qty: number;
  client_oid: string;
  exchange_order_id: string;
  status: string;
  created_at: number;
}

export interface BotCreatePayload {
  name: string;
  market: BotMarket;
  symbol: string;
  side: string;
  type: BotStrategyType;
  user_token: string;
  params: BotParams;
}

