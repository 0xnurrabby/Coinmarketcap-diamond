import { redirect } from "next/navigation";
import { getSessionUser, hasSiteAccess } from "@/lib/auth";

export default async function HomePage() {
  if (!(await hasSiteAccess())) redirect("/gate");
  if (await getSessionUser()) redirect("/dashboard");
  redirect("/login");
}
