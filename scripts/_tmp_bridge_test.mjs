import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";
import { chromium } from "playwright-core";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const secret = new TextEncoder().encode(get("AUTH_SECRET"));
const sql = neon(get("DATABASE_URL"));
const user = (await sql`SELECT id, email FROM users WHERE email = 'nurrabby01.bd@gmail.com'`)[0];
const acc = (await sql`SELECT id, name FROM cmc_accounts WHERE user_id = ${user.id} LIMIT 1`)[0];
console.log("account:", acc?.id, acc?.name);

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
  { name: "dc_user", value: token, domain: "localhost", path: "/" },
  { name: "dc_site", value: site, domain: "localhost", path: "/" },
]);
const page = await context.newPage();

console.log("opening local app with ?login= param (a Chrome window should open)");
await page.goto(`http://localhost:6464/accounts?login=${acc.id}`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(12000);

const modal = await page
  .locator("text=Waiting for login")
  .first()
  .textContent()
  .catch(() => null);
console.log("modal:", modal);

const status = await fetch(`http://localhost:6464/api/accounts/${acc.id}/login`, {
  headers: { cookie: `dc_site=${site}; dc_user=${token}` },
});
console.log("status:", (await status.text()).slice(0, 200));

const cancel = await fetch(`http://localhost:6464/api/accounts/${acc.id}/login`, {
  method: "DELETE",
  headers: { cookie: `dc_site=${site}; dc_user=${token}` },
});
console.log("closed window:", cancel.status);
await browser.close();
