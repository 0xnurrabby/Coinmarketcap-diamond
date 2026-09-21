"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui";

type Activity = {
  id: string;
  type: string;
  message: string;
  created_at: string;
  account_name?: string;
  diamonds_delta: number;
};

export function ActivityClient() {
  const [items, setItems] = useState<Activity[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/stats");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.activities || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-medium text-ink mb-6">Activity</h1>
      <Card>
        {items.length === 0 ? (
          <p className="p-6 text-sm text-muted">No activity</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {items.map((a) => (
              <li
                key={a.id}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-sm text-ink">{a.message}</div>
                  <div className="text-xs text-muted mt-0.5">
                    {a.account_name || "—"} ·{" "}
                    {new Date(a.created_at).toLocaleString()}
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
