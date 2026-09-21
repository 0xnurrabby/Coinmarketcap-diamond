import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const key = process.env.RENDER_API_KEY;
const ownerId = "tea-daojrurm8hqs73evrcp0";

const cronsSecret = "dcr_" + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 10);
console.log("CRON_SECRET for UptimeRobot:", cronsSecret);

const body = {
  type: "web_service",
  name: "diamondclaim",
  ownerId,
  repo: "https://github.com/0xnurrabby/Coinmarketcap-diamond",
  branch: "main",
  autoDeploy: "no",
  serviceDetails: {
    env: "node",
    region: "singapore",
    plan: "free",
    healthCheckPath: "/gate",
    envSpecificDetails: {
      buildCommand: "npm install && npm run build",
      startCommand: "npm start",
    },
  },
  envVars: [
    { key: "NODE_VERSION", value: "22" },
    { key: "DATABASE_URL", value: get("DATABASE_URL") },
    { key: "AUTH_SECRET", value: get("AUTH_SECRET") },
    { key: "SITE_PASSWORD", value: get("SITE_PASSWORD") },
    { key: "ADMIN_EMAILS", value: get("ADMIN_EMAILS") },
    { key: "RESEND_API_KEY", value: get("RESEND_API_KEY") },
    { key: "EMAIL_FROM", value: get("EMAIL_FROM") },
    { key: "STEEL_API_KEY", value: get("STEEL_API_KEY") },
    { key: "CRON_SECRET", value: cronsSecret },
  ],
};

const res = await fetch("https://api.render.com/v1/services", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log("create status:", res.status);
console.log(text.slice(0, 1500));
