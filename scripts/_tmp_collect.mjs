import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { chromium } from "playwright-core";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim());
const acc = (await sql`SELECT id, name, cookies_json FROM cmc_accounts LIMIT 1`)[0];
const cookies = JSON.parse(acc.cookies_json);

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
const calls = [];
page.on("request", async (req) => {
  if (!/api\.coinmarketcap\.com/.test(req.url())) return;
  let body = null;
  try {
    body = req.postData();
  } catch {
    /* */
  }
  calls.push({ phase: "req", method: req.method(), url: req.url(), body });
});
page.on("response", async (res) => {
  if (!/api\.coinmarketcap\.com/.test(res.url())) return;
  let text = "";
  try {
    text = (await res.text()).slice(0, 400);
  } catch {
    /* */
  }
  calls.push({ phase: "res", status: res.status(), url: res.url(), text });
});

await page.goto("https://coinmarketcap.com/account/my-diamonds/", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(5000);

const balance = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll("*")).find((e) =>
    /^\d+$/.test((e.textContent || "").trim()) && e.children.length === 0
  );
  return el?.textContent?.trim() || null;
});
console.log("balance-ish element:", balance);

const btn = page.locator('button:has-text("Collect Diamonds")').first();
console.log("collect button visible:", await btn.isVisible().catch(() => false));
await btn.click({ timeout: 15000 }).catch((e) => console.log("click err:", e.message));
await page.waitForTimeout(6000);

const text = await page.evaluate(() => document.body.innerText);
console.log("\n--- after click (diamonds area) ---");
console.log(text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 25).join(" | "));

console.log("\n--- api calls ---");
for (const c of calls) {
  console.log(c.phase === "req" ? `REQ  ${c.method} ${c.url} body=${c.body}` : `RES  ${c.status} ${c.url} ${c.text}`);
}

await browser.close();
