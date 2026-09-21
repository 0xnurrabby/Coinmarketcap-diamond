import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";
import { chromium } from "playwright-core";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const secret = new TextEncoder().encode(get("AUTH_SECRET"));
const sql = neon(get("DATABASE_URL"));
const user = (await sql`SELECT id, email FROM users WHERE email = 'nurrabby01.bd@gmail.com'`)[0];

const token = await new SignJWT({ sub: user.id, email: user.email, role: "admin" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(secret);
const site = await new SignJWT({ site: true })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(secret);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
await context.addCookies([
  { name: "dc_user", value: token, domain: "coinmarketcap-diamond.onrender.com", path: "/" },
  { name: "dc_site", value: site, domain: "coinmarketcap-diamond.onrender.com", path: "/" },
]);
const page = await context.newPage();
await page.goto("https://coinmarketcap-diamond.onrender.com/dashboard", {
  waitUntil: "networkidle",
});
await page.waitForTimeout(1500);

const loginBtn = page.locator('button:has-text("Login"), button:has-text("Re-login")').first();
console.log("login button found:", await loginBtn.isVisible().catch(() => false));
await loginBtn.click();
await page.waitForTimeout(2000);

const modalText = await page
  .locator("div.fixed")
  .first()
  .innerText()
  .catch(() => null);
console.log("--- modal ---");
console.log(modalText);

const link = await page.locator('a:has-text("Open on my PC")').getAttribute("href").catch(() => null);
console.log("local link:", link);

await page.screenshot({
  path: "C:/Users/Nur/AppData/Local/Temp/opencode/shot-hosted-login.png",
  fullPage: true,
});
await browser.close();
