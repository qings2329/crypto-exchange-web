import { chromium } from "playwright";

// 管理前端偏好「跨设备同步」端到端验证：
//   Context A（已登录、含 localStorage）：改主题/时区/语言并保存，校验后端落库。
//   Context B（全新空 context，模拟另一台设备）：登录后校验偏好从后端自动应用。
const BASE = "http://localhost:5174";
const ADMIN = "admin";
const PW = "admin123";
const SAVE_BTN = /保存偏好|Save preferences|儲存偏好|環境設定を保存/;
const SAVE_MSG = /偏好已保存|Preferences saved|儲存偏好|環境設定を保存/;

function ok(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  console.log("PASS:", msg);
}

const browser = await chromium.launch();

// 仅收集页面错误，便于发现回归（不打扰正常断言日志）。
function attachErrorLog(page, tag) {
  page.on("pageerror", (e) => console.log(`[pageerror:${tag}]`, e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[console.error:${tag}]`, m.text());
  });
}

async function login(page) {
  attachErrorLog(page, page === pageA ? "A" : "B");
  await page.goto(BASE + "/#/login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("input");
  const inputs = page.locator("input");
  await inputs.nth(0).fill(ADMIN);
  await inputs.nth(1).fill(PW);
  await page.locator("button.btn-primary").click();
  await page.waitForFunction(() => !!localStorage.getItem("cx_admin_token"), null, {
    timeout: 8000,
  });
}

async function getStored(page) {
  return await page.evaluate(async () => {
    const tok = localStorage.getItem("cx_admin_token");
    const r = await fetch("/api/admin/preferences", {
      headers: { Authorization: "Bearer " + tok },
    });
    const j = await r.json();
    return j.data;
  });
}

// 把后端偏好重置为已知基线，保证测试不依赖上一次运行的内存残留。
async function resetPrefs(page) {
  await page.evaluate(async () => {
    const tok = localStorage.getItem("cx_admin_token");
    await fetch("/api/admin/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
      body: JSON.stringify({ language: "zh-CN", theme: "dark", timezone: "" }),
    });
  });
}

function settingsSelects(page) {
  return page.locator("main select"); // 仅设置页内的 3 个下拉（排除 NavBar 的 2 个）
}

// ===== Context A: 登录 -> 重置 -> 改偏好 -> 保存 -> 校验后端落库 =====
const ctxA = await browser.newContext();
const pageA = await ctxA.newPage();
pageA.on("request", (r) => {
  if (r.method() === "PUT" && r.url().includes("/preferences")) {
    console.log("[PUT /preferences]", r.postData());
  }
});
await login(pageA);
await resetPrefs(pageA);
await pageA.locator('a[href="#/settings"]').click();
await pageA.waitForSelector("text=偏好设置");

const selA = settingsSelects(pageA);
// 先设主题/时区（界面仍为中文）
await selA.nth(1).selectOption("solar");
await selA.nth(2).selectOption("Asia/Tokyo");
await pageA.getByRole("button", { name: "保存偏好" }).click();
await pageA.waitForSelector("text=偏好已保存", { timeout: 5000 });
ok(true, "Context A: 保存主题/时区成功（中文提示）");
let storedA = await getStored(pageA);
ok(
  storedA.theme === "solar" && storedA.timezone === "Asia/Tokyo" && storedA.language === "zh-CN",
  "Context A: 后端 solar/Tokyo/zh-CN (实际 " + JSON.stringify(storedA) + ")",
);

// 再改语言为 en-US 并保存，验证语言持久化（此时按钮/提示变英文，用正则匹配）。
// 关键回归：语言切换不得清空已选时区（历史 bug：挂载期异步 loadPrefs 覆盖用户选择）。
await selA.nth(0).selectOption("en-US");
await pageA.getByRole("button", { name: SAVE_BTN }).click();
await pageA.getByText(SAVE_MSG).waitFor({ timeout: 5000 });
ok(true, "Context A: 保存语言成功（英文界面）");
storedA = await getStored(pageA);
ok(
  storedA.language === "en-US" && storedA.theme === "solar" && storedA.timezone === "Asia/Tokyo",
  "Context A: 后端持久化 en-US/solar/Asia/Tokyo (实际 " + JSON.stringify(storedA) + ")",
);

// ===== Context B: 全新无 localStorage -> 登录 -> 校验从后端同步（跨设备） =====
const ctxB = await browser.newContext(); // 空存储，模拟另一台设备
const pageB = await ctxB.newPage();
await login(pageB);
await pageB.locator('a[href="#/settings"]').click();
await pageB.waitForSelector("text=偏好设置");

// 等待后端偏好应用：data-theme=solar 且 语言下拉=en-US
await pageB.waitForFunction(
  () => {
    const dt = document.documentElement.getAttribute("data-theme");
    const lang = document.querySelectorAll("main select")[0]?.value;
    return dt === "solar" && lang === "en-US";
  },
  null,
  { timeout: 5000 },
);
ok(true, "Context B: 无 localStorage 时主题从后端应用为 solar、语言为 en-US");

const tzVal = await settingsSelects(pageB).nth(2).inputValue();
ok(tzVal === "Asia/Tokyo", "Context B: 时区下拉从后端加载为 Asia/Tokyo (实际 " + tzVal + ")");

const storedB = await getStored(pageB);
ok(
  storedB.language === "en-US" && storedB.theme === "solar" && storedB.timezone === "Asia/Tokyo",
  "Context B: 后端读取仍为 en-US/solar/Asia/Tokyo (实际 " + JSON.stringify(storedB) + ")",
);

console.log("\n=== ALL E2E PASSED ===");
await browser.close();
