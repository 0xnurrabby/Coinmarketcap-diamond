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
const base = "http://localhost:6464";

const acc = (await sql`SELECT id, name, diamonds FROM cmc_accounts LIMIT 1`)[0];
console.log("account:", acc.name, "db diamonds:", acc.diamonds);

async function call(method, path) {
  const t = Date.now();
  const res = await fetch(base + path, { method, headers: { cookie }, signal: AbortSignal.timeout(180000) });
  const text = await res.text();
  console.log(`${method} ${path} -> ${res.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  console.log("  ", text.slice(0, 400));
}

await call("POST", `/api/accounts/${acc.id}/claim`);
await call("POST", "/api/claim-all");

const after = (await sql`SELECT name, status, diamonds, streak, claimed_date, last_error FROM cmc_accounts LIMIT 1`)[0];
console.log("\nDB after:", JSON.stringify(after));
const act = await sql`SELECT type, message, diamonds_delta FROM activities ORDER BY created_at DESC LIMIT 4`;
console.log("activity:", JSON.stringify(act));
