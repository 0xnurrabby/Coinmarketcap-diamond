"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";

type Totals = {
  users: number;
  accounts: number;
  diamonds: number;
  active_sessions: number;
};

type UserRow = {
  id: string;
  email: string;
  role: string;
  banned: boolean;
  last_login_at: string | null;
  created_at: string;
  account_count: number;
  total_diamonds: number;
  active_accounts: number;
};

type Activity = {
  id: string;
  type: string;
  message: string;
  created_at: string;
  user_email?: string;
  account_name?: string;
};

export function AdminClient() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/overview");
    if (!res.ok) return;
    const data = await res.json();
    setTotals(data.totals);
    setUsers(data.users || []);
    setActivities(data.activities || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function ban(u: UserRow, banned: boolean) {
    setBusy(u.id);
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ banned }),
    });
    await load();
    setBusy(null);
  }

  async function del(u: UserRow) {
    if (!confirm(`Delete ${u.email}?`)) return;
    setBusy(u.id);
    await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  if (!totals) {
    return <main className="max-w-5xl mx-auto px-4 py-10 text-muted">Loading…</main>;
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-medium text-ink mb-6">Admin</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          ["Users", totals.users],
          ["Accounts", totals.accounts],
          ["Diamonds", totals.diamonds],
          ["Active sessions", totals.active_sessions],
        ].map(([k, v]) => (
          <Card key={String(k)} className="p-4">
            <div className="text-xs text-muted">{k}</div>
            <div className="text-2xl font-medium text-ink mt-1">{v}</div>
          </Card>
        ))}
      </div>

      <Card className="mb-6 overflow-x-auto">
        <div className="px-4 py-3 border-b border-hairline text-sm font-medium text-ink">
          Users
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-hairline">
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">CMC</th>
              <th className="px-4 py-2 font-medium">◆</th>
              <th className="px-4 py-2 font-medium">Login</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3">
                  <div className="text-ink">{u.email}</div>
                  <div className="text-xs text-muted flex gap-2 mt-0.5">
                    <span>{u.role}</span>
                    {u.banned ? <Badge tone="bad">banned</Badge> : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {u.active_accounts}/{u.account_count}
                </td>
                <td className="px-4 py-3 text-ink">{u.total_diamonds}</td>
                <td className="px-4 py-3 text-muted text-xs">
                  {u.last_login_at
                    ? new Date(u.last_login_at).toLocaleString()
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2 justify-end">
                    <Button
                      variant="secondary"
                      disabled={busy === u.id}
                      onClick={() => ban(u, !u.banned)}
                    >
                      {u.banned ? "Unban" : "Ban"}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busy === u.id}
                      onClick={() => del(u)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="px-4 py-3 border-b border-hairline text-sm font-medium text-ink">
          Global activity
        </div>
        <ul className="divide-y divide-hairline max-h-[420px] overflow-y-auto">
          {activities.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="text-sm text-ink">{a.message}</div>
              <div className="text-xs text-muted mt-0.5">
                {a.user_email || "—"} · {a.account_name || "—"} ·{" "}
                {new Date(a.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
