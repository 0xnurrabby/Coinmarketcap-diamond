import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const key = env.match(/^STEEL_API_KEY=(.+)$/m)?.[1]?.trim();

async function steel(path, init = {}) {
  const res = await fetch(`https://api.steel.dev/v1${path}`, {
    ...init,
    headers: { "steel-api-key": key, "content-type": "application/json", ...(init.headers || {}) },
  });
  return { status: res.status, text: await res.text() };
}

const created = await steel("/sessions", {
  method: "POST",
  body: JSON.stringify({ timeout: 600_000, inactivityTimeout: 300_000, headless: false }),
});
const steelSession = JSON.parse(created.text);
console.log("created:", created.status, steelSession.id);

const browser = await chromium.connectOverCDP(
  `${steelSession.websocketUrl}${steelSession.websocketUrl.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(key)}`
);
const context = browser.contexts()[0] || (await browser.newContext());
const page = context.pages()[0] || (await context.newPage());

const resp = await page.goto("https://coinmarketcap.com/", { waitUntil: "domcontentloaded", timeout: 90_000 });
console.log("home status:", resp?.status(), "url:", page.url(), "title:", await page.title());

const links = await page.evaluate(() =>
  Array.from(document.querySelectorAll("a"))
    .map((a) => a.getAttribute("href") || "")
    .filter((h) => /log-?in|sign-?in|account/i.test(h))
    .slice(0, 12)
);
console.log("login-ish links:", JSON.stringify(links));

const cookies = await context.cookies();
const cmc = cookies.filter((c) => String(c.domain).includes("coinmarketcap"));
console.log("cmc cookies via CDP:", cmc.map((c) => c.name).join(", ") || "none");

await new Promise((r) => setTimeout(r, 4000));
const ctx = await steel(`/sessions/${steelSession.id}/context`);
console.log("context:", ctx.status, ctx.text.slice(0, 1200));

await browser.close();
await steel(`/sessions/${steelSession.id}/release`, { method: "POST", body: "{}" });
console.log("released");
