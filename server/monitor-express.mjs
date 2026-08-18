// 监控后端接口骨架示例（Express 版）。
// 与 ./monitor-server.mjs 功能一致，路由用 Express 表达，更易扩展中间件（鉴权、限流等）。
// 存储与聚合逻辑见 ./monitor-store.mjs（仅内存，生产请替换为 DB / 消息队列）。
//
// 运行：  cd server && npm install && npm run start:express
//         （默认监听 :8803/api/v1/monitor）

import express from "express";
import { fileURLToPath } from "node:url";
import { pushEvents, summary, recentEvents } from "./monitor-store.mjs";
import { isAuthorized } from "./monitor-auth.mjs";

const PORT = Number(process.env.MONITOR_PORT) || 8803;
const BASE = "/api/v1/monitor";

const app = express();
app.use(express.json({ limit: "1mb" }));

// ---- 鉴权中间件（X-Api-Key 校验）----
// 生产环境应设置环境变量 MONITOR_API_KEY，调用方在请求头携带 X-Api-Key。
// 未设置 MONITOR_API_KEY 时关闭校验（仅骨架演示，勿用于生产）。
const API_KEY = process.env.MONITOR_API_KEY;
if (!API_KEY) {
  console.warn("[monitor] 未设置 MONITOR_API_KEY，鉴权已关闭（演示模式）");
}
export function auth(req, res, next) {
  if (isAuthorized(API_KEY, req.get("X-Api-Key"))) return next();
  return res.status(401).json({ code: 401, message: "unauthorized", data: null });
}
// 应用到所有监控路由（上报与查询统一受保护）
app.use(BASE, auth);

// 统一响应包裹 { code, message, data }
const ok = (res, data, status = 200) => res.status(status).json({ code: 0, message: "ok", data });

// POST /api/v1/monitor/report  —— 接收前端批量上报
app.post(`${BASE}/report`, (req, res) => {
  const list = Array.isArray(req.body?.events) ? req.body.events : req.body ? [req.body] : [];
  // TODO: 生产环境改为异步写入队列 / 批量落库，避免阻塞请求
  pushEvents(list);
  ok(res, { accepted: list.length });
});

// GET /api/v1/monitor/summary?range=24h  —— 聚合统计
app.get(`${BASE}/summary`, (req, res) => {
  ok(res, summary(req.query.range || "24h"));
});

// GET /api/v1/monitor/events?limit=50  —— 事件明细（倒序）
app.get(`${BASE}/events`, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 500);
  ok(res, recentEvents(limit));
});

// 兜底 404
app.use((req, res) => res.status(404).json({ code: 404, message: "not found", data: null }));

export { app };

// 仅作为入口直接运行（node monitor-express.mjs）时才监听端口，被测试 import 时不启动。
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  app.listen(PORT, () => {
    console.log(`[monitor] skeleton server (express) listening on :${PORT}${BASE}`);
  });
}
