import { Resend } from "resend";
import { v4 as uuidv4 } from "uuid";
import { initDb, sql } from "./db";

function resend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY missing");
  return new Resend(key);
}

export function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendOtp(email: string, purpose: "register" | "reset") {
  await initDb();
  const code = generateOtp();
  const id = uuidv4();
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  await sql`
    UPDATE otps SET used = TRUE
    WHERE email = ${email.toLowerCase()} AND purpose = ${purpose} AND used = FALSE
  `;
  await sql`
    INSERT INTO otps (id, email, code, purpose, expires_at)
    VALUES (${id}, ${email.toLowerCase()}, ${code}, ${purpose}, ${expires.toISOString()})
  `;

  const subject =
    purpose === "register"
      ? `${code} is your DiamondClaim code`
      : `${code} is your password reset code`;

  const from = process.env.EMAIL_FROM || "DiamondClaim <onboarding@resend.dev>";

  const { error } = await resend().emails.send({
    from,
    to: email,
    subject,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 12px;color:#181d26">DiamondClaim</h2>
        <p style="color:#41454d;margin:0 0 16px">Your verification code:</p>
        <p style="font-size:32px;letter-spacing:6px;font-weight:600;color:#181d26;margin:0 0 16px">${code}</p>
        <p style="color:#9297a0;font-size:13px;margin:0">Expires in 10 minutes.</p>
      </div>
    `,
  });

  if (error) {
    // Resend free tier can only email the account owner until domain is verified.
    // Keep OTP stored so verified domain / owner email still works after fix.
    if (process.env.OTP_DEV_RETURN === "1") {
      console.warn("[otp-dev]", email, code, error.message);
      return { ok: true, devOtp: code, warning: error.message };
    }
    throw new Error(error.message || "Failed to send email");
  }

  if (process.env.OTP_DEV_RETURN === "1") {
    return { ok: true, devOtp: code };
  }

  return { ok: true };
}

export async function verifyOtp(
  email: string,
  code: string,
  purpose: "register" | "reset"
) {
  await initDb();
  const rows = await sql`
    SELECT * FROM otps
    WHERE email = ${email.toLowerCase()}
      AND purpose = ${purpose}
      AND used = FALSE
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = rows[0] as { id: string; code: string } | undefined;
  if (!row || row.code !== code.trim()) {
    return false;
  }
  await sql`UPDATE otps SET used = TRUE WHERE id = ${row.id}`;
  return true;
}
