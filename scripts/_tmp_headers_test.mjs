import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { chromium } from "playwright-core";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim());
const acc = (await sql`SELECT id, name, cookies_json FROM cmc_accounts LIMIT 1`)[0];
const cookies = JSON.parse(acc.cookies_json);
const cookieMap = new Map(cookies.map((c) => [c.name, c.value]));

console.log("=== B) node fetch with full browser headers ===");
const browserHeaders = {
  cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
  "x-csrf-token": cookieMap.get("x-csrf-token") || "",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/json",
  origin: "https://coinmarketcap.com",
  referer: "https://coinmarketcap.com/account/my-diamonds/",
  platform: "web",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  priority: "u=1, i",
};
const r = await fetch("https://api.coinmarketcap.com/asset/v3/loyalty/user-point-summary", {
  method: "POST",
  headers: browserHeaders,
  body: "{}",
});
console.log("node fetch:", r.status, (await r.text()).slice(0, 250));

console.log("\n=== A) inside real browser page ===");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  userAgent: browserHeaders["user-agent"],
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
await page.goto("https://coinmarketcap.com/account/my-diamonds/", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(6000);

const result = await page.evaluate(async () => {
  const csrf = document.cookie
    .split("; ")
    .find((c) => c.startsWith("x-csrf-token="))
    ?.split("=")[1];
  const out = { csrf: csrf ? "found" : "missing" };
  const call = async (path, body) => {
    const res = await fetch(`https://api.coinmarketcap.com${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        platform: "web",
        accept: "application/json, text/plain, */*",
        "x-csrf-token": csrf || "",
      },
      credentials: "include",
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.text()).slice(0, 260) };
  };
  out.pointSummary = await call("/asset/v3/loyalty/user-point-summary", {});
  out.checkIn = await call("/asset/v3/loyalty/check-in/", { platform: "web" });
  out.latestLogs = await call("/asset/v3/loyalty/latest-check-in-logs", {});
  return out;
});
console.log(JSON.stringify(result, null, 2));

const btn = await page.locator('button:has-text("Collect Diamonds")').first().isVisible().catch(() => false);
console.log("collect button still visible:", btn);
await browser.close();
