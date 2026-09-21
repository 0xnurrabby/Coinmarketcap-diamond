import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

let client: Sql | null = null;

function db(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return client;
}

/**
 * Lazily created so `next build` never needs DATABASE_URL at build time.
 */
export const sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    const fn = db() as unknown as (...a: unknown[]) => unknown;
    return fn(...args);
  },
  get(_target, prop) {
    const c = db() as unknown as Record<string | symbol, unknown>;
    const value = c[prop];
    return typeof value === "function" ? value.bind(c) : value;
  },
}) as Sql;

let initPromise: Promise<void> | null = null;

export async function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          banned BOOLEAN NOT NULL DEFAULT FALSE,
          email_verified BOOLEAN NOT NULL DEFAULT FALSE,
          last_login_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS otps (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          code TEXT NOT NULL,
          purpose TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          used BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS cmc_accounts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          cookies_json TEXT,
          cmc_email TEXT,
          cmc_password_enc TEXT,
          diamonds INTEGER NOT NULL DEFAULT 0,
          auto_claim BOOLEAN NOT NULL DEFAULT TRUE,
          last_claim_at TIMESTAMPTZ,
          next_claim_at TIMESTAMPTZ,
          claimed_date DATE,
          session_expires_at TIMESTAMPTZ,
          streak INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      // migrations for existing tables
      await sql`ALTER TABLE cmc_accounts ADD COLUMN IF NOT EXISTS cmc_email TEXT`;
      await sql`ALTER TABLE cmc_accounts ADD COLUMN IF NOT EXISTS cmc_password_enc TEXT`;
      await sql`ALTER TABLE cmc_accounts ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ`;

      await sql`
        CREATE TABLE IF NOT EXISTS activities (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          account_id TEXT,
          type TEXT NOT NULL,
          message TEXT NOT NULL,
          diamonds_delta INTEGER NOT NULL DEFAULT 0,
          meta JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_accounts_user ON cmc_accounts(user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_activities_user ON activities(user_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email, purpose)`;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export type User = {
  id: string;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  banned: boolean;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type CmcAccount = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  cookies_json: string | null;
  cmc_email: string | null;
  cmc_password_enc: string | null;
  diamonds: number;
  auto_claim: boolean;
  last_claim_at: string | null;
  next_claim_at: string | null;
  claimed_date: string | null;
  session_expires_at: string | null;
  streak: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export function dayString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

export function publicAccount(a: CmcAccount) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: a.id,
    name: a.name,
    cmcEmail: a.cmc_email,
    status: a.status,
    diamonds: a.diamonds,
    autoClaim: a.auto_claim,
    lastClaimAt: a.last_claim_at,
    nextClaimAt: a.next_claim_at,
    claimedToday: dayString(a.claimed_date) === today,
    streak: a.streak,
    lastError: a.last_error,
    hasSession: Boolean(a.cookies_json),
    hasCredentials: Boolean(a.cmc_email && a.cmc_password_enc),
    createdAt: a.created_at,
  };
}
