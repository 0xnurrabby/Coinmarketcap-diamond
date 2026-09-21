import { NextResponse } from "next/server";
import { clearUserCookie } from "@/lib/auth";

export async function POST() {
  await clearUserCookie();
  return NextResponse.json({ ok: true });
}
