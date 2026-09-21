import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppNav } from "@/components/nav";
import { ActivityClient } from "./client";

export default async function ActivityPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen">
      <AppNav email={user.email} role={user.role} />
      <ActivityClient />
    </div>
  );
}
