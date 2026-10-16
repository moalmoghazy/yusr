-- Yusr — initial schema (PostgreSQL 16).
--
-- Principles
--   * Money is bigint minor units (piastres, halalas, cents). No floats near a balance.
--   * The ledger is double-entry and append-only; the database itself refuses an
--     unbalanced journal entry or a case fund that goes negative.
--   * Personal data is minimised: national IDs are stored as a keyed hash (for
--     de-duplication) plus ciphertext readable only through the API's KMS key.
--   * Every rule the API enforces on money or case status has a backstop here.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- Enums (mirror @yusr/core)
CREATE TYPE user_role AS ENUM ('donor', 'beneficiary', 'volunteer', 'field_auditor', 'content_moderator', 'financial_officer', 'super_admin');
CREATE TYPE auth_provider AS ENUM ('phone', 'google', 'apple', 'email');
CREATE TYPE case_category AS ENUM ('medical', 'debt_relief', 'education', 'orphans', 'relief');
CREATE TYPE case_status AS ENUM ('draft', 'under_review', 'field_verified', 'published', 'funded', 'closed', 'paused', 'rejected');
CREATE TYPE currency AS ENUM ('EGP', 'SAR', 'USD');
CREATE TYPE document_kind AS ENUM ('national_id', 'medical_report', 'price_quote', 'invoice', 'debt_proof', 'court_ruling', 'school_record', 'field_report', 'disbursement_proof');
CREATE TYPE verification_status AS ENUM ('assigned', 'scheduled', 'completed', 'cancelled');
CREATE TYPE payee_type AS ENUM ('hospital', 'pharmacy', 'creditor', 'school', 'vendor', 'landlord', 'beneficiary');
CREATE TYPE donation_type AS ENUM ('sadaqah', 'zakat', 'general');
CREATE TYPE donation_status AS ENUM ('pending', 'requires_action', 'awaiting_transfer', 'succeeded', 'failed', 'canceled', 'expired', 'refunded', 'partially_refunded', 'needs_review');
CREATE TYPE payment_method AS ENUM ('card', 'apple_pay', 'mada', 'vodafone_cash', 'fawry', 'instapay');
CREATE TYPE payment_provider AS ENUM ('paymob', 'fawry', 'stripe', 'moyasar', 'instapay');
CREATE TYPE payout_status AS ENUM ('requested', 'approved', 'paid', 'rejected');
CREATE TYPE refund_status AS ENUM ('requested', 'approved', 'processed', 'rejected');
CREATE TYPE account_type AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE entry_kind AS ENUM ('donation', 'refund', 'payout', 'settlement', 'adjustment');
CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'sent', 'failed');

-- ---------------------------------------------------------------- Identity
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE, -- E.164, verified by OTP
  email citext UNIQUE,
  display_name text NOT NULL,
  locale text NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar', 'en')),
  roles user_role[] NOT NULL DEFAULT '{donor}',
  region text, -- ISO 3166-2, e.g. EG-C
  mfa_enabled boolean NOT NULL DEFAULT false, -- required for staff roles
  totp_secret_cipher bytea, -- AES-256-GCM; authenticator app secret for staff two-factor sign-in
  marketing_opt_in boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_contact CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT users_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider auth_provider NOT NULL,
  subject text NOT NULL, -- phone number, Google "sub", Apple "sub"
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_subject UNIQUE (provider, subject)
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id uuid NOT NULL, -- one login; reuse of a rotated token revokes the family
  token_hash text NOT NULL UNIQUE, -- SHA-256 of the opaque token, never the token
  mfa boolean NOT NULL DEFAULT false, -- this login passed a second factor; rotation keeps it
  replaced_by uuid REFERENCES refresh_tokens (id),
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE volunteer_profiles (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'onboarding' CHECK (status IN ('onboarding', 'active', 'paused')),
  region text NOT NULL,
  skills text[] NOT NULL DEFAULT '{}',
  baserow_row_id integer UNIQUE, -- field-ops board sync
  joined_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- Search helpers
-- Same rules as normalizeForSearch() in @yusr/core: strip harakat and tatweel, unify
-- alef/hamza forms, ta marbuta and alef maqsura, Arabic-Indic digits to ASCII.
CREATE FUNCTION yusr_normalize(input text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  RETURN btrim(regexp_replace(
    translate(
      regexp_replace(lower(coalesce(input, '')), '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]', '', 'g'),
      'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩',
      'ااااهيوي0123456789'),
    '\s+', ' ', 'g'));

-- Same honesty rules as computeProgress(): never 0% once money arrived, never 100% before the goal.
CREATE FUNCTION yusr_progress_percent(raised bigint, goal bigint) RETURNS smallint
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  RETURN CASE
    WHEN raised >= goal THEN 100
    WHEN raised > 0 AND raised * 100 < goal THEN 1
    ELSE least(99, (raised * 100) / goal)
  END::smallint;

-- ---------------------------------------------------------------- Cases
CREATE TABLE beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pseudonym jsonb NOT NULL, -- public alias {"ar": "أم سارة، ٣٤", "en": "Um Sara, 34"}
  national_id_hash text UNIQUE, -- HMAC-SHA256 with a server pepper: detects duplicates without storing the number
  national_id_cipher bytea, -- AES-256-GCM, key in KMS; auditors only
  phone_cipher bytea,
  region text NOT NULL,
  household_size smallint CHECK (household_size > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE case_reference_seq START 10500;

CREATE TABLE cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('YSR-' || nextval('case_reference_seq')), -- printed on receipts
  slug text NOT NULL UNIQUE,
  category case_category NOT NULL,
  status case_status NOT NULL DEFAULT 'draft',
  beneficiary_id uuid NOT NULL REFERENCES beneficiaries (id),
  submitted_by uuid NOT NULL REFERENCES users (id),
  submitter_relation text NOT NULL CHECK (submitter_relation IN ('self', 'family', 'volunteer')),
  title jsonb NOT NULL, -- {"ar": …, "en": …}
  summary jsonb NOT NULL,
  story jsonb NOT NULL,
  region text NOT NULL,
  currency currency NOT NULL DEFAULT 'EGP',
  goal_minor bigint NOT NULL CHECK (goal_minor > 0),
  raised_minor bigint NOT NULL DEFAULT 0 CHECK (raised_minor >= 0), -- kept in step with the ledger in the same transaction
  donors_count integer NOT NULL DEFAULT 0 CHECK (donors_count >= 0),
  is_urgent boolean NOT NULL DEFAULT false,
  deadline timestamptz, -- drives the countdown on urgent cases
  zakat_eligible boolean NOT NULL DEFAULT false,
  priority smallint NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 100),
  cover_seed integer NOT NULL DEFAULT 0, -- illustrated cover; no beneficiary photos
  auditor_id uuid REFERENCES users (id),
  verified_at timestamptz,
  published_at timestamptz,
  funded_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  progress_percent smallint GENERATED ALWAYS AS (yusr_progress_percent(raised_minor, goal_minor)) STORED,
  search_text text GENERATED ALWAYS AS (yusr_normalize(
    coalesce(title ->> 'ar', '') || ' ' || coalesce(title ->> 'en', '') || ' ' ||
    coalesce(summary ->> 'ar', '') || ' ' || coalesce(summary ->> 'en', '') || ' ' || reference)) STORED,
  CONSTRAINT cases_urgent_deadline CHECK (NOT is_urgent OR deadline IS NOT NULL),
  CONSTRAINT cases_title_ar CHECK (title ? 'ar'),
  CONSTRAINT cases_public_verified CHECK (status NOT IN ('published', 'funded') OR verified_at IS NOT NULL)
);
CREATE INDEX cases_catalog_idx ON cases (status, category, region, priority DESC) WHERE status IN ('published', 'funded', 'closed');
CREATE INDEX cases_search_trgm_idx ON cases USING gin (search_text gin_trgm_ops);

CREATE TABLE case_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  kind document_kind NOT NULL,
  storage_key text NOT NULL, -- private bucket: original, served through 5-minute signed URLs
  redacted_key text, -- public bucket: names, ID numbers and faces removed
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  pages smallint NOT NULL DEFAULT 1,
  uploaded_by uuid NOT NULL REFERENCES users (id),
  redacted_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_documents_case_idx ON case_documents (case_id);

CREATE TABLE case_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  body jsonb NOT NULL, -- "The surgery took place on …"
  author_id uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The allowed transitions (same table as CASE_TRANSITIONS in @yusr/core; a test keeps them equal).
CREATE TABLE case_status_rules (
  from_status case_status NOT NULL,
  to_status case_status NOT NULL,
  system_only boolean NOT NULL DEFAULT false, -- published → funded is performed by the platform only
  PRIMARY KEY (from_status, to_status)
);
INSERT INTO case_status_rules (from_status, to_status, system_only) VALUES
  ('draft', 'under_review', false),
  ('under_review', 'draft', false),
  ('under_review', 'field_verified', false),
  ('under_review', 'rejected', false),
  ('field_verified', 'published', false),
  ('field_verified', 'rejected', false),
  ('published', 'paused', false),
  ('paused', 'published', false),
  ('published', 'funded', true),
  ('funded', 'closed', false),
  ('published', 'closed', false),
  ('paused', 'closed', false);

CREATE TABLE case_transitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  from_status case_status NOT NULL,
  to_status case_status NOT NULL,
  actor_id uuid REFERENCES users (id), -- NULL means the platform itself
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_transitions_case_idx ON case_transitions (case_id, created_at);

CREATE TABLE verification_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  auditor_id uuid NOT NULL REFERENCES users (id),
  assigned_by uuid NOT NULL REFERENCES users (id),
  status verification_status NOT NULL DEFAULT 'assigned',
  visit_at timestamptz,
  checklist jsonb NOT NULL DEFAULT '{"identity": false, "residence": false, "documents": false, "cost": false, "alternatives": false}',
  recommended_minor bigint CHECK (recommended_minor > 0), -- the auditor's verified goal
  notes text,
  baserow_row_id integer, -- mirrored on the volunteers' field board
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_completed CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND recommended_minor IS NOT NULL))
);
CREATE UNIQUE INDEX verification_one_open_task ON verification_tasks (case_id) WHERE status <> 'completed' AND status <> 'cancelled';

CREATE TABLE disbursement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  payee_type payee_type NOT NULL,
  payee jsonb NOT NULL, -- institution paid directly: hospital, school, creditor
  purpose jsonb NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  payee_account_masked text, -- IBAN or account, masked; full details stay in the payments vault
  position smallint NOT NULL DEFAULT 0
);
CREATE INDEX disbursement_lines_case_idx ON disbursement_lines (case_id, position);

-- ---------------------------------------------------------------- Donations & payments
CREATE TABLE donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id),
  donor_id uuid REFERENCES users (id), -- NULL for guest checkout
  guest_contact jsonb, -- {"name", "email" | "phone"} for the receipt
  idempotency_key text NOT NULL UNIQUE, -- client-generated; a retry returns the same donation
  request_hash text NOT NULL, -- SHA-256 of the request body; the same key with a different body is refused
  type donation_type NOT NULL DEFAULT 'sadaqah',
  anonymous boolean NOT NULL DEFAULT false,
  dedication text CHECK (char_length(dedication) <= 140),
  currency currency NOT NULL, -- what the donor pays in
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  cover_fees boolean NOT NULL DEFAULT false,
  estimated_fee_minor bigint NOT NULL CHECK (estimated_fee_minor >= 0),
  fee_minor bigint CHECK (fee_minor >= 0), -- actual fee reported by the gateway
  charged_minor bigint NOT NULL CHECK (charged_minor >= amount_minor),
  case_currency currency NOT NULL,
  fx_rate numeric(18, 8) NOT NULL DEFAULT 1 CHECK (fx_rate > 0), -- locked at creation
  net_to_case_minor bigint NOT NULL CHECK (net_to_case_minor > 0),
  method payment_method NOT NULL,
  provider payment_provider NOT NULL,
  status donation_status NOT NULL DEFAULT 'pending',
  receipt_no text NOT NULL UNIQUE, -- YSR-2026-000123; also the transfer reference. Unused numbers stay on their expired row, so none go missing
  receipt_token_hash text NOT NULL, -- lets a guest open the receipt without an account
  locale text NOT NULL DEFAULT 'ar',
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'mobile', 'admin')),
  expires_at timestamptz NOT NULL,
  succeeded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT donations_who CHECK (donor_id IS NOT NULL OR guest_contact IS NOT NULL),
  CONSTRAINT donations_success CHECK (status NOT IN ('succeeded', 'refunded', 'partially_refunded') OR (succeeded_at IS NOT NULL AND fee_minor IS NOT NULL)),
  CONSTRAINT donations_same_currency_rate CHECK (currency <> case_currency OR fx_rate = 1)
);
CREATE INDEX donations_case_idx ON donations (case_id, status, succeeded_at DESC);
CREATE INDEX donations_donor_idx ON donations (donor_id, created_at DESC) WHERE donor_id IS NOT NULL;
CREATE INDEX donations_pending_idx ON donations (expires_at) WHERE status IN ('pending', 'requires_action', 'awaiting_transfer');

CREATE TABLE receipt_counters (
  year smallint PRIMARY KEY,
  last_value integer NOT NULL DEFAULT 0 -- incremented inside the donation's own transaction
);

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id uuid NOT NULL REFERENCES donations (id),
  provider payment_provider NOT NULL,
  provider_ref text, -- Paymob intention, Fawry reference, Stripe PaymentIntent, Moyasar payment
  status text NOT NULL CHECK (status IN ('created', 'action_required', 'captured', 'failed', 'refunded')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency currency NOT NULL,
  action jsonb, -- the checkout step returned to the client (redirect URL, Fawry reference …), replayed on retries
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_attempts_ref UNIQUE (provider, provider_ref)
);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider payment_provider NOT NULL,
  event_id text NOT NULL, -- provider's transaction or event id
  signature_valid boolean NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text,
  CONSTRAINT webhook_events_once UNIQUE (provider, event_id) -- replays are acknowledged, never re-applied
);

CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE, -- PO-7K2M9Q
  case_id uuid NOT NULL REFERENCES cases (id),
  line_id uuid NOT NULL REFERENCES disbursement_lines (id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency currency NOT NULL,
  payee_account_masked text NOT NULL, -- full bank details live in the payments vault
  status payout_status NOT NULL DEFAULT 'requested',
  requested_by uuid NOT NULL REFERENCES users (id),
  approved_by uuid REFERENCES users (id),
  approved_at timestamptz,
  paid_at timestamptz,
  bank_reference text,
  proof_document_id uuid REFERENCES case_documents (id), -- the institution's receipt, shown to donors
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payouts_four_eyes CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CONSTRAINT payouts_approved CHECK (status NOT IN ('approved', 'paid') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT payouts_paid CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND bank_reference IS NOT NULL))
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id uuid NOT NULL REFERENCES donations (id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0), -- in the charge currency
  reason text NOT NULL,
  status refund_status NOT NULL DEFAULT 'requested',
  requested_by uuid NOT NULL REFERENCES users (id),
  approved_by uuid REFERENCES users (id),
  provider_ref text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refunds_four_eyes CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

-- ---------------------------------------------------------------- Double-entry ledger
CREATE TABLE ledger_accounts (
  code text PRIMARY KEY, -- asset:clearing:paymob, liability:case:<uuid>, revenue:fee_recovery …
  type account_type NOT NULL,
  currency currency, -- NULL: any currency (lines carry their own)
  case_id uuid REFERENCES cases (id), -- set for case fund accounts
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_accounts_prefix CHECK (split_part(code, ':', 1) = type::text),
  CONSTRAINT ledger_accounts_case_fund CHECK ((case_id IS NOT NULL) = (code LIKE 'liability:case:%'))
);

CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind entry_kind NOT NULL,
  memo text,
  donation_id uuid REFERENCES donations (id),
  payout_id uuid REFERENCES payouts (id),
  refund_id uuid REFERENCES refunds (id),
  posted_by uuid REFERENCES users (id), -- NULL for gateway-driven entries
  posted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_entries_source CHECK (
    (kind = 'donation' AND donation_id IS NOT NULL) OR
    (kind = 'refund' AND refund_id IS NOT NULL) OR
    (kind = 'payout' AND payout_id IS NOT NULL) OR
    kind IN ('settlement', 'adjustment')
  )
);
CREATE UNIQUE INDEX journal_one_entry_per_donation ON journal_entries (donation_id) WHERE kind = 'donation';
CREATE UNIQUE INDEX journal_one_entry_per_payout ON journal_entries (payout_id) WHERE kind = 'payout';

CREATE TABLE journal_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id uuid NOT NULL REFERENCES journal_entries (id),
  account_code text NOT NULL REFERENCES ledger_accounts (code),
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency currency NOT NULL,
  memo text
);
CREATE INDEX journal_lines_entry_idx ON journal_lines (entry_id);
CREATE INDEX journal_lines_account_idx ON journal_lines (account_code, currency);

-- Checked at COMMIT: every entry balances per currency, and no case fund goes below zero.
CREATE FUNCTION assert_journal_invariants() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  offending record;
  line_count integer;
BEGIN
  SELECT count(*) INTO line_count FROM journal_lines WHERE entry_id = NEW.entry_id;
  IF line_count < 2 THEN
    RAISE EXCEPTION 'journal entry % needs at least two lines', NEW.entry_id USING ERRCODE = 'check_violation';
  END IF;

  SELECT currency, sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END) AS diff
    INTO offending
    FROM journal_lines
   WHERE entry_id = NEW.entry_id
   GROUP BY currency
  HAVING sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END) <> 0
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'journal entry % is unbalanced in % by % minor units', NEW.entry_id, offending.currency, offending.diff
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT l.account_code, l.currency, sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE -l.amount_minor END) AS balance
    INTO offending
    FROM journal_lines l
   WHERE l.account_code = NEW.account_code
     AND l.account_code LIKE 'liability:case:%'
   GROUP BY l.account_code, l.currency
  HAVING sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE -l.amount_minor END) < 0
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'case fund % would be overdrawn (% %)', offending.account_code, offending.balance, offending.currency
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER journal_lines_invariants
  AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_invariants();

CREATE FUNCTION assert_line_currency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  account_currency currency;
BEGIN
  SELECT currency INTO account_currency FROM ledger_accounts WHERE code = NEW.account_code;
  IF account_currency IS NOT NULL AND account_currency <> NEW.currency THEN
    RAISE EXCEPTION 'account % only holds %', NEW.account_code, account_currency USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER journal_lines_currency BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION assert_line_currency();

-- ---------------------------------------------------------------- Audit, outbox, notifications
CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users (id), -- NULL means the platform
  actor_role user_role,
  action text NOT NULL, -- case.published, payout.approved, user.roles_updated …
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  before jsonb,
  after jsonb,
  ip inet,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);

CREATE TABLE outbox_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type text NOT NULL, -- donation.succeeded, case.funded, payout.paid …
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  status outbox_status NOT NULL DEFAULT 'pending',
  attempts smallint NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(), -- exponential back-off on failure
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_events_pending_idx ON outbox_events (available_at) WHERE status = 'pending';

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  donation_id uuid REFERENCES donations (id), -- guest receipts are addressed through the donation
  channel text NOT NULL CHECK (channel IN ('push', 'sms', 'whatsapp', 'email', 'in_app')),
  template text NOT NULL, -- receipt, case_funded, disbursement_proof …
  locale text NOT NULL DEFAULT 'ar',
  payload jsonb NOT NULL,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_recipient CHECK (user_id IS NOT NULL OR donation_id IS NOT NULL)
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- Audit rows and posted ledger rows are never edited or deleted; corrections are new, reversing entries.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER journal_entries_append_only BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER journal_lines_append_only BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER journal_no_truncate BEFORE TRUNCATE ON journal_lines FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------- Case status backstop
-- The API checks CASE_TRANSITIONS and permissions first; this refuses anything else,
-- and only a transaction that ran `SET LOCAL yusr.actor_kind = 'system'` may mark a case funded.
CREATE FUNCTION enforce_case_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  rule case_status_rules%ROWTYPE;
BEGIN
  IF NEW.status = OLD.status THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  SELECT * INTO rule FROM case_status_rules WHERE from_status = OLD.status AND to_status = NEW.status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'case % cannot move from % to %', OLD.reference, OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF rule.system_only AND coalesce(current_setting('yusr.actor_kind', true), '') <> 'system' THEN
    RAISE EXCEPTION 'only the platform can move case % to %', OLD.reference, NEW.status USING ERRCODE = 'insufficient_privilege';
  END IF;
  CASE NEW.status
    WHEN 'field_verified' THEN NEW.verified_at := coalesce(NEW.verified_at, now());
    WHEN 'published' THEN NEW.published_at := coalesce(NEW.published_at, now());
    WHEN 'funded' THEN NEW.funded_at := now();
    WHEN 'closed' THEN NEW.closed_at := now();
    ELSE NULL;
  END CASE;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER cases_status_guard BEFORE UPDATE OF status ON cases FOR EACH ROW EXECUTE FUNCTION enforce_case_transition();

-- New cases enter the pipeline at the start; only seeds and migrations may insert later states.
CREATE FUNCTION enforce_case_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'under_review') AND coalesce(current_setting('yusr.actor_kind', true), '') NOT IN ('system', 'seed') THEN
    RAISE EXCEPTION 'new cases start as draft or under_review, not %', NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER cases_entry_guard BEFORE INSERT ON cases FOR EACH ROW EXECUTE FUNCTION enforce_case_entry();

-- ---------------------------------------------------------------- Read models
-- Per case and currency: what came in, what went back, what was paid out, what is held.
CREATE VIEW case_fund_summary AS
SELECT a.case_id,
       l.currency,
       coalesce(sum(l.amount_minor) FILTER (WHERE e.kind = 'donation' AND l.direction = 'credit'), 0) AS raised_minor,
       coalesce(sum(l.amount_minor) FILTER (WHERE e.kind = 'refund' AND l.direction = 'debit'), 0) AS refunded_minor,
       coalesce(sum(l.amount_minor) FILTER (WHERE e.kind = 'payout' AND l.direction = 'debit'), 0) AS disbursed_minor,
       sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE -l.amount_minor END) AS held_minor
  FROM journal_lines l
  JOIN journal_entries e ON e.id = l.entry_id
  JOIN ledger_accounts a ON a.code = l.account_code
 WHERE a.case_id IS NOT NULL
 GROUP BY a.case_id, l.currency;

-- Donor CRM: lifetime giving per registered donor.
CREATE VIEW donor_stats AS
SELECT d.donor_id,
       count(*) AS donations_count,
       sum(d.net_to_case_minor) FILTER (WHERE d.case_currency = 'EGP') AS given_egp_minor,
       min(d.succeeded_at) AS first_donation_at,
       max(d.succeeded_at) AS last_donation_at
  FROM donations d
 WHERE d.donor_id IS NOT NULL AND d.status IN ('succeeded', 'partially_refunded')
 GROUP BY d.donor_id;

-- ---------------------------------------------------------------- Chart of accounts (platform accounts)
INSERT INTO ledger_accounts (code, type, currency) VALUES
  ('asset:bank:operating', 'asset', NULL),
  ('asset:clearing:paymob', 'asset', 'EGP'),
  ('asset:clearing:fawry', 'asset', 'EGP'),
  ('asset:clearing:instapay', 'asset', 'EGP'),
  ('asset:clearing:moyasar', 'asset', 'SAR'),
  ('asset:clearing:stripe', 'asset', 'USD'),
  ('expense:gateway_fees', 'expense', NULL),
  ('revenue:fee_recovery', 'revenue', NULL),
  ('equity:fx:EGP', 'equity', 'EGP'),
  ('equity:fx:SAR', 'equity', 'SAR'),
  ('equity:fx:USD', 'equity', 'USD');
