// 合约下单/持仓冒烟：登录 → 开多 0.5 BTCUSDT → 持仓面板出现（服务端水合）→ Market Close → 面板清空
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

// API 层清理 user1 残留持仓，保证幂等可重跑
{
  const login = await fetch("http://localhost:8787/api/v1/user/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "user1", password: "qwert@123x" }),
  }).then((r) => r.json());
  const tk = login.data.access_token;
  const d = await fetch("http://localhost:8787/api/v1/futures/positions?symbol=BTCUSDT", {
    headers: { Authorization: `Bearer ${tk}` },
  }).then((r) => r.json());
  for (const p of d.data?.positions ?? []) {
    await fetch("http://localhost:8787/api/v1/futures/order", {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: p.Symbol, action: "close", pos_side: p.Side, qty: p.Size }),
    });
  }
}

await page.goto(`${BASE}/#/login`);
await page.fill("input[placeholder='user1']", "user1");
await page.fill("input[type='password']", "qwert@123x");
await page.click("form button:last-of-type");
await page.waitForFunction(() => location.hash !== "#/login", null, { timeout: 8000 });

// SPA hash 导航：goto 只改 hash 不重载 → 显式 reload 确保干净挂载
await page.goto(`${BASE}/#/futures/BTCUSDT`);
await page.reload();
await sleep(2500);

// 持仓在底部 Tab（默认 orders）→ 点 Positions
const tab = page.locator("[data-testid='bottom-tab-positions']");
console.log("POSITIONS TAB visible:", await tab.count());
await tab.click();
const panel = page.locator("[data-testid='positions-panel']");
await panel.waitFor({ state: "visible", timeout: 6000 });
console.log("PANEL visible ✓");

// 切市价单（免填价格），数量填 0.5，点 做多 BTC（zh-CN 默认语言）
await page.locator("button:has-text('市价')").click();
await page.fill("input[placeholder='0.00000']", "0.5");
await sleep(300);
const openBtn = page.locator("button:has-text('做多'), button.bg-buy").first();
console.log("OPEN BTN enabled:", await openBtn.isEnabled());
await openBtn.click();
// 服务端往返 + ≤5s 轮询水合
await page.waitForSelector("[data-testid='positions-panel'] tbody tr", { timeout: 9000 }).catch(() => {});
let rows = await panel.locator("tbody tr").count();
console.log(`OPEN position rows=${rows} ${rows >= 1 ? "✓" : "✗"}`);
if (rows >= 1) {
  const sideTxt = await panel.locator("tbody tr td:nth-child(2)").first().innerText();
  console.log(`SIDE=${sideTxt.trim()} ${/Long/i.test(sideTxt) ? "✓" : "✗"}`);
}

// Market Close → Confirm 弹窗
if (rows >= 1) {
  await panel.locator("button:has-text('Market Close')").first().click();
  await page.locator("button:has-text('Confirm Close')").click();
  await sleep(1800);
  rows = await panel.locator("tbody tr").count();
  console.log(`CLOSED rows=${rows} ${rows === 0 ? "✓" : "✗"}`);
}
console.log(`JS ERRORS: ${errs.length}`, errs.slice(0, 3));
await browser.close();
process.exit(errs.length > 0 ? 1 : 0);
