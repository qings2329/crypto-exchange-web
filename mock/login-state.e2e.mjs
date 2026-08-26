// 端到端登录态验收测试（零配置一键运行）。
//
// 覆盖「登录态」相关的前端契约：
//   1) 未登录：首页展示「注册」CTA（a[href="#/register"] 存在）
//   2) 已登录：首页隐藏「注册」CTA（Home.tsx 以 {!me && ...} 门控）
//   3) 交易偏好后端 hydrate：登录后从 GET /user/preferences 拉取并写入 UI
//      （先把服务端偏好写成 1h / 今日开盘，重载后弹窗对应分段应高亮）
//   4) 交易偏好后端 push：在 UI 改偏好后，PUT /user/preferences 应回写服务端
//
// 运行： node mock/login-state.e2e.mjs
// 前置： 根 node_modules 含 playwright；mock/node_modules 含 express（dev:mock 已装）。
// 退出码：全部通过 0；任意断言失败 1。

import { spawn } from "node:child_process";
import { chromium } from "playwright";

const GATEWAY_PORT = 8787;
const VITE_PORT = 5179;
const GATEWAY = `http://localhost:${GATEWAY_PORT}`;
const FRONTEND = `http://localhost:${VITE_PORT}`;
const DEMO = { target: "user1", password: "qwert@123x" };

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log(`  \u2713 ${msg}`);
  } else {
    console.error(`  \u2717 ${msg}`);
    failures++;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred, timeout = 8000, step = 150) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await pred()) return true;
    await sleep(step);
  }
  return false;
}
async function waitReady(url, timeout = 15000) {
  return waitFor(async () => {
    try {
      const r = await fetch(url);
      return r.ok || r.status === 401; // 401 也说明服务起来了
    } catch {
      return false;
    }
  }, timeout);
}

// ---------- 启动依赖 ----------
console.log("[setup] starting mock gateway ...");
const gateway = spawn("node", ["mock/gateway.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, GATEWAY_PORT: String(GATEWAY_PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
gateway.stdout.on("data", () => {});
gateway.stderr.on("data", (d) => process.stderr.write(`[gateway] ${d}`));

console.log("[setup] starting vite dev server ...");
const vite = spawn("node", ["node_modules/vite/bin/vite.js", "--port", String(VITE_PORT), "--strictPort"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});
vite.stdout.on("data", () => {});
vite.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));

let browser;
try {
  if (!(await waitReady(`${GATEWAY}/api/v1/otc/prices`))) throw new Error("gateway not ready");
  if (!(await waitReady(FRONTEND + "/"))) throw new Error("vite not ready");
  console.log("[setup] both services ready.\n");

  browser = await chromium.launch();

  // ---------- 登录工具（直接打 mock 网关）----------
  async function login() {
    const r = await fetch(`${GATEWAY}/api/v1/user/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(DEMO),
    });
    const j = await r.json();
    if (j.code !== 0) throw new Error("login failed: " + JSON.stringify(j));
    return j.data; // { access_token, refresh_token, user_id, role }
  }
  async function getPrefs(token) {
    const r = await fetch(`${GATEWAY}/api/v1/user/preferences`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    return j.data ?? j; // 网关响应为 {code,message,data}，解包取 data
  }
  async function putPrefs(token, body) {
    await fetch(`${GATEWAY}/api/v1/user/preferences`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }
  // 模拟「登录后刷新页面」的持久化会话：写入前端 tokenStore 的全部四个键
  function injectSession(ctx, data) {
    return ctx.addInitScript(
      (d) => {
        localStorage.setItem("cx_access_token", d.access_token);
        localStorage.setItem("cx_refresh_token", d.refresh_token);
        localStorage.setItem("cx_user_id", String(d.user_id));
        localStorage.setItem("cx_role", d.role);
      },
      data
    );
  }
  function attachErrors(page, errs) {
    page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  }

  // ===== 1) 未登录：首页展示注册 CTA =====
  console.log("[case 1] 未登录 → 首页显示注册 CTA");
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = [];
    attachErrors(page, errs);
    await page.goto(FRONTEND + "/#/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const signupCount = await page.locator('a[href="#/register"]').count();
    check(signupCount >= 1, `未登录时存在注册 CTA（count=${signupCount}）`);
    if (errs.length) console.log("    [diag] console errors:", errs.slice(0, 5));
    await ctx.close();
  }

  // ===== 2) 已登录：首页隐藏注册 CTA =====
  console.log("[case 2] 已登录 → 首页隐藏注册 CTA");
  const sess = await login();
  {
    const ctx = await browser.newContext();
    injectSession(ctx, sess);
    const page = await ctx.newPage();
    const errs = [];
    attachErrors(page, errs);
    await page.goto(FRONTEND + "/#/", { waitUntil: "domcontentloaded" });
    const hidden = await waitFor(
      () => page.locator('a[href="#/register"]').count().then((c) => c === 0),
      8000
    );
    check(hidden, "已登录时注册 CTA 被隐藏（{!me && ...} 门控生效）");
    if (!hidden) {
      const meStatus = await page.evaluate(async () => {
        const t = localStorage.getItem("cx_access_token");
        const r = await fetch("/api/v1/user/me", { headers: { authorization: "Bearer " + t } }).catch(() => null);
        return { token: !!t, meStatus: r ? r.status : "fetch-failed", hash: location.hash };
      });
      console.log("    [diag]", JSON.stringify(meStatus));
    }
    if (errs.length) console.log("    [diag] console errors:", errs.slice(0, 5));
    await ctx.close();
  }

  // ===== 3) & 4) 交易偏好后端 hydrate / push =====
  console.log("[case 3/4] 交易偏好后端 hydrate / push");
  // 先把服务端偏好写成 1h / 今日开盘，便于 hydrate 后断言 UI 高亮
  await putPrefs(sess.access_token, { trade_interval: "1h", change_basis: "today" });

  {
    const ctx = await browser.newContext();
    injectSession(ctx, sess);
    const page = await ctx.newPage();
    const errs = [];
    attachErrors(page, errs);
    await page.goto(FRONTEND + "/#/trade", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // 打开偏好弹窗
    const gear = page.getByRole("button", { name: /偏好|Preferences/ });
    await gear.first().click();
    const prefs = page.getByTestId("trade-prefs");
    const popoverOk = await prefs.waitFor({ state: "visible" }).then(() => true).catch(() => false);
    check(popoverOk, "点击齿轮弹出偏好面板");

    // 等待 hydrate 把服务端 1h / 今日开盘 写入 UI（分段高亮）
    const hydrated = await waitFor(async () => {
      const i = await prefs.getByRole("button", { name: "1H", exact: true }).getAttribute("class");
      const b = await prefs.getByRole("button", { name: /今日开盘|Today/ }).getAttribute("class");
      return i?.includes("text-accent") && b?.includes("text-accent");
    }, 8000);
    check(hydrated, "hydrate：服务端 1h / 今日开盘 已同步到 UI（分段高亮）");

    // 等服务端也确认收到 hydrate 的回写（避免后续 push 竞态）
    await waitFor(
      () => getPrefs(sess.access_token).then((p) => p.trade_interval === "1h" && p.change_basis === "today"),
      8000
    );

    // 在 UI 改偏好为 15M / 24h，并断言服务端被回写（push）
    await prefs.getByRole("button", { name: "15M", exact: true }).click();
    await prefs.getByRole("button", { name: "24h", exact: true }).click();
    const pushed = await waitFor(
      () => getPrefs(sess.access_token).then((p) => p.trade_interval === "15m" && p.change_basis === "24h"),
      8000
    );
    check(pushed, "push：UI 改动（15M / 24h）已写回服务端 /user/preferences");
    if (!pushed) {
      const sv = await getPrefs(sess.access_token);
      console.log("    [diag] server prefs after UI change:", JSON.stringify(sv));
      console.log("    [diag] hash:", await page.evaluate(() => location.hash), "token:", await page.evaluate(() => !!localStorage.getItem("cx_access_token")));
    }
    if (errs.length) console.log("    [diag] console errors:", errs.slice(0, 8));
    await ctx.close();
  }

  console.log("");
} catch (e) {
  console.error("[fatal]", e);
  failures++;
} finally {
  if (browser) await browser.close().catch(() => {});
  gateway.kill("SIGTERM");
  vite.kill("SIGTERM");
}

console.log(failures === 0 ? "\n\u2714 登录态 E2E 全部通过" : `\n\u2717 登录态 E2E 失败 ${failures} 项`);
process.exit(failures === 0 ? 0 : 1);
