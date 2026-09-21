import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admins";
import { AppNav } from "@/components/nav";
import { AdminClient } from "./client";

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/dashboard");
  return (
    <div className="min-h-screen">
      <AppNav email={user.email} role="admin" />
      <AdminClient />
    </div>
  );
}
