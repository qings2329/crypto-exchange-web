// 管理后台业务接口 mock（Express 版，内存存储）。
// 覆盖前端 admin 后台调用的全部端点：风控（规则/黑名单/事件）、通知、合约（提现/持仓）、
// 期权（合约/持仓）、杠杆（账户）、管理总览/审计；含各模块的批量端点。
//
// 契约说明：本 mock 的「管理后台」端点统一挂在 /api/admin/* 前缀下（如 /api/admin/risk、
// /api/admin/notifications、/api/admin/overview、/api/admin/audit-logs），与真实后端
// crypto-exchange cmd/admin（路由前缀 /api/admin）保持一致。用户端前端 crypto-exchange-web
// 本身不含 admin 页面，真正的 admin 前端是独立仓库 ce-admin-web（直连真实后端）；因此本
// 文件下 /api/admin/* 的 admin 路由对 crypto-exchange-web 属于孤儿代码，仅作为 dev/demo 骨架。
//
// 与 ./monitor-express.mjs 等骨架一致：内存存储，无持久化，仅用于联调前端。
// 运行：  cd server && npm install && npm run start:admin
//         （默认监听 :8801；仅作为独立骨架运行，开发联调请使用统一网关 :8787）
//
// 鉴权：已接入真实网关鉴权（见 ./gateway-auth.mjs）—— 登录签发 HS256 JWT 访问令牌，
//       网关校验 Bearer 令牌（401 缺失/无效/过期）；admin 业务前缀实施服务端 RBAC（403），
//       otc 前缀要求 operator 及以上（运营/管理）。
//       登录演示账号见 gateway-auth.mjs 顶部 users 种子（admin@ce.dev / op@ce.dev / user@ce.dev）。
//
// 注意：buildAdminApp() 仅组装业务路由 + 服务端 RBAC，不挂载网关鉴权（authRouter/gateway）
//       与 404 兜底——这些由调用方（start:admin 入口或统一网关 gateway.mjs）统一负责。

import express from "express";
import { authRouter, gateway, authorize } from "./gateway-auth.mjs";

const PORT = Number(process.env.ADMIN_PORT) || 8801;

// 统一响应包裹 { code, message, data }
const ok = (res, data, status = 200) => res.status(status).json({ code: 0, message: "ok", data });
const fail = (res, code, message) =>
  res.status(code === 401 ? 401 : 400).json({ code, message, data: null });

export function buildAdminApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  let seq = 1;
  const nextId = () => seq++;

  // ---------- 内存存储（带种子数据）----------
  const rules = [
    { id: nextId(), name: "大额提现拦截", type: "withdraw", condition: "单笔 > 100000", action: "block", priority: 100, enabled: true, created_at: new Date().toISOString() },
    { id: nextId(), name: "异地登录审核", type: "login", condition: "登录 IP 归属地突变", action: "review", priority: 90, enabled: true, created_at: new Date().toISOString() },
  ];
  const blacklist = [
    { id: nextId(), target_type: "ip", target: "1.2.3.4", reason: "撞库攻击", created_at: new Date().toISOString() },
  ];
  const events = [
    { id: nextId(), rule_id: 1, type: "withdraw_limit", level: "warning", target: "u1001", detail: "单笔提现 120000 超阈值", status: "open", created_at: new Date().toISOString() },
    { id: nextId(), rule_id: 2, type: "login_anomaly", level: "critical", target: "u1002", detail: "异地登录", status: "open", created_at: new Date().toISOString() },
  ];
  const notifications = [
    { id: nextId(), title: "系统维护通知", content: "今晚 02:00-03:00 维护", level: "info", target: "all", status: "sent", created_at: new Date().toISOString() },
  ];
  const withdraws = [
    { id: nextId(), asset: "USDT", amount: 50000, address: "0xabc...", status: "pending", created_at: new Date().toISOString() },
    { id: nextId(), asset: "BTC", amount: 1.2, address: "bc1xyz...", status: "pending", created_at: new Date().toISOString() },
  ];
  const positions = [
    { id: nextId(), user_id: 1001, symbol: "BTC-PERP", side: "long", qty: 2 },
    { id: nextId(), user_id: 1002, symbol: "ETH-PERP", side: "short", qty: 10 },
  ];
  const contracts = [
    { id: nextId(), underlying: "BTC", quote: "USDT", strike: 70000, expiry: "2026-12-31", status: "open" },
  ];
  const optionPositions = [
    { id: nextId(), user_id: 1003, contract_id: 1, side: "call", qty: 5 },
  ];
  const accounts = [
    { id: nextId(), user_id: 1001, asset: "USDT", balance: 100000, debt: 20000 },
    { id: nextId(), user_id: 1002, asset: "USDT", balance: 50000, debt: 0 },
  ];
  const audit = [
    { id: nextId(), admin_id: 1, admin_name: "admin", action: "risk.rule.create", target: "rule:1", detail: "创建规则", ip: "127.0.0.1", created_at: new Date().toISOString() },
  ];

  // 服务端 RBAC：admin 业务前缀仅 admin 可访问；otc 为运营及以上（operator/admin）可访问。
  app.use(
    ["/api/admin/risk", "/api/admin/notifications", "/api/v1/futures", "/api/v1/options", "/api/v1/margin", "/api/admin"],
    authorize("admin")
  );
  app.use(["/api/v1/otc"], authorize("operator"));

  // ---------- 风控：规则 ----------
  app.get("/api/admin/risk/rules", (req, res) => ok(res, rules));
  app.post("/api/admin/risk/rules", (req, res) => {
    const b = req.body || {};
    const r = { id: nextId(), name: b.name, type: b.type ?? "trade", condition: b.condition ?? "", action: b.action ?? "block", priority: b.priority ?? 100, enabled: b.enabled ?? true, created_at: new Date().toISOString() };
    rules.push(r);
    ok(res, r, 201);
  });
  app.put("/api/admin/risk/rules/:id(\\d+)", (req, res) => {
    const r = rules.find((x) => x.id === Number(req.params.id));
    if (!r) return fail(res, 404, "规则不存在");
    Object.assign(r, req.body, { id: r.id });
    ok(res, r);
  });
  app.delete("/api/admin/risk/rules/:id(\\d+)", (req, res) => {
    const i = rules.findIndex((x) => x.id === Number(req.params.id));
    if (i < 0) return fail(res, 404, "规则不存在");
    rules.splice(i, 1);
    ok(res, { ok: true });
  });
  app.delete("/api/admin/risk/rules/batch", (req, res) => {
    const ids = (req.body?.ids || []).map(Number);
    let count = 0;
    for (let i = rules.length - 1; i >= 0; i--) if (ids.includes(rules[i].id)) { rules.splice(i, 1); count++; }
    ok(res, { ok: true, count });
  });

  // ---------- 风控：黑名单 ----------
  app.get("/api/admin/risk/blacklist", (req, res) => ok(res, blacklist));
  app.post("/api/admin/risk/blacklist", (req, res) => {
    const b = req.body || {};
    const it = { id: nextId(), target_type: b.target_type ?? "user", target: b.target ?? "", reason: b.reason ?? "", expire_at: b.expire_at, created_at: new Date().toISOString() };
    blacklist.push(it);
    ok(res, it, 201);
  });
  app.delete("/api/admin/risk/blacklist/:id(\\d+)", (req, res) => {
    const i = blacklist.findIndex((x) => x.id === Number(req.params.id));
    if (i < 0) return fail(res, 404, "黑名单条目不存在");
    blacklist.splice(i, 1);
    ok(res, { ok: true });
  });
  app.delete("/api/admin/risk/blacklist/batch", (req, res) => {
    const ids = (req.body?.ids || []).map(Number);
    let count = 0;
    for (let i = blacklist.length - 1; i >= 0; i--) if (ids.includes(blacklist[i].id)) { blacklist.splice(i, 1); count++; }
    ok(res, { ok: true, count });
  });

  // ---------- 风控：事件 ----------
  app.get("/api/admin/risk/events", (req, res) => ok(res, events));
  app.post("/api/admin/risk/events/:id(\\d+)/resolve", (req, res) => {
    const e = events.find((x) => x.id === Number(req.params.id));
    if (!e) return fail(res, 404, "事件不存在");
    e.status = req.body?.status === "ignored" ? "ignored" : "resolved";
    ok(res, { ok: true });
  });
  app.post("/api/admin/risk/events/batch/resolve", (req, res) => {
    const ids = (req.body?.ids || []).map(Number);
    const status = req.body?.status === "ignored" ? "ignored" : "resolved";
    let count = 0;
    for (const e of events) if (ids.includes(e.id) && e.status === "open") { e.status = status; count++; }
    ok(res, { ok: true, count });
  });

  // ---------- 通知 ----------
  app.get("/api/admin/notifications/list", (req, res) => ok(res, notifications));
  app.post("/api/admin/notifications", (req, res) => {
    const b = req.body || {};
    const n = { id: nextId(), title: b.title ?? "", content: b.content ?? "", level: b.level ?? "info", target: b.target ?? "all", target_user: b.target_user, status: "sent", created_at: new Date().toISOString() };
    notifications.push(n);
    ok(res, n, 201);
  });
  app.delete("/api/admin/notifications/:id(\\d+)", (req, res) => {
    const i = notifications.findIndex((x) => x.id === Number(req.params.id));
    if (i < 0) return fail(res, 404, "通知不存在");
    notifications.splice(i, 1);
    ok(res, { ok: true });
  });
  app.delete("/api/admin/notifications/batch", (req, res) => {
    const ids = (req.body?.ids || []).map(Number);
    let count = 0;
    for (let i = notifications.length - 1; i >= 0; i--) if (ids.includes(notifications[i].id)) { notifications.splice(i, 1); count++; }
    ok(res, { ok: true, count });
  });

  // ---------- 合约：提现 ----------
  app.get("/api/v1/futures/wallet/withdraws", (req, res) => ok(res, withdraws));
  app.post("/api/v1/futures/wallet/withdraws/:id(\\d+)/review", (req, res) => {
    const w = withdraws.find((x) => x.id === Number(req.params.id));
    if (!w) return fail(res, 404, "提现记录不存在");
    w.status = req.body?.action === "reject" ? "rejected" : "approved";
    ok(res, { ok: true });
  });
  app.post("/api/v1/futures/wallet/withdraws/batch/review", (req, res) => {
    const ids = (req.body?.ids || []).map(Number);
    const action = req.body?.action === "reject" ? "rejected" : "approved";
    let count = 0;
    for (const w of withdraws) if (ids.includes(w.id) && w.status === "pending") { w.status = action; count++; }
    ok(res, { ok: true, count });
  });

  // ---------- 合约：持仓 ----------
  app.get("/api/v1/futures/positions", (req, res) => ok(res, positions));
  app.post("/api/v1/futures/positions/:id(\\d+)/liquidate", (req, res) => {
    const i = positions.findIndex((x) => x.id === Number(req.params.id));
    if (i < 0) return fail(res, 404, "持仓不存在");
    positions.splice(i, 1);
    ok(res, { ok: true });
  });
  app.post("/api/v1/futures/positions/batch/liquidate", (req, res) => {
    const ids = (req.body?.ids || []).map(Number);
    let count = 0;
    for (let i = positions.length - 1; i >= 0; i--) if (ids.includes(positions[i].id)) { positions.splice(i, 1); count++; }
    ok(res, { ok: true, count });
  });

  // ---------- 期权 ----------
  app.get("/api/v1/options/contracts", (req, res) => ok(res, contracts));
  app.post("/api/v1/options/contracts", (req, res) => {
    const b = req.body || {};
    const c = { id: nextId(), underlying: b.underlying ?? "BTC", quote: b.quote ?? "USDT", strike: Number(b.strike) || 0, expiry: b.expiry ?? "", status: "open" };
    contracts.push(c);
    ok(res, c, 201);
  });
  app.put("/api/v1/options/contracts/:id(\\d+)", (req, res) => {
    const c = contracts.find((x) => x.id === Number(req.params.id));
    if (!c) return fail(res, 404, "合约不存在");
    if (req.body?.status) c.status = req.body.status;
    ok(res, c);
  });
  app.get("/api/v1/options/positions", (req, res) => ok(res, optionPositions));
  app.post("/api/v1/options/positions/:id(\\d+)/close", (req, res) => {
    const i = optionPositions.findIndex((x) => x.id === Number(req.params.id));
    if (i < 0) return fail(res, 404, "持仓不存在");
    optionPositions.splice(i, 1);
    ok(res, { ok: true });
  });
  app.post("/api/v1/options/positions/batch/close", (req, res) => {
    const ids = (req.body?.ids || []).map(Number);
    let count = 0;
    for (let i = optionPositions.length - 1; i >= 0; i--) if (ids.includes(optionPositions[i].id)) { optionPositions.splice(i, 1); count++; }
    ok(res, { ok: true, count });
  });

  // ---------- 杠杆 ----------
  app.get("/api/v1/margin/accounts", (req, res) => ok(res, accounts));
  app.post("/api/v1/margin/accounts/:id(\\d+)/adjust", (req, res) => {
    const a = accounts.find((x) => x.id === Number(req.params.id));
    if (!a) return fail(res, 404, "账户不存在");
    a.balance = Number(a.balance) + (Number(req.body?.delta) || 0);
    ok(res, { ok: true });
  });
  app.post("/api/v1/margin/accounts/:id(\\d+)/liquidate", (req, res) => {
    const i = accounts.findIndex((x) => x.id === Number(req.params.id));
    if (i < 0) return fail(res, 404, "账户不存在");
    accounts.splice(i, 1);
    ok(res, { ok: true });
  });
  app.post("/api/v1/margin/accounts/batch/liquidate", (req, res) => {
    const ids = (req.body?.ids || []).map(Number);
    let count = 0;
    for (let i = accounts.length - 1; i >= 0; i--) if (ids.includes(accounts[i].id)) { accounts.splice(i, 1); count++; }
    ok(res, { ok: true, count });
  });

  // ---------- OTC 场外交易（运营及以上可访问）----------
  const advertisements = [
    { id: nextId(), side: "sell", asset: "USDT", fiat_currency: "CNY", price: 7.21, min_amount: 100, max_amount: 5000, payment_methods: "支付宝,微信,银行卡", remark: "", created_at: new Date().toISOString() },
    { id: nextId(), side: "buy", asset: "USDT", fiat_currency: "CNY", price: 7.18, min_amount: 200, max_amount: 8000, payment_methods: "银行卡", remark: "", created_at: new Date().toISOString() },
  ];
  const otcOrders = [
    { id: nextId(), ad_id: 1, side: "sell", asset: "USDT", fiat_currency: "CNY", price: 7.21, crypto_amount: 100, fiat_amount: 721, payment_method: "支付宝", maker_id: 1, taker_id: 2, status: "pending", rating: 0, created_at: new Date().toISOString() },
    { id: nextId(), ad_id: 2, side: "buy", asset: "USDT", fiat_currency: "CNY", price: 7.18, crypto_amount: 200, fiat_amount: 1436, payment_method: "银行卡", maker_id: 2, taker_id: 1, status: "paid", rating: 0, created_at: new Date().toISOString() },
  ];
  const counterparties = [
    { counterparty_id: 1, trades_total: 120, trades_completed: 118, rating_sum: 560, rating_count: 118 },
    { counterparty_id: 2, trades_total: 64, trades_completed: 60, rating_sum: 270, rating_count: 60 },
  ];
  // 订单沟通与付款凭证，按 order id 存储。
  const otcMessages = new Map();
  const otcProofs = new Map();

  app.get("/api/v1/otc/advertisements", (req, res) => ok(res, { advertisements }));
  app.post("/api/v1/otc/advertisements", (req, res) => {
    const b = req.body || {};
    const ad = {
      id: nextId(),
      side: b.side ?? "sell",
      asset: b.asset ?? "USDT",
      fiat_currency: b.fiat_currency ?? "CNY",
      price: Number(b.price) || 0,
      min_amount: Number(b.min_amount) || 0,
      max_amount: Number(b.max_amount) || 0,
      payment_methods: b.payment_methods ?? "",
      remark: b.remark ?? "",
      created_at: new Date().toISOString(),
    };
    advertisements.push(ad);
    ok(res, ad, 201);
  });
  app.get("/api/v1/otc/orders", (req, res) => ok(res, { orders: otcOrders }));
  app.post("/api/v1/otc/orders/take", (req, res) => {
    const b = req.body || {};
    const ad = advertisements.find((a) => a.id === Number(b.ad_id));
    if (!ad) return fail(res, 404, "广告不存在");
    const fiat = Number(b.fiat_amount) || 0;
    const crypto_amount = ad.price > 0 ? fiat / ad.price : 0;
    const order = {
      id: nextId(),
      ad_id: ad.id,
      side: ad.side,
      asset: ad.asset,
      fiat_currency: ad.fiat_currency,
      price: ad.price,
      crypto_amount: Number(crypto_amount.toFixed(6)),
      fiat_amount: fiat,
      payment_method: b.payment_method ?? "",
      maker_id: ad.id % 2 === 0 ? 2 : 1,
      taker_id: ad.id % 2 === 0 ? 1 : 2,
      status: "pending",
      rating: 0,
      created_at: new Date().toISOString(),
    };
    otcOrders.push(order);
    ok(res, order, 201);
  });
  // 订单状态流转（:id 仅匹配数字，/take 等字面量段不受影响）
  app.post("/api/v1/otc/orders/:id(\\d+)/pay", (req, res) => {
    const o = otcOrders.find((x) => x.id === Number(req.params.id));
    if (!o) return fail(res, 404, "订单不存在");
    o.status = "paid";
    ok(res, { ok: true });
  });
  app.post("/api/v1/otc/orders/:id(\\d+)/complete", (req, res) => {
    const o = otcOrders.find((x) => x.id === Number(req.params.id));
    if (!o) return fail(res, 404, "订单不存在");
    o.status = "completed";
    o.rating = Number(req.body?.rating) || o.rating;
    o.completed_at = new Date().toISOString();
    ok(res, { ok: true });
  });
  app.post("/api/v1/otc/orders/:id(\\d+)/cancel", (req, res) => {
    const o = otcOrders.find((x) => x.id === Number(req.params.id));
    if (!o) return fail(res, 404, "订单不存在");
    o.status = "cancelled";
    ok(res, { ok: true });
  });
  app.post("/api/v1/otc/orders/:id(\\d+)/dispute", (req, res) => {
    const o = otcOrders.find((x) => x.id === Number(req.params.id));
    if (!o) return fail(res, 404, "订单不存在");
    o.status = "disputed";
    if (req.body?.reason) o.dispute_reason = req.body.reason;
    ok(res, { ok: true });
  });
  app.get("/api/v1/otc/counterparties", (req, res) => ok(res, { counterparties }));
  // 订单沟通（仅订单参与方可见，由真实网关校验，此处仅做内存存储）
  app.get("/api/v1/otc/orders/:id(\\d+)/messages", (req, res) => {
    const list = otcMessages.get(Number(req.params.id)) || [];
    ok(res, { messages: list });
  });
  app.post("/api/v1/otc/orders/:id(\\d+)/messages", (req, res) => {
    const id = Number(req.params.id);
    const m = { id: nextId(), order_id: id, sender_id: req.user.sub, content: req.body?.content ?? "", created_at: new Date().toISOString() };
    const list = otcMessages.get(id) || [];
    list.push(m);
    otcMessages.set(id, list);
    ok(res, m, 201);
  });
  // 付款凭证（真实上传为 multipart；mock 直接返回占位凭证，不解析文件体）
  app.get("/api/v1/otc/orders/:id(\\d+)/proofs", (req, res) => {
    const list = otcProofs.get(Number(req.params.id)) || [];
    ok(res, { proofs: list });
  });
  app.post("/api/v1/otc/orders/:id(\\d+)/proofs", (req, res) => {
    const id = Number(req.params.id);
    const p = { id: nextId(), order_id: id, url: `/mock-proof/order-${id}-${Date.now()}.png`, file_name: `proof-${id}.png`, size: 12345, created_at: new Date().toISOString() };
    const list = otcProofs.get(id) || [];
    list.push(p);
    otcProofs.set(id, list);
    ok(res, p, 201);
  });

  // ---------- 管理总览 / 审计 ----------
  app.get("/api/admin/overview", (req, res) =>
    ok(res, {
      users_total: 1000,
      users_today: 12,
      trade_volume_24h: 3842011,
      orders_24h: 5821,
      pending_withdraws: withdraws.filter((w) => w.status === "pending").length,
      pending_risk_events: events.filter((e) => e.status === "open").length,
      open_disputes: otcOrders.filter((o) => o.status === "disputed").length,
      online_users: 137,
    })
  );
  app.get("/api/admin/audit-logs", (req, res) => ok(res, audit));

  // ---------- 其它只读占位（避免前端表格 404）----------
  app.get("/api/v1/futures/funding", (req, res) => ok(res, [{ symbol: "BTC-PERP", rate: 0.0001 }]));
  app.get("/api/v1/futures/index", (req, res) => ok(res, [{ symbol: "BTC-PERP", price: 68000 }]));
  app.get("/api/v1/futures/wallet/balance", (req, res) => ok(res, [{ asset: "USDT", balance: 123456 }]));
  app.get("/api/v1/margin/liq-price", (req, res) => ok(res, [{ account_id: accounts[0]?.id, liq_price: 50000 }]));

  return app;
}

// 兜底 404（仅由入口/统一网关在挂载 buildAdminApp() 之后注册）
export function notFound(req, res) {
  res.status(404).json({ code: 404, message: "not found", data: null });
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = buildAdminApp();
  // 公开端点（登录/注册/刷新/登出）先于网关注册，避免被拦截。
  app.use(authRouter);
  // 网关：校验除公开端点外的所有 /api/v1 请求的 Bearer 令牌（401）。
  app.use(gateway);
  app.use(notFound);
  app.listen(PORT, () => {
    console.log(`[admin-api] mock server listening on :${PORT} (base /api/v1/{risk,notification,futures,options,margin,admin,otc})`);
  });
}
