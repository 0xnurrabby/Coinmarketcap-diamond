import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSessionUser } from "@/lib/auth";
import { initDb, publicAccount, sql, type CmcAccount } from "@/lib/db";
import { canOpenLoginWindow, captureLocalCookies } from "@/lib/local-sessions";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await initDb();
    const { id } = await params;
    const rows = (await sql`
      SELECT * FROM cmc_accounts WHERE id = ${id} AND user_id = ${user.id}
    `) as CmcAccount[];
    if (!rows[0]) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!canOpenLoginWindow()) {
      return NextResponse.json(
        {
          error:
            "This hosted copy cannot read a browser session. Paste cookies from the Cookie Tool instead.",
        },
        { status: 400 }
      );
    }

    const cookies = await captureLocalCookies(id);
    const expires = new Date(
      Date.now() + 150 * 24 * 60 * 60 * 1000
    ).toISOString();

    await sql`
      UPDATE cmc_accounts SET
        cookies_json = ${JSON.stringify(cookies)},
        status = 'active',
        session_expires_at = ${expires},
        last_error = NULL,
        updated_at = NOW()
      WHERE id = ${id}
    `;
    await sql`
      INSERT INTO activities (id, user_id, account_id, type, message)
      VALUES (${uuidv4()}, ${user.id}, ${id}, 'session_captured', ${`Session captured (${cookies.length} cookies)`})
    `;

    const updated = (
      await sql`SELECT * FROM cmc_accounts WHERE id = ${id}`
    )[0] as CmcAccount;

    return NextResponse.json({
      ok: true,
      cookieCount: cookies.length,
      account: publicAccount(updated),
    });
  } catch (err) {
    console.error("capture POST", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Capture failed" },
      { status: 400 }
    );
  }
}
