import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const password = env.match(/^SITE_PASSWORD=(.+)$/m)?.[1]?.trim();
const base = "https://coinmarketcap-diamond.onrender.com";

const t = Date.now();
const gate = await fetch(`${base}/api/site-gate`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password }),
});
const setCookie = gate.headers.get("set-cookie") || "";
console.log(
  `POST /api/site-gate -> ${gate.status} in ${((Date.now() - t) / 1000).toFixed(1)}s`
);
console.log("  cookie:", setCookie.split(";")[0]);
console.log("  body:", (await gate.text()).slice(0, 120));

const cookie = setCookie.split(";")[0];

for (const path of ["/login", "/register", "/gate"]) {
  const t2 = Date.now();
  const r = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
  const text = await r.text();
  console.log(
    `${path} -> ${r.status} in ${((Date.now() - t2) / 1000).toFixed(2)}s | ${text.includes("DiamondClaim") ? "renders DiamondClaim ✓" : text.slice(0, 60)}`
  );
}
