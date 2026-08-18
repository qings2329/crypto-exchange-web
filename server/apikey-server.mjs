// API 密钥后端接口骨架示例（零依赖，Node 内置 http）。
// 与 ./apikey-express.mjs 功能一致：用户态 API Key 增删改查，挂在 /api/v1/user/api-keys。
// 存储见 ./apikey-store.mjs；鉴权见 ./apikey-auth.mjs（Bearer token -> userId）。
//
// 运行：  node server/apikey-server.mjs   （默认监听 :8080/api/v1/user/api-keys）

import http from "node:http";
import {
  authenticate,
  genApiKey,
  genSecret,
  hashSecret,
} from "./apikey-auth.mjs";
import { listKeys, createKey, updateStatus, deleteKey } from "./apikey-store.mjs";

const PORT = Number(process.env.APIKEY_PORT) || 8080;
const BASE = "/api/v1/user/api-keys";
const PERMS = new Set(["read", "trade", "withdraw"]);

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, message: "ok", data }));
}
function fail(res, status, message, code = status) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code, message, data: null }));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (!path.startsWith(BASE)) {
    fail(res, 404, "not found");
    return;
  }

  // 鉴权：解析 Bearer token -> userId（演示模式按 token 派生；设置 APIKEY_JWT_SECRET 则校验 JWT）
  let userId;
  try {
    ({ userId } = authenticate(req));
  } catch (e) {
    fail(res, 401, e.message || "unauthorized", 401);
    return;
  }

  try {
    // 集合：/api/v1/user/api-keys
    if (path === BASE) {
      if (req.method === "GET") {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);
        const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
        const q = (url.searchParams.get("q") || "").trim();
        const status = url.searchParams.get("status") || "";
        const permission = url.searchParams.get("permission") || "";
        const { api_keys, total } = listKeys(userId, { limit, offset, q, status, permission });
        sendJSON(res, 200, { api_keys, total, limit, offset });
        return;
      }
      if (req.method === "POST") {
        const body = await readBody(req);
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
        const view = createKey(userId, {
          label,
          permissions,
          ip_whitelist,
          key,
          secretHash: hashSecret(secret),
        });
        sendJSON(res, 201, { api_key: view, secret });
        return;
      }
      fail(res, 405, "method not allowed", 405);
      return;
    }

    // 单项：/api/v1/user/api-keys/:id
    const m = new RegExp(`^${BASE}/(\\d+)$`).exec(path);
    if (m) {
      const id = Number(m[1]);
      if (req.method === "PUT") {
        const body = await readBody(req);
        const status = body.status;
        if (status !== "active" && status !== "disabled") {
          return fail(res, 400, "invalid status (expect active|disabled)");
        }
        const updated = updateStatus(userId, id, status);
        if (!updated) return fail(res, 404, "api key not found");
        sendJSON(res, 200, { ok: true });
        return;
      }
      if (req.method === "DELETE") {
        const done = deleteKey(userId, id);
        if (!done) return fail(res, 404, "api key not found");
        sendJSON(res, 200, { ok: true });
        return;
      }
      fail(res, 405, "method not allowed", 405);
      return;
    }

    fail(res, 404, "not found");
  } catch (e) {
    fail(res, 400, String(e?.message || e), 400);
  }
});

server.listen(PORT, () => {
  console.log(`[apikey] skeleton server (http) listening on :${PORT}${BASE}`);
});
