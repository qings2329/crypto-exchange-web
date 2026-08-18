// API 密钥后端接口（Express 版）。
// 实现用户态 API Key 的增删改查，挂在 /api/v1/user/api-keys，与前端 client.ts 契约一致。
// 存储见 ./apikey-store.mjs；鉴权见 ./apikey-auth.mjs（Bearer token -> userId）。
//
// 运行：  cd server && npm install && npm run start:apikey
//         （默认监听 :8080/api/v1/user/api-keys；前端开发将 /api 代理指向该端口即可）

import express from "express";
import { fileURLToPath } from "node:url";
import {
  requireUser,
  genApiKey,
  genSecret,
  hashSecret,
} from "./apikey-auth.mjs";
import { listKeys, createKey, updateStatus, deleteKey } from "./apikey-store.mjs";

const PORT = Number(process.env.APIKEY_PORT) || 8080;
const BASE = "/api/v1/user/api-keys";
const PERMS = new Set(["read", "trade", "withdraw"]);

const app = express();
app.use(express.json({ limit: "256kb" }));

// 统一响应包裹 { code, message, data }
const ok = (res, data, status = 200) => res.status(status).json({ code: 0, message: "ok", data });
const fail = (res, status, message, code = status) =>
  res.status(status).json({ code, message, data: null });

// 全部路由需登录（Bearer token）
app.use(BASE, requireUser);

// GET /api/v1/user/api-keys —— 列表（分页 + 筛选，不含 secret）
// 查询参数：limit（默认 20，最大 100）、offset（默认 0）、
//           q（关键字：备注/公钥）、status（active|disabled）、permission（read|trade|withdraw）
app.get(BASE, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "20", 10) || 20, 100);
  const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
  const q = (req.query.q || "").toString().trim();
  const status = (req.query.status || "").toString();
  const permission = (req.query.permission || "").toString();
  const { api_keys, total } = listKeys(req.userId, { limit, offset, q, status, permission });
  ok(res, { api_keys, total, limit, offset });
});

// POST /api/v1/user/api-keys —— 创建（返回一次性 secret）
app.post(BASE, (req, res) => {
  const body = req.body || {};
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return fail(res, 400, "label required");
  const permissions = Array.isArray(body.permissions) ? body.permissions : [];
  if (permissions.length === 0) return fail(res, 400, "at least one permission required");
  if (!permissions.every((p) => PERMS.has(p))) return fail(res, 400, "invalid permission");
  const ip_whitelist = Array.isArray(body.ip_whitelist)
    ? body.ip_whitelist.map(String).filter(Boolean)
    : [];

  const key = genApiKey();
  const secret = genSecret();
  const view = createKey(req.userId, {
    label,
    permissions,
    ip_whitelist,
    key,
    secretHash: hashSecret(secret),
  });
  ok(res, { api_key: view, secret }, 201);
});

// PUT /api/v1/user/api-keys/:id —— 更新状态（仅支持 active/disabled）
app.put(`${BASE}/:id`, (req, res) => {
  const status = req.body?.status;
  if (status !== "active" && status !== "disabled") {
    return fail(res, 400, "invalid status (expect active|disabled)");
  }
  const updated = updateStatus(req.userId, Number(req.params.id), status);
  if (!updated) return fail(res, 404, "api key not found");
  ok(res, { ok: true });
});

// DELETE /api/v1/user/api-keys/:id —— 撤销（不可恢复）
app.delete(`${BASE}/:id`, (req, res) => {
  const done = deleteKey(req.userId, Number(req.params.id));
  if (!done) return fail(res, 404, "api key not found");
  ok(res, { ok: true });
});

// 兜底 404
app.use((req, res) => res.status(404).json({ code: 404, message: "not found", data: null }));

export { app };

// 仅作为入口直接运行（node apikey-express.mjs）时才监听端口，被测试 import 时不启动。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  app.listen(PORT, () => {
    console.log(`[apikey] skeleton server (express) listening on :${PORT}${BASE}`);
  });
}
