"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";

type Stats = {
  totalAccounts: number;
  connected: number;
  claimedToday: number;
  totalDiamonds: number;
  autoOn: number;
};

type Activity = {
  id: string;
  type: string;
  message: string;
  created_at: string;
  account_name?: string;
};

export function DashboardClient() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/stats");
    if (!res.ok) return;
    const data = await res.json();
    setStats(data.stats);
    setActivities(data.activities || []);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 12000);
    return () => clearInterval(t);
  }, [load]);

  async function claimAll() {
    setClaiming(true);
    setClaimMsg("");
    try {
      const res = await fetch("/api/claim-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const results = data.results || [];
      const skipped = results.filter((r: { skipped?: boolean }) => r.skipped).length;
      const ok = results.filter((r: { ok?: boolean }) => r.ok).length;
      const fail = results.filter((r: { ok?: boolean }) => !r.ok).length;
      setClaimMsg(`${ok} done · ${skipped} already claimed · ${fail} failed`);
      await load();
    } catch (err) {
      setClaimMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setClaiming(false);
    }
  }

  if (!stats) {
    return <main className="max-w-5xl mx-auto px-4 py-10 text-muted">Loading…</main>;
  }

  const tiles = [
    { label: "Diamonds", value: stats.totalDiamonds.toLocaleString() },
    { label: "Connected", value: stats.connected },
    { label: "Claimed today", value: stats.claimedToday },
    { label: "Accounts", value: stats.totalAccounts },
  ];

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-medium text-ink">Dashboard</h1>
        <div className="flex gap-2">
          <Button onClick={claimAll} disabled={claiming}>
            {claiming ? "Claiming…" : "Claim all"}
          </Button>
          <Link href="/accounts">
            <Button variant="secondary">Accounts</Button>
          </Link>
        </div>
      </div>

      {claimMsg ? (
        <p className="mb-4 text-sm text-muted border border-hairline rounded-lg px-3 py-2 bg-canvas">
          {claimMsg}
        </p>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <div className="text-xs text-muted">{t.label}</div>
            <div className="mt-1 text-2xl font-medium text-ink">{t.value}</div>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <div className="px-4 py-3 border-b border-hairline flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Activity</h2>
          <Link href="/activity" className="text-sm text-link">
            All
          </Link>
        </div>
        {activities.length === 0 ? (
          <p className="p-6 text-sm text-muted">No activity</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {activities.slice(0, 8).map((a) => (
              <li key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-ink truncate">{a.message}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {a.account_name || "—"}
                  </div>
                </div>
                <Badge
                  tone={
                    a.type.includes("error")
                      ? "bad"
                      : a.type.includes("success")
                        ? "ok"
                        : "neutral"
                  }
                >
                  {a.type.replaceAll("_", " ")}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
