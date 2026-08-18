// K 线 mock 服务（仅用于前端联调 / E2E 测试，非生产后端）。
// - REST GET /api/v1/market/kline?symbol=&interval=&limit=  返回历史蜡烛
// - WS   /api/v1/market/kline/ws?symbol=&interval=          推送当前整根蜡烛（实时更新 + 自动翻根）
// 历史与实时共享同一份内存行情，保证 WS 起始蜡烛与 REST 末根对齐。
import http from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.KLINE_PORT || 8802);
const TICK_MS = 400; // 实时推送频率
const ROLL_EVERY = 8; // 每 8 个 tick 翻一根新蜡烛（约 3.2s，便于观察）

function intervalToMs(iv) {
  const m = /^(\d+)(m|h|d)$/.exec(iv || "1m");
  if (!m) return 60_000;
  const n = Number(m[1]);
  return m[2] === "m" ? n * 60_000 : m[2] === "h" ? n * 3_600_000 : n * 86_400_000;
}
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

// 每个 symbol 一份模拟行情
const sims = new Map();
function getSim(symbol, intervalMs) {
  let sim = sims.get(symbol);
  if (sim) return sim;
  const limit = 500;
  const now = Math.floor(Date.now() / intervalMs) * intervalMs;
  const startT = now - (limit - 1) * intervalMs;
  let price = 30_000 + Math.random() * 5_000;
  const history = [];
  for (let i = 0; i < limit; i++) {
    const t = startT + i * intervalMs;
    const o = price;
    const c = Math.max(1, o + (Math.random() - 0.5) * o * 0.004);
    const h = Math.max(o, c) * (1 + Math.random() * 0.002);
    const l = Math.min(o, c) * (1 - Math.random() * 0.002);
    const v = r3(Math.random() * 10 + 1);
    history.push({ t, o: r2(o), h: r2(h), l: r2(l), c: r2(c), v });
    price = c;
  }
  sim = { history, current: history[history.length - 1], tick: 0 };
  sims.set(symbol, sim);
  return sim;
}

function parseUrl(reqUrl) {
  const u = new URL(reqUrl, "http://localhost");
  const q = u.searchParams;
  return { pathname: u.pathname, symbol: q.get("symbol") || "BTC_USDT", interval: q.get("interval") || "1m", limit: Number(q.get("limit") || 500) };
}

const server = http.createServer((req, res) => {
  const { pathname, symbol, interval, limit } = parseUrl(req.url);
  if (pathname === "/api/v1/market/kline" && req.method === "GET") {
    const ivMs = intervalToMs(interval);
    const sim = getSim(symbol, ivMs);
    const n = Math.min(Math.max(limit, 1), sim.history.length);
    const out = sim.history.slice(sim.history.length - n);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(out));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

// WS：仅处理 K 线订阅路径
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const { pathname, symbol, interval } = parseUrl(req.url);
  if (!pathname.startsWith("/api/v1/market/kline/ws")) {
    socket.destroy();
    return;
  }
  const ivMs = intervalToMs(interval);
  const sim = getSim(symbol, ivMs);
  wss.handleUpgrade(req, socket, head, (ws) => {
    // 先推一次当前蜡烛
    ws.send(JSON.stringify(sim.current));
    const timer = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return;
      sim.tick++;
      const cur = sim.current;
      if (sim.tick % ROLL_EVERY === 0) {
        // 翻根：新周期蜡烛
        const t = cur.t + ivMs;
        const o = cur.c;
        sim.current = { t, o, h: o, l: o, c: o, v: r3(Math.random() * 2 + 0.2) };
        sim.history.push(sim.current);
        if (sim.history.length > 500) sim.history.shift();
      } else {
        // 同根更新：随机游走价格，累加成交量
        const drift = (Math.random() - 0.5) * cur.c * 0.003;
        const c = Math.max(1, cur.c + drift);
        cur.c = r2(c);
        cur.h = r2(Math.max(cur.h, c));
        cur.l = r2(Math.min(cur.l, c));
        cur.v = r3(cur.v + Math.random() * 1.5);
        sim.current = cur;
        sim.history[sim.history.length - 1] = cur;
      }
      ws.send(JSON.stringify(sim.current));
    }, TICK_MS);
    ws.on("close", () => clearInterval(timer));
  });
});

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  server.listen(PORT, () => {
    console.log(`[kline-mock] listening on :${PORT} (REST /api/v1/market/kline, WS /api/v1/market/kline/ws)`);
  });
}

export { server, getSim, intervalToMs };
