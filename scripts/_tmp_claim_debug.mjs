import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
const sql = neon(url);

const acc = (await sql`SELECT id, name, cookies_json, diamonds FROM cmc_accounts LIMIT 1`)[0];
console.log("account:", acc.name, "diamonds:", acc.diamonds);
const cookies = JSON.parse(acc.cookies_json);
console.log("cookies:", cookies.map((c) => c.name).join(", "));

const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const headers = {
  cookie: header,
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  accept: "application/json, text/plain, */*",
  origin: "https://coinmarketcap.com",
  referer: "https://coinmarketcap.com/account/my-diamonds/",
  platform: "web",
};

async function show(method, u, body) {
  try {
    const res = await fetch(u, {
      method,
      headers: {
        ...headers,
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: method === "POST" ? body ?? "{}" : undefined,
    });
    const text = await res.text();
    console.log(`\n${method} ${u}\n  status=${res.status}\n  ${text.slice(0, 350).replace(/\n/g, " ")}`);
    return { status: res.status, text };
  } catch (e) {
    console.log(`\n${method} ${u}\n  ERR ${e.message}`);
    return { status: 0, text: "" };
  }
}

await show("GET", "https://coinmarketcap.com/account/my-diamonds/");
await show("GET", "https://api.coinmarketcap.com/asset/v3/loyalty/my-diamonds");
await show("POST", "https://api.coinmarketcap.com/asset/v3/loyalty/check-in");
await show("POST", "https://api.coinmarketcap.com/asset/v3/loyalty/daily-check-in");

const html = await fetch("https://coinmarketcap.com/account/my-diamonds/", { headers }).then((r) => r.text());
for (const re of [/already collected/i, /already claimed/i, /come back tomorrow/i, /claimed today/i, /next claim/i, /Log In to Collect/i, /totalDiamonds/i]) {
  const m = html.match(re);
  console.log(`html match ${re}: ${m ? JSON.stringify(m[0]) : "no"}`);
}
const idx = html.search(/next claim|come back|already/i);
console.log("context:", idx >= 0 ? html.slice(Math.max(0, idx - 150), idx + 150).replace(/\s+/g, " ") : "none");
