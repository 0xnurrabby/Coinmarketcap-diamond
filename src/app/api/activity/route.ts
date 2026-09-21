import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 300);

  const activities = await sql`
    SELECT a.id, a.type, a.message, a.diamonds_delta, a.created_at, c.name AS account_name
    FROM activities a
    LEFT JOIN cmc_accounts c ON c.id = a.account_id
    WHERE a.user_id = ${user.id}
    ORDER BY a.created_at DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(
    { activities },
    { headers: { "cache-control": "no-store" } }
  );
}
