// 管理后台 API 客户端。
// 独立于用户端 client.ts：管理后台使用独立的 /api/admin/* 前缀与独立的 JWT（管理员登录签发）。
// token 存 localStorage（ADMIN_TOKEN），请求统一注入 Bearer，并解包 {code,message,data} 响应体。
//
// 契约对齐真实后端 crypto-exchange cmd/admin（路由前缀 /api/admin，见 ADMIN_API_CONTRACT）。

// ---------- 管理后台鉴权 ----------
const ADMIN_TOKEN = "cx_admin_token";

export const adminToken = {
  get() {
    return localStorage.getItem(ADMIN_TOKEN);
  },
  set(token: string) {
    localStorage.setItem(ADMIN_TOKEN, token);
  },
  clear() {
    localStorage.removeItem(ADMIN_TOKEN);
  },
};

export class AdminApiError extends Error {
  code: number;
  status: number;
  constructor(message: string, code: number, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const token = adminToken.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`/api/admin${path}`, { ...init, headers });
  } catch (e) {
    throw new AdminApiError((e as Error).message, -1, 0);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.data) {
    throw new AdminApiError(body?.message ?? String(res.status), body?.code ?? -1, res.status);
  }
  return body.data as T;
}

/** 统一列表查询参数（GET 分页）。 */
export interface PageParams {
  limit?: number;
  offset?: number;
  q?: string;
}

/** 从任意以某数组键为返回的响应提取数组 + 总数。 */
type ListResult<T> = { items: T[]; total: number };

// ---------- 类型 ----------

// 后台总览 KPI
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

// 用户
export interface AdminUser {
  id: number;
  username: string;
  email: string;
  status: string;
  kyc: string;
  level: number;
  balance: number;
  created_at: string;
}

// 交易对配置
export interface SymbolConfig {
  symbol: string;
  base: string;
  quote: string;
  status: string;
  fee_rate: number;
  max_leverage: number;
  min_qty: number;
}

// 公链
export interface Chain {
  id: number;
  name: string;
  symbol: string;
  confirmations: number;
  deposit_enabled: boolean;
  withdraw_enabled: boolean;
  rpc_endpoint: string;
  updated_at: string;
}

// 币种
export interface Coin {
  id: number;
  symbol: string;
  name: string;
  chain: string;
  precision: number;
  withdraw_fee: number;
  updated_at: string;
}

// 充值
export interface Deposit {
  id: string;
  user_id: number;
  coin: string;
  chain: string;
  amount: number;
  tx_hash: string;
  status: string;
  time: string;
}

// 提现
export interface Withdrawal {
  id: string;
  user_id: number;
  coin: string;
  chain: string;
  amount: number;
  address: string;
  tx_hash: string;
  status: string;
  time: string;
}

// 待审提现
export interface PendingWithdrawal {
  id: string;
  user_id: number;
  coin: string;
  amount: number;
  chain: string;
  address: string;
  submitted_at: string;
  status: string;
}

// 充值地址
export interface DepositAddress {
  user_id: number;
  chain: string;
  address: string;
}

// 运营通知
export interface AdminNotification {
  id: number;
  title: string;
  body: string;
  level: string;
  created_at: string;
  source?: string;
}

// 公告（管理端）
export interface Announcement {
  id: number;
  level: string;
  title: string;
  content: string;
  active: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
}

// 订单 / 成交（Fixed 以字符串交付）
export interface OrderView {
  id: number;
  user_id: number;
  symbol: string;
  market: string;
  is_margin: boolean;
  leverage?: number;
  side: string;
  price: string;
  qty: string;
  filled: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface TradeView {
  id: number;
  symbol: string;
  market: string;
  is_margin: boolean;
  leverage?: number;
  price: string;
  qty: string;
  taker_id: number;
  maker_id: number;
  taker_side: string;
  time: number;
}

// 强平 / 风控快照
export interface LiquidationItem {
  user_id: number;
  symbol: string;
  side: string;
  size: number;
  liq_price: number;
  equity: number;
  detected: string;
}
export interface RiskSnapshot {
  updated_at: string;
  liquidations: LiquidationItem[];
  insurance_fund: number;
  socialized_loss: number;
  adl_queue: string[];
  notes?: string;
}

// 账本对账
export interface ClearedTradeView {
  id: number;
  symbol: string;
  price: number;
  qty: number;
  taker_id: number;
  maker_id: number;
  taker_side: string;
  fee: number;
  ts: number;
}
export interface LedgerSummary {
  updated_at: string;
  total_assets: number;
  settlement_balance: number;
  reconciled: boolean;
  discrepancy: number;
  settlement: {
    enabled: boolean;
    total_trades: number;
    total_volume: number;
    total_commission: number;
    by_symbol: Record<string, number>;
    recent: ClearedTradeView[];
    notes?: string;
  };
  notes?: string;
}

// 服务健康
export interface ServiceHealth {
  name: string;
  status: string;
  latency_ms: number;
  last_check: string;
}

// 当前管理员
export interface MeView {
  id: number;
  username: string;
  status: string;
  role_id: number;
  role_name: string;
  permissions: string[];
  totp_enabled: boolean;
  client_ip: string;
}

// 管理员账户
export interface AdminView {
  id: number;
  username: string;
  status: string;
  role_id: number;
  role_name: string;
  totp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// 角色
export interface RoleView {
  id: number;
  name: string;
  description: string;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

// 权限字典
export interface PermissionDef {
  key: string;
  name: string;
  group: string;
}

// 审计日志
export interface AuditEntry {
  id: number;
  admin_id: number;
  method: string;
  path: string;
  action: string;
  target: string;
  status: number;
  detail: string;
  ip: string;
  time: number;
}

// API 密钥
export interface APIKeyView {
  id: number;
  user_id: number;
  label: string;
  prefix: string;
  permissions: string[];
  status: string;
  created_by: number;
  created_at: string;
  last_used_at?: string;
  revoked_at?: string;
}

// 管理偏好
export interface AdminPreferences {
  admin_id: number;
  language: string;
  theme: string;
  timezone: string;
  updated_at: string;
}

// 邀请返佣
export interface ReferralCommission {
  id: number;
  referrer_id: number;
  taker_id: number;
  asset: string;
  amount: number;
  rate: number;
  status: number;
  biz_ref: string;
  created_at: string;
  updated_at: string;
}

// ---------- 管理后台 API ----------
export const adminApi = {
  // 鉴权
  health: () => adminRequest<{ status: string; time: number }>("/health"),
  login: (payload: { username: string; password: string; totp?: string }) =>
    adminRequest<{ token: string; expires_in: number; totp_required: boolean }>("/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  me: () => adminRequest<MeView>("/me"),

  // 管理总览
  overview: () => adminRequest<AdminOverview>("/overview"),

  // 风控
  risk: () => adminRequest<RiskSnapshot>("/risk"),
  riskRules: (p?: PageParams) => adminRequest<any[]>(qpath("/risk/rules", p)),
  riskRuleCreate: (body: any) =>
    adminRequest<any>("/risk/rules", { method: "POST", body: JSON.stringify(body) }),
  riskBlacklist: (p?: PageParams) => adminRequest<any[]>(qpath("/risk/blacklist", p)),
  riskBlacklistCreate: (body: any) =>
    adminRequest<any>("/risk/blacklist", { method: "POST", body: JSON.stringify(body) }),
  riskBlacklistDelete: (target: string) =>
    adminRequest<any>(qpath("/risk/blacklist", { target }), { method: "DELETE" }),

  // 用户管理
  users: (p?: PageParams & { keyword?: string; status?: string }) =>
    adminRequest<ListResult<AdminUser>>(qpath("/users", p)),
  userCreate: (body: { username: string; email: string; password: string; status: string; kyc: string }) =>
    adminRequest<AdminUser>("/users", { method: "POST", body: JSON.stringify(body) }),
  userUpdate: (id: number, body: { username?: string; email?: string; status?: string; kyc?: string }) =>
    adminRequest<AdminUser>(`/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  userFreeze: (id: number) =>
    adminRequest<{ id: number; frozen: boolean; status: string }>(`/users/${id}/freeze`, { method: "POST" }),
  userUnfreeze: (id: number) =>
    adminRequest<{ id: number; frozen: boolean; status: string }>(`/users/${id}/unfreeze`, { method: "POST" }),
  userResetTFA: (id: number) =>
    adminRequest<{ id: number; tfa_enabled: boolean }>(`/users/${id}/tfa/reset`, { method: "POST" }),
  userBalances: (id: number) =>
    adminRequest<{ user_id: number; assets: any[]; asset_totals: Record<string, number> }>(
      `/users/${id}/balances`
    ),

  // 交易对 / 链 / 币种
  symbols: (p?: PageParams) => adminRequest<ListResult<SymbolConfig>>(qpath("/symbols", p)),
  symbolUpsert: (body: Partial<SymbolConfig>, symbol?: string) =>
    adminRequest<SymbolConfig>(symbol ? `/symbols/${symbol}` : "/symbols", {
      method: symbol ? "PUT" : "POST",
      body: JSON.stringify(body),
    }),
  chains: (p?: PageParams) => adminRequest<ListResult<Chain>>(qpath("/chains", p)),
  chainCreate: (body: Partial<Chain>) =>
    adminRequest<Chain>("/chains", { method: "POST", body: JSON.stringify(body) }),
  chainUpdate: (id: number, body: Partial<Chain>) =>
    adminRequest<Chain>(`/chains/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  coins: (p?: PageParams) => adminRequest<ListResult<Coin>>(qpath("/coins", p)),
  coinCreate: (body: Partial<Coin>) =>
    adminRequest<Coin>("/coins", { method: "POST", body: JSON.stringify(body) }),
  coinUpdate: (id: number, body: Partial<Coin>) =>
    adminRequest<Coin>(`/coins/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  // 充值 / 提现
  deposits: (p?: PageParams & { user_id?: number; coin?: string; status?: string }) =>
    adminRequest<{ deposits: Deposit[]; total: number }>(qpath("/deposits", p)),
  withdrawals: (p?: PageParams & { user_id?: number; coin?: string; status?: string }) =>
    adminRequest<{ withdrawals: Withdrawal[]; total: number }>(qpath("/withdrawals", p)),
  pendingWithdrawals: (p?: PageParams) =>
    adminRequest<ListResult<PendingWithdrawal>>(qpath("/pending-withdrawals", p)),
  withdrawalDetail: (id: string) => adminRequest<any>(`/withdrawals/${id}/detail`),
  withdrawalApprove: (id: string) =>
    adminRequest<{ id: string; status: string; hold_id: string }>(`/withdrawals/${id}/approve`, {
      method: "POST",
    }),
  withdrawalReject: (id: string) =>
    adminRequest<{ id: string; status: string; hold_id: string }>(`/withdrawals/${id}/reject`, {
      method: "POST",
    }),
  depositAddresses: (p?: PageParams & { user_id?: number; chain?: string }) =>
    adminRequest<ListResult<DepositAddress>>(qpath("/deposit-addresses", p)),

  // 运营通知
  notifications: (p?: PageParams) =>
    adminRequest<ListResult<AdminNotification>>(qpath("/notifications", p)),
  notificationCreate: (body: { title: string; body: string; level: string }) =>
    adminRequest<AdminNotification>("/notifications", { method: "POST", body: JSON.stringify(body) }),
  notificationDelete: (id: number) =>
    adminRequest<{ deleted: number }>(`/notifications/${id}`, { method: "DELETE" }),

  // 公告
  announcements: (p?: PageParams) =>
    adminRequest<{ announcements: Announcement[]; total: number }>(qpath("/announcements", p)),
  announcementCreate: (body: Partial<Announcement>) =>
    adminRequest<Announcement>("/announcements", { method: "POST", body: JSON.stringify(body) }),
  announcementUpdate: (id: number, body: Partial<Announcement>) =>
    adminRequest<Announcement>(`/announcements/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  announcementDelete: (id: number) =>
    adminRequest<{ ok: boolean }>(`/announcements/${id}`, { method: "DELETE" }),

  // 订单 / 成交
  orders: (p?: PageParams & { user_id?: number; symbol?: string; status?: string; market?: string; margin?: string }) =>
    adminRequest<{ orders: OrderView[]; total: number }>(qpath("/orders", p)),
  orderDetail: (id: number) => adminRequest<{ order: OrderView }>(`/orders/${id}`),
  orderCancel: (id: number, symbol: string) =>
    adminRequest<{ order_id: number; symbol: string; canceled: boolean }>(`/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ symbol }),
    }),
  trades: (p?: PageParams & { user_id?: number; symbol?: string; market?: string; margin?: string }) =>
    adminRequest<{ trades: TradeView[]; total: number }>(qpath("/trades", p)),

  // 账本 / 服务
  ledger: () => adminRequest<LedgerSummary>("/ledger"),
  services: () => adminRequest<ServiceHealth[]>("/services"),

  // 管理员账户
  admins: (p?: PageParams) => adminRequest<ListResult<AdminView>>(qpath("/admins", p)),
  adminCreate: (body: { username: string; password: string; role_id?: number; role_name?: string; status?: string }) =>
    adminRequest<AdminView>("/admins", { method: "POST", body: JSON.stringify(body) }),
  adminUpdate: (id: number, body: { role_id?: number | null; status?: string }) =>
    adminRequest<AdminView>(`/admins/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  adminActivate: (id: number) =>
    adminRequest<AdminView>(`/admins/${id}/activate`, { method: "POST" }),
  adminDisable: (id: number) =>
    adminRequest<AdminView>(`/admins/${id}/disable`, { method: "POST" }),
  adminResetPassword: (id: number, password: string) =>
    adminRequest<{ updated: boolean }>(`/admins/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  // 角色与权限
  roles: (p?: PageParams) => adminRequest<ListResult<RoleView>>(qpath("/roles", p)),
  roleCreate: (body: { name: string; description?: string }) =>
    adminRequest<RoleView>("/roles", { method: "POST", body: JSON.stringify(body) }),
  roleUpdate: (id: number, body: { name: string; description?: string }) =>
    adminRequest<RoleView>(`/roles/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  roleDelete: (id: number) => adminRequest<{ deleted: boolean }>(`/roles/${id}`, { method: "DELETE" }),
  roleSetPermissions: (id: number, permissions: string[]) =>
    adminRequest<RoleView>(`/roles/${id}/permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions }),
    }),
  permissions: () => adminRequest<PermissionDef[]>("/permissions"),

  // 审计日志
  auditLogs: (p?: PageParams & { action?: string; method?: string; admin_id?: number; keyword?: string }) =>
    adminRequest<{ logs: AuditEntry[]; total: number }>(qpath("/audit-logs", p)),

  // API 密钥
  apikeys: (p?: PageParams & { user_id?: number }) =>
    adminRequest<ListResult<APIKeyView>>(qpath("/apikeys", p)),
  apikey: (id: number) => adminRequest<APIKeyView>(`/apikeys/${id}`),
  apikeyCreate: (body: { user_id: number; label: string; permissions?: string[] }) =>
    adminRequest<{ key: string; api_key: APIKeyView }>("/apikeys", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  apikeyRevoke: (id: number) =>
    adminRequest<{ revoked: boolean; id: number }>(`/apikeys/${id}`, { method: "DELETE" }),

  // 自身管理
  preferences: () => adminRequest<AdminPreferences>("/preferences"),
  preferencesUpdate: (body: { language?: string; theme?: string; timezone?: string }) =>
    adminRequest<{ ok: boolean }>("/preferences", { method: "PUT", body: JSON.stringify(body) }),
  changePassword: (body: { old_password: string; new_password: string }) =>
    adminRequest<{ updated: boolean }>("/password", { method: "POST", body: JSON.stringify(body) }),
  mfaSetup: () => adminRequest<{ secret: string; otpauth_uri: string }>("/mfa/setup", { method: "POST" }),
  mfaEnable: (code: string) =>
    adminRequest<{ totp_enabled: boolean }>("/mfa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  mfaDisable: (code: string) =>
    adminRequest<{ totp_enabled: boolean }>("/mfa/disable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  // 借贷
  lendingPools: () => adminRequest<{ pools: any[] }>("/lending/pools"),
  lendingPoolsCreate: (body: any) =>
    adminRequest<any>("/lending/pools", { method: "POST", body: JSON.stringify(body) }),
  lendingLends: () => adminRequest<{ lends: any[] }>("/lending/lends"),
  lendingBorrows: () => adminRequest<{ borrows: any[] }>("/lending/borrows"),

  // 交易机器人
  botStrategies: () => adminRequest<{ strategies: any[] }>("/bot/strategies"),
  botTick: (id: number) =>
    adminRequest<any>(`/bot/strategies/${id}/tick`, { method: "POST", body: "{}" }),

  // 邀请返佣
  referralCommissions: (p?: PageParams) =>
    adminRequest<{ commissions: ReferralCommission[]; total: number }>(qpath("/referral/commissions", p)),
};

/** 拼接查询参数。 */
function qpath(path: string, params?: object): string {
  if (!params) return path;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const query = sp.toString();
  return query ? `${path}?${query}` : path;
}
