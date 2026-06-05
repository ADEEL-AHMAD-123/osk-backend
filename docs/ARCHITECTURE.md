# OSK — Architecture Blueprint

> Premium real estate platform. Production-focused, modular, scalable.
> This document is the single source of truth for architectural decisions.
> Decisions reflect: **two separate repos**, **frontend-first scaffold**,
> **MapLibre GL** for maps (free, no API key / no credit card),
> **MongoDB Atlas** primary DB, **no Docker**.

---

## 1. Final stack with rationale

### Frontend — `osk-frontend`

| Concern        | Choice                              | Rationale |
| -------------- | ----------------------------------- | --------- |
| Framework      | Next.js 15 (App Router) + TS        | Server Components by default cut client JS; streaming + route-level caching; first-class SEO. |
| State          | Redux Toolkit + RTK Query           | RTK Query owns **all** server state (cache, dedupe, invalidation); slices own UI state only. One mental model, scales linearly with features. |
| Styling        | SCSS Modules + global SCSS tokens   | Token layer compiles to CSS custom properties → runtime theme switching with zero JS re-render. Modules give per-component scoping with no runtime cost. |
| Forms          | React Hook Form + Zod               | Uncontrolled inputs = minimal re-renders; Zod schemas are reused as the **contract** shared with the API layer. |
| Maps           | **MapLibre GL JS** + OpenFreeMap    | Open-source (BSD) — **no API key, no credit card, no usage caps**. Vector tiles + GPU clustering for large listing sets and full style control for a luxury look. The style URL is an env var (`NEXT_PUBLIC_MAP_STYLE_URL`), so MapTiler / Stadia / self-hosted tiles drop in with no code change. Mapbox rejected: its SDK now requires an active billing account. Google Maps rejected: heavier bundle, weaker style control, billing. |
| Animation      | Framer Motion (minimal)             | Used only for hero, route transitions, gallery, and micro-interactions. Tree-shaken; never on list items. |
| SEO            | next-sitemap + JSON-LD              | Automated sitemap/robots; `RealEstateListing` + `Organization` structured data. |
| Data fetching  | RTK Query (client) + `fetch` (RSC)  | Server Components fetch directly with Next's cache; client components use RTK Query hooks. |

### Backend — `osk-backend`

| Concern        | Choice                                   | Rationale |
| -------------- | ---------------------------------------- | --------- |
| Runtime        | Node.js 22 LTS                           | Native fetch, stable perf, long support window. |
| Framework      | Express 5 + TypeScript                   | Minimal, ubiquitous, predictable memory profile; layered cleanly under feature modules. |
| Database       | MongoDB Atlas + Mongoose                 | Flexible documents fit heterogeneous inventory (homes/plots/commercial); geospatial + text indexes built in. |
| Cache / limits | Redis (ioredis)                          | Response cache, rate-limit counters, optional Socket.IO pub/sub adapter for horizontal scale. |
| Auth           | JWT access + refresh **rotation**        | Short-lived access token; rotating refresh token stored hashed; reuse-detection revokes the family. |
| Media          | Multer + Cloudinary                      | Cloudinary chosen over S3 for built-in transforms/responsive formats — fewer moving parts, free tier. Abstracted behind a `MediaStorage` port so S3 is a drop-in later. |
| Realtime       | Socket.IO                                | Rooms per thread; Redis adapter ready for multi-instance. |
| Security       | Helmet, CORS, compression, rate limiting, `express-mongo-sanitize`, `hpp` | Defense in depth at the edge. |
| Docs           | OpenAPI 3.1 + Swagger UI                 | Spec generated from Zod schemas → docs never drift from validation. |
| Logging        | Pino + request correlation IDs           | Structured JSON logs; `x-request-id` threaded through every layer; Sentry-compatible error capture. |

### Why two repos (not a monorepo)

Independent deploy cadence, smaller install/build surface per repo (helps the
memory/CPU dev constraint), and clean security boundaries. The cost — a shared
API contract — is solved by the `contracts` module: authored in the frontend
today, designed to be lifted into a published `@osk/contracts` package the
backend consumes once it lands. Versioned with the `/api/v1` namespace so both
sides evolve in lockstep.

---

## 2. System architecture overview

```
                    ┌─────────────────────────────────────────┐
                    │                Browser                   │
                    │  Next.js RSC shell + hydrated islands     │
                    └───────────────┬───────────────┬──────────┘
                          HTTPS REST │               │ WSS (Socket.IO)
                                     │               │
        ┌────────────────────────────▼───────────────▼─────────────┐
        │                  osk-backend (Express)                    │
        │  Edge: Helmet · CORS · compression · rate limit · sanitize │
        │  ┌──────────────────────────────────────────────────────┐ │
        │  │  Presentation   routes / controllers / socket gateways│ │
        │  │  Application    services (use-cases, orchestration)   │ │
        │  │  Domain         entities, value objects, policies     │ │
        │  │  Infrastructure repositories, Mongoose, Redis, media  │ │
        │  └──────────────────────────────────────────────────────┘ │
        └───────┬─────────────────┬────────────────┬────────────────┘
                │                 │                │
        ┌───────▼──────┐  ┌───────▼──────┐  ┌──────▼───────┐
        │ MongoDB Atlas│  │    Redis     │  │  Cloudinary  │
        │  (primary)   │  │ cache/limits │  │    media     │
        └──────────────┘  └──────────────┘  └──────────────┘
                │
        ┌───────▼───────────────────────────────────────────┐
        │  External: OpenFreeMap · WhatsApp Business API ·   │
        │  Email provider (SendGrid/SES/Postmark) · Sentry   │
        └────────────────────────────────────────────────────┘
```

**Request lifecycle:** edge middleware → versioned router (`/api/v1`) →
validation (Zod) → controller (presentation) → service (application) → repository
(infrastructure) → Mongoose. Every response is wrapped in the standard envelope
(§ 7). A correlation ID is generated at the edge and attached to logs, the
response header, and any error sent to Sentry.

**Layering rule:** dependencies point **inward only**. Presentation may call
Application; Application may call Domain and Infrastructure **ports**;
Infrastructure implements ports. Domain depends on nothing. This is what makes
modules replaceable without refactoring callers.

---

## 3. Folder structure

### `osk-frontend` (feature-first + layered)

```
osk-frontend/
├── src/
│   ├── app/                       # App Router — presentation (routing) only
│   │   ├── layout.tsx             # root: providers, theme bootstrap
│   │   ├── page.tsx               # home (premium hero search)
│   │   ├── globals.scss           # imports the SCSS layer
│   │   ├── (marketing)/           # buy / rent / sell / commercial / plots
│   │   ├── property/[slug]/       # property detail
│   │   ├── dashboard/             # agent / seller dashboards
│   │   ├── admin/                 # admin panel
│   │   └── api/                   # route handlers (BFF helpers only)
│   ├── components/                # presentation — reusable, dumb
│   │   ├── ui/                    # design-system primitives (Button, Card…)
│   │   ├── layout/                # Header, Footer, Shell
│   │   ├── property/              # PropertyCard, Gallery, ContactChannels
│   │   └── theme/                 # ThemeProvider, ThemeSwitcher
│   ├── features/                  # one folder per domain module
│   │   ├── auth/                  # authSlice, authApi, components, hooks
│   │   ├── properties/            # propertiesApi, propertiesUiSlice…
│   │   ├── contact/               # contactApi (chat/call/whatsapp/email)
│   │   ├── messaging/             # socket client, thread UI state
│   │   ├── inquiries/  agents/  reviews/  notifications/  ui/
│   ├── store/                     # Redux store, hooks, middleware, base API
│   ├── contracts/                 # shared DTOs / API contract / enums / zod
│   ├── lib/                       # framework-agnostic helpers (http, map, seo)
│   ├── hooks/                     # cross-feature React hooks
│   └── styles/                    # SCSS token + theme layer (see § 4)
├── scripts/preflight.mjs          # env + tooling preflight checker
├── public/
└── <tooling configs>
```

**Feature module shape** (every folder in `features/` follows it):

```
features/<domain>/
├── index.ts            # barrel — the ONLY public surface of the module
├── <domain>Api.ts      # RTK Query endpoints (server state)
├── <domain>Slice.ts    # Redux slice (UI state) — only if needed
├── components/         # feature-scoped components
├── hooks/              # feature-scoped hooks
├── <domain>.types.ts   # types re-exported from contracts + local view types
└── __tests__/          # co-located unit/component tests
```

### `osk-backend` (feature-first + 4-layer)

```
osk-backend/
├── src/
│   ├── server.ts                  # process bootstrap (listen, signals)
│   ├── app.ts                     # Express app: middleware + router mount
│   ├── config/                    # env, db, redis, logger, swagger
│   ├── shared/                    # response envelope, errors, middleware,
│   │                              #   utils, base repository, types
│   ├── modules/                   # one folder per domain module
│   │   └── <domain>/
│   │       ├── <domain>.routes.ts        # presentation
│   │       ├── <domain>.controller.ts    # presentation
│   │       ├── <domain>.service.ts       # application
│   │       ├── <domain>.repository.ts    # infrastructure
│   │       ├── <domain>.model.ts         # infrastructure (Mongoose)
│   │       ├── <domain>.schema.ts        # Zod validation / DTO contract
│   │       ├── <domain>.types.ts         # domain types
│   │       ├── <domain>.module.ts        # feature registration
│   │       └── __tests__/
│   └── modules/index.ts           # module registry — register here, nothing else
└── <tooling configs>
```

**Conventions** — folders `kebab-case`; files `<domain>.<role>.ts`; React
components `PascalCase.tsx`; SCSS partials `_name.scss`. Every feature exposes a
**barrel `index.ts`**; importing module internals across module boundaries is an
ESLint error (`no-restricted-imports`). New modules are wired in exactly one
place: the module registry.

---

## 4. SCSS token + 4-theme design blueprint

Three-tier token model:

1. **Primitive scale** — raw palette/spacing/radius values. Never consumed by components.
2. **Semantic tokens** — `--color-primary`, `--bg-card`, `--text-muted`… Emitted as CSS custom properties, redefined per theme.
3. **Component tokens** — optional, scoped (`--btn-bg`) deriving from semantic tokens.

Components consume **only** semantic/component CSS variables. A theme is a class
on `<html>` (`theme-luxe-light` …) plus `data-theme`. Switching a theme just
swaps the variable values — no re-render, no FOUC (bootstrap script sets the
class before paint).

```
src/styles/
├── index.scss                 # single entry, imported by globals.scss
├── abstracts/
│   ├── _functions.scss        # token() accessor, color math
│   ├── _mixins.scss           # elevation(), focus-ring(), responsive helpers
│   └── _breakpoints.scss
├── base/
│   ├── _reset.scss
│   └── _typography.scss
└── tokens/
    ├── _contract.scss         # the full list of token NAMES (the contract)
    ├── _primitives.scss       # raw values
    ├── themes/
    │   ├── _luxe-light.scss
    │   ├── _luxe-dark.scss
    │   ├── _emerald.scss
    │   └── _sandstone.scss
    └── _themes.scss           # @forward all themes
```

**Token contract** (every theme MUST define all of these):

```
Brand        --color-primary / -hover / -active / -soft
             --color-secondary / -hover
             --color-accent
Status       --color-success / -warning / -danger / -info  (+ -soft each)
Surfaces     --bg-page --bg-card --bg-elevated --bg-overlay --bg-inset
Text         --text-primary --text-secondary --text-muted --text-inverse
Lines        --border-default --border-strong --divider
Buttons      --btn-primary-bg/-fg/-hover  --btn-secondary-* --btn-ghost-* --btn-danger-*
Badges       --badge-new-bg/-fg --badge-resale-* --badge-featured-* --badge-sold-*
Charts       --chart-1 … --chart-6
Effects      --shadow-sm/-md/-lg  --glow-accent  --ring-focus
```

**Starter snippet — token contract + a theme.** See
`osk-frontend/src/styles/tokens/` for the full implementation; the shape is:

```scss
/* tokens/themes/_luxe-light.scss */
.theme-luxe-light {
  --color-primary:        #1c2b4a;   /* deep navy */
  --color-primary-hover:  #243a63;
  --color-accent:         #c8a86b;   /* champagne gold */
  --bg-page:              #f7f5f1;
  --bg-card:              #ffffff;
  --text-primary:         #14181f;
  --text-muted:           #6b7280;
  --shadow-md:            0 8px 24px -8px rgb(20 24 31 / 0.18);
  /* …every token in the contract… */
}
```

The four themes: **luxe-light** (navy + champagne, ivory page),
**luxe-dark** (near-black surfaces, gold accent, glow effects),
**emerald** (deep green primary, warm neutral surfaces),
**sandstone** (terracotta/clay primary, warm sand surfaces).

**Guard against hardcoded colors:** `stylelint` (`color-no-hex`,
`declaration-property-value-disallowed-list` blocking `rgb(`/`hsl(` outside the
`tokens/` folder) + an ESLint rule (`no-restricted-syntax`) flagging hex/rgb/hsl
string literals in `.tsx`. Both run in `lint-staged` pre-commit and in CI.

---

## 5. Redux Toolkit + RTK Query architecture

**Principle:** server state lives in **RTK Query**; UI state lives in **slices**.
They never overlap.

```
store/
├── index.ts              # configureStore, typed store
├── hooks.ts              # useAppDispatch / useAppSelector
├── rootReducer.ts        # combines slices + baseApi.reducer
├── listenerMiddleware.ts # side-effects (toast on error, analytics)
└── api/
    ├── baseApi.ts        # createApi — empty, injected into per-feature
    ├── baseQuery.ts      # fetchBaseQuery + reauth wrapper
    └── tags.ts           # central cache-tag registry
```

- **`baseApi`** is created once with `injectEndpoints`; each feature file
  (`authApi`, `propertiesApi`, `contactApi`…) injects its own endpoints. Adding
  an endpoint never touches the store.
- **`baseQueryWithReauth`** intercepts `401`, calls `/auth/refresh` once (with a
  mutex so concurrent 401s trigger a single refresh), retries, or dispatches
  `loggedOut`.
- **Entity Adapter** for normalised collections (notifications, message threads,
  admin tables) — `O(1)` updates from socket events.
- **Middleware:** dev-only action logger; a listener middleware maps RTK Query
  `rejected` actions to user toasts and Sentry breadcrumbs.
- **Slices:** `uiSlice` (theme, modals, drawers), `authSlice` (current user,
  tokens-in-memory), plus thin per-feature UI slices (`propertiesUiSlice` holds
  filter/sort/view-mode, not data).

Starter snippets for the store, base API and auth slice are scaffolded in
`osk-frontend/src/store/` and `osk-frontend/src/features/auth/`.

---

## 6. MongoDB schema / index strategy

13 collections. Validation via Mongoose schemas (mirrored by Zod at the API edge).

| Collection            | Key fields | Indexes |
| --------------------- | ---------- | ------- |
| `users`               | email, role, passwordHash, status | unique `email`; `role` |
| `agents`              | userId, agencyName, verified, ratingAvg, responseRate | unique `userId`; `verified`; `2dsphere serviceArea` |
| `properties`          | slug, title, type, listingKind, price, status, location, ownerId, agentId, amenities | unique `slug`; **text** (title, description, locality); **2dsphere** `location`; compound `{type:1,status:1,price:1}`, `{listingKind:1,status:1,createdAt:-1}`, `{status:1,isFeatured:-1,createdAt:-1}` |
| `propertyMedia`       | propertyId, url, kind, order, width/height | `{propertyId:1,order:1}` |
| `inquiries`           | propertyId, fromUserId, ownerId, channel, status | `{ownerId:1,status:1,createdAt:-1}`; `{propertyId:1}` |
| `messageThreads`      | propertyId, participantIds, lastMessageAt, unread map | `{participantIds:1,lastMessageAt:-1}` |
| `messages`            | threadId, senderId, body, readBy, createdAt | `{threadId:1,createdAt:1}` |
| `reviews`             | targetType, targetId, authorId, rating, status | `{targetType:1,targetId:1,status:1}`; unique `{authorId,targetId}` |
| `savedProperties`     | userId, propertyId, type(saved/recent) | unique `{userId,propertyId,type}` |
| `notifications`       | userId, type, read, createdAt | `{userId:1,read:1,createdAt:-1}` |
| `auditLogs`           | actorId, action, entity, meta, createdAt | `{entity:1,createdAt:-1}`; **TTL** 365d |
| `contactPreferences`  | propertyId/ownerId, channels{chat,call,whatsapp,email}, phoneMasked | unique `{ownerId,propertyId}` |
| `communicationLogs`   | channel, propertyId, fromUserId, ownerId, consent, payload, createdAt | `{ownerId:1,createdAt:-1}`; **TTL** 730d on non-consent logs |

**Index types in use:** text index on `properties` for the search bar;
`2dsphere` on `properties.location` and `agents.serviceArea` for map/radius
queries; compound indexes ordered to match the listing filter+sort patterns
(equality → sort → range); TTL on `auditLogs` and ephemeral `communicationLogs`.

`properties.location` is GeoJSON: `{ type: "Point", coordinates: [lng, lat] }`.
`listingKind` ∈ `new-project | resale`; `type` ∈ `home | plot | commercial | rental`.

---

## 7. REST API contract summary

All endpoints under `/api/v1`. Every response uses one envelope.

**Success**
```json
{ "success": true, "data": { }, "meta": { "page": 1, "total": 240 }, "requestId": "req_a1b2" }
```
**Error**
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR",
  "message": "Price must be positive", "details": [ ] }, "requestId": "req_a1b2" }
```

| Area        | Endpoints (representative) |
| ----------- | -------------------------- |
| Auth        | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `POST /auth/verify-email` · `POST /auth/forgot-password` |
| Properties  | `GET /properties` (filter/sort/paginate) · `GET /properties/:slug` · `POST /properties` · `PATCH /properties/:id` · `POST /properties/:id/media` · `GET /properties/map?bbox=` |
| Agents      | `GET /agents/:id` · `GET /agents/:id/listings` · `GET /agents/:id/metrics` · `POST /agents/verify` |
| Contact     | `POST /contact/inquiry` (email relay) · `POST /contact/call-intent` · `GET /contact/whatsapp-link` · `POST /contact/callback-request` |
| Messaging   | `GET /threads` · `GET /threads/:id/messages` · `POST /threads/:id/messages` · `POST /threads` |
| Admin       | `GET /admin/moderation/queue` · `POST /admin/properties/:id/approve` · `POST /admin/users/:id/block` · `GET /admin/audit-logs` |

**Sample — list properties**
`GET /api/v1/properties?type=home&listingKind=resale&minPrice=200000&sort=-createdAt&page=1&limit=24`
```json
{ "success": true,
  "data": [ { "id": "p_1", "slug": "skyline-villa-dha",
    "title": "Skyline Villa", "type": "home", "listingKind": "resale",
    "price": 485000, "currency": "USD",
    "location": { "type": "Point", "coordinates": [74.41, 31.47] },
    "thumbnail": "https://res.cloudinary.com/...", "isFeatured": true } ],
  "meta": { "page": 1, "limit": 24, "total": 318, "pages": 14 },
  "requestId": "req_9f3c" }
```

**Sample — create inquiry (email relay)**
`POST /api/v1/contact/inquiry`
```json
{ "propertyId": "p_1", "name": "Sara K.", "email": "sara@example.com",
  "message": "Is this still available?", "captchaToken": "...",
  "consent": true }
```
Response `201`: `{ "success": true, "data": { "inquiryId": "inq_88" }, "requestId": "req_9f40" }`

OpenAPI 3.1 spec is generated from the Zod schemas and served at
`/api/v1/docs`, with worked examples for auth, properties, agents, messages,
contact channels and admin moderation.

---

## 8. Contact channels architecture (chat / call / WhatsApp / email)

Four client→owner channels surfaced on **property detail** and **listing cards**.
Visibility is per-property, owner-controlled, stored in `contactPreferences`.

### Privacy model

- Raw owner email/phone are **never** sent to the client by default.
- The API returns a **capabilities object** per property:
  `{ chat:true, call:{enabled:true, masked:true}, whatsapp:false, email:true }`.
- Phone numbers are masked; a real PSTN number is only revealed to authorised
  roles, or proxied through a masking provider (Twilio-style) when configured.
- Every channel use is written to `communicationLogs` with `consent` captured.
- Role-based authorization gates full contact detail (agent/admin see more).
- Disabled channel → the UI shows a graceful fallback (e.g. "Owner prefers
  email" with the email form) instead of a dead button.

### 1. In-app chat
Socket.IO, room per `messageThread`. Messages persisted in `messages`;
`messageThreads.unread` is a per-participant counter map. Owner/agent
availability is a presence flag (`online | away | offline`) broadcast on a
user room. Unread counts hydrate via `GET /threads` then update live.

### 2. Call
Click-to-call button → `tel:` link on mobile, reveal-on-click + copy on desktop.
Number masking optional per `contactPreferences`. Each click fires
`POST /contact/call-intent` (analytics event, no PII leak). Optional
**request-callback** flow: client picks time slots → inquiry of `channel:"call"`
with `status:"callback-requested"`.

### 3. WhatsApp
Deep link `https://wa.me/<number>?text=<prefilled>`. The template is prefilled
with property title, price and the canonical listing URL. Shown only when the
owner enabled WhatsApp. Designed integration-ready for the **WhatsApp Business
API** — the deep link is the MVP, the BSP webhook path is an extension point.

### 4. Email
Secure relay only — the form posts to `POST /contact/inquiry`; the backend sends
to the owner's real address via a provider-agnostic `EmailProvider` port
(SendGrid / SES / Postmark adapters). Owner gets the inquiry, client gets a
confirmation. Protected by CAPTCHA, IP + account rate limits, and a blocked-user
check.

### Anti-spam & audit
CAPTCHA on email/callback forms; Redis-backed rate limiting per IP and per
account; blocked-users list checked on every channel; consent + full payload
written to `communicationLogs` for audit (TTL on non-consent records).

---

## 9. Feature roadmap

### MVP (ship-able product)
Public site (home + buy/rent/sell/commercial/plots), listing grid/list with
advanced filters, sort and pagination, property detail (gallery, amenities, map,
agent card, related listings). Auth with 4 roles, email verification, password
reset. Property lifecycle Draft → Pending → Approved/Rejected → Published. Media
upload + optimization. All **four contact channels** (chat, call, WhatsApp,
email) with the privacy model. Agent profile + dashboard (listings, leads).
Admin moderation queue. SEO (sitemap, robots, JSON-LD). Four themes.

### Phase 2
Map clustering + viewport/radius search at scale, saved/favorites + recently
viewed, reviews/ratings with moderation, notifications (in-app + email
preferences), agent response metrics + lead follow-up workflow, callback-slot
scheduling, WhatsApp Business API webhook integration, featured/promoted
inventory, neighborhood insights on detail pages, floor plans.

### Phase 3
Payments (promotion/feature purchases), recommendation engine ("similar homes",
personalised feed), CRM sync (HubSpot/Salesforce export of leads), multi-language
+ multi-currency, mortgage calculator, virtual tours / 360°, mobile app via the
same REST API, AI-assisted listing descriptions.

Each phase maps to extension points already present in the scaffold (§ 3
module registry, `EmailProvider`/`MediaStorage` ports, RTK Query
`injectEndpoints`) so new modules drop in without refactoring callers.

---

## 10. Premium UX/UI rules and visual direction

**Visual direction:** restrained luxury — generous whitespace, a confident type
scale, large editorial photography, champagne/gold or jewel accents used
sparingly. Not a generic listing template.

Rules:

1. **Type:** one display serif for headings (e.g. Fraunces/Canela-style), one
   geometric sans for UI/body. Fluid `clamp()` scale; tight tracking on display.
2. **Space:** an 8px spacing scale; rooms to breathe — cards never feel cramped.
3. **Color discipline:** neutrals carry the page; the accent appears on ≤ 1
   element per viewport (CTA, price, featured badge).
4. **Elevation:** soft, low-spread shadows + a subtle border, never harsh boxes.
   `theme-luxe-dark` adds a faint accent glow on interactive surfaces.
5. **Imagery:** 4:3 / 16:9 ratios locked, `object-fit: cover`, gentle zoom on
   hover, skeleton shimmer while loading.
6. **Motion:** Framer Motion only for hero, route transitions, gallery and
   micro-interactions; 150–300ms, ease-out; **never** animate list items in
   bulk; respect `prefers-reduced-motion`.
7. **Components:** consistent radius (cards 16px, controls 10px), one focus-ring
   token, hover states on every interactive element.
8. **Listing card:** photo, price-forward hierarchy, type/kind badges, key
   specs row, and the contact-channel cluster — all themed via tokens.
9. **Accessibility:** WCAG AA contrast verified per theme, visible focus, full
   keyboard paths, semantic landmarks, `aria-live` for async results.
10. **Consistency:** every color/space/shadow value comes from a token — no
    exceptions, enforced by lint.

---

## 11. Performance checklist

- [ ] Server Components by default; `"use client"` only for interactive islands.
- [ ] Route-level code splitting; `next/dynamic` for map, gallery, charts, editor.
- [ ] `next/image` everywhere; AVIF/WebP, responsive `sizes`, LQIP blur.
- [ ] MapLibre GL loaded dynamically, only on pages with a map.
- [ ] Listing queries always paginated (default 24); never unbounded `find()`.
- [ ] MongoDB indexes match every filter+sort path; `.explain()` in CI smoke check.
- [ ] Redis caches hot reads (featured, facets, property detail) with short TTL.
- [ ] HTTP cache headers: `s-maxage` + `stale-while-revalidate` on public GETs.
- [ ] Bundle budgets: first-load JS ≤ 180KB gz per route; CI fails on regression.
- [ ] Fonts: `next/font`, subset, `font-display: swap`, preloaded.
- [ ] Compression (gzip/br) on the API; payloads trimmed to DTO shape.
- [ ] **Dev memory safety:** Turbopack dev, `NODE_OPTIONS` capped, no Docker, no
      file-watching `node_modules`, tsc runs `--incremental`; backend uses `tsx`
      watch (not `ts-node` full recompile). See § 14.
- [ ] **Core Web Vitals targets:** LCP < 2.0s, INP < 200ms, CLS < 0.05,
      TTFB < 0.5s; tracked via `web-vitals` → analytics.

---

## 12. Security checklist

- [ ] JWT: short-lived access (15m) + rotating refresh (7d), refresh hashed at
      rest, **reuse detection** revokes the token family.
- [ ] Passwords hashed with Argon2id (or bcrypt cost ≥ 12).
- [ ] Helmet, strict CORS allow-list, `compression`, `hpp`.
- [ ] `express-mongo-sanitize` + Zod validation on **every** request.
- [ ] Rate limiting (Redis) on auth, contact, and write endpoints.
- [ ] RBAC middleware: Buyer / Seller / Agent / Admin; ownership checks on writes.
- [ ] Contact privacy: owner email/phone never exposed; relay + masking (§ 8).
- [ ] CAPTCHA on public forms; blocked-user enforcement on all channels.
- [ ] File uploads: type/size allow-list, Cloudinary scanning, no executables.
- [ ] Secrets in env only; `.env` git-ignored; `.env.example` documents keys.
- [ ] Audit logs for moderation, auth events, and contact use.
- [ ] Security headers + HTTPS-only cookies (`httpOnly`, `Secure`, `SameSite`).
- [ ] Sentry-compatible error tracking with PII scrubbing.
- [ ] Dependency scanning (`npm audit` + Dependabot) in CI.

---

## 13. Test strategy and CI plan

| Layer            | Tooling                | Scope |
| ---------------- | ---------------------- | ----- |
| Backend unit     | Jest                   | services, domain logic, utils |
| Backend API      | Jest + Supertest       | routes against `mongodb-memory-server` + real Redis mock |
| Frontend unit    | Vitest                 | slices, RTK Query transforms, hooks, helpers |
| Frontend component | Vitest + RTL         | UI primitives, PropertyCard, ContactChannels, forms |
| E2E              | Playwright             | search → detail → contact; auth; admin moderation |
| Contract         | Zod schema round-trip  | contracts validated both ends |
| Visual/theme     | Playwright screenshots | each of the 4 themes on key pages |

**Conventions:** tests co-located in `__tests__/`; one spec per public surface;
no mocked DB for API tests (use memory server) so migrations/indexes are exercised.

**CI — GitHub Actions** (`.github/workflows/ci.yml`), matrix per repo:
`install → typecheck → lint (incl. hardcoded-color guard) → unit → API/component
→ build → bundle-budget check → Playwright (on PR) → npm audit`. Husky +
lint-staged run lint/format/typecheck on staged files pre-commit; commit-msg
hook enforces Conventional Commits.

---

## 14. Native local setup and env vars

No containers. Native services only.

**macOS (Homebrew)**
```bash
brew install node@22
brew tap mongodb/brew && brew install mongodb-community@8.0
brew install redis
brew services start mongodb-community@8.0
brew services start redis
```

**Linux (Debian/Ubuntu)**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
sudo apt install -y mongodb-org redis-server
sudo systemctl enable --now mongod redis-server
```

**Windows**
```powershell
winget install OpenJS.NodeJS.LTS
winget install MongoDB.Server        # runs as a Windows service
winget install Redis.Redis           # or use Memurai / WSL2 for Redis
```

**One-command scripts** (each repo's `package.json`):
`npm run setup` (install + copy env), `npm run dev`, `npm run db:seed`,
`npm test`, `npm run preflight`.

**Frontend env (`.env.example`)**
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
NEXT_PUBLIC_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_THEME=theme-luxe-light
```

**Backend env (`.env.example`)**
```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/osk
REDIS_URL=redis://127.0.0.1:6379
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
CLOUDINARY_URL=cloudinary://key:secret@cloud
EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=
WHATSAPP_BUSINESS_TOKEN=
CORS_ORIGIN=http://localhost:3000
SENTRY_DSN=
```

**Preflight checker** — `scripts/preflight.mjs` (frontend) and the backend
equivalent verify: Node version, required env vars present, MongoDB reachable,
Redis reachable, and ports free. Run automatically before `dev`. Troubleshooting
for stuck ports, MongoDB/Redis services, stale `.next` cache and seed failures
is documented in each repo's README.

---

## 15. First 2 sprints

**Sprint 1 — Foundation & vertical slice (frontend-first)**
1. Lock tooling: repos, lint/prettier/husky, CI skeleton, preflight checker.
2. SCSS token layer + all 4 themes + ThemeProvider/ThemeSwitcher (no FOUC).
3. Redux store, baseApi + reauth, `uiSlice`, `authSlice`.
4. `contracts` module: enums, DTOs, Zod schemas for auth + properties.
5. Design-system primitives (Button, Card, Input, Badge, Skeleton).
6. Listing page: PropertyCard, filters/sort/pagination wired to RTK Query (mock
   or backend stub).
7. Property detail page shell with gallery + ContactChannels component.

**Sprint 2 — Auth, contact channels & backend turn-on**
1. Backend: Express app, envelope, auth module (register/login/refresh rotation).
2. Auth UI: sign-up/in, email verification, reset, route guards.
3. Properties module backend: model, indexes, list/detail/create endpoints.
4. Contact channels end-to-end: email relay + inquiry form, chat via Socket.IO,
   call-intent, WhatsApp deep link, `contactPreferences`.
5. Agent dashboard v1 (listings + leads list).
6. Seed script, OpenAPI docs, Playwright happy-path E2E.

Priority order: theming + state foundation → vertical slice → auth → contact
channels. Nothing in Sprint 2 requires refactoring Sprint 1.

---

## 16. Risks and mitigation

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Dev-server memory/CPU overuse | Slow, crashing local dev | Turbopack, `tsx` watch on backend, capped `NODE_OPTIONS`, no Docker, exclude `node_modules` from watchers, incremental TS. |
| Theme drift / hardcoded colors | Inconsistent UI, broken themes | Token contract + stylelint + ESLint guards in lint-staged & CI; PR fails on any hex/rgb in components. |
| Contract drift between repos | Frontend/backend break silently | Single `contracts` module, Zod schemas shared, `/api/v1` versioning, contract tests in CI. |
| Contact privacy leak | Owner PII exposed, legal risk | Capabilities object instead of raw PII, masking provider, RBAC, consent + audit logs. |
| Geospatial query slowness | Slow map at scale | `2dsphere` indexes, viewport `bbox` queries, server-side clustering, Redis cache on facets. |
| Spam/abuse on contact forms | Owner inbox flooded | CAPTCHA, Redis rate limits per IP+account, blocked-users list, consent logging. |
| Scope creep across phases | MVP slips | Roadmap phased; extension points pre-built so Phase 2/3 add modules, not rewrites. |
| Refresh-token reuse / theft | Account takeover | Rotation + family reuse-detection, hashed storage, short access TTL, httpOnly cookies. |
| Map tiles / email / WhatsApp vendor limits or cost | Feature degradation | Provider ports + env-driven URLs (`EmailProvider`, `MediaStorage`, `NEXT_PUBLIC_MAP_STYLE_URL`); OpenFreeMap needs no key/card and the style URL swaps to MapTiler/self-hosted with no code change; WhatsApp deep-link MVP before paid BSP. |
| Image-heavy pages hurt CWV | Poor LCP/CLS | `next/image`, AVIF/WebP, locked ratios, LQIP, dynamic imports, bundle budgets in CI. |

---

*End of blueprint. Implementation status and per-repo details: `osk-frontend/README.md`, `osk-backend/README.md`.*

