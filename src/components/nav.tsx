"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "./ui";

export function AppNav({
  email,
  role,
}: {
  email: string;
  role?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/accounts", label: "Accounts" },
    { href: "/activity", label: "Activity" },
    ...(role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 bg-canvas/90 backdrop-blur border-b border-hairline">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-5 min-w-0">
          <Link
            href="/dashboard"
            className="font-semibold text-ink shrink-0 flex items-center gap-2"
          >
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white text-[11px] shadow-sm">
              ◆
            </span>
            DiamondClaim
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-full text-sm transition-all duration-200 ${
                  pathname.startsWith(l.href)
                    ? "bg-surface-strong text-ink font-medium"
                    : "text-muted hover:text-ink hover:bg-surface-soft"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-xs text-muted truncate max-w-[160px]">
            {email}
          </span>
          <Button variant="secondary" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
