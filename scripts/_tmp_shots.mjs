import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";
import { chromium } from "playwright-core";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const secret = new TextEncoder().encode(get("AUTH_SECRET"));
const sql = neon(get("DATABASE_URL"));
const user = (await sql`SELECT id, email FROM users LIMIT 1`)[0];

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
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([
  { name: "dc_user", value: token, domain: "localhost", path: "/" },
  { name: "dc_site", value: site, domain: "localhost", path: "/" },
]);
const page = await context.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));

for (const [path, file] of [
  ["/dashboard", "shot-dashboard.png"],
  ["/activity", "shot-activity.png"],
  ["/accounts", "shot-accounts.png"],
]) {
  const t = Date.now();
  await page.goto("http://localhost:6464" + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `C:/Users/Nur/AppData/Local/Temp/opencode/${file}`,
    fullPage: true,
  });
  console.log(`${path}: loaded in ${((Date.now() - t) / 1000).toFixed(2)}s`);
}

console.log("console errors:", errors.length ? errors.join("\n") : "none");
await browser.close();
