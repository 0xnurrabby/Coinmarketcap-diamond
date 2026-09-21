import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb, sql } from "@/lib/db";
import {
  getSteelLive,
  isCmcLoggedIn,
  openSteelLogin,
  releaseSteel,
} from "@/lib/steel-sessions";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_INTERVAL_MS = 8_000;
const verifyState = new Map<string, { at: number; detected: boolean }>();

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
      message:
        "Live browser opened on the CMC login page. Sign in — the session is captured automatically.",
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

    const info = await getSteelLive(id);
    if (!info.live) {
      return json({
        live: false,
        cookieCount: 0,
        viewerUrl: info.viewerUrl,
        loginDetected: false,
      });
    }

    // Throttled check: is the CMC page showing a logged-in session?
    let loginDetected = false;
    if (info.sessionId) {
      const prev = verifyState.get(id);
      if (prev && Date.now() - prev.at < VERIFY_INTERVAL_MS) {
        loginDetected = prev.detected;
      } else {
        try {
          loginDetected = await isCmcLoggedIn(info.sessionId);
        } catch {
          loginDetected = false;
        }
        verifyState.set(id, { at: Date.now(), detected: loginDetected });
      }
    }

    return json({
      live: true,
      cookieCount: info.cookieCount,
      viewerUrl: info.viewerUrl,
      loginDetected,
    });
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
