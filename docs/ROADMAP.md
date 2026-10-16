# Roadmap

Sixteen weeks from kick-off to a public beta, in four phases. Each phase ends with something
people can use.

| Phase | Weeks | Delivers |
|---|---|---|
| **1 · Foundation** | 1–4 | Brand and design tokens, shared packages, database with its invariants, phone sign-in, the case lifecycle |
| **2 · Giving and payments** | 5–8 | Paymob, Fawry and InstaPay, the double-entry ledger, receipts, the website |
| **3 · Operations** | 9–12 | Control hub, field verification, maker-checker payouts, Slack / Baserow / Chatwoot / PostHog / Sentry |
| **4 · Launch** | 13–16 | Mobile apps, Stripe and mada (Moyasar), security review and penetration test, private beta |

## Where things stand

Built and tested in this repository:

- **Shared packages** — core domain, bilingual dictionaries, theme (logo, pattern, tokens for web
  and native), UI components, typed SDK with an in-memory backend.
- **API** — every route in one endpoint table (55 routes, OpenAPI 3.1), auth with rotating
  sessions and staff two-factor, donations with idempotency, five gateways (Paymob, Fawry,
  Moyasar, Stripe, InstaPay) behind one interface plus a simulator, the ledger, payouts and
  refunds with four eyes, documents with presigned storage, the outbox worker and integrations.
- **Database** — the full PostgreSQL schema with its invariants, exercised by SQL tests that try to
  break them.
- **Website, control hub and mobile app** — every screen described in [ARCHITECTURE.md](ARCHITECTURE.md).
- **Prototype** — the whole platform, clickable, in Arabic and English, light and dark.

Verified end to end on a real install (October 2026):

- `pnpm install --frozen-lockfile` from the committed lockfile; formatting, ESLint and TypeScript
  clean across all 12 workspace projects.
- Production builds: the packages (tsup), the API (`nest build`), the website and the hub
  (`next build`, Turbopack, plus the standalone server the Docker image runs), the prototype.
- Mobile: Metro + Hermes bundles for Android and iOS (`expo export`), one React copy in the bundle.
- 199 tests: unit, HTTP end-to-end, the PostgreSQL invariant suite, the migration runner and the
  staff bootstrap command.
- The compiled API on PostgreSQL 16 + Redis (migrations, seed), with the production website and hub
  in a browser: a guest donation through the simulated gateway to its receipt, then a staff
  sign-in (SMS code + authenticator) through every hub page — no console errors.

## Next

1. **Repository and CI** — push to GitHub; CI runs the same checks on every push and pull request.
2. **Gateway sandboxes** — Paymob, Fawry staging, Stripe test and Moyasar test keys; walk every
   method through to a webhook and a ledger entry; register webhook URLs.
3. **Document redaction tooling** — moderators blur personal details in the hub before a public copy
   is made (today the redacted copy is uploaded separately).
4. **Donor accounts on web and mobile** — sign-in (the API and SDK support it), saved receipts across
   devices, recurring monthly giving.
5. **Messaging providers** — SMS / WhatsApp Business templates approved in Arabic and English; push
   notifications through Expo.
6. **Registration and compliance** — the operating association's registration with the Ministry of
   Social Solidarity (and its number on the site), fundraising permits, data-protection review,
   penetration test.
7. **Beta** — a small set of verified cases in two governorates, a closed donor group, weekly
   reviews of verification time and payout time before opening to the public.
