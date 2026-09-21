"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui";

type Activity = {
  id: string;
  type: string;
  message: string;
  created_at: string;
  account_name?: string;
  diamonds_delta: number;
};

const TYPE_STYLES: Record<
  string,
  { icon: string; ring: string; text: string; label: string }
> = {
  claim_success: {
    icon: "💎",
    ring: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    label: "Claimed",
  },
  claim_skipped: {
    icon: "⏭️",
    ring: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
    label: "Already claimed",
  },
  claim_error: {
    icon: "⚠️",
    ring: "bg-rose-50 border-rose-200",
    text: "text-rose-700",
    label: "Error",
  },
  session_captured: {
    icon: "🔐",
    ring: "bg-sky-50 border-sky-200",
    text: "text-sky-700",
    label: "Session saved",
  },
  account_created: {
    icon: "✨",
    ring: "bg-indigo-50 border-indigo-200",
    text: "text-indigo-700",
    label: "Account added",
  },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "claim", label: "Claims" },
  { key: "error", label: "Errors" },
  { key: "session", label: "Sessions" },
];

export function ActivityClient() {
  const [items, setItems] = useState<Activity[] | null>(null);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const res = await fetch("/api/activity?limit=200");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.activities || []);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (filter === "all") return items;
    if (filter === "claim") return items.filter((a) => a.type.startsWith("claim"));
    if (filter === "error") return items.filter((a) => a.type.includes("error"));
    return items.filter((a) => a.type === "session_captured");
  }, [items, filter]);

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Activity</h1>
          <p className="text-sm text-muted mt-1">
            Everything that happened, newest first
          </p>
        </div>
        <div className="flex gap-1.5 rounded-full border border-hairline bg-canvas p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`h-8 rounded-full px-3 text-xs font-medium transition-all duration-200 cursor-pointer ${
                filter === f.key
                  ? "bg-primary text-white shadow-sm"
                  : "text-muted hover:bg-surface-soft"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!filtered ? (
        <Card className="divide-y divide-hairline overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="h-9 w-9 rounded-xl skeleton" />
              <span className="h-4 flex-1 rounded skeleton" />
            </div>
          ))}
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center animate-fade-up">
          <div className="text-3xl">🗒️</div>
          <p className="text-sm text-muted mt-3">No activity here yet</p>
        </Card>
      ) : (
        <Card className="divide-y divide-hairline overflow-hidden">
          {filtered.map((a, i) => {
            const style =
              TYPE_STYLES[a.type] ||
              (a.type.includes("error")
                ? TYPE_STYLES.claim_error
                : {
                    icon: "•",
                    ring: "bg-surface-soft border-hairline",
                    text: "text-muted",
                    label: a.type.replaceAll("_", " "),
                  });
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-surface-soft animate-fade-up"
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-base ${style.ring}`}
                >
                  {style.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink truncate">{a.message}</div>
                  <div className="text-xs text-muted mt-0.5 truncate">
                    {a.account_name || "—"} ·{" "}
                    <span title={format(new Date(a.created_at), "PPpp")}>
                      {formatDistanceToNow(new Date(a.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
                {a.diamonds_delta ? (
                  <span
                    className={`shrink-0 text-sm font-medium tabular-nums ${
                      a.diamonds_delta > 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {a.diamonds_delta > 0 ? "+" : ""}
                    {a.diamonds_delta}
                  </span>
                ) : (
                  <span className={`shrink-0 text-xs font-medium ${style.text}`}>
                    {style.label}
                  </span>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </main>
  );
}
