// 借贷 + 邀请返佣冒烟：
//  Lending: 选 USDT 池 → 存款 5000 → 我的存款出现(active) → 提取 → 消失
//  Referral: 邀请码 CE003… 渲染、佣金收益 125.500000、下线 1 人、佣金明细 ≥2 行
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
await page.fill("input[type='password']", "qwert@123x");
await page.click("form button:last-of-type");
await page.waitForFunction(() => location.hash !== "#/login", null, { timeout: 8000 });

// ---------- Lending ----------
// API 层清理 user1 残留存借单，保证幂等可重跑
{
  const login = await fetch("http://localhost:8787/api/v1/user/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "user1", password: "qwert@123x" }),
  }).then((r) => r.json());
  const tk = login.data.access_token;
  const lends = await fetch("http://localhost:8787/api/v1/lending/my/lends", { headers: { Authorization: `Bearer ${tk}` } }).then((r) => r.json());
  for (const o of lends.data?.lends ?? []) {
    if (o.status === "active") await fetch(`http://localhost:8787/api/v1/lending/withdraw/${o.id}`, { method: "POST", headers: { Authorization: `Bearer ${tk}` } });
  }
  const borrows = await fetch("http://localhost:8787/api/v1/lending/my/borrows", { headers: { Authorization: `Bearer ${tk}` } }).then((r) => r.json());
  for (const o of borrows.data?.borrows ?? []) {
    if (o.status === "active") await fetch(`http://localhost:8787/api/v1/lending/repay/${o.id}`, { method: "POST", headers: { Authorization: `Bearer ${tk}` } });
  }
}

await page.goto(`${BASE}/#/lending`);
await page.reload();
await sleep(2000);
// 存款表单：第一个 select（存款池）+ 第一个 number 输入（金额）
await page.locator("select.form-select").first().selectOption({ index: 1 }); // USDT 池
await page.locator("input[type='number']").first().fill("5000");
await sleep(300);
await page.locator("button:has-text('确认存款')").click();
await sleep(1500);
// 页面渲染 i18n 文案："进行中"=active
await page.getByRole("row").filter({ hasText: "进行中" }).first().waitFor({ timeout: 6000 }).catch(() => {});
let lendRows = await page.getByRole("row").filter({ hasText: "进行中" }).count();
console.log(`LEND rows=${lendRows} ${lendRows >= 1 ? "✓" : "✗"}`);
if (lendRows >= 1) {
  // 只点"提取"按钮所在行的操作（提取/还款都是 link-btn，取第一个提取）
  await page.getByRole("button", { name: "提取" }).first().click();
  await sleep(1800);
  lendRows = await page.getByRole("row").filter({ hasText: "进行中" }).count();
  console.log(`WITHDRAWN remaining=${lendRows} ${lendRows === 0 ? "✓" : "✗"}`);
}

// ---------- Referral ----------
await page.goto(`${BASE}/#/referral`);
await page.reload();
await sleep(1800);
const body = await page.locator("body").innerText();
const hasCode = /CE003\d{6}/.test(body);
const hasTotal = body.includes("125.500000");
const hasReferral = /op@ce\.dev/.test(body);
const commRows = await page.getByRole("row").filter({ hasText: "%" }).count();
console.log(`REFERRAL code=${hasCode ? "✓" : "✗"} total125.5=${hasTotal ? "✓" : "✗"} invitee=${hasReferral ? "✓" : "✗"} commRows=${commRows >= 2 ? commRows + " ✓" : commRows + " ✗"}`);

console.log(`JS ERRORS: ${errs.length}`, errs.slice(0, 3));
await browser.close();
process.exit(errs.length > 0 ? 1 : 0);
