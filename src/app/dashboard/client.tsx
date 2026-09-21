"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button, Card, Input, Modal } from "@/components/ui";

type Account = {
  id: string;
  name: string;
  cmcEmail: string | null;
  status: string;
  diamonds: number;
  autoClaim: boolean;
  lastClaimAt: string | null;
  nextClaimAt: string | null;
  claimedToday: boolean;
  streak: number;
  lastError: string | null;
  hasSession: boolean;
};

type Stats = {
  totalAccounts: number;
  connected: number;
  claimedToday: number;
  totalDiamonds: number;
  bestStreak: number;
  autoOn: number;
};

const GRADIENTS = [
  "from-indigo-500 via-violet-500 to-purple-500",
  "from-emerald-500 via-teal-500 to-cyan-500",
  "from-amber-400 via-orange-500 to-rose-500",
  "from-sky-500 via-blue-500 to-indigo-500",
  "from-rose-500 via-pink-500 to-fuchsia-500",
  "from-lime-500 via-green-500 to-emerald-600",
  "from-cyan-500 via-sky-500 to-blue-600",
  "from-fuchsia-500 via-purple-500 to-indigo-600",
];

function gradientFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 9973;
  return GRADIENTS[hash % GRADIENTS.length];
}

function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: "Connected", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending: { label: "Waiting login", className: "bg-amber-50 text-amber-700 border-amber-200" },
  claiming: { label: "Claiming", className: "bg-sky-50 text-sky-700 border-sky-200" },
  error: { label: "Error", className: "bg-rose-50 text-rose-700 border-rose-200" },
  logged_out: { label: "Logged out", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${s.className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === "active"
            ? "bg-emerald-500"
            : status === "claiming"
              ? "bg-sky-500 animate-pulse"
              : status === "error"
                ? "bg-rose-500"
                : "bg-amber-500"
        }`}
      />
      {s.label}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-56 rounded-2xl border border-hairline bg-canvas overflow-hidden relative"
        >
          <div className="absolute inset-0 skeleton" />
        </div>
      ))}
    </div>
  );
}

export function DashboardClient({
  browserMode,
  localAppUrl,
}: {
  browserMode: "local" | "cloud";
  localAppUrl: string | null;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [capture, setCapture] = useState<{
    account: Account;
    cookieCount: number;
    viewerUrl: string | null;
  } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/stats");
    if (!res.ok) return;
    const data = await res.json();
    setStats(data.stats);
    setAccounts(data.accounts || []);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 20000);
    return () => clearInterval(t);
  }, [load]);

  const captureSession = useCallback(
    async (accountId: string) => {
      setBusy(accountId);
      setError("");
      try {
        const res = await fetch(`/api/accounts/${accountId}/capture`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Capture failed");
        setCapture(null);
        setNotice("Session saved ✓");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Capture failed");
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  const captureId = capture?.account.id ?? null;

  useEffect(() => {
    if (!captureId || browserMode !== "local") return;
    let cancelled = false;
    let capturing = false;
    let busyTick = false;
    let detections = 0;

    const tick = async () => {
      if (cancelled || capturing || busyTick) return;
      busyTick = true;
      try {
        const res = await fetch(`/api/accounts/${captureId}/login`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setCapture((c) =>
          c
            ? {
                ...c,
                cookieCount: data.cookieCount || 0,
                viewerUrl: data.viewerUrl ?? c.viewerUrl,
              }
            : c
        );
        if (data.loginDetected) {
          detections += 1;
          if (detections >= 2) {
            capturing = true;
            await captureSession(captureId);
            return;
          }
        } else {
          detections = 0;
        }
        if (!data.live) setCapture(null);
      } catch {
        /* keep polling */
      } finally {
        busyTick = false;
      }
    };

    void tick();
    const t = setInterval(() => void tick(), 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [captureId, captureSession]);

  async function startLogin(account: Account) {
    setError("");
    setNotice("");

    if (browserMode === "cloud") {
      setCapture({ account, cookieCount: 0, viewerUrl: null });
      return;
    }

    setBusy(account.id);
    try {
      const res = await fetch(`/api/accounts/${account.id}/login`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not open browser");
      setCapture({
        account,
        cookieCount: 0,
        viewerUrl: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(null);
    }
  }

  async function addAccount() {
    setBusy("add");
    setError("");
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setAddOpen(false);
      setName("");
      await load();
      await startLogin(data.account as Account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function cancelCapture() {
    if (!capture) return;
    await fetch(`/api/accounts/${capture.account.id}/login`, { method: "DELETE" });
    setCapture(null);
  }

  async function claimOne(account: Account) {
    setBusy(account.id);
    setError("");
    setNotice("");
    setAccounts((list) =>
      list
        ? list.map((a) => (a.id === account.id ? { ...a, status: "claiming" } : a))
        : list
    );
    try {
      const res = await fetch(`/api/accounts/${account.id}/claim`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Claim failed");
      setNotice(
        data.skipped
          ? "Already claimed today"
          : `+${Math.max(0, (data.diamonds || 0) - account.diamonds)} diamonds claimed`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setBusy(null);
      await load();
    }
  }

  async function claimAll() {
    setBusy("all");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/claim-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const results: Array<{ ok?: boolean; skipped?: boolean }> = data.results || [];
      const ok = results.filter((r) => r.ok && !r.skipped).length;
      const skipped = results.filter((r) => r.skipped).length;
      const fail = results.filter((r) => !r.ok).length;
      setNotice(
        `${ok} claimed · ${skipped} already claimed · ${fail} failed`.trim()
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
      await load();
    }
  }

  async function refreshAll() {
    setBusy("refresh");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/accounts/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      const results: Array<{ ok?: boolean }> = data.results || [];
      setNotice(`Balances refreshed (${results.filter((r) => r.ok).length})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(null);
      await load();
    }
  }

  async function toggleAuto(account: Account) {
    setAccounts((list) =>
      list
        ? list.map((a) =>
            a.id === account.id ? { ...a, autoClaim: !a.autoClaim } : a
          )
        : list
    );
    await fetch(`/api/accounts/${account.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoClaim: !account.autoClaim }),
    });
    await load();
  }

  async function remove(account: Account) {
    if (
      !confirm(
        `Delete ${account.name}? Its saved CMC session will be removed permanently.`
      )
    ) {
      return;
    }
    setBusy(account.id);
    await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  const tiles = [
    {
      key: "diamonds",
      label: "Total diamonds",
      value: stats?.totalDiamonds ?? 0,
      icon: "◆",
      gradient: "from-indigo-500 via-violet-500 to-purple-500",
    },
    {
      key: "accounts",
      label: "Accounts",
      value: stats?.totalAccounts ?? 0,
      hint: `${stats?.connected ?? 0} connected`,
      icon: "◎",
      gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    },
    {
      key: "claimed",
      label: "Claimed today",
      value: stats?.claimedToday ?? 0,
      hint: `${stats?.autoOn ?? 0} auto on`,
      icon: "✓",
      gradient: "from-amber-400 via-orange-500 to-rose-500",
    },
    {
      key: "streak",
      label: "Best streak",
      value: stats?.bestStreak ?? 0,
      hint: "days in a row",
      icon: "🔥",
      gradient: "from-rose-500 via-pink-500 to-fuchsia-500",
    },
  ];

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-muted mt-1">
            Every account, one place — claim, login and manage
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={claimAll} disabled={busy === "all" || !accounts?.length}>
            {busy === "all" ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Claiming…
              </span>
            ) : (
              "Claim all"
            )}
          </Button>
          <Button
            variant="secondary"
            onClick={refreshAll}
            disabled={busy === "refresh" || !accounts?.length}
          >
            {busy === "refresh" ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="secondary" onClick={() => setAddOpen(true)}>
            + Add account
          </Button>
          <a
            href="/api/backup"
            className="inline-flex h-10 items-center justify-center rounded-full border border-hairline bg-canvas px-4 text-sm font-medium text-ink transition hover:border-border-strong"
            title="Download a JSON backup of your accounts and activity"
          >
            Export
          </a>
        </div>
      </div>

      {notice ? (
        <p className="mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 animate-fade-up">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 whitespace-pre-wrap animate-fade-up">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((t, i) => (
          <StatTile key={t.key} tile={t} index={i} loading={!stats} />
        ))}
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink tracking-wide uppercase">
            Accounts
          </h2>
          {accounts?.length ? (
            <span className="text-xs text-muted">{accounts.length} total</span>
          ) : null}
        </div>

        {!accounts ? (
          <Skeleton />
        ) : accounts.length === 0 ? (
          <Card className="p-10 text-center animate-fade-up">
            <div className="text-4xl">💎</div>
            <p className="text-sm text-muted mt-3">
              No accounts yet — add one and sign in to CoinMarketCap
            </p>
            <Button className="mt-4" onClick={() => setAddOpen(true)}>
              + Add account
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a, i) => (
              <AccountCard
                key={a.id}
                account={a}
                index={i}
                busy={busy === a.id || busy === "all" || busy === "refresh"}
                onClaim={() => void claimOne(a)}
                onLogin={() => void startLogin(a)}
                onAuto={() => void toggleAuto(a)}
                onDelete={() => void remove(a)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal open={addOpen} title="Add account" onClose={() => setAddOpen(false)}>
        <p className="text-sm text-muted mb-3">
          Name it (e.g. Premium 1) — then sign in to CMC in the browser window
        </p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") void addAccount();
          }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAddOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || busy === "add"}
            onClick={() => void addAccount()}
          >
            {busy === "add" ? "Opening…" : "Add & login"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(capture)}
        title={capture ? `Log in: ${capture.account.name}` : ""}
        onClose={() => void cancelCapture()}
      >
        {browserMode === "local" ? (
          <>
            <p className="text-sm leading-relaxed">
              A Chrome window opened at the CoinMarketCap login page. Sign in
              there — 2FA and captcha are fine. The session is saved
              automatically.
            </p>
            <p className="mt-3 text-sm text-muted flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-hairline border-t-ink animate-spin" />
              Waiting for login… ({capture?.cookieCount ?? 0} cookies)
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => void cancelCapture()}>
                Cancel
              </Button>
              <Button
                disabled={busy === capture?.account.id}
                onClick={() => {
                  if (capture) void captureSession(capture.account.id);
                }}
              >
                Capture now
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed">
              Login opens a browser window on your own computer. Open the app on
              your PC and sign in to CoinMarketCap there — this hosted copy
              reads the same database, so the session shows up here
              automatically.
            </p>
            {localAppUrl && capture ? (
              <a
                href={`${localAppUrl}/accounts?login=${encodeURIComponent(
                  capture.account.id
                )}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-active"
              >
                Open on my PC →
              </a>
            ) : null}
            <p className="mt-3 text-xs text-muted">
              If that tab cannot connect, start the app on your PC first
              (npm run dev), then click again.
            </p>
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={() => void cancelCapture()}>
                Close
              </Button>
            </div>
          </>
        )}
      </Modal>
    </main>
  );
}

function StatTile({
  tile,
  index,
  loading,
}: {
  tile: { label: string; value: number; hint?: string; icon: string; gradient: string };
  index: number;
  loading: boolean;
}) {
  const value = useCountUp(tile.value);
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-hairline bg-canvas p-4 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 animate-fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div
        className={`absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br ${tile.gradient} opacity-15 blur-xl`}
      />
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted uppercase tracking-wide">
          {tile.label}
        </span>
        <span
          className={`grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br ${tile.gradient} text-white text-sm shadow-sm`}
        >
          {tile.icon}
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold text-ink tabular-nums">
        {loading ? <span className="inline-block h-7 w-16 rounded skeleton" /> : value.toLocaleString()}
      </div>
      {tile.hint ? (
        <div className="mt-1 text-xs text-muted">{tile.hint}</div>
      ) : null}
    </div>
  );
}

function AccountCard({
  account,
  index,
  busy,
  onClaim,
  onLogin,
  onAuto,
  onDelete,
}: {
  account: Account;
  index: number;
  busy: boolean;
  onClaim: () => void;
  onLogin: () => void;
  onAuto: () => void;
  onDelete: () => void;
}) {
  const gradient = gradientFor(account.id);
  const initial = (account.name || "?").trim().charAt(0).toUpperCase();
  const claimed = account.claimedToday;

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-hairline bg-canvas p-5 hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${gradient}`} />

      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${gradient} text-white font-semibold shadow-sm`}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-ink truncate" title={account.name}>
              {account.name}
            </div>
            <div className="text-xs text-muted truncate">
              {account.lastError
                ? account.lastError.slice(0, 42)
                : account.lastClaimAt
                  ? `last claim ${formatDistanceToNow(new Date(account.lastClaimAt), { addSuffix: true })}`
                  : "never claimed"}
            </div>
          </div>
        </div>
        <StatusPill status={account.status} />
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-3xl font-semibold text-ink tabular-nums leading-none">
            {account.diamonds.toLocaleString()}
            <span className="ml-1 text-lg text-indigo-500">◆</span>
          </div>
          <div className="text-xs text-muted mt-1.5">
            {account.nextClaimAt && !claimed
              ? `next ${formatDistanceToNow(new Date(account.nextClaimAt), { addSuffix: true })}`
              : claimed
                ? "claimed today"
                : "ready"}
          </div>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className={account.streak > 0 ? "animate-flame" : "opacity-30"}>
            🔥
          </span>
          <span className="font-medium text-ink tabular-nums">
            {account.streak}
          </span>
          <span className="text-xs text-muted">day{account.streak === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onClaim}
          disabled={busy || claimed || !account.hasSession}
          className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-white transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r ${gradient} hover:brightness-110 active:scale-95`}
        >
          {claimed ? "Claimed ✓" : "Claim"}
        </button>
        <button
          onClick={onLogin}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-full border border-hairline px-3.5 text-sm font-medium text-ink transition-all duration-200 hover:border-border-strong hover:bg-surface-soft active:scale-95 cursor-pointer disabled:opacity-40"
        >
          {account.hasSession ? "Re-login" : "Login"}
        </button>
        <button
          onClick={onAuto}
          disabled={busy}
          className={`inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-40 ${
            account.autoClaim
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-hairline text-muted hover:border-border-strong"
          }`}
        >
          Auto {account.autoClaim ? "on" : "off"}
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-full border border-hairline px-3.5 text-sm font-medium text-rose-600 transition-all duration-200 hover:border-rose-200 hover:bg-rose-50 active:scale-95 cursor-pointer disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
