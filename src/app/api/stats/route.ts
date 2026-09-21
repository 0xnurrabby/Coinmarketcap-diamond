import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb, sql, type CmcAccount } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();

  const accounts = (await sql`
    SELECT * FROM cmc_accounts WHERE user_id = ${user.id}
  `) as CmcAccount[];

  const today = new Date().toISOString().slice(0, 10);
  const totalDiamonds = accounts.reduce((s, a) => s + (a.diamonds || 0), 0);
  const connected = accounts.filter((a) => a.status === "active").length;
  const claimedToday = accounts.filter((a) => a.claimed_date === today).length;

  const activities = await sql`
    SELECT a.*, c.name as account_name
    FROM activities a
    LEFT JOIN cmc_accounts c ON c.id = a.account_id
    WHERE a.user_id = ${user.id}
    ORDER BY a.created_at DESC
    LIMIT 40
  `;

  return NextResponse.json({
    stats: {
      totalAccounts: accounts.length,
      connected,
      claimedToday,
      totalDiamonds,
      autoOn: accounts.filter((a) => a.auto_claim && a.cookies_json).length,
    },
    activities,
  });
}
