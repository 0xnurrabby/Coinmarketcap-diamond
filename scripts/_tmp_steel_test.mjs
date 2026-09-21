import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/^STEEL_API_KEY=(.+)$/m)?.[1]?.trim();

const createRes = await fetch("https://api.steel.dev/v1/sessions", {
  method: "POST",
  headers: { "steel-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({
    timeout: 600_000,
    inactivityTimeout: 300_000,
    headless: false,
    dimensions: { width: 1280, height: 900 },
  }),
});
console.log("create status:", createRes.status);
const raw = await createRes.text();
if (!createRes.ok) {
  console.log("create body:", raw.slice(0, 500));
  process.exit(1);
}
const steel = JSON.parse(raw);
console.log("session id:", steel.id);
console.log("viewer:", steel.sessionViewerUrl);

const ctxRes = await fetch(`https://api.steel.dev/v1/sessions/${steel.id}/context`, {
  headers: { "steel-api-key": key },
});
console.log("context status:", ctxRes.status);
const ctx = await ctxRes.text();
console.log("context body:", ctx.slice(0, 600));

const browser = await chromium.connectOverCDP(
  `${steel.websocketUrl}${steel.websocketUrl.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(key)}`
);
const context = browser.contexts()[0] || (await browser.newContext());
const page = context.pages()[0] || (await context.newPage());
const resp = await page.goto("https://coinmarketcap.com/account/login/", {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
console.log("goto status:", resp?.status(), "url:", page.url());
console.log("title:", await page.title());

const cookies = await context.cookies();
const cmc = cookies.filter((c) => String(c.domain).includes("coinmarketcap"));
console.log("cmc cookies after load:", cmc.map((c) => c.name).join(", ") || "none");

await browser.close();

const ctx2 = await fetch(`https://api.steel.dev/v1/sessions/${steel.id}/context`, {
  headers: { "steel-api-key": key },
});
console.log("context2 status:", ctx2.status, "body:", (await ctx2.text()).slice(0, 800));

await fetch(`https://api.steel.dev/v1/sessions/${steel.id}/release`, {
  method: "POST",
  headers: { "steel-api-key": key, "content-type": "application/json" },
  body: "{}",
});
console.log("released");
