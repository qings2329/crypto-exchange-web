// 真实网关鉴权模拟层（零依赖，仅用 Node 内置 crypto）。
//
// 充当 API 网关的角色，位于所有业务接口之前：
//   1) 登录签发签名 JWT（HS256）作为 access_token，并签发不透明 refresh_token（内存存储）。
//   2) 网关中间件校验每个 /api/v1/* 请求的 Bearer 令牌（签名 + 有效期），缺失/无效/过期返回 401。
//   3) 服务端 RBAC：authorize(role) 校验令牌中的 role 声明，不足返回 403。
//   4) refresh 端点用 refresh_token 换发新 access_token（并轮转 refresh_token）；logout 吊销。
//
// 生产环境这些由真实网关（如 Kong / APISIX / 自建 OAuth2 资源服务器）完成；
// 此处用 Express 中间件复刻同样的行为，使前端可在开发期“对接真实网关鉴权”。

import crypto from "node:crypto";
import express from "express";

// 生产应来自环境变量 / KMS；此处为开发默认值。
const SECRET = process.env.AUTH_SECRET || "dev-gateway-secret";
const ACCESS_TTL = Number(process.env.AUTH_ACCESS_TTL) || 15 * 60; // 秒
const REFRESH_TTL = Number(process.env.AUTH_REFRESH_TTL) || 7 * 24 * 60 * 60; // 秒

// ---------- 角色等级（与前端 src/lib/rbac.tsx 保持一致）----------
export const ROLE_RANK = { user: 1, operator: 2, admin: 3 };
export function roleAtLeast(have, need) {
  const h = ROLE_RANK[have] ?? 0;
  const n = ROLE_RANK[need] ?? 0;
  return h >= n;
}

// ---------- 种子用户（演示账号，生产由用户中心提供）----------
// 密码明文仅用于 mock；真实网关应对接用户中心并校验哈希。
export const users = [
  { id: 1, username: "admin", email: "admin@ce.dev", phone: "13800000001", password: "Admin@123", role: "admin", nickname: "管理员", kyc_level: 2, tfa_enabled: true, email_verified: true, phone_verified: true, status: 0 },
  { id: 2, username: "op", email: "op@ce.dev", phone: "13800000002", password: "Op@123", role: "operator", nickname: "运营", kyc_level: 1, tfa_enabled: false, email_verified: true, phone_verified: false, status: 0 },
  { id: 3, username: "user1", email: "user@ce.dev", phone: "13800000003", password: "User@123", role: "user", nickname: "普通用户", kyc_level: 0, tfa_enabled: false, email_verified: true, phone_verified: false, status: 0 },
];

// 按 id 查种子用户（供统一网关补全 /user/me 档案）。
export function getUserById(id) {
  return users.find((u) => u.id === Number(id));
}

// refresh_token -> { userId, role, exp }
const refreshStore = new Map();

// ---------- HS256 JWT ----------
function b64url(input) {
  return Buffer.from(input).toString("base64url");
}
function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}
function verifyToken(token) {
  if (typeof token !== "string") throw new Error("malformed");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed");
  const data = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("bad signature");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("malformed");
  }
  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error("expired");
  return payload;
}

function issueTokens(user) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = signToken({
    sub: user.id,
    role: user.role,
    username: user.username,
    iat: now,
    exp: now + ACCESS_TTL,
  });
  const refresh_token = crypto.randomBytes(32).toString("hex");
  refreshStore.set(refresh_token, { userId: user.id, role: user.role, exp: now + REFRESH_TTL });
  return { access_token, refresh_token, user_id: user.id, role: user.role };
}

// ---------- 鉴权处理器（挂载到 admin-api.mjs）----------
const authRouter = express.Router();

// 登录：校验凭证 -> 签发双令牌。
authRouter.post("/api/v1/user/login", (req, res) => {
  const { target = "", password = "" } = req.body || {};
  const user = users.find((u) => u.username === target || u.email === target);
  if (!user || user.password !== password) {
    return res.status(401).json({ code: 401, message: "账号或密码错误", data: null });
  }
  const tokens = issueTokens(user);
  res.json({ code: 0, message: "ok", data: tokens });
});

// 刷新：用 refresh_token 换发新 access（并轮转 refresh）。
authRouter.post("/api/v1/user/refresh", (req, res) => {
  const rt = req.body?.refresh_token;
  const rec = rt && refreshStore.get(rt);
  if (!rec || rec.exp * 1000 < Date.now()) {
    if (rt) refreshStore.delete(rt);
    return res.status(401).json({ code: 401, message: "刷新令牌无效或已过期", data: null });
  }
  const user = users.find((u) => u.id === rec.userId);
  refreshStore.delete(rt); // 轮转：旧 refresh 失效
  const tokens = issueTokens(user);
  res.json({ code: 0, message: "ok", data: tokens });
});

// 登出：吊销 refresh_token。
authRouter.post("/api/v1/user/logout", (req, res) => {
  const rt = req.body?.refresh_token;
  if (rt) refreshStore.delete(rt);
  res.json({ code: 0, message: "ok", data: { ok: true } });
});

// ---------- 网关中间件 ----------
function authenticate(req, res, next) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ code: 401, message: "未携带访问令牌", data: null });
  try {
    req.user = verifyToken(m[1]);
    next();
  } catch (e) {
    return res.status(401).json({ code: 401, message: "令牌无效或已过期", data: null });
  }
}

// 服务端 RBAC：不足返回 403。
function authorize(need) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ code: 401, message: "未鉴权", data: null });
    if (roleAtLeast(req.user.role, need)) return next();
    return res.status(403).json({ code: 403, message: "权限不足", data: null });
  };
}

// 网关：除公开端点外，所有 /api/v1/* 都必须携带有效 Bearer。
// 公开端点（无需 access_token）：登录、注册、发码、刷新、登出。
const PUBLIC_PATHS = new Set([
  "/api/v1/user/login",
  "/api/v1/user/register",
  "/api/v1/user/send-code",
  "/api/v1/user/refresh",
  "/api/v1/user/logout",
  // OTC 公开行情：广告列表与法币报价匿名可读（下单等写操作仍需登录）
  "/api/v1/otc/advertisements",
  "/api/v1/otc/prices",
  // 理财产品列表 / Launchpool 项目列表匿名可读（申购、质押等写操作需登录）
  "/api/v1/earn/products",
  "/api/v1/launchpad/projects",
]);
function gateway(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  return authenticate(req, res, next);
}

export { authRouter, gateway, authenticate, authorize };
