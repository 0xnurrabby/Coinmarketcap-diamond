import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SITE_COOKIE = "dc_site";
const USER_COOKIE = "dc_user";

function secret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}

async function hasSite(req: NextRequest) {
  const token = req.cookies.get(SITE_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.site === true;
  } catch {
    return false;
  }
}

async function userPayload(req: NextRequest) {
  const token = req.cookies.get(USER_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as { sub?: string; email?: string; role?: string };
  } catch {
    return null;
  }
}

const PUBLIC_PATHS = ["/gate", "/api/site-gate", "/api/cron"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  if (!isPublic) {
    const ok = await hasSite(req);
    if (!ok) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Site locked" }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/gate";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const user = await userPayload(req);
    // Only emails listed in ADMIN_EMAILS / ADMIN_EMAIL env can access admin
    if (!user?.sub || !isAdminEmail(user.email)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  const authPages = ["/login", "/register", "/forgot"];
  if (
    ["/dashboard", "/accounts", "/activity", "/admin"].some((p) =>
      pathname.startsWith(p)
    )
  ) {
    const user = await userPayload(req);
    if (!user?.sub) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (authPages.includes(pathname)) {
    const user = await userPayload(req);
    if (user?.sub) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
