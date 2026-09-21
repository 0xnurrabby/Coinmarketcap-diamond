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

const base = "https://coinmarketcap-diamond.onrender.com";
const cookie = `dc_site=${site}; dc_user=${token}`;

const t = Date.now();
const res = await fetch(`${base}/api/accounts/refresh`, {
  method: "POST",
  headers: { cookie },
  signal: AbortSignal.timeout(280000),
});
console.log(
  `POST /api/accounts/refresh -> ${res.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`
);
console.log((await res.text()).slice(0, 400));

const after = (await sql`SELECT name, status, diamonds, streak, last_error FROM cmc_accounts LIMIT 1`)[0];
console.log("DB:", JSON.stringify(after));
