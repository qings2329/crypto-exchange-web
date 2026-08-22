// 统一 mock 网关（仅前端开发联调用，内存数据，重启即清空；生产后端为 crypto-exchange Go 网关）。
//
// 整合所有前端 client.ts 调用的 /api/v1/* 业务接口 + 行情 WebSocket，
// 单一进程监听 :8787，前端 Vite 代理 /api -> :8787 即可全量联调（无需再分别启动多个骨架服务）。
// 注意：仅本项目的开发 mock 用此端口；避免占用宿主机上其他服务常用的 :8080。
//
// 整合范围：
//   - 鉴权（gateway-auth）：登录/刷新/登出/网关 Bearer 校验/服务端 RBAC
//   - 管理后台业务（admin-api.buildAdminApp）：风控/通知/合约/期权/杠杆/管理总览/审计/OTC
//   - 本文件新增：注册/发码/用户档案与偏好/TFA/KYC、现货(深度/下单/订单/成交)、行情 ticker、
//     合约资金流水、理财、公告、API Key、监控上报与聚合
//   - WebSocket：/api/v1/spot/ws（深度+成交）、/api/v1/market/ws（Ticker）、/api/v1/market/kline/ws（K线）
//
// 运行：  npm run dev:mock
//         （默认监听 :8787；与前端 vite dev 的代理目标一致）

import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";
import crypto from "node:crypto";
import { authRouter, gateway, authorize, getUserById, roleAtLeast, users } from "./gateway-auth.mjs";

// 与前端 src/lib/validate.ts 保持一致的地址校验
function isValidCryptoAddress(s) {
  const v = String(s ?? "").trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return true;
  return /^[A-Za-z0-9]{25,90}$/.test(v) && !/\s/.test(v);
}
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

// ---------- 提现地址簿（白名单） ----------
const addressBooks = new Map(); // userId -> [{ id, asset, network, address, label, added_at }]
seedAddressBook(3);
function seedAddressBook(userId) {
  addressBooks.set(userId, [
    { id: nextId(), user_id: userId, asset: "USDT", network: "ERC20", address: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72", label: "MetaMask 主钱包", added_at: new Date(Date.now() - 7 * 86400e3).toISOString() },
    { id: nextId(), user_id: userId, asset: "USDT", network: "TRC20", address: "TXk8L2nPQ7sYvVrH4mZcJdFgWq9bAu1E3yRiS5tD", label: "交易所冷钱包", added_at: new Date(Date.now() - 2 * 86400e3).toISOString() },
  ]);
}
function bookOf(userId) {
  let b = addressBooks.get(userId);
  if (!b) {
    b = [];
    addressBooks.set(userId, b);
  }
  return b;
}

// ---------- 风控事件 / 审计日志（演示数据 + 处置联动） ----------
const riskEvents = [
  { id: nextId(), rule_id: 1, type: "login.anomaly", level: "high", target: "user@ce.dev (ID:3)", detail: "异地 IP 登录：45.32.x.x（美国）与常用地区不符", status: "pending", created_at: new Date(Date.now() - 3600e3).toISOString() },
  { id: nextId(), rule_id: 2, type: "trade.velocity", level: "medium", target: "op@ce.dev (ID:2)", detail: "10 分钟内下单 47 次，超过频次阈值 40", status: "pending", created_at: new Date(Date.now() - 7200e3).toISOString() },
  { id: nextId(), rule_id: 3, type: "withdraw.rapid", level: "high", target: "user@ce.dev (ID:3)", detail: "注册 24h 内发起提现 1200 USDT", status: "resolved", created_at: new Date(Date.now() - 86400e3).toISOString() },
];
const auditLogs = [
  { id: nextId(), admin_id: 1, admin_name: "admin", action: "kyc.review.approve", target: "KYC #1", detail: "高级认证通过（演示种子）", ip: "10.0.0.2", created_at: new Date(Date.now() - 172800e3).toISOString() },
  { id: nextId(), admin_id: 2, admin_name: "op", action: "otc.ad.offline", target: "AD #7", detail: "商家广告下架（余额不足）", ip: "10.0.0.3", created_at: new Date(Date.now() - 86400e3).toISOString() },
];
// 预置两条待审提现，便于管理端看板/审核页有初始数据
futuresWithdrawRecords.push(
  { id: nextId(), user_id: 3, asset: "USDT", address: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72", amount: 500, network: "ERC20", status: "pending", created_at: ns() },
  { id: nextId(), user_id: 2, asset: "USDT", address: "TXk8L2nPQ7sYvVrH4mZcJdFgWq9bAu1E3yRiS5tD", amount: 1200, network: "TRC20", status: "approved", created_at: ns() }
);
function appendAudit(user, action, target, detail) {
  auditLogs.push({
    id: nextId(),
    admin_id: user?.sub ?? 0,
    admin_name: user?.username ?? "system",
    action,
    target,
    detail,
    ip: "10.0.0.1",
    created_at: new Date().toISOString(),
  });
}
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
    kyc_level: e.kyc?.status === 2 ? 2 : u.kyc_level ?? 0,
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
// 等级权益：未认证 L0 / 高级认证 L2（演示）
const KYC_LIMITS = {
  0: { level: 0, withdraw_daily_usdt: 1000, fiat_otc: false, futures: false },
  2: { level: 2, withdraw_daily_usdt: 50000, fiat_otc: true, futures: true },
};
const maskName = (s) => (s.length <= 2 ? s[0] + "*" : s[0] + "*".repeat(s.length - 2) + s.slice(-1));
const maskIdNumber = (s) => "*".repeat(Math.max(0, s.length - 4)) + s.slice(-4);

app.post("/api/v1/user/kyc/submit", (req, res) => {
  const e = extra(req.user.sub);
  if (e.kyc?.status === 1) return fail(res, 409, "已有申请审核中，请耐心等待");
  if (e.kyc?.status === 2) return fail(res, 409, "已完成高级认证，无需重复提交");
  const b = req.body || {};
  const realName = String(b.real_name || "").trim();
  const idType = b.id_type === "passport" ? "passport" : "id_card";
  const idNumber = String(b.id_number || "").trim();
  const country = String(b.country || "").trim();
  if (realName.length < 2) return fail(res, 400, "请输入真实姓名");
  if (idNumber.length < 5) return fail(res, 400, "证件号码格式不正确");
  if (!country) return fail(res, 400, "请选择国家/地区");
  // 演示审核规则：证件号尾号 000 → 材料核验失败驳回；其余 10 秒后自动通过
  const willReject = /000$/.test(idNumber);
  e.kyc = {
    user_id: req.user.sub,
    real_name: maskName(realName),
    id_type: idType,
    id_number: maskIdNumber(idNumber),
    country,
    doc_front_name: String(b.doc_front_name || "").slice(0, 120),
    doc_back_name: String(b.doc_back_name || "").slice(0, 120),
    status: 1,
    submitted_at: new Date().toISOString(),
    review_at: Date.now() + 10_000,
    _reject: willReject,
  };
  ok(res, { status: 1, message: "KYC 已提交，审核中" }, 201);
});
app.get("/api/v1/user/kyc", (req, res) => {
  const e = extra(req.user.sub);
  const k = e.kyc;
  // 惰性审核：到达审核时间点即落审（免定时器）
  if (k && k.status === 1 && Date.now() >= k.review_at) {
    k.status = k._reject ? 3 : 2;
    k.reviewed_at = new Date().toISOString();
    k.reviewer = "risk-system";
    if (k._reject) k.reject_reason = "证件信息核验失败，请重新上传清晰的证件照片";
    else k.level = 2;
    delete k._reject;
    delete k.review_at;
  }
  const approved = k?.status === 2;
  ok(res, {
    kyc: k ? { ...k } : null,
    limits: KYC_LIMITS[approved ? 2 : 0],
  });
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
// 余额：与前端 use-mock-balances 同一确定性派生（seed = session-<uid>），保证两处数字一致
function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
app.get("/api/v1/futures/wallet/balance", (req, res) => {
  const s = seedFrom(`session-${req.user.sub}`);
  const r2 = (n) => Math.round(n * 100) / 100;
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const usdt = 5000 + (s % 45000) + ((s >>> 8) % 100) / 100;
  const btc = 0.05 + ((s >>> 4) % 900) / 1000;
  const eth = 0.8 + ((s >>> 6) % 1200) / 100;
  ok(res, [
    { asset: "USDT", available: r2(usdt - usdt * (((s >>> 12) % 800) / 10000)), frozen: r2(usdt * (((s >>> 12) % 800) / 10000)) },
    { asset: "BTC", available: r4(btc - btc * (((s >>> 16) % 1500) / 10000)), frozen: r4(btc * (((s >>> 16) % 1500) / 10000)) },
    { asset: "ETH", available: r4(eth - eth * (((s >>> 20) % 1500) / 10000)), frozen: r4(eth * (((s >>> 20) % 1500) / 10000)) },
  ]);
});
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
  // 白名单：已设置地址簿的用户只能提到簿内地址
  const book = bookOf(req.user.sub);
  if (book.length > 0) {
    const hit = book.some((x) => x.address.toLowerCase() === String(b.address || "").trim().toLowerCase());
    if (!hit) return fail(res, 403, "提现地址不在白名单内，请先在地址簿中添加并验证");
  }
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
// ---------- 地址簿 ----------
app.get("/api/v1/futures/wallet/address-book", (req, res) => {
  const list = [...bookOf(req.user.sub)].sort((a, b) => b.id - a.id);
  ok(res, { entries: list, whitelist_active: list.length > 0 });
});
app.post("/api/v1/futures/wallet/address-book", (req, res) => {
  const b = req.body || {};
  const address = String(b.address || "").trim();
  const asset = String(b.asset || "").trim().toUpperCase();
  const label = String(b.label || "").trim().slice(0, 40);
  if (!asset) return fail(res, 400, "资产必填");
  if (!isValidCryptoAddress(address)) return fail(res, 400, "地址格式不正确");
  const book = bookOf(req.user.sub);
  if (book.some((x) => x.address.toLowerCase() === address.toLowerCase()))
    return fail(res, 409, "该地址已存在");
  const entry = { id: nextId(), user_id: req.user.sub, asset, network: String(b.network || "").trim(), address, label: label || "未命名", added_at: new Date().toISOString() };
  book.push(entry);
  appendAudit(req.user, "addressbook.add", `ADDR #${entry.id}`, `${label} ${address.slice(0, 10)}…`);
  ok(res, entry, 201);
});
app.delete("/api/v1/futures/wallet/address-book/:id", (req, res) => {
  const book = bookOf(req.user.sub);
  const i = book.findIndex((x) => x.id === Number(req.params.id));
  if (i < 0) return fail(res, 404, "地址不存在");
  const [rm] = book.splice(i, 1);
  appendAudit(req.user, "addressbook.remove", `ADDR #${rm.id}`, rm.label);
  ok(res, { ok: true });
});

// 提现记录列表：admin/operator 见全部，普通用户仅本人
app.get("/api/v1/futures/wallet/withdraws", (req, res) => {
  const role = req.user.role ?? "user";
  const list = roleAtLeast(role, "operator")
    ? [...futuresWithdrawRecords].sort((a, b) => b.id - a.id)
    : futuresWithdrawRecords.filter((w) => w.user_id === req.user.sub).sort((a, b) => b.id - a.id);
  ok(res, list);
});
// 提现审核（admin）：approve / reject，落审计日志
app.post("/api/v1/futures/wallet/withdraws/:id/review", authorize("admin"), (req, res) => {
  const w = futuresWithdrawRecords.find((x) => x.id === Number(req.params.id));
  if (!w) return fail(res, 404, "提现记录不存在");
  if (w.status !== "pending") return fail(res, 409, "该提现已处理");
  const action = req.body?.action;
  if (!["approve", "reject"].includes(action)) return fail(res, 400, "action 必须为 approve/reject");
  w.status = action === "approve" ? "approved" : "rejected";
  w.reviewed_by = req.user.username;
  appendAudit(req.user, "withdraw.review", `WD #${w.id}`, `${action} · ${w.amount} ${w.asset}`);
  ok(res, { ok: true });
});
// 批量审核（admin）
app.post("/api/v1/futures/wallet/withdraws/batch/review", authorize("admin"), (req, res) => {
  const { ids = [], action } = req.body || {};
  if (!["approve", "reject"].includes(action)) return fail(res, 400, "action 必须为 approve/reject");
  let count = 0;
  for (const id of ids) {
    const w = futuresWithdrawRecords.find((x) => x.id === Number(id));
    if (w && w.status === "pending") {
      w.status = action === "approve" ? "approved" : "rejected";
      w.reviewed_by = req.user.username;
      count += 1;
    }
  }
  if (count > 0) appendAudit(req.user, "withdraw.batchReview", `${count} 条`, action);
  ok(res, { ok: true, count });
});

// ---------- 风控事件 ----------
app.get("/api/v1/risk/events", (req, res) => {
  const { status, level } = req.query;
  let list = [...riskEvents].sort((a, b) => b.id - a.id);
  if (status) list = list.filter((e) => e.status === status.toString());
  if (level) list = list.filter((e) => e.level === level.toString());
  ok(res, list);
});
app.post("/api/v1/risk/events/batch/resolve", authorize("admin"), (req, res) => {
  const { ids = [], status } = req.body || {};
  if (!["resolved", "ignored"].includes(status)) return fail(res, 400, "status 必须为 resolved/ignored");
  let count = 0;
  for (const id of ids) {
    const ev = riskEvents.find((x) => x.id === Number(id));
    if (ev && ev.status === "pending") {
      ev.status = status;
      count += 1;
    }
  }
  if (count > 0) appendAudit(req.user, "risk.batchResolve", `${count} 条`, status);
  ok(res, { ok: true, count });
});
app.post("/api/v1/risk/events/:id/resolve", authorize("admin"), (req, res) => {
  const ev = riskEvents.find((x) => x.id === Number(req.params.id));
  if (!ev) return fail(res, 404, "风控事件不存在");
  const { status } = req.body || {};
  if (!["resolved", "ignored"].includes(status)) return fail(res, 400, "status 必须为 resolved/ignored");
  ev.status = status;
  appendAudit(req.user, "risk.resolve", `EVENT #${ev.id}`, `${ev.type} → ${status}`);
  ok(res, { ok: true });
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
// ---------- 后台总览 / 审计 ----------
app.get("/api/v1/admin/overview", authorize("admin"), (req, res) => {
  const today = new Date().toDateString();
  ok(res, {
    users_total: users.length,
    users_today: users.filter((u) => new Date((u.created_at ?? Date.now())).toDateString() === today).length,
    trade_volume_24h: spotTrades.reduce((s2, tr) => s2 + (tr.price || 0) * (tr.quantity || 0), 0) + futuresTrades.reduce((s2, tr) => s2 + (tr.price || 0) * (tr.quantity || 0), 0),
    orders_24h: spotOrders.length + futuresOrders.length,
    pending_withdraws: futuresWithdrawRecords.filter((w) => w.status === "pending").length,
    pending_risk_events: riskEvents.filter((e) => e.status === "pending").length,
    open_disputes: otcOrders.filter((o) => o.status === "disputed").length,
    online_users: Math.max(1, Math.round(users.length / 2)),
  });
});
app.get("/api/v1/admin/audit", authorize("admin"), (req, res) => {
  const { action } = req.query;
  let list = [...auditLogs].sort((a, b) => b.id - a.id);
  if (action) list = list.filter((l) => l.action.includes(action.toString()));
  ok(res, list);
});

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

// ---------- OTC（法币交易）----------
// 内存版 P2P 后端：广告（商家种子）/ 报价 / 订单状态机（15 分钟付款超时自动取消）/ 聊天 / 申诉。
const FIAT_RATES = { CNY: 7.23, USD: 1, EUR: 0.92 };
const otcAds = [];
const otcOrders = [];
const otcMessages = new Map(); // orderId -> messages[]
let otcSeq = 1;

// 商家种子（user_id 9001+，带画像字段）
const OTC_MERCHANTS = {
  9001: { nickname: "CryptoPro·旗舰", verified: true, trades: 48210, success_rate: 99.2 },
  9002: { nickname: "快速出金王", verified: false, trades: 12650, success_rate: 97.8 },
  9003: { nickname: "金汇商行", verified: true, trades: 30120, success_rate: 99.6 },
  9004: { nickname: "小熊换汇", verified: false, trades: 2100, success_rate: 95.4 },
  9005: { nickname: "GlobalDesk", verified: true, trades: 15800, success_rate: 98.9 },
  9006: { nickname: "StarFX", verified: false, trades: 4200, success_rate: 96.1 },
  9007: { nickname: "鲸鱼量化", verified: true, trades: 28900, success_rate: 99.4 },
  9008: { nickname: "闪电兑", verified: false, trades: 9800, success_rate: 97.2 },
  9009: { nickname: "恒信支付", verified: true, trades: 20300, success_rate: 98.5 },
  9010: { nickname: "OceanBridge", verified: true, trades: 11200, success_rate: 99.0 },
};
function seedOtcAds() {
  const rows = [
    [9001, "buy", "USDT", "CNY", -0.3, 100, 50000, 152340, ["bank", "alipay"]],
    [9002, "buy", "USDT", "CNY", -0.1, 500, 200000, 88000, ["alipay", "wechat"]],
    [9003, "buy", "USDT", "CNY", 0.2, 1000, 300000, 421000, ["bank"]],
    [9004, "buy", "USDT", "CNY", 0.5, 100, 8000, 12000, ["wechat"]],
    [9005, "buy", "USDT", "USD", -0.2, 50, 20000, 96000, ["bank"]],
    [9006, "buy", "USDT", "USD", 0.4, 20, 5000, 33000, ["alipay", "bank"]],
    [9007, "sell", "USDT", "CNY", 0.6, 1000, 500000, 210000, ["bank", "alipay"]],
    [9008, "sell", "USDT", "CNY", 0.4, 100, 60000, 65000, ["wechat", "alipay"]],
    [9009, "sell", "USDT", "CNY", 0.8, 500, 150000, 175000, ["bank"]],
    [9010, "sell", "USDT", "USD", 0.5, 100, 30000, 88000, ["bank"]],
    [9001, "buy", "BTC", "CNY", -0.5, 500, 2000000, 12.5, ["bank"]],
    [9007, "sell", "BTC", "CNY", 0.9, 1000, 3000000, 18.8, ["bank", "alipay"]],
  ];
  for (const [uid, side, asset, fiat, premium, minAmt, maxAmt, available, methods] of rows) {
    otcAds.push({
      id: otcSeq++,
      user_id: uid,
      side,
      asset,
      fiat_currency: fiat,
      premium, // 相对行情溢价 %
      price: 0, // 读取时按实时行情计算
      min_amount: minAmt,
      max_amount: maxAmt,
      available, // 可用数量（币）
      payment_methods: methods.join(","),
      status: "online",
      created_at: new Date(Date.now() - 86400e3 * 30).toISOString(),
    });
  }
}
seedOtcAds();

function otcAdPrice(ad) {
  const base = ad.asset === "BTC" ? getMarket("BTCUSDT").price : getMarket("USDTUSDT").price;
  const rate = FIAT_RATES[ad.fiat_currency] ?? 1;
  return r2(base * rate * (1 + ad.premium / 100));
}

function otcAdView(ad) {
  const m = OTC_MERCHANTS[ad.user_id] ?? { nickname: `商家${ad.user_id}`, verified: false, trades: 0, success_rate: 90 };
  return {
    ...ad,
    price: otcAdPrice(ad),
    available: r4(ad.available),
    merchant: { user_id: ad.user_id, ...m },
  };
}

// 法币报价：基准价 × 汇率
app.get("/api/v1/otc/prices", (req, res) => {
  const asset = String(req.query.asset || "USDT").toUpperCase();
  const fiat = String(req.query.fiat || "CNY").toUpperCase();
  const base = asset === "BTC" ? getMarket("BTCUSDT").price : getMarket("USDTUSDT").price;
  const rate = FIAT_RATES[fiat] ?? 1;
  ok(res, { asset, fiat, base_price: r2(base * rate), fiat_rate: rate, updated_at: new Date().toISOString() });
});

// 广告列表（公开）：支持 side/asset/fiat/method/amount 过滤
app.get("/api/v1/otc/advertisements", (req, res) => {
  const { side, asset, fiat, method, amount } = req.query;
  let list = otcAds.filter((a) => a.status === "online");
  if (side) list = list.filter((a) => a.side === side);
  if (asset) list = list.filter((a) => a.asset === String(asset).toUpperCase());
  if (fiat) list = list.filter((a) => a.fiat_currency === String(fiat).toUpperCase());
  if (method && method !== "all") list = list.filter((a) => a.payment_methods.split(",").includes(String(method)));
  if (amount) {
    const amt = Number(amount);
    if (Number.isFinite(amt)) list = list.filter((a) => amt >= a.min_amount && amt <= a.max_amount);
  }
  // 排序：买入单价升序、卖出降序
  list.sort((a, b) => (a.side === "buy" ? otcAdPrice(a) - otcAdPrice(b) : otcAdPrice(b) - otcAdPrice(a)));
  ok(res, { advertisements: list.map(otcAdView) });
});

app.post("/api/v1/otc/advertisements", (req, res) => {
  const b = req.body || {};
  if (!b.side || !b.asset || !b.fiat_currency || !(b.price > 0)) return fail(res, 400, "side/asset/fiat_currency/price 必填");
  const ad = {
    id: otcSeq++,
    user_id: Number(req.user.sub),
    side: b.side,
    asset: String(b.asset).toUpperCase(),
    fiat_currency: String(b.fiat_currency).toUpperCase(),
    premium: 0,
    price: r2(b.price),
    min_amount: Number(b.min_amount ?? 1),
    max_amount: Number(b.max_amount ?? 100000),
    available: Number(b.max_amount ?? 100000),
    payment_methods: String(b.payment_methods ?? "bank"),
    status: "online",
    created_at: new Date().toISOString(),
  };
  otcAds.push(ad);
  ok(res, otcAdView(ad), 201);
});

// 接单下单：按法币金额成交，返回订单（含收款人掩码 + 15 分钟过期时间）
const PAYEE_POOL = ["李*明", "王*芳", "张*伟", "陈*静", "刘*洋"];
app.post("/api/v1/otc/orders/take", (req, res) => {
  const { ad_id, fiat_amount, payment_method } = req.body || {};
  const ad = otcAds.find((a) => a.id === Number(ad_id) && a.status === "online");
  if (!ad) return fail(res, 404, "广告不存在或已下架");
  const amount = Number(fiat_amount);
  if (!(amount >= ad.min_amount && amount <= ad.max_amount)) return fail(res, 400, `金额需在 ${ad.min_amount} - ${ad.max_amount} ${ad.fiat_currency} 之间`);
  const price = otcAdPrice(ad);
  const cryptoAmount = r4(amount / price);
  if (cryptoAmount > ad.available) return fail(res, 400, "超出商家可用数量");
  ad.available = r4(ad.available - cryptoAmount);

  const takerId = Number(req.user.sub);
  const isBuy = ad.side === "buy"; // 用户买入 → 对手方（商家）是卖方收款人
  const method = String(payment_method || ad.payment_methods.split(",")[0]);
  const order = {
    id: otcSeq++,
    ad_id: ad.id,
    maker_id: ad.user_id,
    taker_id: takerId,
    side: ad.side,
    asset: ad.asset,
    fiat_currency: ad.fiat_currency,
    crypto_amount: cryptoAmount,
    price,
    fiat_amount: r2(amount),
    payment_method: method,
    status: "pending",
    rating: 0,
    expire_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    payee: isBuy
      ? {
          name: PAYEE_POOL[ad.user_id % PAYEE_POOL.length],
          bank: method === "bank" ? "招商银行" : undefined,
          account: method === "bank" ? `6225 88**** **** ${1000 + (ad.id % 9000)}` : `${method}_pay_${1000 + (ad.id % 9000)}`,
        }
      : undefined,
    created_at: new Date().toISOString(),
  };
  otcOrders.unshift(order);
  otcMessages.set(order.id, []);
  ok(res, order, 201);
});

// 我的订单（参与方视角，附对手方昵称）
function otcOrderView(o, userId) {
  const counterpartyId = o.maker_id === userId ? o.taker_id : o.maker_id;
  const cp = OTC_MERCHANTS[counterpartyId];
  return { ...o, counterparty_nickname: cp?.nickname ?? `用户${counterpartyId}` };
}
app.get("/api/v1/otc/orders", (req, res) => {
  const uid = Number(req.user.sub);
  const list = otcOrders.filter((o) => o.maker_id === uid || o.taker_id === uid);
  ok(res, { orders: list.map((o) => otcOrderView(o, uid)) });
});

function findMyOrder(req, res) {
  const o = otcOrders.find((x) => x.id === Number(req.params.id));
  if (!o) {
    fail(res, 404, "订单不存在");
    return null;
  }
  const uid = Number(req.user.sub);
  if (o.maker_id !== uid && o.taker_id !== uid) {
    fail(res, 403, "无权访问该订单");
    return null;
  }
  return o;
}

app.post("/api/v1/otc/orders/:id/pay", (req, res) => {
  const o = findMyOrder(req, res);
  if (!o) return;
  if (o.status !== "pending") return fail(res, 409, "当前状态不可标记付款");
  if (Date.now() > Date.parse(o.expire_at)) return fail(res, 410, "订单已超时");
  o.status = "paid";
  o.paid_at = new Date().toISOString();
  // 模拟卖方 8 秒后自动放币
  setTimeout(() => {
    if (o.status === "paid") {
      o.status = "completed";
      o.completed_at = new Date().toISOString();
      otcMessages.get(o.id)?.push({
        id: otcSeq++,
        order_id: o.id,
        sender_id: o.maker_id,
        content: "已收到付款，币已放出，感谢惠顾！",
        created_at: new Date().toISOString(),
      });
    }
  }, 8000);
  ok(res, { ok: true });
});

app.post("/api/v1/otc/orders/:id/complete", (req, res) => {
  const o = findMyOrder(req, res);
  if (!o) return;
  if (o.status !== "paid") return fail(res, 409, "仅已付款订单可完成");
  o.status = "completed";
  o.completed_at = new Date().toISOString();
  ok(res, { ok: true });
});

app.post("/api/v1/otc/orders/:id/cancel", (req, res) => {
  const o = findMyOrder(req, res);
  if (!o) return;
  if (o.status !== "pending") return fail(res, 409, "仅待付款订单可取消");
  o.status = "cancelled";
  const ad = otcAds.find((a) => a.id === o.ad_id);
  if (ad) ad.available = r4(ad.available + o.crypto_amount); // 回滚额度
  ok(res, { ok: true });
});

app.post("/api/v1/otc/orders/:id/dispute", (req, res) => {
  const o = findMyOrder(req, res);
  if (!o) return;
  if (o.status !== "pending" && o.status !== "paid") return fail(res, 409, "当前状态不可申诉");
  o.status = "disputed";
  o.dispute_reason = String(req.body?.reason ?? "");
  ok(res, { ok: true });
});

// 聊天：拉取 + 发送（对方 1.5s 后罐头回复）
app.get("/api/v1/otc/orders/:id/messages", (req, res) => {
  const o = findMyOrder(req, res);
  if (!o) return;
  ok(res, { messages: otcMessages.get(o.id) ?? [] });
});
const PEER_REPLIES = ["您好，请付款后点击「我已付款」", "收到转账后我会尽快确认放币", "请备注订单号，方便核对到账", "好的，正在处理中"];
app.post("/api/v1/otc/orders/:id/messages", (req, res) => {
  const o = findMyOrder(req, res);
  if (!o) return;
  const content = String(req.body?.content ?? "").trim();
  if (!content) return fail(res, 400, "消息不能为空");
  const msg = {
    id: otcSeq++,
    order_id: o.id,
    sender_id: Number(req.user.sub),
    content,
    created_at: new Date().toISOString(),
  };
  otcMessages.get(o.id)?.push(msg);
  // 模拟对手方自动回复
  const peerId = o.maker_id === Number(req.user.sub) ? o.taker_id : o.maker_id;
  setTimeout(() => {
    otcMessages.get(o.id)?.push({
      id: otcSeq++,
      order_id: o.id,
      sender_id: peerId,
      content: PEER_REPLIES[Math.floor(Math.random() * PEER_REPLIES.length)],
      created_at: new Date().toISOString(),
    });
  }, 1500);
  ok(res, msg, 201);
});

// 付款凭证
const otcProofs = new Map(); // orderId -> proofs[]
app.get("/api/v1/otc/orders/:id/proofs", (req, res) => {
  const o = findMyOrder(req, res);
  if (!o) return;
  ok(res, { proofs: otcProofs.get(o.id) ?? [] });
});
app.post("/api/v1/otc/orders/:id/proofs", (req, res) => {
  const o = findMyOrder(req, res);
  if (!o) return;
  const proof = {
    id: otcSeq++,
    order_id: o.id,
    filename: String(req.body?.filename ?? "proof.png"),
    uploaded_by: Number(req.user.sub),
    created_at: new Date().toISOString(),
  };
  if (!otcProofs.has(o.id)) otcProofs.set(o.id, []);
  otcProofs.get(o.id).push(proof);
  ok(res, proof, 201);
});

// 超时清扫：待付款且过期的订单每秒检查 → 自动取消并回滚额度
setInterval(() => {
  const now = Date.now();
  for (const o of otcOrders) {
    if (o.status === "pending" && Date.parse(o.expire_at) < now) {
      o.status = "cancelled";
      o.cancel_reason = "timeout";
      const ad = otcAds.find((a) => a.id === o.ad_id);
      if (ad) ad.available = r4(ad.available + o.crypto_amount);
    }
  }
}, 1000).unref();

// ---------- 理财（Earn Hub：活期/定期）----------
// 产品静态数据；持仓利息按读取时刻实时累计（amount × apy × 天数 / 365）。
const DAY_MS = 86400e3;
const earnProducts = [
  { id: nextId(), name: "USDT 活期理财", asset: "USDT", term_days: 0, apy: 0.065, min_amount: 10, max_amount: 500000, status: "open" },
  { id: nextId(), name: "USDC 活期理财", asset: "USDC", term_days: 0, apy: 0.052, min_amount: 10, max_amount: 300000, status: "open" },
  { id: nextId(), name: "BTC 7天定期", asset: "BTC", term_days: 7, apy: 0.098, min_amount: 0.001, max_amount: 50, status: "open" },
  { id: nextId(), name: "ETH 30天定期", asset: "ETH", term_days: 30, apy: 0.125, min_amount: 0.01, max_amount: 500, status: "open" },
  { id: nextId(), name: "BNB 120天定期", asset: "BNB", term_days: 120, apy: 0.158, min_amount: 0.1, max_amount: 2000, status: "open" },
  { id: nextId(), name: "FDUSD 30天定期", asset: "FDUSD", term_days: 30, apy: 0.112, min_amount: 10, max_amount: 100000, status: "open" },
];
const earnSubscriptions = []; // {id,user_id,product_id,asset,amount,apy,start_at,status}

app.get("/api/v1/earn/products", (req, res) => {
  const { term } = req.query;
  let list = earnProducts.filter((p) => p.status === "open");
  if (term === "flexible") list = list.filter((p) => p.term_days === 0);
  if (term === "fixed") list = list.filter((p) => p.term_days > 0);
  if (term && /^\d+$/.test(String(term))) list = list.filter((p) => p.term_days === Number(term));
  ok(res, { products: list });
});

app.get("/api/v1/earn/subscriptions", (req, res) => {
  const uid = Number(req.user.sub);
  const now = Date.now();
  const list = earnSubscriptions
    .filter((s) => s.user_id === uid)
    .map((s) => {
      const days = Math.max(0, (now - Date.parse(s.start_at)) / DAY_MS);
      return { ...s, accrued: r6(s.amount * s.apy * (days / 365)) };
    });
  ok(res, { subscriptions: list });
});

function r6(x) {
  return Math.round(x * 1e6) / 1e6;
}

app.post("/api/v1/earn/subscribe", (req, res) => {
  const b = req.body || {};
  const p = earnProducts.find((x) => x.id === Number(b.product_id));
  if (!p || p.status !== "open") return fail(res, 404, "产品不存在或已售罄");
  const amount = Number(b.amount);
  if (!(amount >= p.min_amount)) return fail(res, 400, `最低申购 ${p.min_amount} ${p.asset}`);
  if (amount > p.max_amount) return fail(res, 400, `超出单户限额 ${p.max_amount} ${p.asset}`);
  if (!b.agreed) return fail(res, 400, "请先阅读并同意《理财服务协议》");
  const sub = {
    id: nextId(),
    user_id: Number(req.user.sub),
    product_id: p.id,
    asset: p.asset,
    amount,
    apy: p.apy,
    term_days: p.term_days,
    start_at: new Date().toISOString(),
    status: "active",
  };
  earnSubscriptions.unshift(sub);
  ok(res, sub, 201);
});

app.post("/api/v1/earn/subscriptions/:id/redeem", (req, res) => {
  const s = earnSubscriptions.find(
    (x) => x.id === Number(req.params.id) && x.user_id === Number(req.user.sub)
  );
  if (!s) return fail(res, 404, "持仓不存在");
  if (s.status !== "active") return fail(res, 409, "该持仓已赎回");
  const days = Math.max(0, (Date.now() - Date.parse(s.start_at)) / DAY_MS);
  const accrued = r6(s.amount * s.apy * (days / 365));
  s.status = "redeemed";
  s.redeemed_at = new Date().toISOString();
  ok(res, { ...s, accrued, redeemed_amount: r6(s.amount + accrued) });
});

// ---------- 新币挖矿（Launchpool）----------
// 项目状态由时间窗推导：upcoming / ongoing / ended；奖励按质押时长实时累计。
const launchProjects = [
  {
    id: nextId(),
    name: "NovaChain",
    token: "NOVA",
    total_supply: "2,000,000,000",
    starts_at: new Date(Date.now() - DAY_MS).toISOString(),
    ends_at: new Date(Date.now() + 20 * DAY_MS).toISOString(),
    pools: [
      { id: "bnb", asset: "BNB", apy: 0.088 },
      { id: "fdusd", asset: "FDUSD", apy: 0.045 },
    ],
  },
  {
    id: nextId(),
    name: "QuantumPay",
    token: "QPAY",
    total_supply: "800,000,000",
    starts_at: new Date(Date.now() + 2 * DAY_MS).toISOString(),
    ends_at: new Date(Date.now() + 32 * DAY_MS).toISOString(),
    pools: [
      { id: "bnb", asset: "BNB", apy: 0.102 },
      { id: "fdusd", asset: "FDUSD", apy: 0.058 },
    ],
  },
  {
    id: nextId(),
    name: "MetaVerse X",
    token: "MVX",
    total_supply: "1,000,000,000",
    starts_at: new Date(Date.now() - 30 * DAY_MS).toISOString(),
    ends_at: new Date(Date.now() - 5 * DAY_MS).toISOString(),
    pools: [
      { id: "bnb", asset: "BNB", apy: 0.075 },
      { id: "fdusd", asset: "FDUSD", apy: 0.038 },
    ],
  },
];
const launchPositions = []; // {id,user_id,project_id,pool_id,staked,rewards,last_accrual_at}

function launchStatus(p, now = Date.now()) {
  if (now < Date.parse(p.starts_at)) return "upcoming";
  if (now > Date.parse(p.ends_at)) return "ended";
  return "ongoing";
}
function findPosition(uid, projectId, poolId) {
  return launchPositions.find(
    (x) => x.user_id === uid && x.project_id === projectId && x.pool_id === poolId
  );
}
// 读取时把自上次结算以来的奖励落账
function settleRewards(pos, project) {
  const now = Date.now();
  if (launchStatus(project, now) !== "ongoing") {
    // 项目结束后停止计息
    const end = Math.min(now, Date.parse(project.ends_at));
    const days = Math.max(0, (end - Date.parse(pos.last_accrual_at)) / DAY_MS);
    if (days > 0) {
      const pool = project.pools.find((x) => x.id === pos.pool_id);
      // 全精度累计：短间隔轮询的增量远小于 1e-6，r6 会把奖励抹零
      pos.rewards = Math.round((pos.rewards + pos.staked * pool.apy * (days / 365)) * 1e12) / 1e12;
    }
    pos.last_accrual_at = new Date(end).toISOString();
    return;
  }
  const days = Math.max(0, (now - Date.parse(pos.last_accrual_at)) / DAY_MS);
  if (days > 0) {
    const pool = project.pools.find((x) => x.id === pos.pool_id);
    pos.rewards = Math.round((pos.rewards + pos.staked * pool.apy * (days / 365)) * 1e12) / 1e12;
    pos.last_accrual_at = new Date(now).toISOString();
  }
}

app.get("/api/v1/launchpad/projects", (req, res) => {
  const now = Date.now();
  ok(res, {
    projects: launchProjects.map((p) => ({
      ...p,
      status: launchStatus(p, now),
      starts_at: p.starts_at,
      ends_at: p.ends_at,
    })),
  });
});

app.get("/api/v1/launchpad/positions", (req, res) => {
  const uid = Number(req.user.sub);
  const list = launchPositions
    .filter((x) => x.user_id === uid)
    .map((pos) => {
      const project = launchProjects.find((p) => p.id === pos.project_id);
      if (project) settleRewards(pos, project);
      return pos;
    });
  ok(res, { positions: list });
});

app.post("/api/v1/launchpad/stake", (req, res) => {
  const { project_id, pool_id, amount } = req.body || {};
  const project = launchProjects.find((p) => p.id === Number(project_id));
  if (!project) return fail(res, 404, "项目不存在");
  if (launchStatus(project) !== "ongoing") return fail(res, 409, "仅进行中的项目可质押");
  const pool = project.pools.find((x) => x.id === String(pool_id));
  if (!pool) return fail(res, 404, "质押池不存在");
  const amt = Number(amount);
  if (!(amt > 0)) return fail(res, 400, "质押数量必须大于 0");
  let pos = findPosition(Number(req.user.sub), project.id, pool.id);
  if (!pos) {
    pos = {
      id: nextId(),
      user_id: Number(req.user.sub),
      project_id: project.id,
      pool_id: pool.id,
      staked: 0,
      rewards: 0,
      last_accrual_at: new Date().toISOString(),
    };
    launchPositions.push(pos);
  }
  pos.staked = r6(pos.staked + amt);
  ok(res, pos, 201);
});

app.post("/api/v1/launchpad/unstake", (req, res) => {
  const { position_id, amount } = req.body || {};
  const pos = launchPositions.find(
    (x) => x.id === Number(position_id) && x.user_id === Number(req.user.sub)
  );
  if (!pos) return fail(res, 404, "仓位不存在");
  const amt = amount == null ? pos.staked : Number(amount); // 缺省全额赎回
  if (!(amt > 0) || amt > pos.staked) return fail(res, 400, "赎回数量无效");
  pos.staked = r6(pos.staked - amt);
  ok(res, pos);
});

app.post("/api/v1/launchpad/harvest", (req, res) => {
  const { position_id } = req.body || {};
  const pos = launchPositions.find(
    (x) => x.id === Number(position_id) && x.user_id === Number(req.user.sub)
  );
  if (!pos) return fail(res, 404, "仓位不存在");
  const project = launchProjects.find((p) => p.id === pos.project_id);
  if (project) settleRewards(pos, project);
  if (pos.rewards <= 0) return fail(res, 409, "暂无可领取的奖励");
  const claimed = pos.rewards;
  pos.rewards = 0;
  ok(res, { ...pos, claimed }, 200);
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
