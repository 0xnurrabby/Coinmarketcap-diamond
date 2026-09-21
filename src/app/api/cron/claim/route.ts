import { NextResponse } from "next/server";
import { claimDueAccounts } from "@/lib/cmc";

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

  const results = await claimDueAccounts();
  return NextResponse.json({ ok: true, count: results.length, results });
}
