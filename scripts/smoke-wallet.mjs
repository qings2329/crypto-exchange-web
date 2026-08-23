// 钱包冒烟：Deposit 弹窗模拟到账→余额增加；Transfer 划转→可用/冻结联动；Withdraw 按钮→二次验证弹窗出现
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

// 管理员账号在用户前端登录应被拒
await page.goto(`${BASE}/#/login`);
await page.reload();
await sleep(800);
await page.fill("input[placeholder='user1']", "admin@ce.dev");
await page.fill("input[type='password']", "qwert@123x");
await page.click("form button:last-of-type");
await sleep(1200);
let errTxt = await page.locator(".error, [class*='error']").first().innerText().catch(() => "");
const adminBlocked = /管理后台/.test(await page.locator("body").innerText());
console.log(`ADMIN LOGIN blocked=${adminBlocked ? "✓" : "✗"} ${errTxt.slice(0, 40)}`);
// 回到 user1
await page.fill("input[placeholder='user1']", "user1");
await page.fill("input[placeholder='user1']", "user1").catch(() => {});
await page.goto(`${BASE}/#/wallet`);
await page.reload();
await sleep(2200);

// 记录 USDT 行当前 available
const usdtAvail = () => page.locator("[data-testid='asset-overview'] tbody tr").filter({ hasText: "USDT" }).locator("td").nth(1).innerText();
const before = await usdtAvail();

// ---- Deposit ----
await page.locator("[data-testid='dep-USDT']").click();
await page.locator("[data-testid='deposit-address']").waitFor({ timeout: 4000 });
const depAddr = await page.locator("[data-testid='deposit-address']").innerText();
console.log(`DEPOSIT addr ${/^0x[0-9a-f]{40}$/.test(depAddr) ? "✓" : "✗"}`);
await page.locator("[data-testid='deposit-amount']").fill("500");
await page.locator("[data-testid='deposit-submit']").click();
await sleep(1800);
const afterDep = await usdtAvail();
const depOk = parseFloat(afterDep.replace(/,/g, "")) > parseFloat(before.replace(/,/g, ""));
console.log(`DEPOSIT credited ${before} -> ${afterDep} ${depOk ? "✓" : "✗"}`);

// ---- Transfer ----
await page.locator("[data-testid='tr-USDT']").click();
await page.locator("[data-testid='transfer-amount']").fill("200");
await page.locator("[data-testid='transfer-submit']").click();
await sleep(1800);
const afterTr = await usdtAvail();
const trOk = parseFloat(afterTr.replace(/,/g, "")) === parseFloat(afterDep.replace(/,/g, "")) - 200;
console.log(`TRANSFER ${afterDep} -> ${afterTr} ${trOk ? "✓" : "✗"}`);

// 流水表应出现新的充值/划转记录
const ledgerTxt = await page.locator("body").innerText();
const ledgerOk = /充值/.test(ledgerTxt) && /转账/.test(ledgerTxt);
console.log(`LEDGER rows ${ledgerOk ? "✓" : "✗"}`);

// ---- Withdraw 联动：点 Withdraw → 二次验证组件出现 ----
await page.locator("[data-testid='wd-USDT']").click();
await sleep(1000);
const secShown = await page.locator("[role='dialog'], .secure-action, [class*='secure'], [class*='verify']").count();
console.log(`WITHDRAW secure-gate shown=${secShown > 0 ? "✓ (" + secShown + ")" : "✗"}`);

console.log(`JS ERRORS: ${errs.length}`, errs.slice(0, 3));
await browser.close();
process.exit(errs.length > 0 ? 1 : 0);
