import { NextResponse } from "next/server";
import { claimDueAccounts } from "@/lib/cmc";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

declare global {
  // eslint-disable-next-line no-var
  var __claimRun: { running: boolean; startedAt: number } | undefined;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const vercelCron = req.headers.get("x-vercel-cron");
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const q = url.searchParams.get("secret");

  const ok =
    Boolean(vercelCron) ||
    (secret && auth === `Bearer ${secret}`) ||
    (secret && q === secret);

  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!globalThis.__claimRun) {
    globalThis.__claimRun = { running: false, startedAt: 0 };
  }
  const state = globalThis.__claimRun;

  if (state.running) {
    return NextResponse.json(
      {
        ok: true,
        running: true,
        startedAt: new Date(state.startedAt).toISOString(),
      },
      { headers: { "cache-control": "no-store" } }
    );
  }

  state.running = true;
  state.startedAt = Date.now();

  void claimDueAccounts()
    .then((results) => {
      console.log(`[cron] claim run finished: ${results.length} accounts`);
    })
    .catch((err) => {
      console.error("[cron] claim run failed", err);
    })
    .finally(() => {
      state.running = false;
    });

  return NextResponse.json(
    { ok: true, started: true },
    { headers: { "cache-control": "no-store" } }
  );
}
