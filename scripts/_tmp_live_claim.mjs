import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";

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
const cookie = `dc_site=${site}; dc_user=${token}`;
const base = "https://coinmarketcap-diamond.onrender.com";

const t = Date.now();
const res = await fetch(`${base}/api/accounts/refresh`, {
  method: "POST",
  headers: { cookie },
  signal: AbortSignal.timeout(280000),
});
console.log(
  `POST /api/accounts/refresh -> ${res.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`
);
console.log((await res.text()).slice(0, 500));

const after = await sql`SELECT name, status, diamonds, streak, last_error FROM cmc_accounts LIMIT 1`;
console.log("DB:", JSON.stringify(after));

const loginAttempt = await fetch(`${base}/api/accounts/${after[0] ? (await sql`SELECT id FROM cmc_accounts LIMIT 1`)[0].id : ""}/login`, {
  method: "POST",
  headers: { cookie },
});
console.log(`POST /login (hosted) -> ${loginAttempt.status}`);
console.log((await loginAttempt.text()).slice(0, 250));
