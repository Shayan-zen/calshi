# Pilani Predict

A Kalshi-style prediction market for BITS Pilani. It uses play money ($1,000 starting balance), a real order book (CLOB) with a bot market maker, multi-outcome events, a leaderboard, comments and an admin panel. It runs on **Cloudflare Workers + D1**.

Sign-in is **Google OAuth only**, restricted to `@pilani.bits-pilani.ac.in` accounts. The domain is checked on the server.

## Stack
- Worker: Hono + D1 (`src/worker`), cron trigger every minute runs the market-maker bot
- Client: React 19 + Vite + Tailwind v4 (`src/client`), served as Workers static assets
- Shared API contract: `src/shared/types.ts`

## Local development
```powershell
npm install
copy .dev.vars.example .dev.vars   # fill in Google creds; DEV_LOGIN=true enables a dev-only login form
npm run db:migrate:local
npm run db:seed:local
npm run dev                         # http://localhost:5173
```
Users whose email is listed in `ADMIN_EMAILS` (comma separated) get the admin panel at `/admin`.

## Google OAuth setup
In Google Cloud Console → APIs & Services → Credentials → your OAuth client, add these **Authorized redirect URIs**:
- `http://localhost:5173/api/auth/google/callback`
- `https://<your-worker>.<your-subdomain>.workers.dev/api/auth/google/callback` (and your custom domain, if any)

## Deploy to Cloudflare
```powershell
npx wrangler login
npx wrangler d1 create pilani-predict       # copy database_id into wrangler.jsonc
npm run db:migrate:remote
npm run db:seed:remote
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put ADMIN_EMAILS
npm run deploy
```
Do **not** set `DEV_LOGIN` in production.
