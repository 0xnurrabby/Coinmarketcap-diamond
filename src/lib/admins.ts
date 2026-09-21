/** Comma-separated admin emails from env (ADMIN_EMAILS or ADMIN_EMAIL). */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = getAdminEmails();
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

export function roleForEmail(email: string): "admin" | "user" {
  return isAdminEmail(email) ? "admin" : "user";
}
