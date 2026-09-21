import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export type LiveSession = {
  accountId: string;
  steelSessionId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  cookieCount: number;
  liveUrl: string;
  startedAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __steelLiveSessions: Map<string, LiveSession> | undefined;
}

function store() {
  if (!globalThis.__steelLiveSessions) {
    globalThis.__steelLiveSessions = new Map();
  }
  return globalThis.__steelLiveSessions;
}

function steelKey() {
  const key = process.env.STEEL_API_KEY;
  if (!key) throw new Error("STEEL_API_KEY is not configured");
  return key;
}

export function getLiveSession(accountId: string) {
  return store().get(accountId) ?? null;
}

async function releaseSteel(sessionId: string) {
  try {
    await fetch(`https://api.steel.dev/v1/sessions/${sessionId}/release`, {
      method: "POST",
      headers: { "steel-api-key": steelKey() },
    });
  } catch {
    /* ignore */
  }
}

export async function closeLoginBrowser(accountId: string) {
  const session = store().get(accountId);
  if (!session) return;
  store().delete(accountId);
  try {
    await session.browser.close();
  } catch {
    /* */
  }
  await releaseSteel(session.steelSessionId);
}

export async function openLoginBrowser(accountId: string) {
  await closeLoginBrowser(accountId);
  const apiKey = steelKey();

  const createRes = await fetch("https://api.steel.dev/v1/sessions", {
    method: "POST",
    headers: {
      "steel-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      // 15 minutes for 2FA / captcha (free plan max)
      timeout: 900_000,
      headless: false,
    }),
  });

  if (!createRes.ok) {
    const t = await createRes.text();
    throw new Error(`Steel session failed: ${t.slice(0, 300)}`);
  }

  const steel = (await createRes.json()) as {
    id: string;
    websocketUrl: string;
    sessionViewerUrl: string;
    debugUrl?: string;
  };

  const wsUrl = `${steel.websocketUrl}${
    steel.websocketUrl.includes("?") ? "&" : "?"
  }apiKey=${encodeURIComponent(apiKey)}`;

  const browser = await chromium.connectOverCDP(wsUrl);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());

  await page.goto("https://coinmarketcap.com/", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });

  const live: LiveSession = {
    accountId,
    steelSessionId: steel.id,
    browser,
    context,
    page,
    cookieCount: 0,
    liveUrl: steel.sessionViewerUrl || steel.debugUrl || "",
    startedAt: Date.now(),
  };

  const refresh = async () => {
    try {
      const cookies = await context.cookies();
      live.cookieCount = cookies.filter((c) =>
        String(c.domain).includes("coinmarketcap")
      ).length;
    } catch {
      /* closed */
    }
  };
  await refresh();
  const timer = setInterval(refresh, 1500);
  browser.on("disconnected", () => {
    clearInterval(timer);
    store().delete(accountId);
  });

  store().set(accountId, live);

  return {
    liveUrl: live.liveUrl,
    cookieCount: live.cookieCount,
    steelSessionId: steel.id,
  };
}

export async function captureSessionCookies(accountId: string) {
  const session = store().get(accountId);
  if (!session) {
    throw new Error("No live browser. Click Login first.");
  }

  const cookies = await session.context.cookies();
  const cmc = cookies.filter(
    (c) =>
      String(c.domain).includes("coinmarketcap.com") ||
      String(c.domain).includes("cmc.com")
  );

  if (cmc.length < 3) {
    throw new Error(
      "Not enough cookies yet. Finish login in the live browser (2FA/captcha), then Capture."
    );
  }

  // Prefer long local expiry marker (~150 days) for our DB; CMC may still expire earlier
  const far = Math.floor(Date.now() / 1000) + 150 * 24 * 60 * 60;
  const serialized = cmc.map((c) => ({
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

  await closeLoginBrowser(accountId);
  return serialized;
}
