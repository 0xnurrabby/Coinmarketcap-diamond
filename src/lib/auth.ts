import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { initDb, sql, type User } from "./db";
import { isAdminEmail, roleForEmail } from "./admins";

const USER_COOKIE = "dc_user";
const SITE_COOKIE = "dc_site";

function secret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "dev-secret-change-me"
  );
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createUserToken(user: Pick<User, "id" | "email" | "role">) {
  const role = roleForEmail(user.email);
  return new SignJWT({
    sub: user.id,
    email: user.email.toLowerCase(),
    role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function setUserCookie(token: string) {
  const store = await cookies();
  store.set(USER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearUserCookie() {
  const store = await cookies();
  store.delete(USER_COOKIE);
}

export async function createSiteToken() {
  return new SignJWT({ site: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function setSiteCookie(token: string) {
  const store = await cookies();
  store.set(SITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function verifySiteAccessFromToken(token: string | undefined) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.site === true;
  } catch {
    return false;
  }
}

export async function hasSiteAccess() {
  const store = await cookies();
  return verifySiteAccessFromToken(store.get(SITE_COOKIE)?.value);
}

export async function getSessionUser(): Promise<User | null> {
  await initDb();
  const store = await cookies();
  const token = store.get(USER_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    const rows = await sql`SELECT * FROM users WHERE id = ${payload.sub} LIMIT 1`;
    const user = rows[0] as User | undefined;
    if (!user || user.banned) return null;
    // Env list is the only source of truth for admin access
    user.role = roleForEmail(user.email);
    return user;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminEmail(user.email)) throw new Error("FORBIDDEN");
  return user;
}

export async function findUserByEmail(email: string) {
  await initDb();
  const rows = await sql`
    SELECT * FROM users WHERE lower(email) = lower(${email.trim()}) LIMIT 1
  `;
  return (rows[0] as User | undefined) ?? null;
}

export async function createUser(email: string, passwordHash: string) {
  await initDb();
  const id = uuidv4();
  const normalized = email.trim().toLowerCase();
  const role = roleForEmail(normalized);
  await sql`
    INSERT INTO users (id, email, password_hash, role, email_verified)
    VALUES (${id}, ${normalized}, ${passwordHash}, ${role}, TRUE)
  `;
  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
  const user = rows[0] as User;
  user.role = role;
  return user;
}

export { USER_COOKIE, SITE_COOKIE };
