import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb, sql } from "@/lib/db";
import {
  canOpenLoginWindow,
  closeLocalLogin,
  getLocalStatus,
  isLocalLoggedIn,
  openLocalLogin,
} from "@/lib/local-sessions";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERIFY_INTERVAL_MS = 6_000;
const verifyState = new Map<string, { at: number; detected: boolean }>();

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

async function ownedAccount(id: string, userId: string) {
  await initDb();
  const rows = (await sql`
    SELECT id FROM cmc_accounts WHERE id = ${id} AND user_id = ${userId} LIMIT 1
  `) as { id: string }[];
  return Boolean(rows[0]);
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { id } = await params;
    if (!(await ownedAccount(id, user.id))) {
      return json({ error: "Account not found" }, 404);
    }

    if (!canOpenLoginWindow()) {
      return json(
        {
          error:
            "This hosted copy cannot open a browser on your computer. Log in from the app running on your PC, or use Paste with cookies from the Cookie Tool.",
        },
        400
      );
    }

    await openLocalLogin(id);
    verifyState.delete(id);
    return json({
      ok: true,
      mode: "local",
      viewerUrl: null,
      cookieCount: 0,
      message:
        "Chrome window opened at the CoinMarketCap login page. Sign in — the session is saved automatically.",
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
    const { id } = await params;
    if (!(await ownedAccount(id, user.id))) {
      return json({ error: "Not found" }, 404);
    }

    if (!canOpenLoginWindow()) {
      return json({
        live: false,
        mode: "cloud",
        cookieCount: 0,
        viewerUrl: null,
        loginDetected: false,
      });
    }

    const status = await getLocalStatus(id);
    if (!status.live) {
      return json({
        live: false,
        mode: "local",
        cookieCount: 0,
        viewerUrl: null,
        loginDetected: false,
      });
    }

    // Throttled check: is the CMC page showing a logged-in session?
    let loginDetected = false;
    const prev = verifyState.get(id);
    if (prev && Date.now() - prev.at < VERIFY_INTERVAL_MS) {
      loginDetected = prev.detected;
    } else {
      try {
        loginDetected = await isLocalLoggedIn(id);
      } catch {
        loginDetected = false;
      }
      verifyState.set(id, { at: Date.now(), detected: loginDetected });
    }

    return json({
      live: true,
      mode: "local",
      cookieCount: status.cookieCount,
      viewerUrl: null,
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
    verifyState.delete(id);
    await closeLocalLogin(id);
    return json({ ok: true });
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : "Cancel failed",
    }, 500);
  }
}
