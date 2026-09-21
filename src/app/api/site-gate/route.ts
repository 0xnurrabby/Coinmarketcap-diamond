import { NextResponse } from "next/server";
import { createSiteToken, setSiteCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = String(body.password || "");
  const expected = process.env.SITE_PASSWORD || "";

  if (!expected) {
    return NextResponse.json(
      { error: "SITE_PASSWORD not configured" },
      { status: 500 }
    );
  }

  if (password !== expected) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = await createSiteToken();
  await setSiteCookie(token);
  return NextResponse.json({ ok: true });
}
