import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canOpenLoginWindow, localAppUrl } from "@/lib/local-sessions";
import { AppNav } from "@/components/nav";
import { DashboardClient } from "./client";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const local = canOpenLoginWindow();
  return (
    <div className="min-h-screen">
      <AppNav email={user.email} role={user.role} />
      <DashboardClient
        browserMode={local ? "local" : "cloud"}
        localAppUrl={local ? null : localAppUrl()}
      />
    </div>
  );
}
