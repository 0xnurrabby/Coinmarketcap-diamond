import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { dayString, initDb, publicAccount, sql, type CmcAccount } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();

  const accounts = (await sql`
    SELECT * FROM cmc_accounts WHERE user_id = ${user.id} ORDER BY created_at ASC
  `) as CmcAccount[];

  const today = new Date().toISOString().slice(0, 10);
  const totalDiamonds = accounts.reduce((s, a) => s + (a.diamonds || 0), 0);
  const connected = accounts.filter((a) => a.status === "active").length;
  const claimedToday = accounts.filter((a) => dayString(a.claimed_date) === today).length;

  return NextResponse.json(
    {
      stats: {
        totalAccounts: accounts.length,
        connected,
        claimedToday,
        totalDiamonds,
        bestStreak: accounts.reduce((s, a) => Math.max(s, a.streak || 0), 0),
        autoOn: accounts.filter((a) => a.auto_claim && a.cookies_json).length,
      },
      accounts: accounts.map(publicAccount),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
