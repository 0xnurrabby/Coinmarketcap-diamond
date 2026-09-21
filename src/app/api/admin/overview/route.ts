import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admins";
import { initDb, sql } from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await initDb();

  const users = await sql`
    SELECT u.id, u.email, u.role, u.banned, u.last_login_at, u.created_at,
      (SELECT COUNT(*)::int FROM cmc_accounts c WHERE c.user_id = u.id) as account_count,
      (SELECT COALESCE(SUM(c.diamonds),0)::int FROM cmc_accounts c WHERE c.user_id = u.id) as total_diamonds,
      (SELECT COUNT(*)::int FROM cmc_accounts c WHERE c.user_id = u.id AND c.status = 'active') as active_accounts
    FROM users u
    ORDER BY u.created_at DESC
  `;

  const totals = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM users) as users,
      (SELECT COUNT(*)::int FROM cmc_accounts) as accounts,
      (SELECT COALESCE(SUM(diamonds),0)::int FROM cmc_accounts) as diamonds,
      (SELECT COUNT(*)::int FROM cmc_accounts WHERE status = 'active') as active_sessions
  `;

  const activities = await sql`
    SELECT a.*, u.email as user_email, c.name as account_name
    FROM activities a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN cmc_accounts c ON c.id = a.account_id
    ORDER BY a.created_at DESC
    LIMIT 80
  `;

  return NextResponse.json({
    totals: totals[0],
    users,
    activities,
  });
}
