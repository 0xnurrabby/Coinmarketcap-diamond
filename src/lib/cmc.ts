import { v4 as uuidv4 } from "uuid";
import { initDb, sql, type CmcAccount } from "./db";

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

function cookieHeader(cookies: CookiePair[]) {
  // de-dupe by name (last wins)
  const map = new Map<string, string>();
  for (const c of cookies) map.set(c.name, c.value);
  return [...map.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
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

async function cmcFetch(
  url: string,
  cookies: CookiePair[],
  init: RequestInit = {}
) {
  const headers = new Headers(init.headers || {});
  headers.set("cookie", cookieHeader(cookies));
  headers.set(
    "user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );
  if (!headers.has("accept")) {
    headers.set("accept", "application/json, text/plain, */*");
  }
  headers.set("origin", "https://coinmarketcap.com");
  headers.set("referer", "https://coinmarketcap.com/account/my-diamonds/");
  headers.set("platform", "web");
  if (!headers.has("content-type") && init.method === "POST") {
    headers.set("content-type", "application/json");
  }
  return fetch(url, { ...init, headers, cache: "no-store", redirect: "follow" });
}

function pickNumber(obj: unknown, keys: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
    if (typeof v === "string" && /^\d+(\.\d+)?$/.test(v)) return Number(v);
  }
  // one level nested data/result
  for (const nest of ["data", "result", "payload"]) {
    if (o[nest] && typeof o[nest] === "object") {
      const n = pickNumber(o[nest], keys);
      if (n != null) return n;
    }
  }
  return null;
}

/** Verify session looks logged-in (not guest). */
async function verifySession(cookies: CookiePair[]) {
  const hasAuthLike = cookies.some((c) =>
    /session|token|auth|uid|user|jwt|sid|cmc/i.test(c.name)
  );
  if (!hasAuthLike && cookies.length < 5) {
    return { ok: false as const, reason: "Cookies look incomplete" };
  }

  // HTML page: logged-out users get login CTA
  try {
    const res = await cmcFetch(
      "https://coinmarketcap.com/account/my-diamonds/",
      cookies,
      { method: "GET", headers: { accept: "text/html,application/xhtml+xml" } }
    );
    const html = await res.text();
    if (
      /Log In to Collect|Sign In|sign-in|\/login/i.test(html) &&
      !/Log Out|Sign Out|my-diamonds|loyalty/i.test(html)
    ) {
      return { ok: false as const, reason: "Not logged in (session invalid)" };
    }
    // If redirected heavily to home without account markers
    if (res.url.includes("login") || res.status === 401 || res.status === 403) {
      return { ok: false as const, reason: "Session unauthorized" };
    }
    return { ok: true as const, html };
  } catch {
    return { ok: false as const, reason: "Could not reach CMC" };
  }
}

async function fetchDiamondBalance(
  cookies: CookiePair[],
  htmlHint?: string
): Promise<number | null> {
  const endpoints = [
    "https://api.coinmarketcap.com/asset/v3/loyalty/my-diamonds",
    "https://api.coinmarketcap.com/asset/v3/loyalty/summary",
    "https://api.coinmarketcap.com/asset/v3/loyalty/user-info",
    "https://api.coinmarketcap.com/auth/v4/user/info",
  ];

  for (const url of endpoints) {
    try {
      const res = await cmcFetch(url, cookies, { method: "GET" });
      if (!res.ok) continue;
      const data = await res.json();
      const n = pickNumber(data, [
        "totalDiamonds",
        "total_diamonds",
        "diamondBalance",
        "diamond_balance",
        "diamonds",
        "diamond",
        "balance",
        "amount",
      ]);
      // reject obviously wrong tiny junk from wrong field if nested garbage
      if (n != null && n >= 0 && n < 1_000_000_000) return Math.floor(n);
    } catch {
      /* next */
    }
  }

  const html =
    htmlHint ||
    (await cmcFetch("https://coinmarketcap.com/account/my-diamonds/", cookies, {
      method: "GET",
      headers: { accept: "text/html" },
    })
      .then((r) => r.text())
      .catch(() => ""));

  if (!html) return null;

  // Prefer structured JSON embedded in page
  const jsonBal =
    html.match(/"totalDiamonds"\s*:\s*(\d+)/i) ||
    html.match(/"diamondBalance"\s*:\s*(\d+)/i) ||
    html.match(/"diamonds"\s*:\s*(\d+)/i);
  if (jsonBal) return Number(jsonBal[1]);

  // Strict visible "My Diamonds" block — avoid day reward +10 tiles
  const block = html.match(
    /My Diamonds[\s\S]{0,200}?([0-9][0-9,]{0,12})/i
  );
  if (block) {
    const n = Number(block[1].replace(/,/g, ""));
    // day tiles are usually 10/20/50 — still could be real balance
    if (Number.isFinite(n)) return n;
  }

  return null;
}

type CheckInResult =
  | { ok: true; already: boolean; reward?: number; raw?: string }
  | { ok: false; raw?: string };

async function tryDailyCheckIn(cookies: CookiePair[]): Promise<CheckInResult> {
  const endpoints = [
    "https://api.coinmarketcap.com/asset/v3/loyalty/check-in",
    "https://api.coinmarketcap.com/asset/v3/loyalty/daily-check-in",
    "https://api.coinmarketcap.com/asset/v3/loyalty/checkin",
  ];

  for (const url of endpoints) {
    try {
      const res = await cmcFetch(url, cookies, {
        method: "POST",
        body: "{}",
      });
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      const blob = text.toLowerCase();
      if (
        /already|claimed|collected|come back|tomorrow|has checked/i.test(blob)
      ) {
        return { ok: true, already: true, raw: text.slice(0, 400) };
      }

      // CMC style: { status: { error_code: "0" }, data: {...} }
      const status = json?.status as Record<string, unknown> | undefined;
      const errCode = status?.error_code ?? status?.errorCode;
      if (res.ok && (errCode === "0" || errCode === 0 || errCode == null)) {
        // empty WAF HTML is not success
        if (text.trim().startsWith("<") || text.trim() === "") {
          continue;
        }
        const reward = pickNumber(json, [
          "reward",
          "diamonds",
          "amount",
          "points",
        ]);
        return {
          ok: true,
          already: false,
          reward: reward ?? undefined,
          raw: text.slice(0, 400),
        };
      }

      if (String(errCode) === "1001" || /unauthorized|login/i.test(blob)) {
        return { ok: false, raw: text.slice(0, 400) };
      }
    } catch {
      /* next */
    }
  }

  // Fallback: read my-diamonds page for claim state
  try {
    const res = await cmcFetch(
      "https://coinmarketcap.com/account/my-diamonds/",
      cookies,
      { method: "GET", headers: { accept: "text/html" } }
    );
    const html = await res.text();
    if (/already collected|already claimed|come back tomorrow|claimed today|next claim/i.test(html)) {
      return { ok: true, already: true, raw: "html-already" };
    }
    if (/Log In to Collect/i.test(html)) {
      return { ok: false, raw: "need-login" };
    }
  } catch {
    /* */
  }

  return { ok: false };
}

export async function claimAccount(accountId: string, opts?: { force?: boolean }) {
  await initDb();
  const rows = await sql`SELECT * FROM cmc_accounts WHERE id = ${accountId} LIMIT 1`;
  const account = rows[0] as CmcAccount | undefined;
  if (!account) throw new Error("Account not found");
  if (!account.cookies_json) {
    throw new Error("No session cookies. Use Cookie Tool → paste Session.");
  }

  const today = todayUTC();
  if (!opts?.force && account.claimed_date === today) {
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

  const cookies = parseCookies(account.cookies_json);
  if (cookies.length < 3) {
    throw new Error("Cookie list too short — recapture with Cookie Tool");
  }

  try {
    const session = await verifySession(cookies);
    if (!session.ok) {
      throw new Error(`${session.reason}. Capture cookies again with Cookie Tool.`);
    }

    const before = await fetchDiamondBalance(
      cookies,
      "html" in session ? session.html : undefined
    );

    const checkIn = await tryDailyCheckIn(cookies);

    if (!checkIn.ok) {
      // If we at least have balance, update it but do NOT fake a claim
      if (before != null) {
        await sql`
          UPDATE cmc_accounts SET
            status = 'active',
            diamonds = ${before},
            last_error = ${"Check-in API blocked or unavailable — balance refreshed only"},
            updated_at = NOW()
          WHERE id = ${accountId}
        `;
        await logActivity(
          account.user_id,
          accountId,
          "claim_error",
          "Could not check-in (CMC blocked API). Balance refreshed only.",
          0
        );
        throw new Error(
          "CMC check-in failed (WAF/API). Session may work in browser but server claim is blocked. Try again later."
        );
      }
      throw new Error("Session invalid or check-in failed. Recapture cookies.");
    }

    const after = (await fetchDiamondBalance(cookies)) ?? before;
    const diamonds = after ?? account.diamonds ?? 0;
    const prev = account.diamonds || 0;
    // Only count positive real delta; ignore bogus jumps from bad parse
    let delta = 0;
    if (before != null && after != null && after >= before) {
      delta = after - before;
    } else if (checkIn.reward && checkIn.reward > 0 && checkIn.reward <= 100) {
      delta = checkIn.reward;
    } else if (!checkIn.already && after != null && after > prev && after - prev <= 100) {
      delta = after - prev;
    }

    const already = checkIn.already;
    const next = randomNextClaim();
    const streak = already ? account.streak : account.streak + 1;
    const msg = already
      ? "Already claimed today on CMC"
      : delta > 0
        ? `Claimed +${delta} diamonds`
        : "Check-in OK (no diamond change detected)";

    await sql`
      UPDATE cmc_accounts SET
        status = 'active',
        diamonds = ${diamonds},
        streak = ${streak},
        last_claim_at = NOW(),
        next_claim_at = ${next},
        claimed_date = ${today},
        last_error = NULL,
        updated_at = NOW()
      WHERE id = ${accountId}
    `;

    await logActivity(
      account.user_id,
      accountId,
      already ? "claim_skipped" : "claim_success",
      msg,
      already ? 0 : delta
    );

    return {
      ok: true,
      skipped: already,
      message: msg,
      diamonds,
      nextClaimAt: next,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Claim failed";
    const sessionBad = /session|invalid|login|cookie|logged in|unauthorized/i.test(
      message
    );
    await sql`
      UPDATE cmc_accounts SET
        status = ${sessionBad ? "logged_out" : "error"},
        last_error = ${message},
        updated_at = NOW()
      WHERE id = ${accountId}
    `;
    await logActivity(account.user_id, accountId, "claim_error", message, 0);
    throw err;
  }
}

export async function refreshBalance(accountId: string) {
  await initDb();
  const rows = await sql`SELECT * FROM cmc_accounts WHERE id = ${accountId} LIMIT 1`;
  const account = rows[0] as CmcAccount | undefined;
  if (!account?.cookies_json) throw new Error("No cookies");
  const cookies = parseCookies(account.cookies_json);
  const session = await verifySession(cookies);
  if (!session.ok) throw new Error(session.reason);
  const bal = await fetchDiamondBalance(
    cookies,
    "html" in session ? session.html : undefined
  );
  if (bal == null) throw new Error("Could not read diamond balance");
  await sql`
    UPDATE cmc_accounts SET diamonds = ${bal}, status = 'active', last_error = NULL, updated_at = NOW()
    WHERE id = ${accountId}
  `;
  return bal;
}

export async function claimAllForUser(userId: string) {
  await initDb();
  const accounts = (await sql`
    SELECT * FROM cmc_accounts
    WHERE user_id = ${userId}
      AND auto_claim = TRUE
      AND cookies_json IS NOT NULL
    ORDER BY created_at ASC
  `) as CmcAccount[];

  const results = [];
  for (const a of accounts) {
    try {
      const r = await claimAccount(a.id);
      results.push({ id: a.id, name: a.name, ...r });
    } catch (err) {
      results.push({
        id: a.id,
        name: a.name,
        ok: false,
        message: err instanceof Error ? err.message : "Failed",
      });
    }
  }
  return results;
}

export async function claimDueAccounts() {
  await initDb();
  const today = todayUTC();
  const accounts = (await sql`
    SELECT * FROM cmc_accounts
    WHERE auto_claim = TRUE
      AND cookies_json IS NOT NULL
      AND status IN ('active', 'error')
      AND (claimed_date IS NULL OR claimed_date < ${today}::date)
      AND (next_claim_at IS NULL OR next_claim_at <= NOW())
  `) as CmcAccount[];

  const results = [];
  for (const a of accounts) {
    try {
      results.push({ id: a.id, ...(await claimAccount(a.id)) });
    } catch (err) {
      results.push({
        id: a.id,
        ok: false,
        message: err instanceof Error ? err.message : "Failed",
      });
    }
  }
  return results;
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
