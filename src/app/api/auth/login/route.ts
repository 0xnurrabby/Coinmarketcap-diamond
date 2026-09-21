import { NextResponse } from "next/server";
import {
  createUserToken,
  findUserByEmail,
  setUserCookie,
  verifyPassword,
} from "@/lib/auth";
import { initDb, sql } from "@/lib/db";

export async function POST(req: Request) {
  try {
    await initDb();
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    if (user.banned) {
      return NextResponse.json({ error: "Account banned" }, { status: 403 });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;
    const token = await createUserToken(user);
    await setUserCookie(token);
    return NextResponse.json({
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Login failed" },
      { status: 500 }
    );
  }
}
