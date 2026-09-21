import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb, publicAccount, sql, type CmcAccount } from "@/lib/db";
import { claimAccount } from "@/lib/cmc";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();
  const { id } = await params;
  const rows = (await sql`
    SELECT * FROM cmc_accounts WHERE id = ${id} AND user_id = ${user.id}
  `) as CmcAccount[];
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await claimAccount(id);
    const updated = (
      await sql`SELECT * FROM cmc_accounts WHERE id = ${id}`
    )[0] as CmcAccount;
    return NextResponse.json({ ...result, account: publicAccount(updated) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Claim failed" },
      { status: 400 }
    );
  }
}
