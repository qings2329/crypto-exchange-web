// API 密钥存储单测（进程内，直接调用 store 与 auth 纯函数）。
// 覆盖网关校验 verifyApiKey：secret 哈希比对、IP/CIDR 白名单、启用/禁用、公钥视图不含 secret。
// 运行：  cd server && npm install && npm test   （node --test 自动发现本文件）

import test from "node:test";
import assert from "node:assert/strict";
import { createKey, updateStatus, publicView, verifyApiKey, listKeys, apikeyStore } from "./apikey-store.mjs";
import { genApiKey, genSecret, hashSecret, ipAllowed } from "./apikey-auth.mjs";

// 每个用例前清空共享存储，避免相互干扰。
function freshStore() {
  apikeyStore.byUser = new Map();
}

test("createKey 返回不含 secret 的公钥视图", () => {
  freshStore();
  const key = genApiKey();
  const secret = genSecret();
  const view = createKey(1, {
    label: "t",
    permissions: ["read", "trade"],
    ip_whitelist: [],
    key,
    secretHash: hashSecret(secret),
  });
  assert.equal(view.key, key);
  assert.deepEqual(view.permissions, ["read", "trade"]);
  assert.equal(view.status, "active");
  assert.equal("secret" in view, false);
  assert.equal("secretHash" in view, false);
});

test("verifyApiKey：secret 正确且 IP 命中 -> 通过", () => {
  freshStore();
  const key = genApiKey();
  const secret = genSecret();
  createKey(1, { label: "t", permissions: ["read"], ip_whitelist: ["1.2.3.4"], key, secretHash: hashSecret(secret) });
  const v = verifyApiKey(key, secret, "1.2.3.4");
  assert.ok(v);
  assert.equal(v.key, key);
});

test("verifyApiKey：secret 错误 -> 拒绝", () => {
  freshStore();
  const key = genApiKey();
  const secret = genSecret();
  createKey(1, { label: "t", permissions: ["read"], ip_whitelist: ["1.2.3.4"], key, secretHash: hashSecret(secret) });
  assert.equal(verifyApiKey(key, "wrong", "1.2.3.4"), null);
});

test("verifyApiKey：IP 不在白名单 -> 拒绝", () => {
  freshStore();
  const key = genApiKey();
  const secret = genSecret();
  createKey(1, { label: "t", permissions: ["read"], ip_whitelist: ["1.2.3.4"], key, secretHash: hashSecret(secret) });
  assert.equal(verifyApiKey(key, secret, "9.9.9.9"), null);
});

test("verifyApiKey：禁用状态 -> 拒绝；重新启用 -> 通过", () => {
  freshStore();
  const key = genApiKey();
  const secret = genSecret();
  const created = createKey(1, { label: "t", permissions: ["read"], ip_whitelist: [], key, secretHash: hashSecret(secret) });
  assert.ok(verifyApiKey(key, secret, "5.5.5.5"));
  updateStatus(1, created.id, "disabled");
  assert.equal(verifyApiKey(key, secret, "5.5.5.5"), null);
  updateStatus(1, created.id, "active");
  assert.ok(verifyApiKey(key, secret, "5.5.5.5"));
});

test("verifyApiKey：白名单为空 -> 任意 IP 放行", () => {
  freshStore();
  const key = genApiKey();
  const secret = genSecret();
  createKey(1, { label: "t", permissions: ["read"], ip_whitelist: [], key, secretHash: hashSecret(secret) });
  assert.ok(verifyApiKey(key, secret, "203.0.113.7"));
});

test("verifyApiKey：CIDR 匹配", () => {
  freshStore();
  const key = genApiKey();
  const secret = genSecret();
  createKey(1, { label: "t", permissions: ["read"], ip_whitelist: ["10.0.0.0/8"], key, secretHash: hashSecret(secret) });
  assert.ok(verifyApiKey(key, secret, "10.1.2.3"));
  assert.equal(verifyApiKey(key, secret, "11.0.0.1"), null);
});

test("ipAllowed：精确 / CIDR / 空", () => {
  assert.equal(ipAllowed([], "1.2.3.4"), true);
  assert.equal(ipAllowed(["1.2.3.4"], "1.2.3.4"), true);
  assert.equal(ipAllowed(["1.2.3.4"], "1.2.3.5"), false);
  assert.equal(ipAllowed(["192.168.0.0/16"], "192.168.55.5"), true);
  assert.equal(ipAllowed(["192.168.0.0/16"], "192.169.0.1"), false);
});

test("listKeys 分页：返回总数与分片", () => {
  freshStore();
  for (let i = 0; i < 5; i++) {
    createKey(1, { label: `k${i}`, permissions: ["read"], ip_whitelist: [], key: `key${i}`, secretHash: "x" });
  }
  const p1 = listKeys(1, { limit: 2, offset: 0 });
  assert.equal(p1.total, 5);
  assert.equal(p1.api_keys.length, 2);
  const p3 = listKeys(1, { limit: 2, offset: 4 });
  assert.equal(p3.api_keys.length, 1);
  const all = listKeys(1, { limit: 100, offset: 0 });
  assert.equal(all.api_keys.length, 5);
});

test("listKeys 筛选：q / status / permission", () => {
  freshStore();
  const a = createKey(1, { label: "quant-bot", permissions: ["read", "trade"], ip_whitelist: [], key: "cx_aaaa", secretHash: "x" });
  createKey(1, { label: "read-only", permissions: ["read"], ip_whitelist: [], key: "cx_bbbb", secretHash: "x" });
  const c = createKey(2, { label: "other", permissions: ["read"], ip_whitelist: [], key: "cx_cccc", secretHash: "x" });
  updateStatus(1, a.id, "disabled");

  // q 匹配 label 或 key（不区分大小写）
  assert.equal(listKeys(1, { q: "QUANT" }).total, 1);
  assert.equal(listKeys(1, { q: "aaaa" }).total, 1); // 命中 key
  // status 筛选
  assert.equal(listKeys(1, { status: "disabled" }).total, 1);
  // permission 筛选（需包含）
  assert.equal(listKeys(1, { permission: "trade" }).total, 1);
  // 组合：status + permission
  assert.equal(listKeys(1, { status: "active", permission: "read" }).total, 1);
  // 不同用户互不干扰
  assert.equal(listKeys(2, {}).total, 1);
  // 无匹配
  assert.equal(listKeys(1, { q: "nope" }).total, 0);
});

test("publicView 剥离 secretHash", () => {
  freshStore();
  const key = genApiKey();
  const rec = createKey(1, { label: "t", permissions: ["read"], ip_whitelist: [], key, secretHash: "abc" });
  const v = publicView({ id: 1, user_id: 1, label: "t", key, secretHash: "abc", permissions: ["read"], ip_whitelist: [], status: "active" });
  assert.equal(v.secretHash, undefined);
  assert.equal(rec.secretHash, undefined);
});
