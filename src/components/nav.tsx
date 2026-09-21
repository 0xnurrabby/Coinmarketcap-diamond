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
    <header className="sticky top-0 z-40 bg-canvas border-b border-hairline">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-5 min-w-0">
          <Link href="/dashboard" className="font-medium text-ink shrink-0">
            DiamondClaim
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-full text-sm ${
                  pathname.startsWith(l.href)
                    ? "bg-surface-strong text-ink"
                    : "text-muted hover:text-ink"
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
