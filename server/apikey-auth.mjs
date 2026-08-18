// API 密钥后端：鉴权与密钥工具（供 http 版与 express 版共用，纯逻辑便于单元测试）。
//
// 身份来源：前端以 Authorization: Bearer <token> 携带登录态 access_token。
// - 设置环境变量 APIKEY_JWT_SECRET 时，按 HS256 校验 JWT 并取 user_id（与真实网关一致）。
// - 未设置（演示模式）时接受任意非空 token，并从 token 稳定派生 user_id，
//   使多个「用户」在手动联调时相互隔离（同一 token 跨请求得到同一 userId）。
//
// 密钥材料：公钥 key 可公开展示；私钥 secret 仅在创建响应里返回一次，
// 服务端只保存 secret 的哈希，因此创建后无法再还原。

import crypto from "node:crypto";

// 用户 JWT 校验密钥；缺省为 null -> 演示模式（关闭校验，按 token 派生 userId）。
const JWT_SECRET = process.env.APIKEY_JWT_SECRET || null;

// ---------- 身份 ----------
// 校验 HS256 JWT（base64url 三段式），返回 payload；失败抛错。
export function verifyJwt(token, secret) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [h, p, s] = parts;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${h}.${p}`)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) {
    throw new Error("invalid signature");
  }
  const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error("token expired");
  return payload;
}

// 演示模式：从 token 派生稳定 userId（不同 token -> 不同用户，便于隔离）。
export function deriveDemoUserId(token) {
  const h = crypto.createHash("sha256").update(String(token)).digest();
  return h.readUInt32BE(0);
}

// 从请求头解析并校验身份，返回 { userId }；失败抛错（调用方转 401）。
export function authenticate(req) {
  const auth = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) throw new Error("missing bearer token");
  const token = m[1].trim();
  if (!token) throw new Error("empty token");
  if (JWT_SECRET) {
    const payload = verifyJwt(token, JWT_SECRET);
    const uid = payload.user_id ?? payload.sub ?? payload.uid;
    if (uid == null) throw new Error("token missing user_id");
    return { userId: Number(uid) };
  }
  return { userId: deriveDemoUserId(token) };
}

// Express 中间件版（挂载到路由前先鉴权）。
export function requireUser(req, res, next) {
  try {
    const { userId } = authenticate(req);
    req.userId = userId;
    next();
  } catch (e) {
    res.status(401).json({ code: 401, message: e.message || "unauthorized", data: null });
  }
}

// ---------- 密钥材料 ----------
export function genApiKey() {
  return "cx_" + crypto.randomBytes(18).toString("base64url");
}
export function genSecret() {
  return crypto.randomBytes(32).toString("base64url");
}
export function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret)).digest("base64url");
}

// ---------- IP / CIDR 白名单 ----------
// 仅支持 IPv4（含 CIDR）。解析失败返回 null。
function ipToLong(ip) {
  const v = String(ip).split(":")[0].trim(); // 去掉可能的端口
  const parts = v.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const o = Number(p);
    if (o > 255) return null;
    n = (n << 8) | o;
  }
  return n >>> 0;
}

// 判断 remoteIp 是否被 whitelist 放行（空数组表示不限制）。
export function ipAllowed(whitelist, remoteIp) {
  if (!whitelist || whitelist.length === 0) return true;
  const rip = ipToLong(remoteIp);
  if (rip == null) return false;
  for (const entry of whitelist) {
    if (entry === remoteIp) return true;
    if (String(entry).includes("/")) {
      const [net, bitsStr] = String(entry).split("/");
      const n = ipToLong(net);
      const bits = parseInt(bitsStr, 10);
      if (n != null && !Number.isNaN(bits)) {
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        if ((rip & mask) === (n & mask)) return true;
      }
    }
  }
  return false;
}
