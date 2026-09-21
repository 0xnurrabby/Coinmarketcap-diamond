import { NextResponse } from "next/server";
import {
  createUser,
  createUserToken,
  findUserByEmail,
  hashPassword,
  setUserCookie,
} from "@/lib/auth";
import { sendOtp, verifyOtp } from "@/lib/email";
import { initDb } from "@/lib/db";

export async function POST(req: Request) {
  try {
    await initDb();
    const body = await req.json();
    const step = String(body.step || "request");
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const otp = String(body.otp || "");

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    if (step === "request") {
      if (password.length < 6) {
        return NextResponse.json(
          { error: "Password min 6 characters" },
          { status: 400 }
        );
      }
      if (await findUserByEmail(email)) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }
      const sent = await sendOtp(email, "register");
      return NextResponse.json({
        step: "verify",
        ok: true,
        devOtp: "devOtp" in sent ? sent.devOtp : undefined,
        warning: "warning" in sent ? sent.warning : undefined,
      });
    }

    if (step === "resend") {
      if (await findUserByEmail(email)) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }
      const sent = await sendOtp(email, "register");
      return NextResponse.json({
        ok: true,
        devOtp: "devOtp" in sent ? sent.devOtp : undefined,
        warning: "warning" in sent ? sent.warning : undefined,
      });
    }

    if (step === "verify") {
      if (password.length < 6) {
        return NextResponse.json(
          { error: "Password min 6 characters" },
          { status: 400 }
        );
      }
      const ok = await verifyOtp(email, otp, "register");
      if (!ok) {
        return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
      }
      if (await findUserByEmail(email)) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }
      const hash = await hashPassword(password);
      const user = await createUser(email, hash);
      const token = await createUserToken(user);
      await setUserCookie(token);
      return NextResponse.json({
        user: { id: user.id, email: user.email, role: user.role },
      });
    }

    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  } catch (err) {
    console.error("register error", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : typeof err === "object" && err && "message" in err
              ? String((err as { message: unknown }).message)
              : "Register failed",
      },
      { status: 500 }
    );
  }
}
