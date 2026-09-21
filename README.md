# DiamondClaim

Multi-user CoinMarketCap diamond claimer (Neon + Vercel).

## Setup

```bash
cp .env.example .env.local
# fill DATABASE_URL, AUTH_SECRET, SITE_PASSWORD, ADMIN_EMAIL, RESEND_API_KEY
npm install
npm run dev
```

## Env

| Key | Purpose |
|-----|---------|
| `DATABASE_URL` | Neon Postgres |
| `AUTH_SECRET` | JWT signing |
| `SITE_PASSWORD` | Gate before whole site |
| `ADMIN_EMAILS` | Comma-separated emails that can open `/admin` |
| `RESEND_API_KEY` | OTP email |
| `EMAIL_FROM` | Verified Resend sender |
| `CRON_SECRET` | Protects `/api/cron/claim` |

## Flow

1. Site password (`/gate`)
2. Register with email + OTP
3. Add CMC account + paste cookies
4. Dashboard → **Claim all** (skips already claimed)
5. Cron hourly for auto accounts

## Admin

Register with `ADMIN_EMAIL` → `/admin`
