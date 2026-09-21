import { neon } from "@neondatabase/serverless";
import { Resend } from "resend";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (key) => env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();

const sql = neon(get("DATABASE_URL"));

try {
  console.log("neon", await sql`SELECT 1 as ok`);
} catch (e) {
  console.error("neon fail", e.message || e);
}

try {
  const resend = new Resend(get("RESEND_API_KEY"));
  const r = await resend.emails.send({
    from: "DiamondClaim <onboarding@resend.dev>",
    to: "delivered@resend.dev",
    subject: "test otp",
    html: "<p>123456</p>",
  });
  console.log("resend", JSON.stringify(r));
} catch (e) {
  console.error("resend fail", e.message || e);
}
