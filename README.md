<div dir="rtl">

# يُسر — منصة عطاء بمعايير شفافة

«فإنّ مع العسر يسرًا»

**يُسر** منصة تبرعات تربط المتبرعين بحالات تحقّق منها مدققون ميدانيون — علاج، سداد ديون، رعاية أيتام،
تعليم، إغاثة عاجلة — وتدفع للمستشفى أو الدائن أو المدرسة مباشرةً، مع إيصال وإثبات صرف لكل جنيه.
الواجهات عربية أولًا مع الإنجليزية كاملة، في الوضعين الفاتح والداكن.

## النسخة التجريبية الحية

| | الرابط |
|---|---|
| الموقع | <https://yusr-eg.vercel.app> |
| لوحة التحكم | <https://yusr-hub.vercel.app> |
| الـ API | <https://yusr-api.vercel.app/v1/openapi.json> |

نسخة للعرض: الحالات والتبرعات افتراضية ولا يُخصم أي مبلغ (انظر [الدليل](docs/GUIDE.ar.md) ← النشر ← نسخة تجريبية مجانية).

## ماذا يوجد في المستودع

| الجزء | المسار | الوصف |
|---|---|---|
| الموقع | `apps/web` | الصفحة الرئيسية، الحالات مع التصفية، صفحة الحالة والتبرع، الإيصال، تقديم حالة — Next.js |
| مركز التحكم | `apps/admin` | نظرة عامة، مراحل الحالات، التحقق الميداني، المالية باعتماد مزدوج، المتبرعون والمتطوعون، سجل التدقيق |
| تطبيق الجوال | `apps/mobile` | iOS وAndroid بـ Expo: الرئيسية، الاستكشاف، تبرعاتي، الإعدادات، الدفع داخل التطبيق |
| النموذج التفاعلي | `apps/prototype` | المنصة كلها في صفحة واحدة قابلة للنقر |
| الواجهة البرمجية | `packages/api` | NestJS + PostgreSQL: التبرعات، بوابات الدفع، الدفتر المحاسبي، التحقق، المستندات |
| الحزم المشتركة | `packages/*` | المنطق، الترجمة، الهوية البصرية، المكوّنات، عميل الـ API |

## التشغيل السريع

> **ابدأ من هنا:** [دليل المالك والمطوّر بالعربي](docs/GUIDE.ar.md) — كيف تشغّل المشروع وتعدّل فيه وتنشره، خطوة بخطوة.

```bash
node scripts/setup.mjs     # مرة واحدة: يثبّت كل شيء وينشئ ملفات الإعدادات
pnpm dev:demo              # الموقع :3000 · مركز التحكم :3001 · الـ API :4000 — ببيانات تجريبية بلا قاعدة بيانات
pnpm check                 # كل فحوص الجودة قبل أي رفع
```

أو افتح المستودع في **GitHub Codespaces** وكل شيء يُجهَّز تلقائيًا.

## التوثيق

[الدليل بالعربي](docs/GUIDE.ar.md) · [البنية](docs/ARCHITECTURE.md) · [المدفوعات](docs/PAYMENTS.md) · [الأمان والخصوصية](docs/SECURITY.md) ·
[التشغيل وأدوات الفريق](docs/OPERATIONS.md) · [الهوية البصرية](docs/BRAND.md) · [تطبيق الجوال](docs/MOBILE.md) ·
[خطة التنفيذ](docs/ROADMAP.md)

</div>

---

# Yusr — giving with open books

**Yusr** (يُسر, "ease") is a donation platform that connects donors with cases verified in the
field — medical treatment, debt relief, orphans' care, education, urgent relief — and pays the
hospital, creditor or school directly, with a receipt and proof of payment for every pound.
Arabic first, English complete; light and dark.

## What's inside

```text
apps/web          Donor website (Next.js 16, RSC, Tailwind v4)
apps/admin        Control hub for the team (Next.js 16, staff two-factor sign-in)
apps/mobile       iOS + Android app (Expo SDK 54, Expo Router)
apps/prototype    The whole platform as one clickable, bilingual page
packages/api      NestJS 11 API, PostgreSQL 16 schema, gateways, ledger, outbox worker
packages/core     Domain rules: money, lifecycle, RBAC, payments routing, ledger, schemas
packages/i18n     Arabic + English dictionaries, plurals, formatting
packages/theme    Design tokens, logo, the «روضة العطاء» pattern — for web and native
packages/ui       Shared React components (CaseCard, DonationProgress, …)
packages/sdk      Typed API client + an in-memory backend with the same contract
```

## Quick start

Requirements: Node 22.12+ and pnpm 10 (`corepack enable`). Docker only for the full stack.
Or open the repository in **GitHub Codespaces** / a VS Code dev container: everything below is set up for you.

```bash
node scripts/setup.mjs        # once: checks Node/pnpm, installs, creates the .env files with dev secrets
pnpm dev:demo                 # website :3000 · hub :3001 · API :4000 on seeded demo data, no database

# Full stack: PostgreSQL 16, Redis 7 and S3-compatible storage (MinIO) in Docker
node scripts/setup.mjs --db   # = pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm dev

# Mobile (a development build: Expo Go can't load the Stripe module)
pnpm dev:mobile
```

`node scripts/doctor.mjs` diagnoses the environment (tools, settings files, databases, ports).

**Signing in to the hub locally.** Demo staff use the phones `+201000000001` (super admin),
`…02` / `…03` (field auditors), `…04` / `…05` (finance) and `…06` (moderator). In development the
SMS code is printed in the API's log; the authenticator code comes from the demo secret
`JBSWY3DPEHPK3PXP` (add it to any authenticator app, or `oathtool --totp -b JBSWY3DPEHPK3PXP`).
Demo credentials exist only in seeded development data.

## Everyday commands

| Command | Does |
|---|---|
| `pnpm dev:demo` / `pnpm dev` | Website, hub and API with live reload (demo data / PostgreSQL) |
| `pnpm check` | Everything CI checks: formatting, lint, types, tests |
| `pnpm format` · `pnpm lint:fix` | Fix formatting (Prettier) and autofixable lint (ESLint) |
| `pnpm build` | Builds every package and app (Turborepo, cached) |
| `pnpm test` | All test suites; set `YUSR_TEST_DATABASE_URL` to include the PostgreSQL ones |
| `pnpm db:migrate` · `pnpm db:seed` · `pnpm db:studio` | Apply SQL migrations · load demo data · browse the data |
| `pnpm api:openapi` | Regenerates [`docs/api/openapi.json`](docs/api/openapi.json) (import into Postman/Insomnia) |
| `pnpm prototype` | Rebuilds the one-file prototype into `apps/prototype/dist/index.html` |
| `pnpm --filter @yusr/api worker` | Runs the outbox worker (notifications and integrations) |

Editor: open the folder in VS Code and accept the recommended extensions — formatting, lint fixes,
Tailwind hints, debugging (F5) and one-click tasks are configured in `.vscode/`. Coding assistants
read [`CLAUDE.md`](CLAUDE.md) for the project's conventions.

## Documentation

- [دليل المالك والمطوّر (عربي)](docs/GUIDE.ar.md) — run, change, deploy, step by step
- [Architecture](docs/ARCHITECTURE.md) — system, monorepo, API design, data model (ERD), lifecycles
- [Payments](docs/PAYMENTS.md) — gateways, checkout, webhooks, the ledger, payouts and refunds
- [Security and privacy](docs/SECURITY.md) — threats, sessions, RBAC, personal data, hardening
- [Operations](docs/OPERATIONS.md) — Linear, Slack, Baserow, Chatwoot, PostHog, Sentry; routines
- [Brand](docs/BRAND.md) — the mark, colour, type, pattern, writing, theming
- [Mobile](docs/MOBILE.md) — screens, RTL, native checkout, deep links
- [Roadmap](docs/ROADMAP.md) — phases, status, what's next
