"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Input, Modal, Textarea } from "@/components/ui";

type Account = {
  id: string;
  name: string;
  status: string;
  diamonds: number;
  autoClaim: boolean;
  claimedToday: boolean;
  streak: number;
  lastError: string | null;
  hasSession: boolean;
};

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      text.startsWith("<!DOCTYPE") || text.startsWith("<html")
        ? `Server error (HTTP ${res.status}). Try again in a few seconds.`
        : text.slice(0, 240) || `HTTP ${res.status}`
    );
  }
}

export function AccountsClient({
  browserMode,
  localAppUrl,
}: {
  browserMode: "local" | "cloud";
  localAppUrl: string | null;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [capture, setCapture] = useState<{
    account: Account;
    cookieCount: number;
    viewerUrl: string | null;
  } | null>(null);
  const [pasteFor, setPasteFor] = useState<Account | null>(null);
  const [cookies, setCookies] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/accounts");
    if (!res.ok) return;
    const data = await res.json();
    setAccounts(data.accounts || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const autoStarted = useRef(false);

  useEffect(() => {
    if (autoStarted.current) return;
    const loginId = new URLSearchParams(window.location.search).get("login");
    if (!loginId) return;
    const account = accounts.find((a) => a.id === loginId);
    if (!account) return;
    autoStarted.current = true;
    window.history.replaceState({}, "", window.location.pathname);
    const id = window.setTimeout(() => void startLogin(account), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const captureSession = useCallback(
    async (accountId: string) => {
      setBusy(accountId);
      setError("");
      try {
        const res = await fetch(`/api/accounts/${accountId}/capture`, {
          method: "POST",
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(String(data.error || "Capture failed"));
        setCapture(null);
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
          // require two consecutive positives so a mid-reload page is not captured
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
      setOpen(false);
      setName("");
      await load();
      await startLogin(data.account as Account);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function startLogin(account: Account, win?: Window | null) {
    setError("");
    if (browserMode === "cloud") {
      setCapture({ account, cookieCount: 0, viewerUrl: null });
      return;
    }
    setBusy(account.id);
    try {
      const res = await fetch(`/api/accounts/${account.id}/login`, {
        method: "POST",
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(String(data.error || "Failed to open browser"));
      setCapture({
        account,
        cookieCount: Number(data.cookieCount || 0),
        viewerUrl: null,
      });
    } catch (err) {
      if (win && !win.closed) win.close();
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(null);
    }
  }

  async function cancelCapture() {
    if (!capture) return;
    await fetch(`/api/accounts/${capture.account.id}/login`, { method: "DELETE" });
    setCapture(null);
  }

  async function savePaste() {
    if (!pasteFor) return;
    setBusy(pasteFor.id);
    setError("");
    try {
      const res = await fetch(`/api/accounts/${pasteFor.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cookies }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPasteFor(null);
      setCookies("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function claimOne(a: Account) {
    if (a.claimedToday) return;
    setBusy(a.id);
    setError("");
    try {
      const res = await fetch(`/api/accounts/${a.id}/claim`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleAuto(a: Account) {
    setBusy(a.id);
    await fetch(`/api/accounts/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoClaim: !a.autoClaim }),
    });
    await load();
    setBusy(null);
  }

  async function remove(a: Account) {
    if (
      !confirm(
        `Delete ${a.name}? Its saved CMC session will be removed permanently.`
      )
    ) {
      return;
    }
    setBusy(a.id);
    await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-medium text-ink">Accounts</h1>
          <p className="text-sm text-muted mt-1">
            Login opens a browser window → sign in to CMC → session saved
            automatically
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Add account</Button>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-error bg-red-50 border border-red-100 rounded-lg px-3 py-2 whitespace-pre-wrap">
          {error}
        </p>
      ) : null}

      {accounts.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted">No accounts</p>
          <Button className="mt-4" onClick={() => setOpen(true)}>
            + Add account
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {accounts.map((a, idx) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted text-sm w-5">{idx + 1}</span>
                    <span className="font-medium text-ink">{a.name}</span>
                    <Badge
                      tone={
                        a.status === "active"
                          ? "ok"
                          : a.status === "error" || a.status === "logged_out"
                            ? "bad"
                            : "warn"
                      }
                    >
                      {a.status}
                    </Badge>
                    {a.claimedToday ? <Badge tone="ok">claimed</Badge> : null}
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    {a.diamonds.toLocaleString()} ◆ · streak {a.streak} · auto{" "}
                    {a.autoClaim ? "on" : "off"}
                  </div>
                  {a.lastError ? (
                    <p className="mt-1 text-xs text-error">{a.lastError}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy === a.id} onClick={() => startLogin(a)}>
                    {a.hasSession ? "Re-login" : "Login"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy === a.id || a.claimedToday || !a.hasSession}
                    onClick={() => claimOne(a)}
                  >
                    {a.claimedToday ? "Done" : "Claim"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy === a.id}
                    onClick={() => {
                      setCookies("");
                      setPasteFor(a);
                    }}
                  >
                    Paste
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy === a.id}
                    onClick={() => toggleAuto(a)}
                  >
                    Auto
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy === a.id}
                    onClick={() => remove(a)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} title="Add account" onClose={() => setOpen(false)}>
        <p className="text-sm text-muted mb-3">Name (e.g. Premium 1)</p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") void addAccount();
          }}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || busy === "add"}
            onClick={() => void addAccount()}
          >
            OK
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
              automatically once you are logged in.
            </p>
            <p className="mt-3 text-sm text-muted">
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

      <Modal
        open={Boolean(pasteFor)}
        title={pasteFor ? `Paste cookies · ${pasteFor.name}` : ""}
        onClose={() => setPasteFor(null)}
      >
        <Textarea
          placeholder="Optional: paste cookies JSON from EXE tool"
          value={cookies}
          onChange={(e) => setCookies(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPasteFor(null)}>
            Cancel
          </Button>
          <Button
            disabled={!cookies.trim() || busy === pasteFor?.id}
            onClick={savePaste}
          >
            Save
          </Button>
        </div>
      </Modal>
    </main>
  );
}
