import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { claimAllForUser } from "@/lib/cmc";
import { initDb } from "@/lib/db";

export const maxDuration = 60;

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();
  const results = await claimAllForUser(user.id);
  return NextResponse.json({ results });
}
