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

for (const path of ["/api/stats", "/api/activity?limit=3", "/api/auth/me"]) {
  const r = await fetch("http://localhost:6464" + path, {
    headers: { cookie: `dc_site=${site}; dc_user=${token}` },
  });
  const t = await r.text();
  console.log(`${path} -> ${r.status} ${t.slice(0, 160)}`);
}
