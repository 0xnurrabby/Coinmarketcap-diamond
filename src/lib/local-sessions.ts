import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const CMC_DIAMONDS_URL = "https://coinmarketcap.com/account/my-diamonds/";
const CMC_LOGIN_CTA =
  'button[data-btnname="Log In to Collect"], button:has-text("Log In to Collect"), button:has-text("Log In to Complete")';

export type LocalSession = {
  accountId: string;
  context: BrowserContext;
  page: Page;
  startedAt: number;
};

export type StoredCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

declare global {
  // eslint-disable-next-line no-var
  var __cmcLocalSessions: Map<string, LocalSession> | undefined;
}

function store() {
  if (!globalThis.__cmcLocalSessions) {
    globalThis.__cmcLocalSessions = new Map();
  }
  return globalThis.__cmcLocalSessions;
}

/** Local dev uses a real Chrome window on this PC; Vercel falls back to Steel. */
export function useLocalBrowser() {
  const mode = process.env.LOGIN_BROWSER?.trim().toLowerCase();
  if (mode === "steel") return false;
  if (mode === "local") return true;
  return !process.env.VERCEL;
}

function isCmcCookie(c: { domain?: string }) {
  const domain = String(c.domain || "");
  return domain.includes("coinmarketcap.com") || domain.includes("cmc.com");
}

async function isLoginCtaVisible(page: Page) {
  return page
    .locator(CMC_LOGIN_CTA)
    .first()
    .isVisible()
    .catch(() => false);
}

function diamondsPage(context: BrowserContext) {
  return context.pages().find((p) => p.url().includes("/account/my-diamonds"));
}

async function liveSession(accountId: string) {
  const session = store().get(accountId);
  if (!session) return null;
  if (session.context.browser()?.isConnected() === false) {
    store().delete(accountId);
    return null;
  }
  return session;
}

export async function openLocalLogin(accountId: string) {
  await closeLocalLogin(accountId);
  const profileDir = path.join(process.cwd(), ".local-browser", accountId);
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: false,
    viewport: null,
    args: ["--start-maximized", "--no-first-run", "--no-default-browser-check"],
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(CMC_DIAMONDS_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const cta = page.locator(CMC_LOGIN_CTA).first();
  try {
    await cta.waitFor({ state: "visible", timeout: 15000 });
    await cta.click({ timeout: 8000 });
    await page.waitForTimeout(1200);
  } catch {
    /* already logged in, or user opens the modal manually */
  }

  const session: LocalSession = {
    accountId,
    context,
    page,
    startedAt: Date.now(),
  };
  store().set(accountId, session);
  context.on("close", () => {
    if (store().get(accountId) === session) store().delete(accountId);
  });

  return session;
}

export async function getLocalStatus(accountId: string) {
  const session = await liveSession(accountId);
  if (!session) return { live: false, cookieCount: 0 };
  try {
    const cookies = (await session.context.cookies()).filter(isCmcCookie);
    return { live: true, cookieCount: cookies.length };
  } catch {
    store().delete(accountId);
    return { live: false, cookieCount: 0 };
  }
}

export async function isLocalLoggedIn(accountId: string) {
  const session = await liveSession(accountId);
  if (!session) return false;
  try {
    const page = diamondsPage(session.context);
    if (!page) return false;
    if (await isLoginCtaVisible(page)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function captureLocalCookies(accountId: string) {
  const session = await liveSession(accountId);
  if (!session) {
    throw new Error("No Chrome window is open. Click Login first.");
  }

  const pages = session.context.pages();
  const page = diamondsPage(session.context) ?? pages[0];
  if (!page) throw new Error("Chrome window was closed. Click Login again.");

  if (await isLoginCtaVisible(page)) {
    throw new Error(
      "Not logged in yet. Sign in to CoinMarketCap in the Chrome window first."
    );
  }

  const cookies = (await session.context.cookies()).filter(isCmcCookie);
  if (cookies.length < 3) {
    throw new Error(
      "Not enough cookies yet. Finish the CoinMarketCap login, then try again."
    );
  }

  const far = Math.floor(Date.now() / 1000) + 150 * 24 * 60 * 60;
  const stored: StoredCookie[] = cookies.map((c) => ({
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

  await closeLocalLogin(accountId);
  return stored;
}

export async function closeLocalLogin(accountId: string) {
  const session = store().get(accountId);
  if (!session) return;
  store().delete(accountId);
  await session.context.close().catch(() => null);
}
