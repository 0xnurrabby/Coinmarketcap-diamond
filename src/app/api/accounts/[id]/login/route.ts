import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb, sql, type CmcAccount } from "@/lib/db";
import {
  getSteelLive,
  openSteelLogin,
  releaseSteel,
} from "@/lib/steel-sessions";

export const maxDuration = 30;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    if (!process.env.STEEL_API_KEY?.trim()) {
      return json({ error: "STEEL_API_KEY missing on Vercel env" }, 500);
    }

    await initDb();
    const { id } = await params;
    const rows = (await sql`
      SELECT id FROM cmc_accounts WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
    `) as { id: string }[];
    if (!rows[0]) return json({ error: "Account not found" }, 404);

    const info = await openSteelLogin(id);
    return json({
      ok: true,
      sessionId: info.sessionId,
      viewerUrl: info.viewerUrl,
      cookieCount: 0,
      message: "Open live browser, login to CMC, then Capture session.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[login POST]", message);
    return json({ error: message }, 500);
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    await initDb();
    const { id } = await params;
    const rows = (await sql`
      SELECT id FROM cmc_accounts WHERE id = ${id} AND user_id = ${user.id} LIMIT 1
    `) as { id: string }[];
    if (!rows[0]) return json({ error: "Not found" }, 404);
    return json(await getSteelLive(id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message, live: false, cookieCount: 0 }, 500);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { id } = await params;
    await releaseSteel(id);
    return json({ ok: true });
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : "Cancel failed",
    }, 500);
  }
}
