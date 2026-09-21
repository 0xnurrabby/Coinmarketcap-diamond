import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();

  const accounts = await sql`
    SELECT * FROM cmc_accounts WHERE user_id = ${user.id} ORDER BY created_at ASC
  `;
  const activities = await sql`
    SELECT * FROM activities WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 1000
  `;

  const body = JSON.stringify(
    {
      app: "DiamondClaim",
      exportedAt: new Date().toISOString(),
      user: { email: user.email },
      accounts,
      activities,
    },
    null,
    2
  );

  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="diamondclaim-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
