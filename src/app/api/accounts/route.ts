import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSessionUser } from "@/lib/auth";
import { initDb, publicAccount, sql, type CmcAccount } from "@/lib/db";
import { normalizeCookieInput } from "@/lib/cmc";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();
  const rows = (await sql`
    SELECT * FROM cmc_accounts WHERE user_id = ${user.id} ORDER BY created_at ASC
  `) as CmcAccount[];
  return NextResponse.json({ accounts: rows.map(publicAccount) });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  let cookiesJson: string | null = null;
  let status = "pending";
  if (body.cookies) {
    try {
      const parsed = normalizeCookieInput(String(body.cookies));
      if (parsed.length < 2) {
        return NextResponse.json({ error: "Invalid cookies" }, { status: 400 });
      }
      cookiesJson = JSON.stringify(parsed);
      status = "active";
    } catch {
      return NextResponse.json({ error: "Invalid cookie format" }, { status: 400 });
    }
  }

  const id = `acc_${uuidv4().slice(0, 8)}`;
  const expires = cookiesJson
    ? new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  await sql`
    INSERT INTO cmc_accounts (id, user_id, name, status, cookies_json, session_expires_at)
    VALUES (${id}, ${user.id}, ${name}, ${status}, ${cookiesJson}, ${expires})
  `;
  await sql`
    INSERT INTO activities (id, user_id, account_id, type, message)
    VALUES (${uuidv4()}, ${user.id}, ${id}, 'account_created', ${`Added ${name}`})
  `;

  const rows = (await sql`SELECT * FROM cmc_accounts WHERE id = ${id}`) as CmcAccount[];
  return NextResponse.json({ account: publicAccount(rows[0]) });
}
