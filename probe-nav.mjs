import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();

for (const [name, hash] of [["HOME", "#/home"], ["FUTURES", "#/futures"]]) {
  await page.goto(`http://localhost:5173/${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({
    nav: document.querySelector("header nav")?.innerText.replace(/\n/g, " "),
    loginRedirect: location.hash.includes("login"),
    forbidden: document.body.innerText.includes("403"),
    snippet: document.body.innerText.replace(/\n+/g, " | ").slice(0, 150),
  }));
  console.log(`${name}: redirect=${state.loginRedirect} forbidden=${state.forbidden}`);
  console.log(`  nav=${JSON.stringify(state.nav)}`);
  console.log(`  body=${state.snippet}`);
}
await browser.close();
