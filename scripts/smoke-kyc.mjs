// KYC 冒烟（单用户 user1，重启 gateway 保证干净）：
// ① 尾号000 → 10s 后驳回+原因+重新认证按钮 ② 重新提交正常证件号 → pending → 通过+权益
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
console.log("LOGIN ok");

async function fillAndSubmit(idNumber) {
  await page.goto(`${BASE}/#/kyc`);
  await page.waitForSelector("[data-testid='kyc-form']", { timeout: 8000 });
  await page.fill("[data-testid='kyc-form'] input[placeholder='ZHANG SAN']", "ZHANG SAN");
  const inputs = page.locator("[data-testid='kyc-form'] input:not([placeholder='ZHANG SAN'])");
  await inputs.last().fill(idNumber);
  await page.click("[data-testid='kyc-form'] button:has-text('下一步')");
  await page.waitForSelector("[data-testid='kyc-upload']", { timeout: 4000 });
  const fileInputs = page.locator("[data-testid='kyc-upload'] input[type='file']");
  const n = await fileInputs.count();
  const buf = Buffer.from("fake-image-data");
  for (let i = 0; i < n; i++) await fileInputs.nth(i).setInputFiles({ name: `doc${i}.png`, mimeType: "image/png", buffer: buf });
  if (n > 0) console.log(`UPLOAD docs=${n} ✓`);
  else { console.log("UPLOAD no file inputs ✗"); return false; }
  await page.click("[data-testid='kyc-upload'] button:has-text('下一步')");
  await page.waitForSelector("[data-testid='kyc-face']", { timeout: 4000 });
  await page.click("[data-testid='kyc-face-start']");
  await page.click("[data-testid='kyc-submit']");
  await sleep(500);
  return true;
}

// ---- 权益对比表（未认证向导页）----
await page.goto(`${BASE}/#/kyc`);
await page.waitForSelector("[data-testid='kyc-form']", { timeout: 8000 });
const cmpRows0 = await page.locator("[data-testid='kyc-compare'] tbody tr").count();
console.log(`COMPARE table rows=${cmpRows0} ${cmpRows0 === 3 ? "✓" : "✗"}`);

// ---- 分支1：驳回 ----
if (await fillAndSubmit("11010119900101000")) {
  await page.waitForSelector("[data-testid='kyc-reject-reason']", { timeout: 16000 });
  const reason = await page.locator("[data-testid='kyc-reject-reason']").textContent();
  console.log(`REJECT reason="${reason?.trim().slice(0, 24)}…" ✓`);
  const hasBtn = (await page.locator("[data-testid='kyc-resubmit']").count()) === 1;
  console.log(`RESUBMIT button=${hasBtn ? "✓" : "✗"}`);
  // ---- 分支2：重新提交 → 通过 ----
  await page.click("[data-testid='kyc-resubmit']");
  if (await fillAndSubmit("110101199001011234")) {
    await page.waitForFunction(() => document.body.innerText.includes("等待审核"), null, { timeout: 6000 }).catch(() => {});
    const pending = await page.evaluate(() => document.body.innerText.includes("等待审核"));
    console.log(`RESUBMIT → pending shown=${pending} ${pending ? "✓" : "✗"}`);
    await page.waitForSelector("[data-testid='limit-withdraw']", { timeout: 18000 });
    const limitTxt = await page.locator("[data-testid='limit-withdraw']").textContent();
    console.log(`APPROVED limit="${limitTxt}" ${limitTxt?.includes("50,000") ? "✓" : "✗"}`);
  }
}
console.log(`JS ERRORS: ${errs.length}`, errs.slice(0, 3));
await browser.close();
