import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto("http://127.0.0.1:8080/practice.html", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => document.getElementById("turnInfo")?.textContent?.includes("turn"), { timeout: 60000 });

const turnInfo = await page.locator("#turnInfo").textContent();
console.log("turnInfo", turnInfo);

await page.locator("#submitTurnBtn").click();
await page.waitForTimeout(300);
const msg1 = await page.locator("#message").textContent();
console.log("after empty submit message:", JSON.stringify(msg1));

const rackTiles = await page.locator(".rack .tile").count();
console.log("rack tiles", rackTiles);
console.log("errors", errors);

await browser.close();
