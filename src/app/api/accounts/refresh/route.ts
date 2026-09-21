import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { refreshBalancesForUser } from "@/lib/cmc";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const results = await refreshBalancesForUser(user.id);
    return NextResponse.json(
      { ok: true, count: results.length, results },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 400 }
    );
  }
}
