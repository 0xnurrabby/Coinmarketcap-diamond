import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const sql = neon(env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim());
const acc = (await sql`SELECT id, name, cookies_json, diamonds FROM cmc_accounts LIMIT 1`)[0];
const cookies = JSON.parse(acc.cookies_json);
console.log("account:", acc.name, "db diamonds:", acc.diamonds);

const cookieMap = new Map(cookies.map((c) => [c.name, c.value]));
const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const csrf = cookieMap.get("x-csrf-token") || "";

const headers = {
  cookie: header,
  "x-csrf-token": csrf,
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  "accept-language": "en-US,en;q=0.9",
  origin: "https://coinmarketcap.com",
  referer: "https://coinmarketcap.com/account/my-diamonds/",
  platform: "web",
  "content-type": "application/json",
};

async function post(path, body = {}) {
  const res = await fetch(`https://api.coinmarketcap.com${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\nPOST ${path}\n  status=${res.status}\n  ${text.slice(0, 400)}`);
  return text;
}

await post("/user-info/v3/user-info/get");
await post("/asset/v3/loyalty/user-point-summary");
await post("/asset/v3/loyalty/latest-check-in-logs");
await post("/asset/v3/loyalty/check-in/", { platform: "web" });
await post("/asset/v3/loyalty/user-point-summary");
