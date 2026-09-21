import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb, publicAccount, sql, type CmcAccount } from "@/lib/db";
import { normalizeCookieInput } from "@/lib/cmc";

async function owned(userId: string, id: string) {
  const rows = (await sql`
    SELECT * FROM cmc_accounts WHERE id = ${id} AND user_id = ${userId} LIMIT 1
  `) as CmcAccount[];
  return rows[0];
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();
  const { id } = await params;
  const account = await owned(user.id, id);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  if (typeof body.name === "string" && body.name.trim()) {
    await sql`UPDATE cmc_accounts SET name = ${body.name.trim()}, updated_at = NOW() WHERE id = ${id}`;
  }
  if (typeof body.autoClaim === "boolean") {
    await sql`UPDATE cmc_accounts SET auto_claim = ${body.autoClaim}, updated_at = NOW() WHERE id = ${id}`;
  }
  if (typeof body.cookies === "string" && body.cookies.trim()) {
    try {
      const parsed = normalizeCookieInput(body.cookies);
      if (parsed.length < 2) {
        return NextResponse.json({ error: "Invalid cookies" }, { status: 400 });
      }
      const expires = new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString();
      await sql`
        UPDATE cmc_accounts SET
          cookies_json = ${JSON.stringify(parsed)},
          status = 'active',
          session_expires_at = ${expires},
          last_error = NULL,
          updated_at = NOW()
        WHERE id = ${id}
      `;
    } catch {
      return NextResponse.json({ error: "Invalid cookie format" }, { status: 400 });
    }
  }

  const updated = await owned(user.id, id);
  return NextResponse.json({ account: publicAccount(updated) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();
  const { id } = await params;
  const account = await owned(user.id, id);
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await sql`DELETE FROM cmc_accounts WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
