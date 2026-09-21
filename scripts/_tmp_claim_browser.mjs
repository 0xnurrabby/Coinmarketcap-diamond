import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { chromium } from "playwright-core";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim());
const acc = (await sql`SELECT id, name, cookies_json, diamonds FROM cmc_accounts LIMIT 1`)[0];
const cookies = JSON.parse(acc.cookies_json);
console.log("account:", acc.name, "diamonds:", acc.diamonds);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 900 },
});
await context.addCookies(
  cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain?.startsWith(".") ? c.domain : c.domain || ".coinmarketcap.com",
    path: c.path || "/",
    httpOnly: Boolean(c.httpOnly),
    secure: c.secure !== false,
  }))
);

const page = await context.newPage();
const apiCalls = [];
page.on("response", async (res) => {
  const u = res.url();
  if (/loyalty|diamond|check-?in|auth\/v/i.test(u) && !/\.(js|css|png|svg|woff)/.test(u)) {
    apiCalls.push({ status: res.status(), url: u, method: res.request().method() });
  }
});

await page.goto("https://coinmarketcap.com/account/my-diamonds/", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(6000);

const text = await page.evaluate(() => document.body.innerText);
console.log("\n--- visible page text (diamonds area) ---");
const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
console.log(lines.slice(0, 60).join(" | "));

console.log("\n--- buttons ---");
console.log(await page.evaluate(() => Array.from(document.querySelectorAll("button")).map((b) => (b.textContent || "").trim()).filter(Boolean).slice(0, 30).join(" | ")));

console.log("\n--- loyalty API calls the page made ---");
console.log(JSON.stringify(apiCalls, null, 2));

const inPage = await page.evaluate(async () => {
  const out = {};
  try {
    const r = await fetch("https://api.coinmarketcap.com/asset/v3/loyalty/check-in", {
      method: "POST",
      headers: { "content-type": "application/json", platform: "web", accept: "application/json, text/plain, */*" },
      credentials: "include",
      body: "{}",
    });
    out.checkin = { status: r.status, body: (await r.text()).slice(0, 300) };
  } catch (e) {
    out.checkin = { error: String(e) };
  }
  return out;
});
console.log("\n--- in-page check-in ---");
console.log(JSON.stringify(inPage, null, 2));

await browser.close();
