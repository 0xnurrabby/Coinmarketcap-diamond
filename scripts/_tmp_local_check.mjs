import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const secret = new TextEncoder().encode(get("AUTH_SECRET"));
const sql = neon(get("DATABASE_URL"));
const user = (await sql`SELECT id, email FROM users LIMIT 1`)[0];
const acc = (await sql`SELECT id, name FROM cmc_accounts LIMIT 1`)[0];

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

async function call(method, path) {
  const t = Date.now();
  const res = await fetch(base + path, {
    method,
    headers: { cookie },
    signal: AbortSignal.timeout(120000),
  });
  const text = await res.text();
  console.log(
    `${method} ${path} -> ${res.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`
  );
  console.log("  ", text.slice(0, 300));
}

console.log("account:", acc.name);
await call("POST", `/api/accounts/${acc.id}/claim`);
console.log("\n--- opening login window (Chrome will pop up) ---");
await call("POST", `/api/accounts/${acc.id}/login`);
await new Promise((r) => setTimeout(r, 8000));
await call("GET", `/api/accounts/${acc.id}/login`);
await call("DELETE", `/api/accounts/${acc.id}/login`);
