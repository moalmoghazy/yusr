# Security and privacy

Yusr holds three kinds of things worth protecting: **money** (donations, payouts), **people's most
sensitive facts** (illness, debt, national IDs, homes) and **trust** (a public record that says a
case was verified and every pound was paid out). This is how each is protected, and where.

## Threats we design for

| Threat | Main defences |
|---|---|
| Fake or duplicate cases | Field visit before publishing (five-point checklist, auditor ≠ submitter), keyed-hash duplicate detection on national IDs, documents hashed at upload |
| Money diverted or double-counted | Direct payment to payees only, maker-checker on payouts and refunds, double-entry ledger balanced by the database, append-only journals |
| Forged payment confirmations | Signed webhooks only (constant-time checks), amount/currency matching, replay-proof event store; return URLs never change state |
| Account takeover (staff) | Phone OTP **and** authenticator app (TOTP) for any staff permission; short-lived access tokens; refresh-token reuse revokes the whole login |
| Exposure of beneficiaries | Pseudonyms, redacted public documents, originals only to auditors via short-lived links, encrypted national IDs, masked contacts in the CRM |
| Abuse of public endpoints | Redis rate limits per IP or account, body size limits, strict validation, OTP attempt limits and resend cooldown |
| Script injection / clickjacking | Nonce-based CSP with no third-party scripts, `frame-ancestors 'none'`, React escaping, no `dangerouslySetInnerHTML` of user content |

## Identity and sessions

- **Donors** can give as guests (email or mobile number for the receipt) or sign in with a phone
  code, Google or Apple (ID tokens verified against the providers' JWKS and the configured
  client ids).
- **Phone codes**: 6 digits, valid 5 minutes, 5 attempts, one resend per minute; stored only as a
  peppered hash in Redis.
- **Access tokens**: JWT (HS256 with key ids, so a previous secret can verify while a new one signs),
  15 minutes, carrying roles and whether a second factor was completed.
- **Refresh tokens**: opaque, 30 days, stored hashed, **rotated on every use**. Presenting a token
  that was already rotated means it leaked: the whole login family is revoked.
- **Staff**: every staff permission requires `mfa=true` in the session — a code from an
  authenticator app enrolled with `/v1/auth/mfa`. Without it the API answers `FORBIDDEN` with
  `mfaRequired`, whatever the role.
- **Control hub cookies** are httpOnly, `Secure` (in production) and `SameSite=Strict`; tokens are refreshed only in the
  Next.js proxy (never in parallel prefetches, which would trip reuse detection).

## Authorization (RBAC)

Least privilege, mapped to how the organisation works (`packages/core/src/rbac.ts`):

| Role | Can |
|---|---|
| Field auditor | Read cases, review, **verify** (checklist and sign-off on their own visits), open original documents |
| Content moderator | Edit wording, review, publish, pause, prioritise, redact documents, assign visits, manage volunteers, read the CRM |
| Financial officer | Read and reconcile finance, request and approve refunds and payouts (never their own), close funded cases, read the CRM |
| Super admin | Everything, including team and settings; still subject to four-eyes on money |
| Donor · Beneficiary · Volunteer | Their own data; beneficiaries and volunteers can submit cases |

The API checks the permission on every route (declared in the endpoint table) and again in the
service for rules that depend on data (e.g. "this visit is assigned to another auditor"). The
apps only hide what a role cannot do; they are never the enforcement point.

## Personal data

| Data | Stored as | Who sees it |
|---|---|---|
| National ID | AES-256-GCM ciphertext (key from `DATA_KEY_BASE64` / KMS) + HMAC-SHA256 keyed hash (`NATIONAL_ID_PEPPER`) for duplicate checks | Auditors, through the API; everywhere else the hash only flags "possible duplicate" |
| Beneficiary name | Never published; a pseudonym (e.g. «أم أحمد») is | Auditors (originals) |
| Documents | Private bucket; SHA-256 recorded at upload; redacted copies in the public bucket | Public: redacted copies · Auditors: originals through 5-minute links |
| Donor contact | Plain columns needed for receipts; masked in the CRM (`+201•••17`) | Finance/moderators see masked values |
| Payment data | Never stored — hosted gateway pages and the Stripe sheet | Gateways only |

Logs contain method, path, status, duration and request id — never query strings or bodies.
Analytics events carry ids, amounts and categories, not names, phones or emails.

## Money controls

- Payouts go to payees on the published disbursement plan, never cash to beneficiaries.
- Maker-checker on payouts and refunds, enforced by the API and by `CHECK` constraints.
- Journal entries balance per currency (deferred constraint trigger at COMMIT); journals and the
  audit log reject UPDATE, DELETE and TRUNCATE.
- A case fund cannot go negative; `funded` can only be set by the platform when the ledger says so.
- Transfers (InstaPay) are credited only after finance matches the statement and the amount.

## Web and API hardening

- **Website and hub**: per-request nonce CSP with `'strict-dynamic'`, `object-src 'none'`,
  `base-uri 'self'`, `frame-ancestors 'none'`, `form-action 'self' https:` (gateway redirects),
  `connect-src` limited to self, the upload bucket and configured observability hosts; HSTS
  (preload), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- **API**: Helmet with `default-src 'none'`, CORS allow-list, JSON limit 256 KB (uploads never pass
  through the API in production), problem+json errors without stack traces, request ids,
  `TRUST_PROXY` so rate limits count real client IPs.
- **Webhooks**: raw-body signature verification, 5-minute timestamp tolerance where the provider
  signs time, stored once per `(provider, event_id)`.
- **Configuration**: the API refuses to start in production with development defaults (memory
  storage, simulated gateways, missing secrets).

## Operations

- Secrets live in the deployment platform's secret store; `.env` files are for development only.
- Rotate `JWT_SECRET` by moving the current value to `JWT_SECRET_PREVIOUS` for one access-token
  lifetime; rotate gateway secrets in the provider dashboard and the environment together.
- Sentry (errors and performance, `sendDefaultPii` off) and the access log carry the same request id for tracing.
- Backups: PostgreSQL point-in-time recovery; object storage with versioning on the private bucket.
- Before launch: an external penetration test, a review of the gateway integrations against each
  provider's checklist, and a data-protection review under Egypt's Personal Data Protection Law
  (No. 151 of 2020) and Saudi Arabia's PDPL.

Found a vulnerability? Email security@yusr.org — please don't open a public issue.
