# Architecture

Yusr (يُسر) connects donors with verified people in need — medical cases, debt relief, orphans'
care, education and urgent relief — and pays hospitals, creditors and schools directly, with a
receipt and proof of payment for every pound. This document is the map: what runs where, how a
request travels, what the data looks like and which rules the system refuses to break.

**Contents** · [System](#system) · [Monorepo](#monorepo) · [The API](#the-api) · [Data model](#data-model) ·
[Lifecycles](#lifecycles) · [Clients](#clients) · [Language and theme](#language-and-theme) ·
[Background work](#background-work) · [Configuration](#configuration) · [Testing](#testing)

Related: [Payments](PAYMENTS.md) · [Security](SECURITY.md) · [Operations](OPERATIONS.md) ·
[Brand](BRAND.md) · [Mobile](MOBILE.md) · [Roadmap](ROADMAP.md)

## Principles

1. **Money is accounted, not counted.** Every movement is a balanced double-entry journal entry;
   a case's "raised" figure is a ledger balance, never a counter that can drift.
2. **Trust is enforced below the application.** The rules that matter (balanced journals,
   append-only audit, four-eyes payouts, allowed case transitions) are PostgreSQL constraints and
   triggers, so a bug in a service cannot break them.
3. **One contract, many clients.** A single endpoint table drives the HTTP API, its OpenAPI 3.1
   document, request validation and rate limits; the typed `@yusr/sdk` is the only way the web,
   control hub and mobile app talk to it.
4. **Arabic first, not Arabic too.** Right-to-left layouts, Arabic plural rules and Arabic-Indic
   digits are the default path; English is a full second language.
5. **Dignity by design.** No beneficiary photos (illustrated covers instead), pseudonyms on public
   pages, redacted documents, national IDs encrypted and matched only by keyed hash.

## System

```mermaid
flowchart LR
  subgraph Clients
    WEB["Website<br/>Next.js 16 · RSC"]
    HUB["Control hub<br/>Next.js 16"]
    APP["Mobile app<br/>Expo · React Native"]
  end
  subgraph API["Yusr API — NestJS 11 on Node 22"]
    DISPATCH["Endpoint table → dispatch()<br/>auth · RBAC · rate limit · cache · zod"]
    SERVICES["Services<br/>cases · donations · finance · documents · auth"]
    WORKER["Outbox worker"]
  end
  PG[("PostgreSQL 16<br/>ledger · audit · cases")]
  REDIS[("Redis 7<br/>rate limits · OTP · cache")]
  S3[("Object storage<br/>S3 / R2 — private + public")]
  GW["Payment gateways<br/>Paymob · Fawry · Moyasar · Stripe · InstaPay"]
  OPS["SMS · WhatsApp · email · push<br/>Slack · Baserow · Chatwoot · PostHog · Sentry"]

  WEB -- "SDK over HTTPS" --> DISPATCH
  HUB -- "SDK · staff JWT + TOTP" --> DISPATCH
  APP -- "SDK over HTTPS" --> DISPATCH
  DISPATCH --> SERVICES
  SERVICES --> PG
  SERVICES --> REDIS
  SERVICES -- "presigned links" --> S3
  WEB -. "document PUT (presigned)" .-> S3
  SERVICES -- "create checkout" --> GW
  GW -- "signed webhooks" --> DISPATCH
  SERVICES -- "events in the same transaction" --> PG
  PG -- "outbox" --> WORKER
  WORKER --> OPS
```

The browser never calls the API directly from the website: pages render on the server with the
SDK, and forms post to Next.js server actions. The only direct browser → cloud traffic is the
upload of case documents to object storage through ten-minute presigned links.

## Monorepo

pnpm workspaces + Turborepo. Shared packages are compiled with tsup (ESM + CJS + types); tests,
tools and the API in development read them from source through the `@yusr/source` export
condition, so nothing needs building between an edit and a test run.

```text
yusr/
├─ apps/
│  ├─ web/          Donor website — landing, catalog, case pages + checkout, receipts, case submission
│  ├─ admin/        Control hub — overview, case pipeline, field verification, finance, people, audit
│  ├─ mobile/       iOS + Android app (Expo Router) — home, explore, my giving, profile, native checkout
│  └─ prototype/    Clickable bilingual prototype of everything, built into one HTML file
├─ packages/
│  ├─ core/         Domain: types, money, progress, lifecycle, RBAC, payments routing, ledger, zod schemas
│  ├─ i18n/         Arabic + English dictionaries, ICU-style plurals, number/money/date formatting
│  ├─ theme/        Design tokens → CSS variables, Tailwind v4 theme, React Native theme; logo + pattern
│  ├─ ui/           Shared React components (shadcn-style, Tailwind v4): CaseCard, DonationProgress, …
│  ├─ sdk/          Typed API client (+ an in-memory backend with the same contract, for demos and tests)
│  ├─ api/          NestJS API, PostgreSQL schema + migrations, gateways, outbox worker
│  └─ config/       Shared tsconfig presets
├─ infra/           docker-compose (PostgreSQL, Redis, MinIO) and Dockerfiles
├─ docs/            This documentation
└─ .github/         CI
```

| Package | Depends on | Notes |
|---|---|---|
| `@yusr/core` | zod | No I/O. Everything else builds on it. |
| `@yusr/i18n` | core | `textFor(locale)` on the server, a provider on clients. |
| `@yusr/theme` | — | One TypeScript source compiled to `tokens.css`, `tailwind.css`, native tokens and SVG assets. |
| `@yusr/ui` | core, i18n, theme | Server-compatible; only the live countdown is a client component. |
| `@yusr/sdk` | core | `createHttpClient`, `createHttpAdminClient`, `createHttpAuthClient`, `createMockBackend`. |
| `@yusr/api` | core, i18n, sdk (tests) | Nest controllers are generated from the endpoint table. |

## The API

Every route is one object in `packages/api/src/http/endpoints/*`:

```ts
endpoint({
  id: 'donations.create',
  method: 'POST', path: '/donations', version: '1',
  access: 'public',                       // public · user · staff
  body: createDonationSchema,             // zod: validated, and exported to OpenAPI
  headers: [{ name: 'Idempotency-Key', required: true }],
  rateLimit: { name: 'donations:create', limit: 30, windowSeconds: 600, by: 'ip' },
  handle: ({ services, ctx, body, request }) => services.donations.create(body, { ...ctx, idempotencyKey: … }),
});
```

From that table the API derives, in one place:

- **`dispatch()`** — the request pipeline: authenticate (JWT) → access level and permission
  (staff permissions also require a completed second factor) → Redis rate limit → guest GET cache
  → zod validation of body and query → handler → `application/problem+json` errors with stable
  codes (`VALIDATION_FAILED`, `IDEMPOTENCY_CONFLICT`, `FORBIDDEN_TRANSITION`, …).
- **NestJS controllers**, one per tag, generated with Nest's decorators — Nest provides the
  server, lifecycle and DI; it does not own the routing rules.
- **`GET /v1/openapi.json`** — OpenAPI 3.1 built from the same schemas.
- **A plain `node:http` host** used by the end-to-end tests.

55 routes in 10 groups: System, Catalog, Donations, Submissions, Auth, Me, Payments (webhooks) and
Operations · Cases / Finance / People. The prototype's architecture page lists them all, generated
from the table at build time.

## Data model

PostgreSQL 16, hand-written SQL migrations (`packages/api/src/db/migrations/`, starting with
`0000_init.sql`: 24 tables, 2 views, 17 enums, 9 triggers), applied in order by
`src/db/migrate.ts` (`pnpm db:migrate`), which records each file with a checksum in
`yusr_migrations`. A schema change is a new numbered file mirrored in `schema.ts`. Amounts are
integer minor units (`bigint`) with an explicit currency; timestamps are `timestamptz`; public ids
are UUIDv7.

```mermaid
erDiagram
  users {
    uuid id PK
    citext email
    text locale
    user_role_array roles
    boolean mfa_enabled
  }
  auth_identities {
    uuid id PK
    uuid user_id FK
  }
  refresh_tokens {
    uuid id PK
    uuid user_id FK
    uuid family_id
    uuid replaced_by FK
    timestamptz revoked_at
  }
  volunteer_profiles {
    uuid user_id PK,FK
  }
  beneficiaries {
    uuid id PK
    jsonb pseudonym
    text national_id_hash
  }
  cases {
    uuid id PK
    text reference
    case_category category
    case_status status
    uuid beneficiary_id FK
    uuid submitted_by FK
    text region
    currency currency
    bigint goal_minor
    boolean is_urgent
    timestamptz deadline
    uuid auditor_id FK
  }
  case_documents {
    uuid id PK
    uuid case_id FK
    document_kind kind
    text storage_key
    text sha256
    uuid uploaded_by FK
    uuid redacted_by FK
  }
  case_updates {
    uuid id PK
    uuid case_id FK
    uuid author_id FK
  }
  case_status_rules {
    case_status from_status PK
    case_status to_status PK
  }
  case_transitions {
    bigint id PK
    uuid case_id FK
    uuid actor_id FK
  }
  verification_tasks {
    uuid id PK
    uuid case_id FK
    uuid auditor_id FK
    uuid assigned_by FK
    verification_status status
    jsonb checklist
    bigint recommended_minor
  }
  disbursement_lines {
    uuid id PK
    uuid case_id FK
    payee_type payee_type
    bigint amount_minor
  }
  donations {
    uuid id PK
    uuid case_id FK
    uuid donor_id FK
    text idempotency_key
    bigint amount_minor
    bigint charged_minor
    bigint net_to_case_minor
    payment_method method
    payment_provider provider
    donation_status status
    text receipt_no
  }
  receipt_counters {
    smallint year PK
  }
  payment_attempts {
    uuid id PK
    uuid donation_id FK
    payment_provider provider
    text provider_ref
    text status
  }
  webhook_events {
    uuid id PK
    payment_provider provider
    text event_id
    timestamptz processed_at
  }
  payouts {
    uuid id PK
    uuid case_id FK
    uuid line_id FK
    bigint amount_minor
    payout_status status
    uuid requested_by FK
    uuid approved_by FK
    text bank_reference
    uuid proof_document_id FK
  }
  refunds {
    uuid id PK
    uuid donation_id FK
    bigint amount_minor
    refund_status status
    uuid requested_by FK
    uuid approved_by FK
  }
  ledger_accounts {
    text code PK
    uuid case_id FK
  }
  journal_entries {
    uuid id PK
    entry_kind kind
    uuid donation_id FK
    uuid payout_id FK
    uuid refund_id FK
    uuid posted_by FK
    timestamptz posted_at
    in kind
  }
  journal_lines {
    bigint id PK
    uuid entry_id FK
    text account_code FK
    text direction
    bigint amount_minor
    currency currency
  }
  audit_logs {
    bigint id PK
    uuid actor_id FK
    text action
    text entity_type
    text entity_id
  }
  outbox_events {
    bigint id PK
    text type
    outbox_status status
    smallint attempts
  }
  notifications {
    uuid id PK
    uuid user_id FK
    uuid donation_id FK
  }
  users ||--o{ auth_identities : "user_id"
  users ||--o{ refresh_tokens : "user_id"
  users ||--o{ volunteer_profiles : "user_id"
  beneficiaries ||--o{ cases : "beneficiary_id"
  users ||--o{ cases : "submitted_by"
  users |o--o{ cases : "auditor_id"
  cases ||--o{ case_documents : "case_id"
  users ||--o{ case_documents : "uploaded_by"
  users |o--o{ case_documents : "redacted_by"
  cases ||--o{ case_updates : "case_id"
  users ||--o{ case_updates : "author_id"
  cases ||--o{ case_transitions : "case_id"
  users |o--o{ case_transitions : "actor_id"
  cases ||--o{ verification_tasks : "case_id"
  users ||--o{ verification_tasks : "auditor_id"
  users ||--o{ verification_tasks : "assigned_by"
  cases ||--o{ disbursement_lines : "case_id"
  cases ||--o{ donations : "case_id"
  users |o--o{ donations : "donor_id"
  donations ||--o{ payment_attempts : "donation_id"
  cases ||--o{ payouts : "case_id"
  disbursement_lines ||--o{ payouts : "line_id"
  users ||--o{ payouts : "requested_by"
  users |o--o{ payouts : "approved_by"
  case_documents |o--o{ payouts : "proof_document_id"
  donations ||--o{ refunds : "donation_id"
  users ||--o{ refunds : "requested_by"
  users |o--o{ refunds : "approved_by"
  cases |o--o{ ledger_accounts : "case_id"
  donations |o--o{ journal_entries : "donation_id"
  payouts |o--o{ journal_entries : "payout_id"
  refunds |o--o{ journal_entries : "refund_id"
  users |o--o{ journal_entries : "posted_by"
  journal_entries ||--o{ journal_lines : "entry_id"
  ledger_accounts ||--o{ journal_lines : "account_code"
  users |o--o{ audit_logs : "actor_id"
  users |o--o{ notifications : "user_id"
  donations |o--o{ notifications : "donation_id"
```

The generated diagram shows keys and the columns that carry business meaning; the migration has
every column, comment and constraint.

### Invariants the database enforces

| Rule | How |
|---|---|
| Every journal entry balances, per currency | Deferred constraint trigger `journal_lines_invariants`, checked at COMMIT |
| Ledger and audit log are append-only | `forbid_mutation()` triggers on UPDATE / DELETE / TRUNCATE |
| A case fund never goes below zero | Checked in the same trigger for `liability:case:*` accounts |
| Four eyes on money out | `payouts_four_eyes`, `refunds_four_eyes`: approver ≠ requester |
| Cases move only along allowed edges; only the platform sets `funded` | `cases_status_guard` against `case_status_rules` |
| Public cases are verified | `cases_public_verified`: published/funded ⇒ `verified_at` |
| A webhook is applied once; one journal entry per donation / payout | `webhook_events_once`, partial unique indexes |
| One open field visit per case | `verification_one_open_task` partial unique index |

The services check the same rules first (with friendly errors); the database is the backstop.

## Lifecycles

### Case

```mermaid
stateDiagram-v2
  direction LR
  [*] --> draft
  draft --> under_review: submit
  under_review --> draft: needs changes (reason)
  under_review --> field_verified: visit signed off
  under_review --> rejected: reason
  field_verified --> published: moderator publishes
  field_verified --> rejected: reason
  published --> paused: reason
  paused --> published
  published --> funded: platform only, when the ledger says so
  funded --> closed: all paid out
  published --> closed: reason
  paused --> closed: reason
```

Each edge belongs to a permission (`packages/core/src/lifecycle.ts`); the control hub only offers
the edges the signed-in role holds, and the API re-checks them.

### Donation

```mermaid
stateDiagram-v2
  direction LR
  [*] --> requires_action: checkout created
  requires_action --> succeeded: gateway webhook
  requires_action --> failed
  requires_action --> expired: checkout window over
  [*] --> awaiting_transfer: InstaPay / bank
  awaiting_transfer --> succeeded: finance matches the statement
  awaiting_transfer --> expired
  succeeded --> partially_refunded
  succeeded --> refunded
  requires_action --> needs_review: amount or currency mismatch
```

Only a verified webhook (or a finance officer's reconciliation of a transfer) marks a donation
succeeded. Return URLs are for people; they never change money state.

## Clients

**Website (`apps/web`)** — Next.js 16 App Router, React Server Components, Tailwind v4.
Locale-prefixed routes (`/ar`, `/en`; the proxy picks the language from a cookie or
`Accept-Language`). Catalog reads go through Next's data cache for 20 seconds; anything personal
is `no-store`. The donate form and the case submission form post to server actions and work
before JavaScript loads. A per-request nonce CSP allows no third-party script; the only outbound
browser traffic is to the gateway (form action) and to object storage (document upload).

**Control hub (`apps/admin`)** — staff only. Sign-in is phone OTP **and** an authenticator code;
sessions are an httpOnly access cookie plus a rotating refresh cookie, refreshed in the Next.js
proxy only (prefetches skip it, so a refresh token is never raced). Navigation shows the sections
a role can use: the case pipeline with role-aware transitions, field verification (assign an
auditor, checklist, sign-off with the verified goal), finance (transfer reconciliation, maker-checker
payouts, ledger balance check), donors / volunteers / team, and the audit trail.

**Mobile (`apps/mobile`)** — Expo SDK 54, Expo Router, React Native 0.81 with the new
architecture. Same SDK, dictionaries, tokens and icon set as the web. Arabic switches the whole
layout to RTL (one reload, as React Native requires). Checkout opens hosted gateways in an auth
session that closes on `yusr://receipt`, confirms Stripe in the native Payment Sheet, and shows
Fawry / InstaPay references in the app. See [MOBILE.md](MOBILE.md).

**Prototype (`apps/prototype`)** — every surface above as one self-contained, clickable page,
running the real shared packages against the SDK's in-memory backend.

## Language and theme

`@yusr/i18n` holds both dictionaries (typed keys — a missing key is a compile error), Arabic
plural categories (zero / one / two / few / many / other), and formatters for money, percentages,
dates and relative times with Arabic-Indic digits in Arabic. Components get a `{ t, f, l }`
bundle (`l` picks the locale's side of a `{ ar, en }` value).

`@yusr/theme` is the single source of the brand: semantic colours for light and dark, category
tones, radii, type scale, motion, the logo geometry and the «روضة العطاء» pattern. It emits
`tokens.css` (CSS variables), `tailwind.css` (a Tailwind v4 `@theme inline` block mapping those
variables to utilities such as `bg-primary`, `rounded-card`), a React Native theme, and SVG
assets. Swapping the palette is one `createTheme()` call; see [BRAND.md](BRAND.md).

## Background work

State changes that must reach the outside world (a donation succeeded, a case was funded, a
visit was assigned) write an `outbox_events` row **in the same transaction**. The worker
(`pnpm --filter @yusr/api worker`) claims events with `FOR UPDATE SKIP LOCKED`, delivers them
with retries and backoff, and fans out:

| Event | Goes to |
|---|---|
| `donation.succeeded` | Receipt by email / SMS / WhatsApp, push to the donor's devices, analytics |
| `donation.failed`, `donation.expired` | A gentle "your payment didn't complete" with a link to try again |
| `case.funded` | Donors of the case; finance channel in Slack |
| `payout.paid` | Donors of the case (proof of payment), case page transparency |
| `case.submitted` | Slack `#field-ops`, a row in the Baserow visits table |
| `verification.assigned` | The auditor (SMS / WhatsApp), Baserow |
| `finance.review_needed` | Finance in Slack (amount or currency mismatch from a gateway) |
| `refund.processed` | The donor |
| other `case.*` transitions | Product analytics only |

## Configuration

Each app has an `.env.example` with every variable explained. The API validates its environment at
start-up (`packages/api/src/config/env.ts`) and refuses to start in production with development
defaults (memory storage, simulated payments, missing secrets).

| App | Key settings |
|---|---|
| API | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `OTP_PEPPER`, `NATIONAL_ID_PEPPER`, `DATA_KEY_BASE64`, gateway keys, `S3_*`, messaging and ops tokens |
| Web | `YUSR_API_URL`, `NEXT_PUBLIC_SITE_URL`, `UPLOAD_ORIGIN`, `NEXT_PUBLIC_SHOW_SUPERVISION`, `NEXT_PUBLIC_MOSS_REGISTRATION_NUMBER` |
| Admin | `YUSR_API_URL` |
| Mobile | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` (and `app.json` → `extra`) |

`YUSR_STORAGE=memory` runs the API with no database or Redis (seeded demo data, simulated
gateways) — the fastest way to click through everything locally.

## Testing

| Suite | What it proves |
|---|---|
| `packages/core` | Money rounding, honest progress, fees and gross-up, ledger postings balance, lifecycle and RBAC rules, schemas |
| `packages/i18n` | Both dictionaries have the same keys and placeholders; plurals and digits |
| `packages/theme` | Contrast (WCAG AA) of every token pair, logo geometry, pattern tiling |
| `packages/sdk` | The in-memory backend honours the API contract |
| `packages/ui` | Server rendering of the case card, progress and countdown in both languages |
| `packages/api` | Services, gateway signatures and parsers, **end-to-end over real HTTP with the SDK**, and **SQL tests on PostgreSQL 16** that try to break the invariants above |

`node apps/prototype/scripts/verify.mjs` runs them all and records the result for the prototype's
architecture page.
