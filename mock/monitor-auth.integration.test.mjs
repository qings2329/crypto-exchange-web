// 鉴权流程集成测试（真实启动服务进程并发送 HTTP 请求，覆盖 http 版与 express 版）。
// 零额外依赖，仅用 Node 内置 child_process + fetch。
// 运行：  cd server && npm install && npm test
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY = "it-secret";
const BASE = "/api/v1/monitor";

// 以子进程方式启动某个服务入口（作为主模块运行，会真正 listen）
function startServer(entry, port) {
  const child = spawn("node", [entry], {
    cwd: __dirname,
    env: { ...process.env, MONITOR_PORT: String(port), MONITOR_API_KEY: API_KEY },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // 把子进程日志透传给父进程，便于排错
  child.stdout.on("data", (b) => process.stdout.write(`[${entry}] ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`[${entry}] ${b}`));
  return child;
}

// 轮询直到端口可连通（返回非连接错误即视为就绪）
async function waitReady(port, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await fetch(`http://127.0.0.1:${port}${BASE}/summary`);
      return; // 收到响应（即使 401）即代表服务已起
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`server not ready on port ${port}`);
}

const VARIANTS = [
  ["http", "monitor-server.mjs", 8120],
  ["express", "monitor-express.mjs", 8121],
];

for (const [name, entry, port] of VARIANTS) {
  test(`集成：${name} 版鉴权流程`, async () => {
    const child = startServer(entry, port);
    try {
      await waitReady(port);
      const base = `http://127.0.0.1:${port}${BASE}`;
      const json = { "Content-Type": "application/json" };

      // 1) 无 key -> 401
      let r = await fetch(`${base}/summary`);
      assert.equal(r.status, 401);

      // 2) 错误 key -> 401
      r = await fetch(`${base}/summary`, { headers: { "X-Api-Key": "bad" } });
      assert.equal(r.status, 401);

      // 3) 正确 key -> 200
      r = await fetch(`${base}/summary`, { headers: { "X-Api-Key": API_KEY } });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).code, 0);

      // 4) 上报无 key -> 401
      r = await fetch(`${base}/report`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ events: [{ type: "error", message: "x" }] }),
      });
      assert.equal(r.status, 401);

      // 5) 上报带 key -> 200，且聚合反映
      r = await fetch(`${base}/report`, {
        method: "POST",
        headers: { ...json, "X-Api-Key": API_KEY },
        body: JSON.stringify({ events: [{ type: "error", message: "x" }] }),
      });
      assert.equal(r.status, 200);

      r = await fetch(`${base}/summary`, { headers: { "X-Api-Key": API_KEY } });
      assert.equal((await r.json()).data.errors, 1);

      // 6) events 倒序返回该事件
      r = await fetch(`${base}/events?limit=10`, { headers: { "X-Api-Key": API_KEY } });
      const evs = (await r.json()).data;
      assert.ok(Array.isArray(evs) && evs.length >= 1);
      assert.equal(evs[0].type, "error");
    } finally {
      child.kill();
    }
  });
}
