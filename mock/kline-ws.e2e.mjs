// K 线 WebSocket 实时更新 E2E：
// 1) 启动 kline mock 服务
// 2) REST 拉历史，校验结构（t 升序、OHLC 闭合、字段数值）
// 3) 连 WS，校验：同根 c 实时变化、v 增长、跨周期自动翻根（t 递增）
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.KLINE_PORT || 8091);
const BASE = `http://localhost:${PORT}`;
const SYMBOL = "BTC_USDT";
const INTERVAL = "1m";
const LIMIT = 120;

function waitServer(timeoutMs = 5000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = async () => {
      try {
        const r = await fetch(`${BASE}/api/v1/market/kline?symbol=${SYMBOL}&interval=${INTERVAL}&limit=1`);
        if (r.ok) return resolve();
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("mock 服务未就绪"));
      setTimeout(tryOnce, 150);
    };
    tryOnce();
  });
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const run = async () => {
  const srv = spawn("node", [join(__dirname, "kline-server.mjs")], {
    env: { ...process.env, KLINE_PORT: String(PORT) },
    stdio: "ignore",
  });
  const cleanup = () => {
    try {
      srv.kill();
    } catch {
      /* ignore */
    }
  };
  process.on("exit", cleanup);

  await waitServer();

  // ---- 1. REST 历史结构校验 ----
  const histRes = await fetch(`${BASE}/api/v1/market/kline?symbol=${SYMBOL}&interval=${INTERVAL}&limit=${LIMIT}`);
  const history = await histRes.json();
  check("REST 返回数组且长度=limit", Array.isArray(history) && history.length === LIMIT, `len=${history.length}`);
  const allNumeric = history.every(
    (k) => ["t", "o", "h", "l", "c", "v"].every((f) => typeof k[f] === "number")
  );
  check("每根蜡烛字段均为数值", allNumeric);
  const ascending = history.every((k, i) => i === 0 || k.t > history[i - 1].t);
  check("t 严格升序", ascending);
  const ohlcOk = history.every((k) => k.h >= Math.max(k.o, k.c) - 1e-6 && k.l <= Math.min(k.o, k.c) + 1e-6);
  check("OHLC 闭合 (h>=max, l<=min)", ohlcOk);

  // ---- 2. WS 实时更新校验 ----
  const lastT0 = history[history.length - 1].t;
  const c0 = history[history.length - 1].c;
  const v0 = history[history.length - 1].v;

  const ws = new WebSocket(`${BASE.replace("http", "ws")}/api/v1/market/kline/ws?symbol=${SYMBOL}&interval=${INTERVAL}`);
  const seen = [];
  let sawUpdate = false;
  let maxV = v0;
  let sawRoll = false;

  await new Promise((resolve) => {
    ws.onmessage = (ev) => {
      const k = JSON.parse(ev.data);
      seen.push(k);
      if (k.t === lastT0) {
        if (k.c !== c0 || seen.length > 1) sawUpdate = true; // 同根价格/量变化
        if (k.v > maxV) maxV = k.v;
      } else if (k.t > lastT0) {
        sawRoll = true; // 翻根
      }
    };
    ws.onopen = () => console.log("[e2e] WS 已连接，监听实时蜡烛…");
    setTimeout(() => {
      ws.close();
      resolve();
    }, 12000);
  });

  check("WS 收到多帧推送", seen.length > 5, `frames=${seen.length}`);
  check("同根实时更新 (c/v 变化)", sawUpdate, `maxV=${maxV.toFixed(3)} v0=${v0.toFixed(3)}`);
  check("成交量随时间增长", maxV > v0, `${v0.toFixed(3)} -> ${maxV.toFixed(3)}`);
  check("跨周期自动翻根 (t 递增出新根)", sawRoll);

  cleanup();
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n结果：${checks.length - failed}/${checks.length} 通过`);
  process.exit(failed ? 1 : 0);
};

run().catch((e) => {
  console.error("E2E 异常:", e);
  process.exit(1);
});
