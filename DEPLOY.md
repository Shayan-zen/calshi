# Deploying from the Cloudflare dashboard

This guide deploys Pilani Predict entirely through the Cloudflare web dashboard, with no Wrangler CLI on your machine. Cloudflare builds straight from the GitHub repo (`Shayan-zen/calshi`) and redeploys on every push to `main`.

**Time:** ~15 minutes. **Cost:** the free plan covers everything here: Workers, D1 and cron triggers.

---

## 1. Create the D1 database

1. Go to **dash.cloudflare.com**, log in, and open **Storage & Databases → D1 SQL Database** in the left sidebar.
2. Click **Create Database**.
3. Name it **`pilani-predict`**, leave the location on *Automatic*, and click **Create**.
4. On the database page, copy the **Database ID**. It's a UUID like `a1b2c3d4-...`.

## 2. Put the database ID in `wrangler.jsonc`

You can do this in the GitHub web editor:

1. Open https://github.com/Shayan-zen/calshi/blob/main/wrangler.jsonc and click the ✏️ pencil icon.
2. Replace `00000000-0000-0000-0000-000000000000` with the ID you copied:
   ```jsonc
   "database_id": "a1b2c3d4-....",
   ```
3. Click **Commit changes** and commit directly to `main`.

> The database ID is not a secret, so committing it is fine.

## 3. Connect the GitHub repo to a Worker

1. In the dashboard, go to **Compute (Workers) → Workers & Pages** and click **Create**.
2. On the **Workers** tab, choose **Import a repository**.
3. Click **Connect GitHub**, authorize Cloudflare, and select the **`Shayan-zen/calshi`** repo. You can grant access to just that repo.
4. Fill in the build settings:

   | Field | Value |
   |---|---|
   | **Project name** | `pilani-predict` (**must match** `"name"` in `wrangler.jsonc`, or the build fails) |
   | **Production branch** | `main` |
   | **Build command** | `npm run build` |
   | **Deploy command** | `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy` |
   | **Root directory** | `/` (leave blank) |

5. Expand **Advanced settings → Build variables** and add:

   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `22` |

6. Click **Create and deploy**. The first build takes 1–3 minutes. The deploy command also creates all the database tables, because the migrations run before every deploy and already-applied ones are skipped.

> **If the build fails with a D1 permission / authentication error:** the auto-generated build token can't write to D1.
> 1. Go to **My Profile → API Tokens → Create Token** and use the **"Edit Cloudflare Workers"** template.
> 2. Add one more permission row: **Account → D1 → Edit**. Create the token and copy it.
> 3. In the Worker, go to **Settings → Build → Build variables and secrets** and add the token as a **secret** named `CLOUDFLARE_API_TOKEN`.
> 4. Go to **Deployments** and click **Retry build**.

## 4. Load the demo markets (one time only)

The database starts empty, with no markets and no market-maker bot account. To seed it once:

1. In the Worker, open **Settings → Build** and edit the **Deploy command** to:
   ```
   npx wrangler d1 migrations apply DB --remote && npm run db:seed:remote && npx wrangler deploy
   ```
2. Go to **Deployments** and click **Retry build** on the latest one, or push any commit.
3. When it succeeds, **change the deploy command back** to:
   ```
   npx wrangler d1 migrations apply DB --remote && npx wrangler deploy
   ```

> ⚠️ Don't leave the seed step in. Re-seeding on every deploy would reset the demo markets and their price history.

To check it worked: **D1 → pilani-predict → Console**, run `SELECT COUNT(*) FROM events;`, and expect roughly 25.

## 5. Add the secrets

In the Worker, go to **Settings → Variables and Secrets → + Add**. Add each of these with **Type: Secret**, *not* Text. Plain-text vars set in the dashboard get overwritten by the next deploy, but secrets don't.

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | `793945071992-nin68db30pss6a4cnsp9rvkso780knu6.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | the `client_secret` from your downloaded `client_secret_*.json` file |
| `ADMIN_EMAILS` | `f20250983@pilani.bits-pilani.ac.in` (comma-separate more admins) |

Click **Deploy** to save. **Never add `DEV_LOGIN`** here: it enables a password-less dev login.

`ALLOWED_EMAIL_DOMAIN` is already set to `pilani.bits-pilani.ac.in` in `wrangler.jsonc`, so you don't need to add it.

## 6. Allow the production URL in Google OAuth

1. Copy your Worker's URL from its **Overview** page, e.g. `https://pilani-predict.<your-subdomain>.workers.dev`.
2. In **console.cloud.google.com**, select project **calshi** and go to **APIs & Services → Credentials**, then click your OAuth 2.0 Client ID.
3. Under **Authorized redirect URIs**, click **+ Add URI** and add:
   ```
   https://pilani-predict.<your-subdomain>.workers.dev/api/auth/google/callback
   ```
   For local dev, also add `http://localhost:5173/api/auth/google/callback`.
4. Click **Save**. Google can take a few minutes to apply the change.
5. Under **APIs & Services → OAuth consent screen**: if the app's **Publishing status** is *Testing*, only listed test users can log in. Click **Publish app** so every `@pilani.bits-pilani.ac.in` account can sign in. With only the `openid email profile` scopes, Google won't require verification.

## 7. Done: check it works

1. Open the Worker URL. You should see the markets grid.
2. Log in with your BITS Google account. Non-BITS accounts are rejected.
3. Because your email is in `ADMIN_EMAILS`, **Admin** appears in the avatar menu.
4. Prices move by themselves: the cron trigger (`* * * * *` in `wrangler.jsonc`) runs the market-maker bot every minute. You can see it under **Worker → Settings → Trigger events**.

---

## Everyday use

- **Deploying changes:** push to `main`. Cloudflare rebuilds and redeploys automatically, and new migrations in `migrations/` are applied as part of the deploy.
- **Logs:** Worker → **Logs** (observability is enabled in `wrangler.jsonc`).
- **Querying the DB:** D1 → `pilani-predict` → **Console**.
- **Custom domain:** Worker → **Settings → Domains & Routes → Add → Custom domain**. Then add `https://<domain>/api/auth/google/callback` to Google's redirect URIs too.
- **Rolling back:** Worker → **Deployments**, then pick an older version and **Rollback**.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails: *"name doesn't match"* | The Worker project name must be exactly `pilani-predict`. |
| Build fails: *"database_id ... not found"* | Step 2 wasn't done, or the ID doesn't belong to this Cloudflare account. |
| Google error `redirect_uri_mismatch` | The exact callback URL (https, no trailing slash) isn't listed in step 6. |
| Redirected to `/login?auth_error=domain` | You used a non-`@pilani.bits-pilani.ac.in` account. This is working as intended. |
| Site loads but has no markets | Step 4 (seed) wasn't run. |
| Prices never move | Check that **Settings → Trigger events** shows the cron, and look for errors under **Logs**. |
| Login works but no Admin menu | `ADMIN_EMAILS` is missing or doesn't exactly match your email. Fix it, then redeploy. |
