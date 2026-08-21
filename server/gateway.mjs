// 统一业务网关（开发后端，内存 mock，零额外依赖：仅 express + ws）。
//
// 整合所有前端 client.ts 调用的 /api/v1/* 业务接口 + 行情 WebSocket，
// 单一进程监听 :8787，前端 Vite 代理 /api -> :8787 即可全量联调（无需再分别启动多个骨架服务）。
// 注意：仅本项目的开发后端用此端口；避免占用宿主机上其他服务常用的 :8080。
//
// 整合范围：
//   - 鉴权（gateway-auth）：登录/刷新/登出/网关 Bearer 校验/服务端 RBAC
//   - 管理后台业务（admin-api.buildAdminApp）：风控/通知/合约/期权/杠杆/管理总览/审计/OTC
//   - 本文件新增：注册/发码/用户档案与偏好/TFA/KYC、现货(深度/下单/订单/成交)、行情 ticker、
//     合约资金流水、理财、公告、API Key、监控上报与聚合
//   - WebSocket：/api/v1/spot/ws（深度+成交）、/api/v1/market/ws（Ticker）、/api/v1/market/kline/ws（K线）
//
// 运行：  cd server && npm install && npm run start:gateway
//         （默认监听 :8787；与前端 vite dev 的代理目标一致）

import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";
import crypto from "node:crypto";
import { authRouter, gateway, authorize, getUserById } from "./gateway-auth.mjs";
import { buildAdminApp, notFound } from "./admin-api.mjs";
import { pushEvents, summary, recentEvents } from "./monitor-store.mjs";
import { getSim, intervalToMs } from "./kline-server.mjs";

// 演示用种子监控事件：让聚合看板首次打开即有数据（真实环境由前端上报累积）。
pushEvents([
  { type: "error", message: "历史异常已恢复（演示）", code: 50001, status: 500 },
  { type: "api_error", message: "历史接口超时（演示）", code: 504, status: 504 },
  { type: "ws_drop", name: "BTC_USDT", message: "行情 WS 曾短暂掉线（演示）" },
  { type: "vital", name: "LCP", value: 1820.5 },
  { type: "vital", name: "CLS", value: 0.02 },
  { type: "vital", name: "INP", value: 120.0 },
  { type: "vital", name: "FCP", value: 980.1 },
  { type: "vital", name: "TTFB", value: 80.3 },
]);

const PORT = Number(process.env.GATEWAY_PORT || 8787);
const TICK_MS = 600; // 行情推送频率

const ok = (res, data, status = 200) => res.status(status).json({ code: 0, message: "ok", data });
const fail = (res, code, message) =>
  res.status(code === 401 ? 401 : 400).json({ code, message, data: null });

let seq = 1;
const nextId = () => seq++;
const r2 = (x) => Math.round(x * 100) / 100;
const r4 = (x) => Math.round(x * 10000) / 10000;
const ns = () => Number(BigInt(Date.now()) * 1000000n); // Unix 纳秒（与前端 OrderView/TradeView/LedgerEntry 对齐）

// ---------- 行情模拟 ----------
function basePrice(symbol) {
  if (symbol.startsWith("BTC")) return 68000;
  if (symbol.startsWith("ETH")) return 3500;
  if (symbol.startsWith("SOL")) return 150;
  return 7.2;
}
const marketSims = new Map();
function getMarket(symbol) {
  let s = marketSims.get(symbol);
  if (!s) {
    s = { symbol, price: basePrice(symbol), lastTradeId: 1 };
    marketSims.set(symbol, s);
  }
  return s;
}
function stepPrice(s) {
  const drift = (Math.random() - 0.5) * s.price * 0.0016;
  s.price = Math.max(0.01, s.price + drift);
  return s.price;
}
function makeDepth(symbol, price) {
  const bids = [];
  const asks = [];
  for (let i = 1; i <= 20; i++) {
    bids.push({ price: r2(price - i * price * 0.0002), volume: r4(0.5 + Math.random() * 5) });
    asks.push({ price: r2(price + i * price * 0.0002), volume: r4(0.5 + Math.random() * 5) });
  }
  return { bids, asks };
}
function makeTicker(symbol, price) {
  return {
    symbol,
    last: r2(price),
    best_bid: r2(price - price * 0.0002),
    best_ask: r2(price + price * 0.0002),
    timestamp: Date.now(),
  };
}

// ---------- 内存存储 ----------
const usersExtra = new Map(); // userId -> { nickname, avatar, preferences, tfa, kyc }
function extra(userId) {
  let e = usersExtra.get(userId);
  if (!e) {
    e = {
      nickname: "",
      avatar: "",
      preferences: { user_id: userId, language: "zh-CN", theme: "system", timezone: "", notify_order: true, notify_security: true, notify_marketing: false },
      tfa: { enabled: false, secret: "" },
      kyc: null,
    };
    usersExtra.set(userId, e);
  }
  return e;
}

const spotOrders = [];
const spotTrades = [];

// 合约订单 / 成交（内存 mock；演示账号 user@ce.dev 的 user_id = 3）。
const futuresOrders = [];
const futuresTrades = [];
const futuresWithdrawRecords = [];
{
  const fo1 = {
    id: nextId(), user_id: 3, symbol: "BTC_USDT", market: "futures", is_margin: true,
    leverage: 10, side: "buy", price: 68000, qty: 0.5, filled: 0.5, status: "filled",
    time_in_force: "GTC", created_at: ns(), updated_at: ns(),
  };
  futuresOrders.push(fo1);
  futuresOrders.push({
    id: nextId(), user_id: 3, symbol: "ETH_USDT", market: "futures", is_margin: true,
    leverage: 5, side: "sell", price: 3500, qty: 2, filled: 0, status: "open",
    time_in_force: "GTC", created_at: ns(), updated_at: ns(),
  });
  futuresTrades.push({
    id: nextId(), symbol: "BTC_USDT", market: "futures", is_margin: true, leverage: 10,
    price: 68000, qty: 0.5, taker_id: 3, maker_id: 2, taker_side: "buy",
    taker_oid: fo1.id, maker_oid: 9001, time: ns(),
  });
}

const wealthProducts = [
  { id: nextId(), name: "USDT 灵活理财", asset: "USDT", type: "current", annual_rate: 0.05, duration_days: 0, min_amount: 10, status: "open", created_at: new Date().toISOString() },
  { id: nextId(), name: "BTC 30天锁仓", asset: "BTC", type: "fixed", annual_rate: 0.08, duration_days: 30, min_amount: 0.001, status: "open", created_at: new Date().toISOString() },
  { id: nextId(), name: "ETH 90天锁仓", asset: "ETH", type: "fixed", annual_rate: 0.1, duration_days: 90, min_amount: 0.01, status: "open", created_at: new Date().toISOString() },
];
const wealthHoldings = [];

// 初始会话 / 登录历史（演示用户 user_id=3）
{
  const now = new Date();
  const s1 = {
    id: crypto.randomUUID(), user_id: 3, ip: "116.233.45.67",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    location: "上海", current: true,
    created_at: new Date(now - 86400000 * 3).toISOString(),
    last_active_at: now.toISOString(),
  };
  const s2 = {
    id: crypto.randomUUID(), user_id: 3, ip: "220.181.38.148",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/127.0",
    location: "北京", current: false,
    created_at: new Date(now - 86400000 * 7).toISOString(),
    last_active_at: new Date(now - 86400000 * 5).toISOString(),
  };
  ensureSessions(3).push(s1, s2);
  loginHistory.push(
    { id: crypto.randomUUID(), user_id: 3, ip: "116.233.45.67", ua: s1.ua, location: "上海", success: true, created_at: s1.created_at },
    { id: crypto.randomUUID(), user_id: 3, ip: "42.120.74.101", ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", location: "杭州", success: false, created_at: new Date(now - 86400000 * 2).toISOString() },
    { id: crypto.randomUUID(), user_id: 3, ip: "220.181.38.148", ua: s2.ua, location: "北京", success: true, created_at: s2.created_at },
  );
}

const announcements = [
  { id: nextId(), level: "info", title: "欢迎使用 crypto-exchange", content: "现货/OTC/合约等模块已开放联调。", active: true, published_at: new Date().toISOString(), created_at: new Date().toISOString() },
  { id: nextId(), level: "maintenance", title: "计划内系统维护", content: "本周末 02:00-03:00 进行升级维护。", active: true, published_at: new Date().toISOString(), created_at: new Date().toISOString() },
];

// API Key 内存存储（按 userId 隔离）
const apiKeys = new Map();
function genApiKey() {
  return "cx_" + crypto.randomBytes(18).toString("base64url");
}
function genSecret() {
  return crypto.randomBytes(32).toString("base64url");
}
function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest("base64url");
}

// 登录历史 / 会话 / 防钓鱼码 内存存储
const loginHistory = [];
const sessions = new Map(); // userId -> UserSession[]
const antiPhishing = new Map(); // userId -> code string
function ensureSessions(userId) {
  let arr = sessions.get(userId);
  if (!arr) {
    arr = [];
    sessions.set(userId, arr);
  }
  return arr;
}
function mockLoginEntry(userId, success) {
  const ips = ["116.233.45.67", "220.181.38.148", "42.120.74.101", "183.6.66.12", "114.88.32.11"];
  const uas = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  ];
  const locs = ["上海", "北京", "深圳", "杭州", "广州"];
  const entry = {
    id: crypto.randomUUID(),
    user_id: userId,
    ip: ips[Math.floor(Math.random() * ips.length)],
    ua: uas[Math.floor(Math.random() * uas.length)],
    location: locs[Math.floor(Math.random() * locs.length)],
    success,
    created_at: new Date().toISOString(),
  };
  loginHistory.push(entry);
  return entry;
}

// ---------- 应用组装 ----------
const app = express();
app.use(express.json({ limit: "1mb" }));

// 1) 公开端点（登录/刷新/登出，register/send-code 在 PUBLIC_PATHS 内由网关放行）
app.use(authRouter);
// 2) 网关：校验除公开端点外的所有 /api/v1 请求的 Bearer 令牌（401）
app.use(gateway);

// ---------- 认证补充：注册 / 发码 ----------
app.post("/api/v1/user/register", (req, res) => {
  const { target = "", password = "" } = req.body || {};
  if (!target || !password) return fail(res, 400, "账号与密码必填");
  ok(res, { user_id: nextId(), message: "注册成功，请登录" }, 201);
});
app.post("/api/v1/user/send-code", (req, res) => {
  const { target = "", purpose = "register" } = req.body || {};
  if (!target) return fail(res, 400, "账号必填");
  ok(res, { message: `验证码已发送至 ${target}（演示：${purpose}）` });
});

// ---------- 用户档案（完整字段，覆盖 admin-api 的精简版）----------
app.get("/api/v1/user/me", (req, res) => {
  const u = getUserById(req.user.sub) || { id: req.user.sub, email: req.user.username, username: req.user.username, role: req.user.role };
  const e = extra(u.id);
  ok(res, {
    user_id: u.id,
    email: u.email || "",
    phone: u.phone || "",
    nickname: e.nickname || u.nickname || u.username,
    avatar: e.avatar || "",
    status: u.status ?? 0,
    kyc_level: u.kyc_level ?? 0,
    tfa_enabled: e.tfa.enabled,
    email_verified: u.email_verified ?? false,
    phone_verified: u.phone_verified ?? false,
  });
});
app.put("/api/v1/user/me", (req, res) => {
  const e = extra(req.user.sub);
  const b = req.body || {};
  if (typeof b.nickname === "string") e.nickname = b.nickname;
  if (typeof b.avatar === "string") e.avatar = b.avatar;
  ok(res, { ok: true });
});
app.post("/api/v1/user/password", (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!new_password) return fail(res, 400, "新密码必填");
  ok(res, { ok: true, message: "密码已更新" });
});

// ---------- 用户偏好 ----------
app.get("/api/v1/user/preferences", (req, res) => {
  ok(res, extra(req.user.sub).preferences);
});
app.put("/api/v1/user/preferences", (req, res) => {
  const e = extra(req.user.sub);
  e.preferences = { ...e.preferences, ...(req.body || {}), user_id: req.user.sub, updated_at: new Date().toISOString() };
  ok(res, { ok: true });
});

// ---------- TFA ----------
app.post("/api/v1/user/tfa/setup", (req, res) => {
  const e = extra(req.user.sub);
  const secret = crypto.randomBytes(20).toString("base64url");
  e.tfa.secret = secret;
  const otpauth_uri = `otpauth://totp/crypto-exchange:${req.user.username}?secret=${secret}&issuer=crypto-exchange`;
  ok(res, { secret, otpauth_uri, message: "请使用验证器扫描二维码" }, 201);
});
app.post("/api/v1/user/tfa/enable", (req, res) => {
  const e = extra(req.user.sub);
  e.tfa.enabled = true;
  ok(res, { tfa_enabled: true });
});
app.post("/api/v1/user/tfa/disable", (req, res) => {
  const e = extra(req.user.sub);
  e.tfa.enabled = false;
  ok(res, { tfa_enabled: false });
});

// ---------- KYC ----------
app.post("/api/v1/user/kyc/submit", (req, res) => {
  const e = extra(req.user.sub);
  const b = req.body || {};
  e.kyc = { ...b, status: 1, submitted_at: new Date().toISOString() };
  ok(res, { kyc_level: 1, message: "KYC 已提交，审核中" }, 201);
});
app.get("/api/v1/user/kyc", (req, res) => {
  ok(res, { kyc: extra(req.user.sub).kyc });
});

// ---------- 登录历史 ----------
app.get("/api/v1/user/login-history", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 500);
  const list = loginHistory
    .filter((h) => h.user_id === req.user.sub)
    .slice(-limit)
    .reverse();
  ok(res, { entries: list });
});

// ---------- 会话管理 ----------
app.get("/api/v1/user/sessions", (req, res) => {
  const list = ensureSessions(req.user.sub);
  ok(res, { sessions: list });
});
app.delete("/api/v1/user/sessions/:id", (req, res) => {
  const arr = ensureSessions(req.user.sub);
  const idx = arr.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return fail(res, 404, "会话不存在");
  if (arr[idx].current) return fail(res, 400, "不能注销当前会话");
  arr.splice(idx, 1);
  ok(res, { ok: true });
});
app.delete("/api/v1/user/sessions", (req, res) => {
  const arr = ensureSessions(req.user.sub);
  const before = arr.length;
  const kept = arr.filter((s) => s.current);
  sessions.set(req.user.sub, kept);
  ok(res, { ok: true, revoked: before - kept.length });
});

// ---------- 防钓鱼码 ----------
app.get("/api/v1/user/anti-phishing", (req, res) => {
  ok(res, { code: antiPhishing.get(req.user.sub) || "" });
});
app.post("/api/v1/user/anti-phishing", (req, res) => {
  const { code } = req.body || {};
  if (code) {
    antiPhishing.set(req.user.sub, code);
    ok(res, { ok: true, message: "防钓鱼码已设置" });
  } else {
    antiPhishing.delete(req.user.sub);
    ok(res, { ok: true, message: "防钓鱼码已清除" });
  }
});

// ---------- 现货 ----------
app.get("/api/v1/spot/depth", (req, res) => {
  const symbol = (req.query.symbol || "BTC_USDT").toString();
  const s = getMarket(symbol);
  ok(res, makeDepth(symbol, s.price));
});
app.get("/api/v1/market/ticker", (req, res) => {
  const symbol = (req.query.symbol || "BTC_USDT").toString();
  const s = getMarket(symbol);
  ok(res, makeTicker(symbol, s.price));
});
app.get("/api/v1/market/kline", (req, res) => {
  const symbol = (req.query.symbol || "BTC_USDT").toString();
  const interval = (req.query.interval || "1m").toString();
  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 1000);
  const sim = getSim(symbol, intervalToMs(interval));
  const n = Math.min(limit, sim.history.length);
  ok(res, sim.history.slice(sim.history.length - n));
});
app.post("/api/v1/spot/order", (req, res) => {
  const b = req.body || {};
  const symbol = b.symbol || "BTC_USDT";
  const price = Number(b.price) || 0;
  const qty = Number(b.qty) || 0;
  const order = {
    id: nextId(),
    user_id: req.user.sub,
    symbol,
    market: "spot",
    is_margin: false,
    leverage: 0,
    side: b.side || "buy",
    price,
    qty,
    filled: qty,
    status: "filled",
    time_in_force: "GTC",
    created_at: ns(),
    updated_at: ns(),
  };
  spotOrders.push(order);
  // 生成一条对应成交
  spotTrades.push({
    id: nextId(),
    symbol,
    market: "spot",
    is_margin: false,
    leverage: 0,
    price,
    qty,
    taker_id: req.user.sub,
    maker_id: 0,
    taker_side: order.side,
    taker_oid: order.id,
    maker_oid: 0,
    time: ns(),
  });
  ok(res, { order_id: order.id, status: "open" }, 201);
});
app.get("/api/v1/spot/orders", (req, res) => {
  const { symbol, status } = req.query;
  let list = spotOrders.filter((o) => o.user_id === req.user.sub);
  if (symbol) list = list.filter((o) => o.symbol === symbol.toString());
  if (status) list = list.filter((o) => o.status === status.toString());
  ok(res, { orders: list });
});
app.get("/api/v1/spot/trades", (req, res) => {
  const { symbol } = req.query;
  let list = spotTrades.filter((o) => o.taker_id === req.user.sub || o.maker_id === req.user.sub);
  if (symbol) list = list.filter((o) => o.symbol === symbol.toString());
  ok(res, { trades: list });
});

// ---------- 合约资金流水 ----------
app.get("/api/v1/futures/wallet/ledger", (req, res) => {
  const { asset } = req.query;
  const entries = [
    { id: nextId(), user_id: req.user.sub, asset: "USDT", delta: 1000, balance: 123456, biz_type: "deposit", ref: "dep_001", time: ns() },
    { id: nextId(), user_id: req.user.sub, asset: "USDT", delta: -200, balance: 123256, biz_type: "withdraw", ref: "wd_002", time: ns() },
    { id: nextId(), user_id: req.user.sub, asset: "BTC", delta: 0.01, balance: 0.51, biz_type: "transfer", ref: "tr_003", time: ns() },
  ].filter((e) => !asset || e.asset === asset.toString());
  ok(res, { entries });
});

// ---------- 合约：订单 / 成交 ----------
app.get("/api/v1/futures/orders", (req, res) => {
  const { symbol, status } = req.query;
  let list = futuresOrders.filter((o) => o.user_id === req.user.sub);
  if (symbol) list = list.filter((o) => o.symbol === symbol.toString());
  if (status) list = list.filter((o) => o.status === status.toString());
  ok(res, { orders: list });
});
app.get("/api/v1/futures/trades", (req, res) => {
  const { symbol } = req.query;
  let list = futuresTrades.filter((o) => o.taker_id === req.user.sub || o.maker_id === req.user.sub);
  if (symbol) list = list.filter((o) => o.symbol === symbol.toString());
  ok(res, { trades: list });
});
app.post("/api/v1/futures/wallet/withdraw", (req, res) => {
  const b = req.body || {};
  const id = nextId();
  const rec = {
    id,
    user_id: req.user.sub,
    asset: b.asset ?? "USDT",
    address: b.address ?? "",
    amount: Number(b.amount) || 0,
    network: b.network ?? "ERC20",
    status: "pending",
    created_at: ns(),
  };
  futuresWithdrawRecords.push(rec);
  ok(res, { order_id: id, status: "pending" }, 201);
});

// ---------- 理财 ----------
app.get("/api/v1/wealth/products", (req, res) => ok(res, wealthProducts));
app.get("/api/v1/wealth/holdings", (req, res) =>
  ok(res, wealthHoldings.filter((h) => h.user_id === req.user.sub))
);
app.post("/api/v1/wealth/subscribe", (req, res) => {
  const b = req.body || {};
  const p = wealthProducts.find((x) => x.id === Number(b.product_id));
  if (!p) return fail(res, 404, "产品不存在");
  const h = {
    id: nextId(),
    user_id: req.user.sub,
    product_id: p.id,
    asset: p.asset,
    principal: Number(b.amount) || 0,
    accrued_yield: 0,
    status: "active",
    created_at: new Date().toISOString(),
    last_accrual_at: new Date().toISOString(),
  };
  wealthHoldings.push(h);
  ok(res, h, 201);
});
app.post("/api/v1/wealth/redeem", (req, res) => {
  const b = req.body || {};
  const h = wealthHoldings.find((x) => x.id === Number(b.holding_id) && x.user_id === req.user.sub);
  if (!h) return fail(res, 404, "持仓不存在");
  h.status = "redeemed";
  h.redeemed_at = new Date().toISOString();
  ok(res, h);
});

// ---------- 公告 ----------
app.get("/api/v1/announcement/list", (req, res) =>
  ok(res, { announcements: announcements.filter((a) => a.active) })
);
app.use("/api/v1/announcement/admin", authorize("admin"));
app.get("/api/v1/announcement/admin", (req, res) => ok(res, { announcements }));
app.post("/api/v1/announcement/admin", (req, res) => {
  const b = req.body || {};
  const a = {
    id: nextId(),
    level: b.level || "info",
    title: b.title || "",
    content: b.content || "",
    active: b.active ?? true,
    published_at: b.active ? new Date().toISOString() : undefined,
    created_at: new Date().toISOString(),
  };
  announcements.push(a);
  ok(res, a, 201);
});
app.put("/api/v1/announcement/admin/:id(\\d+)", (req, res) => {
  const a = announcements.find((x) => x.id === Number(req.params.id));
  if (!a) return fail(res, 404, "公告不存在");
  Object.assign(a, req.body, { id: a.id });
  if (a.active && !a.published_at) a.published_at = new Date().toISOString();
  ok(res, a);
});
app.delete("/api/v1/announcement/admin/:id(\\d+)", (req, res) => {
  const i = announcements.findIndex((x) => x.id === Number(req.params.id));
  if (i < 0) return fail(res, 404, "公告不存在");
  announcements.splice(i, 1);
  ok(res, { ok: true });
});

// ---------- API Key（按用户隔离，secret 仅创建时返回一次）----------
app.get("/api/v1/user/api-keys", (req, res) => {
  const list = (apiKeys.get(req.user.sub) || []).map(({ secret, ...v }) => v);
  ok(res, { api_keys: list, total: list.length });
});
app.post("/api/v1/user/api-keys", (req, res) => {
  const b = req.body || {};
  const label = (b.label || "").toString().trim();
  if (!label) return fail(res, 400, "label required");
  const permissions = Array.isArray(b.permissions) ? b.permissions : [];
  if (!permissions.length) return fail(res, 400, "at least one permission required");
  const secret = genSecret();
  const key = {
    id: nextId(),
    user_id: req.user.sub,
    label,
    key: genApiKey(),
    permissions,
    ip_whitelist: Array.isArray(b.ip_whitelist) ? b.ip_whitelist.map(String).filter(Boolean) : [],
    status: "active",
    created_at: new Date().toISOString(),
    secretHash: hashSecret(secret),
  };
  const store = apiKeys.get(req.user.sub) || [];
  store.push(key);
  apiKeys.set(req.user.sub, store);
  const { secretHash, ...view } = key;
  ok(res, { api_key: view, secret }, 201);
});
app.put("/api/v1/user/api-keys/:id(\\d+)", (req, res) => {
  const store = apiKeys.get(req.user.sub) || [];
  const k = store.find((x) => x.id === Number(req.params.id));
  if (!k) return fail(res, 404, "api key not found");
  if (req.body?.status === "active" || req.body?.status === "disabled") k.status = req.body.status;
  ok(res, { ok: true });
});
app.delete("/api/v1/user/api-keys/:id(\\d+)", (req, res) => {
  const store = apiKeys.get(req.user.sub) || [];
  const i = store.findIndex((x) => x.id === Number(req.params.id));
  if (i < 0) return fail(res, 404, "api key not found");
  store.splice(i, 1);
  ok(res, { ok: true });
});

// ---------- 监控（上报接收 + 服务端聚合）----------
// 上报端点：任意已登录客户端均可上报（前端 initMonitor 全局采集）。
app.post("/api/v1/monitor/report", (req, res) => {
  const list = Array.isArray(req.body?.events) ? req.body.events : [];
  if (list.length) pushEvents(list);
  ok(res, { ok: true, accepted: list.length });
});
// 聚合查询：仅 admin 可见（与前端 Monitor 页 RBAC 一致）。
app.use("/api/v1/monitor/summary", authorize("admin"));
app.use("/api/v1/monitor/events", authorize("admin"));
app.get("/api/v1/monitor/summary", (req, res) => {
  const range = (req.query.range || "24h").toString();
  ok(res, summary(range));
});
app.get("/api/v1/monitor/events", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 1000);
  ok(res, recentEvents(limit));
});

// ---------- 挂载管理后台业务路由 ----------
app.use(buildAdminApp());

// ---------- 兜底 404 ----------
app.use(notFound);

// ---------- HTTP + WebSocket ----------
const server = http.createServer(app);

// 行情 WebSocket 多房间
const spotWss = new WebSocketServer({ noServer: true });
const marketWss = new WebSocketServer({ noServer: true });
const klineWss = new WebSocketServer({ noServer: true });

function parseWsUrl(reqUrl) {
  const u = new URL(reqUrl, "http://localhost");
  return {
    pathname: u.pathname,
    symbol: (u.searchParams.get("symbol") || "BTC_USDT").toString(),
    interval: (u.searchParams.get("interval") || "1m").toString(),
  };
}

// 现货：深度 + 成交推送
spotWss.on("connection", (ws, req) => {
  const { symbol } = parseWsUrl(req.url);
  const s = getMarket(symbol);
  const send = () => {
    if (ws.readyState !== ws.OPEN) return;
    const price = stepPrice(s);
    ws.send(JSON.stringify({ type: "depth", data: makeDepth(symbol, price) }));
    if (Math.random() < 0.3) {
      const side = Math.random() < 0.5 ? "buy" : "sell";
      ws.send(JSON.stringify({ type: "trade", data: { id: s.lastTradeId++, symbol, price: r2(price), qty: r4(Math.random() * 2 + 0.01), side, ts: Date.now() } }));
    }
  };
  send();
  const timer = setInterval(send, TICK_MS);
  ws.on("close", () => clearInterval(timer));
});

// 行情 Ticker 广播
marketWss.on("connection", (ws, req) => {
  const { symbol } = parseWsUrl(req.url);
  const s = getMarket(symbol);
  const send = () => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(JSON.stringify(makeTicker(symbol, stepPrice(s))));
  };
  send();
  const timer = setInterval(send, TICK_MS);
  ws.on("close", () => clearInterval(timer));
});

// K 线实时推送（与 REST 共用 kline-server 的内存行情）
klineWss.on("connection", (ws, req) => {
  const { symbol, interval } = parseWsUrl(req.url);
  const ivMs = intervalToMs(interval);
  const sim = getSim(symbol, ivMs);
  const ROLL_EVERY = 8;
  ws.send(JSON.stringify(sim.current));
  const timer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    sim.tick++;
    const cur = sim.current;
    if (sim.tick % ROLL_EVERY === 0) {
      const t = cur.t + ivMs;
      const o = cur.c;
      sim.current = { t, o, h: o, l: o, c: o, v: Math.round((Math.random() * 2 + 0.2) * 1000) / 1000 };
      sim.history.push(sim.current);
      if (sim.history.length > 500) sim.history.shift();
    } else {
      const drift = (Math.random() - 0.5) * cur.c * 0.003;
      const c = Math.max(1, cur.c + drift);
      cur.c = r2(c);
      cur.h = r2(Math.max(cur.h, c));
      cur.l = r2(Math.min(cur.l, c));
      cur.v = Math.round((cur.v + Math.random() * 1.5) * 1000) / 1000;
      sim.current = cur;
      sim.history[sim.history.length - 1] = cur;
    }
    ws.send(JSON.stringify(sim.current));
  }, TICK_MS);
  ws.on("close", () => clearInterval(timer));
});

server.on("upgrade", (req, socket, head) => {
  const { pathname } = parseWsUrl(req.url);
  if (pathname === "/api/v1/spot/ws") {
    spotWss.handleUpgrade(req, socket, head, (ws) => spotWss.emit("connection", ws, req));
  } else if (pathname === "/api/v1/market/ws") {
    marketWss.handleUpgrade(req, socket, head, (ws) => marketWss.emit("connection", ws, req));
  } else if (pathname.startsWith("/api/v1/market/kline/ws")) {
    klineWss.handleUpgrade(req, socket, head, (ws) => klineWss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  server.listen(PORT, () => {
    console.log(`[gateway] unified dev backend listening on :${PORT} (REST + WS: /api/v1/{spot,market,kline}/ws)`);
  });
}

export { app, server };
