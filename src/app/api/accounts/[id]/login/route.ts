import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { initDb, sql } from "@/lib/db";
import {
  closeLocalLogin,
  getLocalStatus,
  isLocalLoggedIn,
  openLocalLogin,
  useLocalBrowser,
} from "@/lib/local-sessions";
import {
  getSteelLive,
  isCmcLoggedIn,
  openSteelLogin,
  releaseSteel,
} from "@/lib/steel-sessions";

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

    if (useLocalBrowser()) {
      await openLocalLogin(id);
      verifyState.delete(id);
      return json({
        ok: true,
        mode: "local",
        viewerUrl: null,
        cookieCount: 0,
        message:
          "Chrome window opened on this computer at the CMC login page. Sign in — the session is captured automatically.",
      });
    }

    if (!process.env.STEEL_API_KEY?.trim()) {
      return json({ error: "STEEL_API_KEY missing" }, 500);
    }

    const info = await openSteelLogin(id);
    verifyState.delete(id);
    return json({
      ok: true,
      mode: "steel",
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
    const { id } = await params;
    if (!(await ownedAccount(id, user.id))) {
      return json({ error: "Not found" }, 404);
    }

    const local = useLocalBrowser();
    type Status = {
      live: boolean;
      cookieCount: number;
      viewerUrl: string | null;
      sessionId: string | null;
    };
    let status: Status;
    if (local) {
      const s = await getLocalStatus(id);
      status = {
        live: s.live,
        cookieCount: s.cookieCount,
        viewerUrl: null,
        sessionId: null,
      };
    } else {
      const s = await getSteelLive(id);
      status = {
        live: s.live,
        cookieCount: s.cookieCount,
        viewerUrl: s.viewerUrl,
        sessionId: s.sessionId,
      };
    }

    if (!status.live) {
      return json({
        live: false,
        mode: local ? "local" : "steel",
        cookieCount: 0,
        viewerUrl: status.viewerUrl,
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
        loginDetected = local
          ? await isLocalLoggedIn(id)
          : await isCmcLoggedIn(status.sessionId as string);
      } catch {
        loginDetected = false;
      }
      verifyState.set(id, { at: Date.now(), detected: loginDetected });
    }

    return json({
      live: true,
      mode: local ? "local" : "steel",
      cookieCount: status.cookieCount,
      viewerUrl: status.viewerUrl,
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
    if (useLocalBrowser()) {
      await closeLocalLogin(id);
      return json({ ok: true });
    }
    await releaseSteel(id);
    return json({ ok: true });
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : "Cancel failed",
    }, 500);
  }
}
