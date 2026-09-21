import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const key = process.env.RENDER_API_KEY;
const id = "srv-daokfr6gekts73cl40l0";
const h = {
  Authorization: `Bearer ${key}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

const vars = [
  { key: "PORT", value: "10000" },
  { key: "NODE_VERSION", value: "22" },
  { key: "PLAYWRIGHT_BROWSERS_PATH", value: "0" },
  { key: "DATABASE_URL", value: get("DATABASE_URL") },
  { key: "AUTH_SECRET", value: get("AUTH_SECRET") },
  { key: "SITE_PASSWORD", value: get("SITE_PASSWORD") },
  { key: "ADMIN_EMAILS", value: get("ADMIN_EMAILS") },
  { key: "RESEND_API_KEY", value: get("RESEND_API_KEY") },
  { key: "EMAIL_FROM", value: get("EMAIL_FROM") },
  { key: "CRON_SECRET", value: "dcr_uyurt7encjts13g26a" },
];

const put = await fetch(`https://api.render.com/v1/services/${id}/env-vars`, {
  method: "PUT",
  headers: h,
  body: JSON.stringify(vars),
});
console.log("env-vars PUT:", put.status, (await put.text()).slice(0, 120));

const patch = await fetch(`https://api.render.com/v1/services/${id}`, {
  method: "PATCH",
  headers: h,
  body: JSON.stringify({
    serviceDetails: {
      envSpecificDetails: {
        buildCommand:
          "npm install && npx playwright-core install chromium && npm run build",
        startCommand: "npm start",
      },
    },
  }),
});
console.log("service PATCH:", patch.status, (await patch.text()).slice(0, 200));

const svc = await fetch(`https://api.render.com/v1/services/${id}`, { headers: h });
const s = await svc.json();
console.log("build:", s.serviceDetails?.envSpecificDetails?.buildCommand);

const deploy = await fetch(`https://api.render.com/v1/services/${id}/deploys`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ clearCache: "clear" }),
});
console.log("deploy trigger:", deploy.status);
