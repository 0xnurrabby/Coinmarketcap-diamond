import { initDb, sql } from "./db";
import type { Page } from "playwright-core";

function apiKey() {
  const key = process.env.STEEL_API_KEY?.trim();
  if (!key) throw new Error("STEEL_API_KEY is not set on server");
  return key;
}

function steelHeaders() {
  return {
    "steel-api-key": apiKey(),
    "content-type": "application/json",
  };
}

export type SteelCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  [key: string]: unknown;
};

const CMC_DIAMONDS_URL = "https://coinmarketcap.com/account/my-diamonds/";
const CMC_LOGIN_CTA =
  'button[data-btnname="Log In to Collect"], button:has-text("Log In to Collect"), button:has-text("Log In to Complete")';

async function isLoginCtaVisible(page: Page) {
  return page
    .locator(CMC_LOGIN_CTA)
    .first()
    .isVisible()
    .catch(() => false);
}

function steelWs(sessionId: string) {
  return `wss://connect.steel.dev?sessionId=${sessionId}&apiKey=${encodeURIComponent(
    apiKey()
  )}`;
}

/**
 * Navigate the Steel session to the CMC login entry point.
 * Best effort: if the login modal does not open, the user can click it manually.
 */
async function openCmcLoginPage(sessionId: string) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.connectOverCDP(steelWs(sessionId), {
    timeout: 45000,
  });
  try {
    const context = browser.contexts()[0];
    if (!context) return;
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(CMC_DIAMONDS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const loginBtn = page.locator(CMC_LOGIN_CTA).first();
    try {
      await loginBtn.waitFor({ state: "visible", timeout: 15000 });
      await loginBtn.click({ timeout: 8000 });
      await page.waitForTimeout(1500);
    } catch {
      /* already logged in, or modal opened by the user */
    }
  } finally {
    await browser.close().catch(() => null);
  }
}

/** True only when the CMC diamonds page is loaded and no login CTA is shown. */
export async function isCmcLoggedIn(sessionId: string) {
  const { chromium } = await import("playwright-core");
  const browser = await chromium.connectOverCDP(steelWs(sessionId), {
    timeout: 45000,
  });
  try {
    const context = browser.contexts()[0];
    if (!context) return false;
    const page = context
      .pages()
      .find((p) => p.url().includes("/account/my-diamonds"));
    if (!page) return false;
    if (await isLoginCtaVisible(page)) return false;
    const ready = await page
      .evaluate(() => document.readyState === "complete")
      .catch(() => false);
    return ready;
  } finally {
    await browser.close().catch(() => null);
  }
}

export async function getSteelContextCookies(
  sessionId: string
): Promise<SteelCookie[]> {
  const res = await fetch(
    `https://api.steel.dev/v1/sessions/${sessionId}/context`,
    { headers: { "steel-api-key": apiKey() }, cache: "no-store" }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { cookies?: SteelCookie[] };
  return (data.cookies || []).filter(
    (c) =>
      String(c.domain || "").includes("coinmarketcap.com") ||
      String(c.domain || "").includes("cmc.com")
  );
}

/** Create Steel live session only (no Playwright) — works on Vercel. */
export async function openSteelLogin(accountId: string) {
  await initDb();
  await releaseSteel(accountId).catch(() => null);

  const create = await fetch("https://api.steel.dev/v1/sessions", {
    method: "POST",
    headers: steelHeaders(),
    body: JSON.stringify({
      timeout: 900_000,
      inactivityTimeout: 900_000,
      headless: false,
      dimensions: { width: 1280, height: 900 },
    }),
  });

  const raw = await create.text();
  if (!create.ok) {
    throw new Error(`Steel create failed (${create.status}): ${raw.slice(0, 300)}`);
  }

  let session: {
    id: string;
    sessionViewerUrl?: string;
    debugUrl?: string;
  };
  try {
    session = JSON.parse(raw);
  } catch {
    throw new Error(`Steel non-JSON response: ${raw.slice(0, 200)}`);
  }

  if (!session.id) {
    throw new Error(`Steel session missing id: ${raw.slice(0, 200)}`);
  }

  const viewerUrl =
    session.sessionViewerUrl ||
    session.debugUrl ||
    `https://app.steel.dev/sessions/${session.id}`;

  await sql`
    UPDATE cmc_accounts SET
      steel_session_id = ${session.id},
      steel_viewer_url = ${viewerUrl},
      status = 'pending',
      last_error = NULL,
      updated_at = NOW()
    WHERE id = ${accountId}
  `;

  // Put the CMC login page in front of the user inside the live browser
  await openCmcLoginPage(session.id).catch(() => null);

  return {
    sessionId: session.id,
    viewerUrl,
    cookieCount: 0,
  };
}

export async function getSteelLive(accountId: string) {
  await initDb();
  const rows = await sql`
    SELECT steel_session_id, steel_viewer_url
    FROM cmc_accounts WHERE id = ${accountId} LIMIT 1
  `;
  const row = rows[0] as
    | { steel_session_id: string | null; steel_viewer_url: string | null }
    | undefined;

  if (!row?.steel_session_id) {
    return {
      live: false,
      cookieCount: 0,
      cookies: [] as SteelCookie[],
      viewerUrl: null,
      sessionId: null,
    };
  }

  let live = true;
  try {
    const st = await fetch(
      `https://api.steel.dev/v1/sessions/${row.steel_session_id}`,
      { headers: steelHeaders() }
    );
    if (st.status === 404) live = false;
    else if (st.ok) {
      const info = (await st.json()) as { status?: string };
      if (info.status && !["live", "active", "running"].includes(info.status)) {
        live = info.status !== "released" && info.status !== "failed";
      }
    }
  } catch {
    /* keep showing viewer */
  }

  const cookies = live
    ? await getSteelContextCookies(row.steel_session_id).catch(() => [])
    : [];

  return {
    live,
    cookieCount: cookies.length,
    cookies,
    viewerUrl: row.steel_viewer_url,
    sessionId: row.steel_session_id,
  };
}

export async function captureSteelCookies(accountId: string) {
  await initDb();
  const rows = await sql`
    SELECT steel_session_id FROM cmc_accounts WHERE id = ${accountId} LIMIT 1
  `;
  const row = rows[0] as { steel_session_id: string | null } | undefined;
  if (!row?.steel_session_id) {
    throw new Error("No live Steel session. Click Login first.");
  }

  const sessionId = row.steel_session_id;

  // Dynamic import so Login route never loads Playwright
  const { chromium } = await import("playwright-core");
  const browser = await chromium.connectOverCDP(steelWs(sessionId), {
    timeout: 45000,
  });
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error("No browser context on Steel session");

    // Make sure the diamonds page is open so we can tell guest from logged in
    const pages = context.pages();
    const page =
      pages.find((p) => p.url().includes("/account/my-diamonds")) ??
      pages[0] ??
      (await context.newPage());
    if (!page.url().includes("/account/my-diamonds")) {
      await page
        .goto(CMC_DIAMONDS_URL, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        })
        .catch(() => null);
    }

    if (await isLoginCtaVisible(page)) {
      throw new Error(
        "Not logged in yet. Sign in to CoinMarketCap in the live browser first."
      );
    }

    const cookies = await context.cookies();
    const cmc = cookies.filter(
      (c) =>
        String(c.domain).includes("coinmarketcap.com") ||
        String(c.domain).includes("cmc.com")
    );

    if (cmc.length < 3) {
      throw new Error(
        "Not enough cookies yet. In the live browser open coinmarketcap.com, finish login (2FA/captcha), then Capture again."
      );
    }

    const far = Math.floor(Date.now() / 1000) + 150 * 24 * 60 * 60;
    return cmc.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || "/",
      expires:
        !c.expires || c.expires < 0 || c.expires < far - 30 * 24 * 60 * 60
          ? far
          : c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: (c.sameSite as "Strict" | "Lax" | "None") || "Lax",
    }));
  } finally {
    await browser.close().catch(() => null);
    await releaseSteel(accountId).catch(() => null);
  }
}

export async function releaseSteel(accountId: string) {
  await initDb();
  const rows = await sql`
    SELECT steel_session_id FROM cmc_accounts WHERE id = ${accountId} LIMIT 1
  `;
  const row = rows[0] as { steel_session_id: string | null } | undefined;
  const sessionId = row?.steel_session_id;
  if (sessionId) {
    await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/release`, {
      method: "POST",
      headers: steelHeaders(),
      body: "{}",
    }).catch(() => null);
  }
  await sql`
    UPDATE cmc_accounts SET
      steel_session_id = NULL,
      steel_viewer_url = NULL,
      updated_at = NOW()
    WHERE id = ${accountId}
  `;
}
