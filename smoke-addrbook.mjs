// 地址簿冒烟（user1，每次重启 gateway 保证种子态）：
// ① 白名单提示+chips ② 簿外地址被拒 ③ chip 一键填充 ④ 保存到簿
// ⑤ 清空簿→白名单关闭→首次使用核对勾选拦截/放行
import { chromium } from "playwright";
const BASE = "http://localhost:5173";
const errs = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => errs.push(String(e)));
const allLogs = [];
page.on("console", (m) => {
  const t = m.text();
  allLogs.push(`${m.type()}:${t.slice(0, 90)}`);
  if (t.includes("[cooldown]")) console.log("BROWSER:", t);
  if (t.includes("[verify]") || t.includes("[secure]")) console.log("MARK:", t.slice(0, 90));
  if (m.type() === "error" && !/Failed to load resource|reown|web3modal|walletconnect/i.test(t)) errs.push(t);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("uncaughtException", (e) => {
  console.error("FATAL:", String(e).split("\n").slice(0, 4).join(" | "));
  Promise.all([
    page.locator("[data-testid='send-email-code']").count().catch(() => -1),
    page.locator("[data-testid='captcha-track']").count().catch(() => -1),
    page.locator("[data-testid='send-email-code']").textContent().catch(() => "-"),
    page.url(),
    page.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => "-"),
    page.screenshot({ path: "/tmp/ab-fail.png" }).catch(() => {}),
  ]).then(([nSend, nTrack, t, u, body]) => { console.log("COUNTS send/track:", nSend, nTrack); console.log("SEND-BTN text:", t); console.log("URL:", u); console.log("BODY:", String(body).replace(/\n/g, "|").slice(0, 280)); })
    .catch(() => {})
    .finally(() => setTimeout(() => { browser.close().catch(() => {}); process.exit(1); }, 500));
});
process.on("unhandledRejection", (e) => console.error("REJECTION:", String(e).slice(0, 120)));
const bodyText = () => page.evaluate(() => document.body.innerText);
async function openGate() {
  if (!(await page.locator("[data-testid='captcha-track']").count())) {
    try { await page.click("[data-testid='wallet-withdraw-toggle']", { timeout: 3000 }); } catch {}
    for (let i = 0; i < 10 && !(await page.locator("[data-testid='captcha-track']").count()); i++) {
      await sleep(800);
      try { await page.click("[data-testid='wallet-withdraw-toggle']", { timeout: 2000 }); } catch {}
    }
  }
  await page.waitForSelector("[data-testid='captcha-track']", { timeout: 15000 });
}

// 自愈前置：无论网关当前状态如何，先把 user1 地址簿重置为两笔种子
{
  const login = await fetch(`${"http://localhost:8787"}/api/v1/user/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "user1", password: "User@123" }),
  }).then((r) => r.json());
  const tk = login.data.access_token;
  const H = { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" };
  const cur = await fetch("http://localhost:8787/api/v1/futures/wallet/address-book", { headers: H }).then((r) => r.json());
  for (const e of cur.data?.entries ?? []) {
    await fetch(`http://localhost:8787/api/v1/futures/wallet/address-book/${e.id}`, { method: "DELETE", headers: H });
  }
  for (const a of [
    { asset: "USDT", network: "TRC20", label: "MetaMask-ERC20", address: "0x8Ba1f109551bD432803012645Ac136ddd64DBA72" },
    { asset: "USDT", network: "TRC20", label: "冷钱包", address: "TXk8L2nPQ7sYvVrH4mZcJd9Rt3UqWbNp6KgYuF5wTz" },
  ]) {
    await fetch("http://localhost:8787/api/v1/futures/wallet/address-book", { method: "POST", headers: H, body: JSON.stringify(a) });
  }
  console.log("BOOK reseeded ✓");
}

await page.goto(`${BASE}/#/login`);
await page.fill("input[placeholder='user1']", "user1");
await page.fill("input[type='password']", "User@123");
await page.click("form button:last-of-type");
await page.waitForFunction(() => location.hash !== "#/login", null, { timeout: 8000 });

await page.goto(`${BASE}/#/wallet`);
await page.waitForSelector("[data-testid='wallet-withdraw-toggle']");
await openGate();

// 安全验证：滑块 + 邮箱码
{
  const track = await page.locator("[data-testid='captcha-track']").boundingBox();
  const handle = await page.locator("[data-testid='captcha-handle']").boundingBox();
  await page.mouse.move(handle.x + 22, handle.y + 22);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(track.x + 22 + ((track.width - 28) * i) / 8, handle.y + 22);
  await page.mouse.up();
  await page.click("[data-testid='captcha-next']");
  await page.click("[data-testid='verify-tab-email']");
  await page.click("[data-testid='send-email-code']");
  await page.waitForFunction(() => /演示[:：]\s*\d{6}|demo[:]\s*\d{6}/i.test(document.body.innerText), null, { timeout: 5000 });
  const code = (await bodyText()).match(/(?:演示|demo)[:：]\s*(\d{6})/i)[1];
  await page.fill("[data-testid='verify-code-input']", code);
  await page.click("[data-testid='verify-submit']");
  await sleep(600);
  console.log("VERIFY gate passed ✓");
}

const form = page.locator(".card .card").last(); // 提现表单卡片
const addrInput = page.locator("input[placeholder*='链上地址']").last();
const submitBtn = page.locator("button.primary").last();

// ① 白名单提示 + chips
const abState = await page.evaluate(async () => {
  const r = await fetch("/api/v1/futures/wallet/address-book", { headers: { Authorization: `Bearer ${localStorage.getItem("cx_access_token")}` } });
  const d = await r.json();
  return { n: d.data?.entries?.length, wl: d.data?.whitelist_active };
});
console.log("AB-STATE:", JSON.stringify(abState));
await sleep(400);
console.log("FORM inputs:", await page.locator("input[placeholder*='链上地址']").count(),
  "| chips el:", await page.locator("[data-testid='withdraw-book-chips']").count(),
  "| body has 簿:", (await bodyText()).includes("提现地址簿"),
  "| body has 白名单:", (await bodyText()).includes("白名单"));
await page.waitForSelector("[data-testid='withdraw-whitelist-hint']");
console.log(`WHITELIST hint ✓`);
let chips = await page.locator("[data-testid='withdraw-book-chips'] button").count();
console.log(`BOOK chips=${chips} ${chips >= 2 ? "✓" : "✗"}`);

// 资产与数量
await page.fill("input[list='asset-options']", "USDT");
await page.fill("input[inputmode='decimal']", "10");

// ② 簿外地址被拒
await addrInput.fill("0x1111111111111111111111111111111111111111");
await submitBtn.click();
await sleep(1500);
console.log(`NON-WHITELIST rejected=${(await bodyText()).includes("白名单内") ? "✓" : "✗"}`);

// ③ chip 一键填充（第一枚 = 冷钱包 TRC20）
await page.locator("[data-testid='withdraw-book-chips'] button").first().click();
await sleep(500);
const filled = await addrInput.inputValue();
console.log(`CHIP fill=${filled.startsWith("TXk8L2") ? "✓" : `✗(${filled.slice(0, 8)})`}`);

// ④ 保存新地址 0x2222 → chips 3
await addrInput.fill("");
await addrInput.fill("0x2222222222222222222222222222222222222222");
await sleep(300);
await page.locator("button:has-text('保存到地址簿')").first().click();
await sleep(900);
chips = await page.locator("[data-testid='withdraw-book-chips'] button").count();
console.log(`SAVE to book chips=${chips} ${chips >= 3 ? "✓" : "✗"}`);

// ⑤ 清空簿 → 白名单关闭 → 首次使用核对
await page.evaluate(async () => {
  const token = localStorage.getItem("cx_access_token");
  const r = await fetch("/api/v1/futures/wallet/address-book", { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();
  for (const e of d.data?.entries ?? []) {
    await fetch(`/api/v1/futures/wallet/address-book/${e.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  }
});
await sleep(500);

// 白名单关闭后需重载页面让前端重新拉取地址簿；重新打开表单会再次触发安全验证门
await page.reload();
await page.waitForSelector("[data-testid='wallet-withdraw-toggle']");
await openGate();
{
  const track = await page.locator("[data-testid='captcha-track']").boundingBox();
  const handle = await page.locator("[data-testid='captcha-handle']").boundingBox();
  await page.mouse.move(handle.x + 22, handle.y + 22);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(track.x + 22 + ((track.width - 28) * i) / 8, handle.y + 22);
  await page.mouse.up();
  await page.click("[data-testid='captcha-next']");
  await page.click("[data-testid='verify-tab-email']");
  await sleep(300);
    const btn2 = page.locator("[data-testid='send-email-code']");
  console.log("GATE2 send btn:", JSON.stringify(await btn2.textContent()), "disabled:", await btn2.isDisabled());
  try {
    await btn2.click({ timeout: 8000 });
  } catch {
    console.log("GATE2 CLICK FAIL, retry after wait");
    await sleep(3000);
    await btn2.click({ timeout: 10000 });
  }
  await page.waitForFunction(() => /演示[:：]\s*\d{6}|demo[:]\s*\d{6}/i.test(document.body.innerText), null, { timeout: 6000 });
  const code = (await bodyText()).match(/(?:演示|demo)[:：]\s*(\d{6})/i)[1];
  await page.fill("[data-testid='verify-code-input']", code);
  await page.click("[data-testid='verify-submit']");
  await sleep(600);
  console.log("VERIFY gate#2 passed ✓");
}
const hintGone = (await page.locator("[data-testid='withdraw-whitelist-hint']").count()) === 0;
console.log(`WHITELIST OFF after clear=${hintGone ? "✓" : "✗"}`);

// 首次使用核对流程（reload 后需重填资产/数量）
const addr2 = page.locator("input[placeholder*='链上地址']").last();
const submit2 = page.locator("button.primary").last();
await page.fill("input[list='asset-options']", "USDT");
await page.fill("input[inputmode='decimal']", "10");
await addr2.fill("0x3333333333333333333333333333333333333333");
await sleep(400);
const chk = page.locator("[data-testid='withdraw-first-confirm']");
console.log(`FIRST-USE checkbox=${(await chk.count()) === 1 ? "✓" : "✗"}`);
if ((await chk.count()) === 1) {
  await submit2.click();
  await sleep(1500);
  const errsOnPage = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[class*='error']")).map((e) => e.textContent?.trim() ?? "").filter(Boolean)
  );
  console.log(`UNTICKED blocked=${errsOnPage.some((t) => t.includes("勾选核对")) ? "✓" : "✗"}`);
  await chk.locator("input[type='checkbox']").check();
  console.log(`TICKED confirm ✓`);
}
console.log(`JS ERRORS: ${errs.length}`, errs.slice(0, 3));
await browser.close();
