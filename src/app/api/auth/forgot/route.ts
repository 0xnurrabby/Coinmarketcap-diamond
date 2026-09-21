import { NextResponse } from "next/server";
import { findUserByEmail, hashPassword } from "@/lib/auth";
import { sendOtp, verifyOtp } from "@/lib/email";
import { initDb, sql } from "@/lib/db";

export async function POST(req: Request) {
  try {
    await initDb();
    const body = await req.json();
    const step = String(body.step || "request");
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const otp = String(body.otp || "");

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    if (step === "request" || step === "resend") {
      const user = await findUserByEmail(email);
      if (!user) {
        return NextResponse.json({ ok: true, step: "verify" });
      }
      await sendOtp(email, "reset");
      return NextResponse.json({ ok: true, step: "verify" });
    }

    if (step === "verify") {
      if (password.length < 6) {
        return NextResponse.json(
          { error: "Password min 6 characters" },
          { status: 400 }
        );
      }
      const ok = await verifyOtp(email, otp, "reset");
      if (!ok) {
        return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
      }
      const user = await findUserByEmail(email);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      const hash = await hashPassword(password);
      await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${user.id}`;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
