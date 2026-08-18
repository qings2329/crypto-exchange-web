// 监控后端接口骨架示例（零依赖，Node 内置 http）。
// 实现前端 initMonitor 上报 + 监控看板查询所需的三个端点。
// 存储与聚合逻辑见 ./monitor-store.mjs（仅内存，生产请替换为 DB / 消息队列）。
//
// 运行：  node server/monitor-server.mjs   （默认监听 :8803/api/v1/monitor）
// 前端开发时与现有 /api 代理指向同一网关即可被 /api/v1/monitor/* 命中。

import http from "node:http";
import { pushEvents, summary, recentEvents } from "./monitor-store.mjs";
import { isAuthorized } from "./monitor-auth.mjs";

const PORT = Number(process.env.MONITOR_PORT) || 8803;
const BASE = "/api/v1/monitor";

// ---- 鉴权：X-Api-Key（与 Express 版一致）----
// 设置环境变量 MONITOR_API_KEY 后，所有 /api/v1/monitor/* 请求须带请求头 X-Api-Key。
// 未设置时关闭校验（仅演示用，勿用于生产）。
const API_KEY = process.env.MONITOR_API_KEY;
if (!API_KEY) console.warn("[monitor] 未设置 MONITOR_API_KEY，鉴权已关闭（演示模式）");

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ code: 0, message: "ok", data }));
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
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 404, message: "not found", data: null }));
    return;
  }

  // 鉴权：未设置 MONITOR_API_KEY 时跳过；否则校验 X-Api-Key 请求头
  if (!isAuthorized(API_KEY, req.headers["x-api-key"])) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 401, message: "unauthorized", data: null }));
    return;
  }

  try {
    // POST /api/v1/monitor/report  —— 接收前端批量上报
    if (req.method === "POST" && path === `${BASE}/report`) {
      const body = await readBody(req);
      const list = Array.isArray(body?.events) ? body.events : body ? [body] : [];
      // TODO: 生产环境改为异步写入队列 / 批量落库，避免阻塞请求
      pushEvents(list);
      sendJSON(res, 200, { accepted: list.length });
      return;
    }

    // GET /api/v1/monitor/summary?range=24h  —— 聚合统计
    if (req.method === "GET" && path === `${BASE}/summary`) {
      sendJSON(res, 200, summary(url.searchParams.get("range") || "24h"));
      return;
    }

    // GET /api/v1/monitor/events?limit=50  —— 事件明细（倒序）
    if (req.method === "GET" && path === `${BASE}/events`) {
      const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 500);
      sendJSON(res, 200, recentEvents(limit));
      return;
    }

    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 405, message: "method not allowed", data: null }));
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: 400, message: String(e?.message || e), data: null }));
  }
});

server.listen(PORT, () => {
  console.log(`[monitor] skeleton server (http) listening on :${PORT}${BASE}`);
});
