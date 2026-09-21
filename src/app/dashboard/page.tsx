import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canOpenLoginWindow } from "@/lib/local-sessions";
import { AppNav } from "@/components/nav";
import { DashboardClient } from "./client";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen">
      <AppNav email={user.email} role={user.role} />
      <DashboardClient browserMode={canOpenLoginWindow() ? "local" : "cloud"} />
    </div>
  );
}
