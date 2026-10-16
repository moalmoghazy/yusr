# Yusr (يُسر) — working notes for Claude Code and other coding assistants

A transparent donation platform: donors give to field-verified cases (medical, debt relief, education,
urgent relief), and every pound is traced through a double-entry ledger to a receipt and a payout.
Arabic first (RTL), English second. The owner's guide is `docs/GUIDE.ar.md`; architecture in `docs/`.

## Map

| Path | What it is |
|---|---|
| `apps/web` | Donor website — Next.js 16 App Router, Tailwind 4. Server-side API access only (`src/lib/api.ts`); forms are server actions in `src/lib/*.ts` |
| `apps/admin` | Control hub for staff — Next.js; phone OTP + authenticator sign-in; RBAC on every page |
| `apps/mobile` | Donor app — Expo SDK 54, Expo Router (`src/app`), React Native 0.81 |
| `apps/prototype` | Clickable one-file demo of every surface, built from the same packages. Not production code |
| `packages/api` | NestJS 11 API on PostgreSQL 16 + Redis. Endpoints are a typed table in `src/http/endpoints/*.endpoints.ts` |
| `packages/core` | Domain rules shared by everything: money, case lifecycle, RBAC, ledger postings, zod schemas |
| `packages/i18n` | `messages/ar.ts` + `messages/en.ts`, plurals, number/date/money formatting |
| `packages/theme` | Design tokens (`src/tokens.ts`), logo geometry, the «روضة العطاء» pattern; generates CSS for web |
| `packages/ui` | Shared React (DOM) components: `CaseCard`, `DonationProgress`, `Logo`, `Icon`; icon data reused by mobile |
| `packages/sdk` | Typed API client + an in-memory backend with the same contract (prototype, tests) |
| `packages/config` | Shared tsconfig bases |

## Commands

```bash
pnpm dev:demo            # website :3000 + hub :3001 + API :4000 on demo data, no database
pnpm dev                 # same on PostgreSQL (pnpm infra:up && pnpm db:migrate && pnpm db:seed first)
pnpm dev:mobile          # Expo
pnpm check               # format:check + lint + typecheck + test — run before you say you're done
pnpm --filter @yusr/<pkg> test       # one package's tests (node:test + tsx)
pnpm format && pnpm lint:fix         # fix formatting and autofixable lint
pnpm api:openapi         # regenerate docs/api/openapi.json after changing endpoints
pnpm prototype           # rebuild apps/prototype/dist/index.html
```

PostgreSQL test suites run when `YUSR_TEST_DATABASE_URL` is set (an account that may CREATE DATABASE).

## Rules that keep the project consistent

- **No hard-coded UI text.** Every string a person reads goes in `packages/i18n/src/messages/ar.ts` and
  `en.ts` under the same key (a test fails if the two differ). Write Arabic first; Egyptian-neutral MSA.
- **RTL is the default.** Use logical CSS (`ms-*`, `me-*`, `start`, `end`, `text-start`), never left/right.
  Numbers, references and phone numbers that must stay LTR get `dir="ltr"`. Check both locales.
- **Money is integers in minor units** (`amountMinor`: piasters, halalas, cents). Never floats; use the
  helpers in `@yusr/core` (`toMinor`, `allocateMinor`, …) and `f.money` from `@yusr/i18n` to display.
- **Brand comes from `packages/theme`.** Colours, radii, type and shadows are tokens in `src/tokens.ts`;
  web reads the generated CSS variables (`--y-*`), mobile reads `theme.colors.*`. Logo face: Reem Kufi
  (`LOGO_FACE`); headings: IBM Plex Sans Arabic bold (`DEFAULT_DISPLAY_FACE`). Don't add hex colours in apps.
- **Database changes = a new SQL file.** Add `packages/api/src/db/migrations/NNNN_name.sql` (next number),
  mirror it in `src/db/schema.ts` (and `rows.ts`, the memory store, the seed if needed). Never edit a
  migration that has been applied — the runner refuses changed files. Ledger and case-status rules are
  enforced by triggers in `0000_init.sql`; keep the TypeScript rules in `@yusr/core` in step with them.
- **New API endpoint:** add it to the endpoint table with zod schemas from `@yusr/core/schemas`, the
  permission it needs, and tests in `packages/api/test`; then the SDK (`YusrClient`, `http.ts`, and the
  mock backend), then `pnpm api:openapi`.
- **Case lifecycle:** `draft → under_review → field_verified → published → funded → closed` (+ paused,
  rejected). Transitions live in `@yusr/core` (`CASE_TRANSITIONS`) and are backstopped in SQL.
- **Permissions:** roles and permissions are defined in `@yusr/core` (`rbac.ts`); check them on the API,
  and hide what a role can't do in the hub.
- **One React version (19.1.0) everywhere**, pinned by `pnpm-workspace.yaml` overrides, because React
  Native needs the exact version its Expo SDK ships. Upgrade Expo, React and the overrides together.
- **`NEXT_PUBLIC_*` values are compiled in at build time**; server-only settings (`YUSR_API_URL`) are read
  at request time. The browser never calls the API directly.
- **Personal data:** national IDs are encrypted (`FieldCipher`) and only shown redacted; donor contact
  details never reach public pages. Don't log them.

## Definition of done

`pnpm check` passes; new behaviour has a test; UI changes are looked at in Arabic and English, light and
dark, at phone width; docs updated when a command, setting or flow changes.
