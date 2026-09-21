import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admins";
import { initDb, sql } from "@/lib/db";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getSessionUser();
  if (!admin || !isAdminEmail(admin.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await initDb();
  const { id } = await params;
  const body = await req.json();

  if (typeof body.banned === "boolean") {
    if (id === admin.id) {
      return NextResponse.json({ error: "Cannot ban yourself" }, { status: 400 });
    }
    await sql`UPDATE users SET banned = ${body.banned} WHERE id = ${id}`;
  }

  const rows = await sql`
    SELECT id, email, role, banned, last_login_at, created_at FROM users WHERE id = ${id}
  `;
  return NextResponse.json({ user: rows[0] });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getSessionUser();
  if (!admin || !isAdminEmail(admin.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }
  await initDb();
  await sql`DELETE FROM users WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
