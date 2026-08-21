// 鉴权逻辑单元测试（Node 内置 node:test，无需额外依赖）。
// 运行：  cd server && npm install && npm test
//        （npm test 会先设置 MONITOR_API_KEY，使 Express 中间件走校验分支）
import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorized } from "./monitor-auth.mjs";

// ---- 纯函数 isAuthorized（两版共用，零依赖）----
test("演示模式：未设置 expectedKey 时一律放行", () => {
  assert.equal(isAuthorized(undefined, undefined), true);
  assert.equal(isAuthorized(null, "whatever"), true);
  assert.equal(isAuthorized("", "whatever"), true);
  assert.equal(isAuthorized(undefined, "secret"), true);
});

test("设置 expectedKey 后须严格相等", () => {
  assert.equal(isAuthorized("secret", "secret"), true);
  assert.equal(isAuthorized("secret", undefined), false);
  assert.equal(isAuthorized("secret", ""), false);
  assert.equal(isAuthorized("secret", "wrong"), false);
  assert.equal(isAuthorized("secret", "Secret"), false); // 区分大小写
  assert.equal(isAuthorized("secret", "secret "), false); // 区分首尾空白
});

// ---- Express 中间件 auth（动态 import 以在设置 env 后再加载模块）----
test("auth 中间件：已授权时调用 next 且不写响应", async () => {
  process.env.MONITOR_API_KEY = "secret";
  const { auth } = await import("./monitor-express.mjs");
  let nextCalled = false;
  let wrote = false;
  const req = { get: () => "secret" };
  const res = {
    status() {
      wrote = true;
      return this;
    },
    json() {
      wrote = true;
      return this;
    },
  };
  auth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(wrote, false);
});

test("auth 中间件：未授权时返回 401 且不调用 next", async () => {
  process.env.MONITOR_API_KEY = "secret";
  const { auth } = await import("./monitor-express.mjs");
  let nextCalled = false;
  let statusCode = null;
  let body = null;
  const req = { get: () => undefined }; // 缺头
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  auth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 401);
  assert.deepEqual(body, { code: 401, message: "unauthorized", data: null });
});

test("auth 中间件：错误 key 时返回 401", async () => {
  process.env.MONITOR_API_KEY = "secret";
  const { auth } = await import("./monitor-express.mjs");
  let nextCalled = false;
  const req = { get: () => "wrong" };
  const res = { status() { return this; }, json() { return this; } };
  auth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
});
