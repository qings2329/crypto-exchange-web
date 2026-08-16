// 端到端测试脚本：模拟前端监控全链路
//   1) 启动后端（http / express 两版）
//   2) 以前端 initMonitor/report() 的精确批量报文 POST 事件（无 key 必须被拒，带 key 接受）
//   3) 以监控看板页的方式 GET summary / events，并校验响应结构对齐前端类型
//      （MonitorSummaryRemote / MonitorEventItem，见 src/api/client.ts）
// 运行：  cd server && npm install && node monitor-e2e.mjs
// 退出码：全部通过 0，任意断言失败 1。
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_KEY = "e2e-secret";
const BASE = "/api/v1/monitor";

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log(`  \u2713 ${msg}`);
  } else {
    console.error(`  \u2717 ${msg}`);
    failures++;
  }
}

function startServer(entry, port) {
  const child = spawn("node", [entry], {
    cwd: __dirname,
    env: { ...process.env, MONITOR_PORT: String(port), MONITOR_API_KEY: API_KEY },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

async function waitReady(port, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await fetch(`http://127.0.0.1:${port}${BASE}/summary`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`server not ready on ${port}`);
}

// 精确复刻前端 src/lib/monitor.ts 中 report() 发送的批量报文
function frontendBatch() {
  const now = Date.now();
  return {
    events: [
      { ts: now, type: "api_error", message: "下单失败", code: 50001, status: 500 },
      { ts: now, type: "ws_drop", name: "BTC_USDT" },
      { ts: now, type: "error", message: "Uncaught TypeError" },
      { ts: now, type: "vital", name: "LCP", value: 1820.5 },
      { ts: now, type: "vital", name: "CLS", value: 0.02 },
    ],
  };
}

async function runVariant(name, entry, port) {
  console.log(`\n=== E2E: ${name} 版 ===`);
  const child = startServer(entry, port);
  const base = `http://127.0.0.1:${port}${BASE}`;
  const auth = { "X-Api-Key": API_KEY };
  try {
    await waitReady(port);

    // 步骤 1：上报缺少 key -> 401
    let r = await fetch(`${base}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(frontendBatch()),
    });
    check(r.status === 401, "上报缺少 X-Api-Key 被拒 (401)");

    // 步骤 2：带 key 上报
    const batch = frontendBatch();
    r = await fetch(`${base}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify(batch),
    });
    check(r.status === 200, "带 key 上报成功 (200)");
    const rep = await r.json();
    check(rep.code === 0 && rep.data.accepted === batch.events.length, `后端接受 ${batch.events.length} 条事件`);

    // 步骤 3：看板查询 summary，对齐 MonitorSummaryRemote
    r = await fetch(`${base}/summary`, { headers: auth });
    const sum = (await r.json()).data;
    check(sum.errors === 1, "summary.errors == 1");
    check(sum.apiErrors === 1, "summary.apiErrors == 1");
    check(sum.wsDrops === 1, "summary.wsDrops == 1");
    check(typeof sum.total === "number" && sum.total >= 5, "summary.total >= 5");
    check(typeof sum.vitals === "object" && sum.vitals.LCP === 1820.5, "summary.vitals.LCP 已聚合");
    check(typeof sum.range === "string", "summary.range 为字符串（对齐前端类型）");

    // 步骤 4：看板查询 events，对齐 MonitorEventItem
    r = await fetch(`${base}/events?limit=10`, { headers: auth });
    const evs = (await r.json()).data;
    check(Array.isArray(evs) && evs.length >= 5, "events 返回数组且数量正确");
    check(
      evs[0].type === batch.events[batch.events.length - 1].type,
      "events 按时间倒序（最新在前）"
    );
    check(
      evs.every(
        (e) =>
          "ts" in e && "type" in e && "name" in e && "message" in e &&
          "code" in e && "status" in e && "value" in e
      ),
      "events 每项字段对齐 MonitorEventItem"
    );
  } finally {
    child.kill();
  }
}

(async () => {
  await runVariant("http", "monitor-server.mjs", 8130);
  await runVariant("express", "monitor-express.mjs", 8131);
  console.log(`\n=== 结果：${failures === 0 ? "全部通过 ✅" : failures + " 项失败 ❌"} ===`);
  process.exit(failures === 0 ? 0 : 1);
})();
