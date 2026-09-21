import { v4 as uuidv4 } from "uuid";
import { initDb, sql, type CmcAccount } from "./db";
import {
  snapshotInBrowser,
  withClaimBrowser,
  type CmcSnapshot,
  type CookiePayload,
} from "./claim-browser";

export type CookiePair = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
};

function parseCookies(raw: string | null): CookiePair[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data
        .map((c) => ({
          name: String(c.name || "").trim(),
          value: String(c.value ?? ""),
          domain: c.domain ? String(c.domain) : ".coinmarketcap.com",
          path: c.path ? String(c.path) : "/",
        }))
        .filter((c) => c.name && c.value);
    }
  } catch {
    /* cookie header string */
  }
  return raw
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      return {
        name: p.slice(0, i).trim(),
        value: p.slice(i + 1).trim(),
        domain: ".coinmarketcap.com",
        path: "/",
      };
    })
    .filter((c) => c.name && c.value);
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function dayString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function randomNextClaim() {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(
    8 + Math.floor(Math.random() * 14),
    Math.floor(Math.random() * 60),
    Math.floor(Math.random() * 60),
    0
  );
  return next.toISOString();
}

async function logActivity(
  userId: string,
  accountId: string | null,
  type: string,
  message: string,
  diamondsDelta = 0
) {
  await sql`
    INSERT INTO activities (id, user_id, account_id, type, message, diamonds_delta)
    VALUES (${uuidv4()}, ${userId}, ${accountId}, ${type}, ${message}, ${diamondsDelta})
  `;
}

async function saveSnapshot(account: CmcAccount, snap: CmcSnapshot) {
  const today = todayUTC();
  const prev = account.diamonds || 0;
  const diamonds = snap.diamonds ?? prev;
  const already = snap.claimStatus === "already";
  const delta = already ? 0 : Math.max(0, diamonds - prev);
  const next = randomNextClaim();
  const expires = new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString();

  await sql`
    UPDATE cmc_accounts SET
      status = 'active',
      diamonds = ${diamonds},
      streak = ${snap.streak},
      last_claim_at = NOW(),
      next_claim_at = ${next},
      claimed_date = ${today},
      session_expires_at = ${expires},
      cookies_json = ${JSON.stringify(snap.cookies)},
      last_error = NULL,
      updated_at = NOW()
    WHERE id = ${account.id}
  `;

  const message = already
    ? "Already claimed today on CMC"
    : delta > 0
      ? `Claimed +${delta} diamonds`
      : "Check-in OK";

  await logActivity(
    account.user_id,
    account.id,
    already ? "claim_skipped" : "claim_success",
    message,
    delta
  );

  return {
    ok: true as const,
    skipped: already,
    message,
    diamonds,
    streak: snap.streak,
    nextClaimAt: next,
  };
}

async function failAccount(
  account: CmcAccount,
  message: string,
  sessionBad: boolean
) {
  await sql`
    UPDATE cmc_accounts SET
      status = ${sessionBad ? "logged_out" : "error"},
      last_error = ${message},
      updated_at = NOW()
    WHERE id = ${account.id}
  `;
  await logActivity(
    account.user_id,
    account.id,
    "claim_error",
    message,
    0
  );
}

export async function claimAccount(accountId: string, opts?: { force?: boolean }) {
  await initDb();
  const rows = await sql`SELECT * FROM cmc_accounts WHERE id = ${accountId} LIMIT 1`;
  const account = rows[0] as CmcAccount | undefined;
  if (!account) throw new Error("Account not found");
  if (!account.cookies_json) {
    throw new Error("No session cookies. Log in to CoinMarketCap first.");
  }

  const today = todayUTC();
  if (!opts?.force && dayString(account.claimed_date) === today) {
    return {
      ok: true,
      skipped: true,
      message: "Already claimed today",
      diamonds: account.diamonds,
    };
  }

  await sql`
    UPDATE cmc_accounts SET status = 'claiming', updated_at = NOW() WHERE id = ${accountId}
  `;

  try {
    const cookies = parseCookies(account.cookies_json);
    if (cookies.length < 3) {
      throw new Error("Cookie list too short — log in again");
    }

    const snap = await withClaimBrowser((browser) =>
      snapshotInBrowser(browser, cookies as CookiePayload[], true)
    );

    if (!snap.loggedIn) {
      throw new Error("Session expired — log in to CoinMarketCap again");
    }
    if (snap.claimStatus === "error") {
      throw new Error(snap.claimMessage);
    }

    return await saveSnapshot(account, snap);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Claim failed";
    const sessionBad = /session|invalid|login|cookie|logged in|unauthorized|expired/i.test(
      message
    );
    await failAccount(account, message, sessionBad);
    throw err;
  }
}

export async function refreshBalance(accountId: string) {
  await initDb();
  const rows = await sql`SELECT * FROM cmc_accounts WHERE id = ${accountId} LIMIT 1`;
  const account = rows[0] as CmcAccount | undefined;
  if (!account?.cookies_json) throw new Error("No session cookies");

  const cookies = parseCookies(account.cookies_json);
  const snap = await withClaimBrowser((browser) =>
    snapshotInBrowser(browser, cookies as CookiePayload[], false)
  );

  if (!snap.loggedIn) {
    await failAccount(account, "Session expired — log in again", true);
    throw new Error("Session expired — log in again");
  }

  await sql`
    UPDATE cmc_accounts SET
      diamonds = ${snap.diamonds ?? account.diamonds},
      streak = ${snap.streak},
      claimed_date = ${snap.claimedToday ? todayUTC() : account.claimed_date},
      status = 'active',
      cookies_json = ${JSON.stringify(snap.cookies)},
      last_error = NULL,
      updated_at = NOW()
    WHERE id = ${accountId}
  `;

  return snap.diamonds ?? account.diamonds;
}

async function claimBatch(accounts: CmcAccount[], opts?: { force?: boolean }) {
  const today = todayUTC();
  const todo = accounts.filter(
    (a) => a.cookies_json && (opts?.force || dayString(a.claimed_date) !== today)
  );
  const results: Array<Record<string, unknown>> = [];
  if (!todo.length) return results;

  await withClaimBrowser(async (browser) => {
    for (const account of todo) {
      try {
        const cookies = parseCookies(account.cookies_json);
        const snap = await snapshotInBrowser(
          browser,
          cookies as CookiePayload[],
          true
        );

        if (!snap.loggedIn) {
          const message = "Session expired — log in to CoinMarketCap again";
          await failAccount(account, message, true);
          results.push({ id: account.id, name: account.name, ok: false, message });
          continue;
        }
        if (snap.claimStatus === "error") {
          await failAccount(account, snap.claimMessage, false);
          results.push({
            id: account.id,
            name: account.name,
            ok: false,
            message: snap.claimMessage,
          });
          continue;
        }

        const saved = await saveSnapshot(account, snap);
        results.push({ id: account.id, name: account.name, ...saved });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Claim failed";
        await failAccount(account, message, false);
        results.push({ id: account.id, name: account.name, ok: false, message });
      }
    }
  });

  return results;
}

export async function claimAllForUser(userId: string) {
  await initDb();
  const accounts = (await sql`
    SELECT * FROM cmc_accounts
    WHERE user_id = ${userId} AND cookies_json IS NOT NULL
    ORDER BY created_at ASC
  `) as CmcAccount[];

  const today = todayUTC();
  const results: Array<Record<string, unknown>> = [];
  const pending: CmcAccount[] = [];
  for (const account of accounts) {
    if (dayString(account.claimed_date) === today) {
      results.push({
        id: account.id,
        name: account.name,
        ok: true,
        skipped: true,
        message: "Already claimed today",
        diamonds: account.diamonds,
      });
    } else {
      pending.push(account);
    }
  }
  results.push(...(await claimBatch(pending)));
  return results;
}

export async function claimDueAccounts() {
  await initDb();
  const today = todayUTC();
  const accounts = (await sql`
    SELECT * FROM cmc_accounts
    WHERE auto_claim = TRUE
      AND cookies_json IS NOT NULL
      AND status IN ('active', 'error', 'logged_out')
      AND (claimed_date IS NULL OR claimed_date::text <> ${today})
      AND (next_claim_at IS NULL OR next_claim_at <= NOW())
    ORDER BY created_at ASC
  `) as CmcAccount[];
  return claimBatch(accounts);
}

export function normalizeCookieInput(input: string): CookiePair[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as Array<Record<string, string>>;
    return arr.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || ".coinmarketcap.com",
      path: c.path || "/",
    }));
  }
  return parseCookies(trimmed);
}
