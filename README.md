# OSK — Premium Real Estate Platform

OSK is a production-grade real estate platform supporting **Homes, Plots/Land,
Commercial, and Rentals**, across **Resale and New Projects**, with a premium,
luxury UI/UX and four first-class themes.

This workspace contains **two independent repositories** plus shared docs:

```
OSK/
├── docs/
│   └── ARCHITECTURE.md      ← Full 16-section architecture blueprint (read this first)
├── osk-frontend/            ← Next.js (App Router) + TypeScript + Redux Toolkit + SCSS
└── osk-backend/             ← Node.js + Express + TypeScript + MongoDB (shell)
```

> **Status of this scaffold:** the frontend is scaffolded end-to-end (tooling,
> SCSS token system + 4 themes, Redux/RTK Query, contracts, App Router pages,
> theming, contact-channel components, preflight checker). The backend is a
> runnable **shell** — middleware stack, response envelope, auth middleware and
> module folders are in place; domain logic is stubbed for a later pass.

## Quick start

```bash
# Frontend
cd osk-frontend
cp .env.example .env.local
npm install
npm run preflight     # verifies env + tooling
npm run dev           # http://localhost:3000

# Backend (shell)
cd ../osk-backend
cp .env.example .env
npm install
npm run dev           # http://localhost:5000/api/v1/health
```

No Docker is used anywhere. See `docs/ARCHITECTURE.md` § 14 for native local
setup of Node.js, MongoDB and Redis on macOS / Linux / Windows.

## Non-negotiables enforced by this scaffold

- REST APIs only, versioned at `/api/v1`.
- Redux Toolkit + RTK Query for **all** state; UI state separated from server state.
- SCSS design-token architecture; **zero hardcoded colors** in components
  (enforced by ESLint via `stylelint`-style guard + lint rule).
- Four complete themes from day one.
- Feature-first + layered architecture; each domain module self-contained.
- MongoDB as primary database; Redis for cache / rate limiting / pub-sub.

## Repos

| Repo           | Stack                                              | Docs                          |
| -------------- | -------------------------------------------------- | ----------------------------- |
| `osk-frontend` | Next.js 15, TS, Redux Toolkit, RTK Query, SCSS     | `osk-frontend/README.md`      |
| `osk-backend`  | Node 22, Express 5, TS, Mongoose, Redis, Socket.IO | `osk-backend/README.md`       |

Each repo is initialised as its own Git repository. The API contract is shared
through a versioned `contracts` module (see `osk-frontend/src/contracts` and
`docs/ARCHITECTURE.md` § 7) designed to be extracted into a published
`@osk/contracts` package once the backend implementation lands.
