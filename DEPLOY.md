# OSK Deployment — Vercel (frontend) + Railway (backend)

This walks through a first-time production deploy. The two repos can be deployed independently, but they need each other's URLs in env vars, so do **Railway first**, then **Vercel**, then go back and lock the Railway `CORS_ORIGIN` to the real Vercel URL.

---

## 0. Prerequisites — managed services

You need two managed databases. Both have free tiers.

- **MongoDB Atlas** — create a free M0 cluster. Network Access → allow `0.0.0.0/0` (Railway egress IPs are dynamic). Copy the connection string (will look like `mongodb+srv://user:pass@cluster0.xxx.mongodb.net/osk`).
- **Redis** — either Railway's own Redis plugin (one click, recommended), or Upstash's free tier. Copy the `redis://` URL.

You'll paste both into the Railway backend env.

---

## 1. Backend — Railway

### 1.1 Create the project
- New project → "Deploy from GitHub repo" → pick this repo.
- Set **Root Directory** = `osk-backend` (Railway → Settings → Source).
- Railway auto-detects Node from `engines` / `.nvmrc` (22) and reads `railway.json` for the build + start commands. No manual setup required.

### 1.2 Environment variables
Paste these into Railway → Variables. Anything not listed uses the defaults from `src/config/env.ts`.

| Key | Value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | |
| `PORT` | _(leave unset)_ | Railway injects this automatically |
| `API_PREFIX` | `/api/v1` | |
| `MONGODB_URI` | `mongodb+srv://...` | From Atlas |
| `REDIS_URL` | `redis://...` | From Railway/Upstash |
| `JWT_ACCESS_SECRET` | _(long random)_ | `openssl rand -hex 48` |
| `JWT_REFRESH_SECRET` | _(long random, different)_ | `openssl rand -hex 48` |
| `JWT_ACCESS_TTL` | `15m` | |
| `JWT_REFRESH_TTL` | `7d` | |
| `CORS_ORIGIN` | _Vercel URL_ | e.g. `https://osk.vercel.app` — see §3 for multi-origin |
| `APP_BASE_URL` | _Vercel URL_ | used in email links (verify, reset) |
| `EMAIL_FROM` | `OSK <no-reply@osk.dev>` | |
| `EMAIL_PROVIDER` | `console` _or_ `smtp` | console = just logs; smtp = real send |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` | _SMTP creds_ | Only required when `EMAIL_PROVIDER=smtp` |
| `MEDIA_PROVIDER` | `local` _or_ `cloudinary` | local = ephemeral on Railway! see §1.4 |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` / `CLOUDINARY_FOLDER` | _Cloudinary creds_ | Required when `MEDIA_PROVIDER=cloudinary` |
| `SENTRY_DSN` | _(optional)_ | If/when error tracking ships |

### 1.3 Deploy + healthcheck
- Push to `main` (or the branch you connected). Nixpacks runs `npm ci` in the install phase; Railway then runs `npm run build` and starts via `node dist/server.js`.
- Healthcheck hits `/api/v1/health` (configured in `railway.json`). Wait for the green check.
- Note the public domain Railway assigned (e.g. `osk-backend-production-1234.up.railway.app`). You'll need it for the Vercel side.

### 1.4 About `MEDIA_PROVIDER=local` on Railway
The local-disk adapter writes to `./uploads/`. **Railway's filesystem is ephemeral** — every redeploy or restart wipes uploaded files. For real production, flip `MEDIA_PROVIDER=cloudinary` and add the four Cloudinary keys. The local adapter is fine for demo/staging where data loss across deploys is acceptable.

### 1.5 Seeding (optional)
Railway → ... → Run command → `npm run db:seed`. Creates `admin@osk.dev` / `agent@osk.dev` with sample listings. **Change the default passwords immediately** via the admin panel after first login.

---

## 2. Frontend — Vercel

### 2.1 Create the project
- Vercel → "Add New… → Project" → pick this repo.
- **Root Directory** = `osk-frontend`.
- Framework preset auto-detects from `vercel.json` (`framework: "nextjs"`). No manual build command override.

### 2.2 Environment variables
Add under Settings → Environment Variables. **All `NEXT_PUBLIC_*` vars are baked into the build**, so re-deploy after changing them.

| Key | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | `https://<railway-domain>/api/v1` | from §1.3 |
| `NEXT_PUBLIC_SOCKET_URL` | `https://<railway-domain>` | Socket.IO endpoint (no `/api/v1`) |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-vercel-domain>` | used by `next-sitemap` |
| `NEXT_PUBLIC_SITE_NAME` | `OSK` | |
| `NEXT_PUBLIC_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` | free, no key |
| `NEXT_PUBLIC_DEFAULT_THEME` | `theme-luxe-light` | one of the 4 themes |
| `NEXT_PUBLIC_SENTRY_DSN` | _(optional)_ | |

### 2.3 Image domains
Already configured in `next.config.mjs`: Cloudinary (`res.cloudinary.com`), Unsplash, and `*.up.railway.app` / `*.railway.app`. If you attach a custom domain to the Railway service, add it to `images.remotePatterns` and re-deploy.

### 2.4 Deploy
Push to `main`. Vercel builds via `npm run build`. First deploy takes ~2 minutes; subsequent deploys ~30 seconds.

---

## 3. Tie the two together

Once Vercel is live, go back to Railway and **update `CORS_ORIGIN`** with the real Vercel domain. `CORS_ORIGIN` accepts a comma-separated allowlist — keep preview deploys working by including the wildcard form:

```
CORS_ORIGIN=https://osk.vercel.app,https://osk-git-main-<team>.vercel.app
```

Vercel preview URLs change per branch, so either:
- Add each long-lived preview URL explicitly, or
- (For staging) point a stable `staging.osk.app` subdomain at the preview and whitelist that.

Also update `APP_BASE_URL` to match the production Vercel URL so the auth-email "Confirm your email" / "Reset your password" links resolve.

---

## 4. Auth across domains

Cross-origin cookies need three things, and they're already wired:

1. **`SameSite=None` + `Secure`** on the refresh cookie (in `auth.controller.ts`, set automatically when `NODE_ENV=production`).
2. **`trust proxy`** on Express so `Secure` works behind Railway's TLS terminator (set in `app.ts`).
3. **`credentials: 'include'`** on every fetch — already set in the RTK Query base.

If you ever get 401s on `/auth/refresh` from prod but not localhost, it's almost always one of: CORS_ORIGIN doesn't include the requesting Vercel domain, or `APP_BASE_URL` is still pointing at localhost.

---

## 5. Custom domains (optional, recommended)

- **Vercel**: Settings → Domains → add `osk.app` (or whatever you own). Vercel handles the TLS cert.
- **Railway**: Settings → Networking → add `api.osk.app`. Add a CNAME at your DNS provider pointing to the Railway-supplied target.
- **After both are live**: update `NEXT_PUBLIC_API_BASE_URL` (Vercel) and `CORS_ORIGIN` + `APP_BASE_URL` (Railway).

---

## 6. Smoke test the live deploy

1. `GET https://<railway>/api/v1/health` → `{success:true, data:{status:"ok", dependencies:{mongodb:"up", redis:"up"}}}`.
2. `GET https://<railway>/api/v1/docs` → loads the Swagger UI.
3. Open `https://<vercel>` → home page renders with sample listings.
4. Sign up a fresh account → confirms the auth flow works end-to-end (and that the refresh cookie is round-tripping across origins).
5. Sign in as the seeded admin (`admin@osk.dev`) → `/admin/audit` should show your moderation actions appearing live.

If any step fails, check `Railway → Deployments → Logs` (pino JSON, one line per request) and Vercel's Build/Function logs.

---

## 7. Day-2 operations

- **Logs**: Railway pipes pino to its built-in viewer. Filter on `level:error` for incidents.
- **Restarts**: `railway.json` sets `restartPolicyType: ON_FAILURE` with up to 5 retries — the service self-heals through transient crashes.
- **Rate limiting**: defaults to 120 req/min/IP at the edge, 20 req/15min on `/auth/login` and `/auth/register`. Tune in `app.ts` / `auth.routes.ts` if abuse becomes a problem.
- **Backups**: MongoDB Atlas does daily snapshots on every tier (incl. M0). For a stronger SLA bump to M2+.
- **Secrets rotation**: change a JWT secret → all existing sessions invalidate immediately (refresh tokens are signed with `JWT_REFRESH_SECRET`, access tokens with `JWT_ACCESS_SECRET`). Users land on the sign-in screen.
