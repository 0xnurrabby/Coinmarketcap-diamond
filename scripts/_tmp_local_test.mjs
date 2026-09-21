import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";
import { chromium } from "playwright-core";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const secret = new TextEncoder().encode(get("AUTH_SECRET"));
const sql = neon(get("DATABASE_URL"));

const user = (await sql`SELECT id, email FROM users LIMIT 1`)[0];
const userToken = await new SignJWT({ sub: user.id, email: user.email, role: "admin" })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(secret);
const siteToken = await new SignJWT({ site: true })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(secret);
const cookie = `dc_site=${siteToken}; dc_user=${userToken}`;
const base = "http://localhost:6464";

async function api(method, path, body) {
  const started = Date.now();
  const res = await fetch(base + path, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, secs: ((Date.now() - started) / 1000).toFixed(1) };
}

const created = await api("POST", "/api/accounts", { name: "Local Login Test" });
const id = created.data.account.id;
console.log(`create account: ${created.status} in ${created.secs}s -> ${id}`);

const login = await api("POST", `/api/accounts/${id}/login`);
console.log(`login: ${login.status} in ${login.secs}s`);
console.log("  ", JSON.stringify(login.data));

for (let i = 0; i < 5; i++) {
  await new Promise((r) => setTimeout(r, 4000));
  const st = await api("GET", `/api/accounts/${id}/login`);
  console.log(`poll ${i + 1}: ${st.secs}s`, JSON.stringify(st.data));
}

const release = await api("DELETE", `/api/accounts/${id}/login`);
console.log(`release: ${release.status} in ${release.secs}s`);

const del = await api("DELETE", `/api/accounts/${id}`);
console.log(`delete account: ${del.status}`);

console.log("\n--- page speed in a clean browser profile ---");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
await context.addCookies([
  { name: "dc_user", value: userToken, domain: "localhost", path: "/" },
  { name: "dc_site", value: siteToken, domain: "localhost", path: "/" },
]);
const page = await context.newPage();
for (const path of ["/dashboard", "/accounts", "/activity"]) {
  const t = Date.now();
  await page.goto(base + path, { waitUntil: "networkidle" });
  console.log(`${path}: ${((Date.now() - t) / 1000).toFixed(2)}s`);
}
await browser.close();
console.log("done");
