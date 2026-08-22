import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage();
await p.goto("http://localhost:5173/#/login");
await p.fill("input[placeholder='user1']", "user1");
await p.fill("input[type='password']", "User@123");
await p.click("form button:last-of-type");
await p.waitForFunction(() => location.hash !== "#/login");
await new Promise(r => setTimeout(r, 1200));
// 导航项统计
const navTexts = await p.locator("nav a, nav button").allInnerTexts();
const wealthCount = navTexts.filter(t => t.trim() === "理财").length;
console.log(`NAV 理财 count=${wealthCount} ${wealthCount === 1 ? "✓" : "✗"}`, JSON.stringify(navTexts));
// /earn 路由已删 → 回退首页
await p.goto("http://localhost:5173/#/earn");
await p.reload();
await new Promise(r => setTimeout(r, 1500));
console.log(`/earn fallback hash=${await p.evaluate(() => location.hash)} ${!/earn/.test(await p.evaluate(() => location.hash)) || (await p.locator("body").innerText()).includes("404") ? "(页面移除)" : "?"}`);
// 语言下拉
await p.locator("[data-testid='lang-trigger']").click();
await p.locator("[data-testid='lang-dropdown']").waitFor({ timeout: 3000 });
const ddTxt = await p.locator("[data-testid='lang-dropdown']").innerText();
const okLang = /语言|Language/i.test(ddTxt) && ddTxt.includes("简体中文") && ddTxt.includes("日本語");
console.log(`LANG dropdown ${okLang ? "✓" : "✗"}`, JSON.stringify(ddTxt.slice(0, 80)));
// 切英文再切回
await p.locator("[data-testid='lang-dropdown'] button", { hasText: "English" }).click();
await new Promise(r => setTimeout(r, 800));
const enNav = await p.locator("nav a, nav button").allInnerTexts();
console.log(`SWITCH EN ${(enNav.some(t => t.includes("Wealth")) && !enNav.filter(t=>t.trim()==="Wealth").length || enNav.filter(t => t.trim() === "Earn").length === 0) ? "✓" : "?"}`, JSON.stringify(enNav.slice(0, 12)));
await b.close();
