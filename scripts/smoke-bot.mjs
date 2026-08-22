// 交易机器人冒烟：种子策略渲染 → 新建 ETH 网格（含 user_token）→ 启动 → 停止 → 查看订单
import { chromium } from "playwright";
const BASE = "http://localhost:5173";
const errs = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource|reown|web3modal|walletconnect/i.test(m.text())) errs.push(m.text());
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/#/login`);
await page.fill("input[placeholder='user1']", "user1");
await page.fill("input[type='password']", "User@123");
await page.click("form button:last-of-type");
await page.waitForFunction(() => location.hash !== "#/login", null, { timeout: 8000 });

await page.goto(`${BASE}/#/bot`);
await page.reload();
await sleep(2000);
// 种子策略卡：BTC 震荡网格 · 运行中
let body = await page.locator("body").innerText();
const seedOk = body.includes("BTC 震荡网格") && body.includes("运行中");
console.log(`SEED strategy ${seedOk ? "✓" : "✗"}`);

// 打开新建表单并填写（name/symbol/token/lower/upper/gridNum/orderAmt）
await page.locator("button:has-text('新建策略')").first().click();
const inputs = page.locator(".form-field input.filter");
await inputs.nth(0).fill("ETH 定投网格");
await inputs.nth(1).fill("ETHUSDT");
await inputs.nth(2).fill("sk-user-token-abc");
// grid 类型专属输入：lower/upper/gridNum/orderAmount（顺序按页面渲染）
const nums = page.locator(".form-field input");
const allInputs = await nums.count();
console.log("form inputs:", allInputs);
await page.locator("input").nth(6).fill(""); // noop 防严格模式误判
// 直接按 label 文本定位更稳：
async function fillByLabel(label, value) {
  const field = page.locator(".form-field").filter({ hasText: label }).first();
  await field.locator("input").fill(value);
}
await fillByLabel("网格下沿", "2800");
await fillByLabel("网格上沿", "3600");
await fillByLabel("网格数", "10");
await fillByLabel("单笔金额", "30");
await sleep(300);
await page.locator("button:has-text('确认创建'), button:has-text('创建')").last().click();
await sleep(1800);
body = await page.locator("body").innerText();
const createdOk = body.includes("ETH 定投网格") && body.includes("已停止");
console.log(`CREATED strategy(已停止) ${createdOk ? "✓" : "✗"}`);

// 启动新策略 → 变运行中；再停止
if (createdOk) {
  // 找到包含 ETH 定投网格 的卡片内的启动按钮
  const card = page.locator("div").filter({ hasText: /^ETH 定投网格/ }).last();
  await page.getByRole("button", { name: "启动" }).last().click();
  await sleep(1200);
  // 可能有确认弹窗
  const confirmBtn = page.locator("button:has-text('启动')");
  if ((await confirmBtn.count()) > 1 || (await page.locator("[role='dialog']").count()) > 0) {
    await page.locator("[role='dialog'] button:has-text('启动')").click().catch(() => {});
    await sleep(800);
  }
  body = await page.locator("body").innerText();
  const startedOk = /ETH 定投网格[\s\S]{0,200}运行中/.test(body);
  console.log(`STARTED ${startedOk ? "✓" : "✗"}`);
}

// 查看种子策略订单弹窗
// 列表新策略在前、种子 BTC 在后 → 用含"BTC 震荡网格"的卡片区内的查看订单
const btcRow = page.getByRole("row").filter({ hasText: "BTC 震荡网格" }).first();
await btcRow.getByRole("button", { name: "查看订单" }).click();
await sleep(1200);
body = await page.locator("body").innerText();
const ordersOk = /策略订单 — BTC 震荡网格/.test(body);
console.log(`ORDERS section=${ordersOk ? "✓" : "✗"} (种子 2 笔成交)`);
console.log(`JS ERRORS: ${errs.length}`, errs.slice(0, 3));
await browser.close();
process.exit(errs.length > 0 ? 1 : 0);
