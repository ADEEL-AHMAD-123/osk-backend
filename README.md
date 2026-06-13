# OSK Backend

Node.js + Express + TypeScript REST API for the OSK platform. MongoDB +
Mongoose, Redis, Socket.IO. No Docker.

> **Status.** The full middleware stack, response envelope, error handling,
> request correlation IDs and the module registry are in place.
> - `auth` — **fully implemented**: register / login / refresh-token rotation
>   with reuse detection / logout / session / email-verification +
>   password-reset token flows.
> - `properties` — **fully implemented**: MongoDB-backed CRUD with text /
>   geospatial / compound indexes, owner-scoped writes, and the lifecycle
>   draft → pending-review → published / rejected.
> - `contact` — call / WhatsApp / email channel endpoints (validated and
>   acknowledged; persistence + email relay pending).
> - The remaining domain modules return `501` until implemented — see
>   `../docs/ARCHITECTURE.md` §9 / §15.
>
> **MongoDB is now required** (auth + properties persist data). Run
> `npm run db:seed` once to create sample users and listings.
>
> Email delivery is not wired yet: verification / reset tokens are generated,
> persisted and logged (dev only) behind a `TODO(email)` marker for the
> `EmailProvider` adapter.

## Quick start

```bash
cp .env.example .env
npm install
# start MongoDB first (see "Native services" below), then:
npm run db:seed        # sample users + listings
npm run dev            # runs preflight, then starts on :5000
```

Node 22+ required. The API boots even if MongoDB is down (preflight only
warns), but `auth` and `properties` return `503` until MongoDB is running.

```bash
curl http://localhost:5000/api/v1/health
curl http://localhost:5000/api/v1/properties      # after db:seed
```

The seed creates two logins (development only):
`admin@osk.dev / Admin1234` and `agent@osk.dev / Agent1234`.

## Scripts

| Script              | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Preflight, then `tsx` watch (memory-friendly)    |
| `npm run build`     | `tsc` → `dist/`                                  |
| `npm start`         | Run the built server                            |
| `npm run preflight` | Verify Node, env, and MongoDB/Redis reachability |
| `npm run typecheck` | `tsc --noEmit`                                   |
| `npm run lint`      | ESLint                                           |
| `npm test`          | Jest (+ Supertest for API tests)                 |
| `npm run db:seed`   | Seed script (placeholder in the shell)           |

## Architecture

Feature-first modules over a four-layer split — see `../docs/ARCHITECTURE.md`.

```
src/
├── server.ts          Process bootstrap (HTTP + Socket.IO, signals)
├── app.ts             Express app: middleware stack + module router
├── config/            env, logger, db, redis
├── shared/            response envelope, errors, middleware, helpers
└── modules/
    ├── index.ts       Module registry — wire new modules here, only here
    ├── health/        liveness + dependency status
    ├── auth/          presentation scaffold (501 until Sprint 2)
    ├── properties/    routes → controller → service → data
    └── contact/       call / WhatsApp / email channels
```

### Adding a module

Create `modules/<name>/<name>.routes.ts` (+ controller, service, model as
needed), then add one line to `modules/index.ts`. Nothing else changes.

### Layers

`routes` (presentation) → `controller` (presentation) → `service`
(application) → `repository`/`data` (infrastructure). Dependencies point
inward. The `properties` module is the reference implementation of the split.

## API

All endpoints are under `/api/v1`. Every response uses one envelope:

```json
{ "success": true, "data": {}, "meta": {}, "requestId": "req_…" }
{ "success": false, "error": { "code": "", "message": "" }, "requestId": "req_…" }
```

Implemented:

- **Auth** (requires MongoDB): `POST /auth/register`, `POST /auth/login`,
  `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/session`,
  `POST /auth/verify-email`, `POST /auth/forgot-password`,
  `POST /auth/reset-password`.
- **Properties** (MongoDB): `GET /properties`, `GET /properties/map`,
  `GET /properties/mine`, `GET /properties/:slug`, `POST /properties`,
  `PATCH /properties/:id`, `POST /properties/:id/submit`,
  `POST /properties/:id/approve`, `POST /properties/:id/reject`.
- **Contact**: `POST /contact/inquiry`, `POST /contact/call-intent`,
  `POST /contact/callback-request`, `GET /contact/whatsapp-link/:propertyId`.
- `GET /health`.

## Environment

Copy `.env.example` → `.env`. The app validates env at boot (`config/env.ts`)
and exits on a malformed config.

## Native services (no Docker)

```bash
# macOS
brew services start mongodb-community@8.0
brew services start redis

# Linux
sudo systemctl start mongod redis-server
```

## Troubleshooting

- **Port 5000 in use** — `lsof -ti:5000 | xargs kill`, or change `PORT`.
- **MongoDB/Redis "not reachable"** — preflight warns but the shell still
  runs; start the services with the commands above to clear it.
- **`tsx` not found** — run `npm install` (it is a dev dependency).
- **Stale build** — `rm -rf dist` then `npm run build`.
