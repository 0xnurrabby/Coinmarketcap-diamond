import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const sql = neon(get("DATABASE_URL"));

const email = "upload-test@example.com";
const password = "test1234";
const hash = await bcrypt.hash(password, 12);

await sql`DELETE FROM cmc_accounts WHERE user_id IN (SELECT id FROM users WHERE email = ${email})`;
await sql`DELETE FROM users WHERE email = ${email}`;
const userId = randomUUID();
await sql`
  INSERT INTO users (id, email, password_hash, role, email_verified)
  VALUES (${userId}, ${email}, ${hash}, 'user', TRUE)
`;
console.log("temp user created:", email, password);

const cookies = [
  { name: "cmc-language", value: "en", domain: ".coinmarketcap.com", path: "/" },
  { name: "x-csrf-token", value: "dummy-csrf", domain: ".coinmarketcap.com", path: "/" },
  { name: "Authorization", value: "dummy-token", domain: ".coinmarketcap.com", path: "/" },
  { name: "u-prod", value: "dummy-user", domain: ".coinmarketcap.com", path: "/" },
];

const t = Date.now();
const res = await fetch("http://127.0.0.1:17865/api/upload", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    apiBase: "http://localhost:6464",
    sitePassword: get("SITE_PASSWORD"),
    email,
    password,
    accountName: "Upload Test",
    cookiesJson: JSON.stringify(cookies),
  }),
});
console.log(`upload -> ${res.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`);
console.log((await res.text()).slice(0, 400));

const acc = await sql`SELECT id, name, status, diamonds FROM cmc_accounts WHERE user_id = ${userId}`;
console.log("account in app:", JSON.stringify(acc));

for (const a of acc) {
  await sql`DELETE FROM activities WHERE account_id = ${a.id}`;
  await sql`DELETE FROM cmc_accounts WHERE id = ${a.id}`;
}
await sql`DELETE FROM users WHERE id = ${userId}`;
console.log("cleaned up temp user + account");
