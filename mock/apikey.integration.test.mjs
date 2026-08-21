// API 密钥后端集成测试（真实启动 http 版与 express 版子进程并发送 HTTP 请求）。
// 零额外依赖，仅用 Node 内置 child_process + fetch。覆盖鉴权、创建（一次性 secret）、
// 参数校验、禁用/启用、删除。网关闭源校验（verifyApiKey）在 apikey-store.test.mjs 单测覆盖。
// 运行：  cd server && npm install && npm test   （node --test 自动发现本文件）

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = "Bearer demo-token-user-1";
const BASE = "/api/v1/user/api-keys";

function startServer(entry, port) {
  const child = spawn("node", [entry], {
    cwd: __dirname,
    env: { ...process.env, APIKEY_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (b) => process.stdout.write(`[${entry}] ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`[${entry}] ${b}`));
  return child;
}

async function waitReady(port, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await fetch(`http://127.0.0.1:${port}${BASE}`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`server not ready on port ${port}`);
}

const VARIANTS = [
  ["http", "apikey-server.mjs", 8130],
  ["express", "apikey-express.mjs", 8131],
];

for (const [name, entry, port] of VARIANTS) {
  test(`集成：${name} 版 API Key CRUD`, async () => {
    const child = startServer(entry, port);
    try {
      await waitReady(port);
      const base = `http://127.0.0.1:${port}${BASE}`;
      const json = { "Content-Type": "application/json" };
      const auth = { ...json, Authorization: TOKEN };

      // 1) 无 token -> 401
      let r = await fetch(base);
      assert.equal(r.status, 401);

      // 2) 空列表
      r = await fetch(base, { headers: auth });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).data.api_keys.length, 0);

      // 3) 创建缺 label -> 400
      r = await fetch(base, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ permissions: ["read"] }),
      });
      assert.equal(r.status, 400);

      // 4) 创建缺权限 -> 400
      r = await fetch(base, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ label: "只读机器人", permissions: [] }),
      });
      assert.equal(r.status, 400);

      // 5) 创建非法权限 -> 400
      r = await fetch(base, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ label: "x", permissions: ["hack"] }),
      });
      assert.equal(r.status, 400);

      // 6) 创建成功 -> 201，返回 api_key + secret，公钥视图不含 secret
      r = await fetch(base, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ label: "量化只读", permissions: ["read"], ip_whitelist: ["1.2.3.4"] }),
      });
      assert.equal(r.status, 201);
      const created = (await r.json()).data;
      assert.ok(created.api_key && created.secret);
      assert.equal(created.api_key.label, "量化只读");
      assert.deepEqual(created.api_key.permissions, ["read"]);
      assert.deepEqual(created.api_key.ip_whitelist, ["1.2.3.4"]);
      assert.equal(created.api_key.status, "active");
      assert.equal("secret" in created.api_key, false);

      const keyId = created.api_key.id;

      // 7) 列表包含该密钥，且列表项不含 secret
      r = await fetch(base, { headers: auth });
      const list = (await r.json()).data.api_keys;
      assert.equal(list.length, 1);
      assert.equal(list[0].id, keyId);
      assert.equal("secret" in list[0], false);

      // 7b) 分页：limit=1 仍返回 total=1 与单条
      r = await fetch(`${base}?limit=1`, { headers: auth });
      const paged = (await r.json()).data;
      assert.equal(paged.total, 1);
      assert.equal(paged.api_keys.length, 1);

      // 7c) 筛选：再建一条带 trade 权限、不同备注的密钥，验证 q/status/permission
      const tradeRes = await fetch(base, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ label: "交易机器人", permissions: ["read", "trade"], ip_whitelist: [] }),
      });
      const tradeId = (await tradeRes.json()).data.api_key.id;
      // 按权限 trade 过滤 -> 命中新建的 1 条（原有一条仅 read）
      r = await fetch(`${base}?permission=trade`, { headers: auth });
      let f = (await r.json()).data;
      assert.equal(f.total, 1);
      assert.deepEqual(f.api_keys[0].permissions, ["read", "trade"]);
      // 按关键字「交易」过滤 -> 1 条
      r = await fetch(`${base}?q=${encodeURIComponent("交易")}`, { headers: auth });
      f = (await r.json()).data;
      assert.equal(f.total, 1);
      // 组合无匹配 -> 0 条
      r = await fetch(`${base}?q=${encodeURIComponent("不存在")}&permission=trade`, { headers: auth });
      f = (await r.json()).data;
      assert.equal(f.total, 0);

      // 8) 禁用 -> 200，状态变更
      r = await fetch(`${base}/${keyId}`, {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ status: "disabled" }),
      });
      assert.equal(r.status, 200);
      r = await fetch(base, { headers: auth });
      assert.equal((await r.json()).data.api_keys[0].status, "disabled");

      // 9) 非法 status -> 400
      r = await fetch(`${base}/${keyId}`, {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ status: "banana" }),
      });
      assert.equal(r.status, 400);

      // 10) 重新启用 -> 200
      r = await fetch(`${base}/${keyId}`, {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ status: "active" }),
      });
      assert.equal(r.status, 200);

      // 11) 删除 -> 200，列表清空（含 7c 新建的 trade 密钥）
      r = await fetch(`${base}/${keyId}`, { method: "DELETE", headers: auth });
      assert.equal(r.status, 200);
      r = await fetch(`${base}/${tradeId}`, { method: "DELETE", headers: auth });
      assert.equal(r.status, 200);
      r = await fetch(base, { headers: auth });
      assert.equal((await r.json()).data.api_keys.length, 0);

      // 12) 删除不存在 -> 404
      r = await fetch(`${base}/99999`, { method: "DELETE", headers: auth });
      assert.equal(r.status, 404);
    } finally {
      child.kill();
    }
  });
}
