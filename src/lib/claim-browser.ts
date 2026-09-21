import type { Browser } from "playwright-core";

export type CookiePayload = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
};

export type CmcSnapshot = {
  loggedIn: boolean;
  email: string | null;
  diamonds: number | null;
  claimedToday: boolean;
  streak: number;
  weekStates: boolean[];
  claimStatus: "claimed" | "already" | "error" | "skipped";
  claimMessage: string;
  cookies: CookiePayload[];
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CMC_DIAMONDS_URL = "https://coinmarketcap.com/account/my-diamonds/";

function isCmcDomain(domain: string | undefined) {
  const d = String(domain || "");
  return d.includes("coinmarketcap.com") || d.includes("cmc.com");
}

function toPlaywrightCookie(c: CookiePayload) {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain?.startsWith(".") ? c.domain : c.domain || ".coinmarketcap.com",
    path: c.path || "/",
    expires: typeof c.expires === "number" && c.expires > 0 ? c.expires : -1,
    httpOnly: Boolean(c.httpOnly),
    secure: c.secure !== false,
    sameSite: (c.sameSite as "Strict" | "Lax" | "None") || ("Lax" as const),
  };
}

/** Uses installed Chrome when present, otherwise the bundled Chromium. */
async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
}

/**
 * CMC's WAF rejects plain server-side HTTP requests (error 40110), so the
 * loyalty API is always called from inside a real browser page.
 */
export async function withClaimBrowser<T>(
  fn: (browser: Browser) => Promise<T>
): Promise<T> {
  const browser = await launchBrowser();
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => null);
  }
}

export async function snapshotInBrowser(
  browser: Browser,
  cookies: CookiePayload[],
  doClaim: boolean
): Promise<CmcSnapshot> {
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 900 },
  });

  try {
    await context.addCookies(cookies.map(toPlaywrightCookie));
    const page = await context.newPage();
    await page.goto(CMC_DIAMONDS_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2500);

    const data = await page.evaluate(async (shouldClaim: boolean) => {
      const csrf =
        document.cookie
          .split("; ")
          .find((c) => c.startsWith("x-csrf-token="))
          ?.split("=")[1] || "";

      const call = async (path: string, body: unknown = {}) => {
        const res = await fetch(`https://api.coinmarketcap.com${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            platform: "web",
            accept: "application/json, text/plain, */*",
            "x-csrf-token": csrf,
          },
          credentials: "include",
          body: JSON.stringify(body),
        });
        return (await res.json().catch(() => null)) as Record<
          string,
          unknown
        > | null;
      };

      const user = await call("/user-info/v3/user-info/get");
      const before = await call("/asset/v3/loyalty/user-point-summary");
      const checkin = shouldClaim
        ? await call("/asset/v3/loyalty/check-in/", { platform: "web" })
        : null;
      const after = await call("/asset/v3/loyalty/user-point-summary");
      const logs = await call("/asset/v3/loyalty/latest-check-in-logs");
      return { user, before, checkin, after, logs };
    }, doClaim);

    const cookiesOut = (await context.cookies())
      .filter((c) => isCmcDomain(c.domain))
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || "/",
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      }));

    type Status = { error_code?: string | number; error_message?: string };
    const status = (j: Record<string, unknown> | null): Status =>
      ((j?.status ?? {}) as Status) || {};
    const payload = (j: Record<string, unknown> | null) =>
      (j?.data ?? null) as Record<string, unknown> | null;

    const userCode = String(status(data.user).error_code ?? "");
    const loggedIn = userCode === "0" && Boolean(payload(data.user));
    const email = (payload(data.user)?.email as string | undefined) ?? null;

    const afterPoint = payload(data.after)?.point;
    const beforePoint = payload(data.before)?.point;
    const rawPoint = afterPoint ?? beforePoint;
    const diamonds =
      typeof rawPoint === "number" && Number.isFinite(rawPoint)
        ? Math.floor(rawPoint)
        : null;

    const logs = Array.isArray(payload(data.logs))
      ? (payload(data.logs) as unknown as Array<{ state?: number }>)
      : [];
    const weekStates = logs.map((l) => l?.state === 1);
    const claimedToday =
      weekStates.length > 0 && weekStates[weekStates.length - 1] === true;
    let streak = 0;
    for (let i = weekStates.length - 1; i >= 0; i--) {
      if (!weekStates[i]) break;
      streak++;
    }

    let claimStatus: CmcSnapshot["claimStatus"] = "skipped";
    let claimMessage = "";
    if (doClaim) {
      const checkinStatus = status(data.checkin);
      const code = String(checkinStatus.error_code ?? "");
      const msg = String(checkinStatus.error_message || "");
      if (code === "0") {
        claimStatus = "claimed";
        claimMessage = "Claimed today's diamonds";
      } else if (code === "10007" || /twice a day|already/i.test(msg)) {
        claimStatus = "already";
        claimMessage = "Already claimed today on CMC";
      } else if (!loggedIn) {
        claimStatus = "error";
        claimMessage = "Session expired — log in again";
      } else {
        claimStatus = "error";
        claimMessage = msg || `Claim rejected (${code || "unknown"})`;
      }
    }

    return {
      loggedIn,
      email,
      diamonds,
      claimedToday,
      streak,
      weekStates,
      claimStatus,
      claimMessage,
      cookies: cookiesOut,
    };
  } finally {
    await context.close().catch(() => null);
  }
}
