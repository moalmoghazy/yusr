/**
 * Runs the real migration on PostgreSQL and proves the database refuses what the
 * services refuse: unbalanced or overdrawn ledger entries, edits to append-only
 * tables, self-approved payouts, skipped case stages and replayed webhooks.
 *
 * Needs psql and YUSR_TEST_DATABASE_URL (an account allowed to CREATE DATABASE), e.g.
 *   YUSR_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test:sql
 * The suite is skipped (not failed) when either is missing.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { CASE_TRANSITIONS, buildDonationPostings, computeProgress, normalizeForSearch, type Posting } from '@yusr/core';

const ADMIN_URL = process.env['YUSR_TEST_DATABASE_URL'];
const HAS_PSQL = spawnSync('psql', ['--version']).status === 0;
const SKIP = !ADMIN_URL || !HAS_PSQL ? 'set YUSR_TEST_DATABASE_URL and install psql to run the SQL tests' : false;

const MIGRATION = join(__dirname, '..', 'src', 'db', 'migrations', '0000_init.sql');
const SCHEMA_TS = join(__dirname, '..', 'src', 'db', 'schema.ts');
const DB_NAME = `yusr_test_${process.pid}`;

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

interface Result {
  ok: boolean;
  out: string;
  err: string;
}

function psql(url: string, sql: string): Result {
  const result = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', url], { input: sql, encoding: 'utf8' });
  return { ok: result.status === 0, out: result.stdout.trim(), err: result.stderr.trim() };
}

const ID = {
  donor: '00000000-0000-4000-8000-0000000000d1',
  financeA: '00000000-0000-4000-8000-0000000000f1',
  financeB: '00000000-0000-4000-8000-0000000000f2',
  beneficiary: '00000000-0000-4000-8000-00000000b001',
  case: '00000000-0000-4000-8000-00000000c001',
  draft: '00000000-0000-4000-8000-00000000c002',
  donation: '00000000-0000-4000-8000-00000000d001',
  entry: '00000000-0000-4000-8000-00000000e001',
  line: '00000000-0000-4000-8000-0000000011a1',
  payout: '00000000-0000-4000-8000-00000000a001',
};

const FIXTURES = `
SET yusr.actor_kind = 'seed';
INSERT INTO users (id, phone, display_name, roles, mfa_enabled) VALUES
  ('${ID.donor}', '+201001110001', 'Mona', '{donor}', false),
  ('${ID.financeA}', '+201001110002', 'Karim', '{financial_officer}', true),
  ('${ID.financeB}', '+201001110003', 'Laila', '{financial_officer}', true);
INSERT INTO beneficiaries (id, pseudonym, region) VALUES ('${ID.beneficiary}', '{"ar": "أم سارة", "en": "Um Sara"}', 'EG-C');
INSERT INTO cases (id, slug, category, status, beneficiary_id, submitted_by, submitter_relation, title, summary, story, region, currency, goal_minor, verified_at, published_at)
VALUES ('${ID.case}', 'heart-surgery', 'medical', 'published', '${ID.beneficiary}', '${ID.donor}', 'family',
        '{"ar": "عمليّة قلب مفتوح لطفلة", "en": "Open-heart surgery"}', '{"ar": "ملخص", "en": "Summary"}', '{"ar": "القصة"}', 'EG-C', 'EGP', 5000000, now(), now());
INSERT INTO cases (id, slug, category, status, beneficiary_id, submitted_by, submitter_relation, title, summary, story, region, currency, goal_minor)
VALUES ('${ID.draft}', 'draft-case', 'relief', 'draft', '${ID.beneficiary}', '${ID.donor}', 'self', '{"ar": "مسودة"}', '{"ar": "ملخص"}', '{"ar": "القصة"}', 'EG-C', 'EGP', 100000);
INSERT INTO ledger_accounts (code, type, currency, case_id) VALUES ('liability:case:${ID.case}', 'liability', 'EGP', '${ID.case}');
INSERT INTO donations (id, case_id, donor_id, idempotency_key, request_hash, currency, amount_minor, cover_fees, estimated_fee_minor, fee_minor, charged_minor,
                       case_currency, net_to_case_minor, method, provider, status, receipt_no, receipt_token_hash, expires_at, succeeded_at)
VALUES ('${ID.donation}', '${ID.case}', '${ID.donor}', 'fixture-key-000000001', 'h', 'EGP', 125000, true, 3750, 3750, 128750,
        'EGP', 125000, 'card', 'paymob', 'succeeded', 'YSR-2026-000001', 't', now() + interval '30 minutes', now());
INSERT INTO disbursement_lines (id, case_id, payee_type, payee, purpose, amount_minor) VALUES
  ('${ID.line}', '${ID.case}', 'hospital', '{"ar": "مستشفى"}', '{"ar": "العملية"}', 5000000);
RESET yusr.actor_kind;
`;

function linesSql(entryId: string, postings: readonly Posting[]): string {
  return postings
    .map(
      (p) =>
        `INSERT INTO journal_lines (entry_id, account_code, direction, amount_minor, currency) VALUES ('${entryId}', '${p.account}', '${p.direction}', ${p.amountMinor}, '${p.currency}');`,
    )
    .join('\n');
}

const donationPostings = buildDonationPostings({
  caseId: ID.case,
  provider: 'paymob',
  currency: 'EGP',
  chargedMinor: 128_750,
  feeMinor: 3_750,
  caseCurrency: 'EGP',
  netToCaseMinor: 125_000,
  fxRate: 1,
});

describe('PostgreSQL schema', { skip: SKIP }, () => {
  let url = '';

  before(() => {
    const created = psql(ADMIN_URL!, `DROP DATABASE IF EXISTS ${DB_NAME}; CREATE DATABASE ${DB_NAME};`);
    assert.ok(created.ok, created.err);
    url = withDatabase(ADMIN_URL!, DB_NAME);
    const migrated = psql(url, readFileSync(MIGRATION, 'utf8'));
    assert.ok(migrated.ok, `migration failed: ${migrated.err}`);
    const seeded = psql(url, FIXTURES);
    assert.ok(seeded.ok, `fixtures failed: ${seeded.err}`);
  });

  after(() => {
    psql(ADMIN_URL!, `DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE);`);
  });

  it('keeps case_status_rules identical to CASE_TRANSITIONS in @yusr/core', () => {
    const rows = psql(url, `SELECT from_status || '>' || to_status || ':' || system_only FROM case_status_rules ORDER BY 1;`);
    const expected = CASE_TRANSITIONS.map((rule) => `${rule.from}>${rule.to}:${rule.permission === 'system'}`).sort();
    assert.deepEqual(rows.out.split('\n').sort(), expected);
  });

  it('normalizes search text and rounds progress exactly like @yusr/core', () => {
    const samples = ['إِغاثةٌ عاجلة للأُسرة ـــ مستشفى ١٢٣', 'أيتام  الإسكندرية', 'Open-Heart Surgery'];
    for (const sample of samples) {
      const row = psql(url, `SELECT yusr_normalize('${sample}');`);
      assert.equal(row.out, normalizeForSearch(sample), sample);
    }
    for (const [raised, goal] of [
      [0, 1000],
      [1, 1000],
      [9, 1000],
      [504, 1000],
      [999, 1000],
      [1000, 1000],
      [1500, 1000],
    ] as const) {
      const row = psql(url, `SELECT yusr_progress_percent(${raised}, ${goal});`);
      assert.equal(Number(row.out), computeProgress(raised, goal).percent, `${raised}/${goal}`);
    }
    const found = psql(url, `SELECT reference FROM cases WHERE search_text LIKE '%${normalizeForSearch('عملية قلب')}%';`);
    assert.match(found.out, /^YSR-/);
  });

  it('accepts a balanced donation entry built by @yusr/core and reports the case fund', () => {
    const result = psql(
      url,
      `BEGIN;
      INSERT INTO journal_entries (id, kind, donation_id) VALUES ('${ID.entry}', 'donation', '${ID.donation}');
      ${linesSql(ID.entry, donationPostings)}
      COMMIT;
      SELECT raised_minor || '|' || held_minor FROM case_fund_summary WHERE case_id = '${ID.case}';`,
    );
    assert.ok(result.ok, result.err);
    assert.equal(result.out, '125000|125000');
  });

  it('refuses an unbalanced entry at COMMIT', () => {
    const skewed = donationPostings.map((p, index) => (index === 0 ? { ...p, amountMinor: p.amountMinor - 1 } : p));
    const result = psql(
      url,
      `BEGIN;
      INSERT INTO journal_entries (id, kind, memo) VALUES ('00000000-0000-4000-8000-00000000e002', 'adjustment', 'skewed');
      ${linesSql('00000000-0000-4000-8000-00000000e002', skewed)}
      COMMIT;`,
    );
    assert.equal(result.ok, false);
    assert.match(result.err, /unbalanced in EGP by -1 minor units/);
  });

  it('refuses single-line entries and lines in the wrong currency', () => {
    const single = psql(
      url,
      `BEGIN;
      INSERT INTO journal_entries (id, kind) VALUES ('00000000-0000-4000-8000-00000000e003', 'adjustment');
      INSERT INTO journal_lines (entry_id, account_code, direction, amount_minor, currency) VALUES ('00000000-0000-4000-8000-00000000e003', 'asset:bank:operating', 'debit', 100, 'EGP');
      COMMIT;`,
    );
    assert.match(single.err, /needs at least two lines/);
    const currency = psql(
      url,
      `BEGIN;
      INSERT INTO journal_entries (id, kind) VALUES ('00000000-0000-4000-8000-00000000e004', 'adjustment');
      INSERT INTO journal_lines (entry_id, account_code, direction, amount_minor, currency) VALUES ('00000000-0000-4000-8000-00000000e004', 'asset:clearing:paymob', 'debit', 100, 'SAR');
      COMMIT;`,
    );
    assert.match(currency.err, /only holds EGP/);
  });

  it('never lets a case fund go below zero, and enforces four eyes on payouts', () => {
    const selfApproved = psql(
      url,
      `INSERT INTO payouts (id, reference, case_id, line_id, amount_minor, currency, payee_account_masked, status, requested_by, approved_by, approved_at)
      VALUES ('${ID.payout}', 'PO-TEST01', '${ID.case}', '${ID.line}', 200000, 'EGP', '•••0002', 'approved', '${ID.financeA}', '${ID.financeA}', now());`,
    );
    assert.match(selfApproved.err, /payouts_four_eyes/);

    const payout = psql(
      url,
      `INSERT INTO payouts (id, reference, case_id, line_id, amount_minor, currency, payee_account_masked, status, requested_by, approved_by, approved_at)
      VALUES ('${ID.payout}', 'PO-TEST01', '${ID.case}', '${ID.line}', 200000, 'EGP', '•••0002', 'approved', '${ID.financeA}', '${ID.financeB}', now());`,
    );
    assert.ok(payout.ok, payout.err);
    const overdraw = psql(
      url,
      `BEGIN;
      INSERT INTO journal_entries (id, kind, payout_id) VALUES ('00000000-0000-4000-8000-00000000e005', 'payout', '${ID.payout}');
      INSERT INTO journal_lines (entry_id, account_code, direction, amount_minor, currency) VALUES
        ('00000000-0000-4000-8000-00000000e005', 'liability:case:${ID.case}', 'debit', 200000, 'EGP'),
        ('00000000-0000-4000-8000-00000000e005', 'asset:bank:operating', 'credit', 200000, 'EGP');
      COMMIT;`,
    );
    assert.match(overdraw.err, /would be overdrawn/);
  });

  it('keeps the ledger and audit log append-only', () => {
    psql(url, `INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('case.published', 'case', '${ID.case}');`);
    for (const statement of [
      'UPDATE journal_lines SET amount_minor = 1;',
      'DELETE FROM journal_entries;',
      'TRUNCATE journal_lines;',
      "UPDATE audit_logs SET action = 'nothing';",
      'DELETE FROM audit_logs;',
    ]) {
      const result = psql(url, statement);
      assert.match(result.err, /append-only/, statement);
    }
  });

  it('refuses skipped stages, and "funded" from anyone but the platform', () => {
    assert.match(psql(url, `UPDATE cases SET status = 'published' WHERE id = '${ID.draft}';`).err, /cannot move from draft to published/);
    assert.match(psql(url, `UPDATE cases SET status = 'funded' WHERE id = '${ID.case}';`).err, /only the platform/);
    const system = psql(
      url,
      `BEGIN;
      SELECT set_config('yusr.actor_kind', 'system', true);
      UPDATE cases SET status = 'funded' WHERE id = '${ID.case}';
      COMMIT;
      SELECT status || '|' || (funded_at IS NOT NULL) FROM cases WHERE id = '${ID.case}';`,
    );
    assert.ok(system.ok, system.err);
    assert.equal(system.out.split('\n').pop(), 'funded|true');
    assert.match(
      psql(
        url,
        `INSERT INTO cases (slug, category, status, beneficiary_id, submitted_by, submitter_relation, title, summary, story, region, goal_minor)
        VALUES ('sneaky', 'relief', 'published', '${ID.beneficiary}', '${ID.donor}', 'self', '{"ar": "x"}', '{"ar": "x"}', '{"ar": "x"}', 'EG-C', 100);`,
      ).err,
      /new cases start as draft or under_review/,
    );
  });

  it('records a webhook once and a donation entry once', () => {
    const webhook = `INSERT INTO webhook_events (provider, event_id, signature_valid, payload) VALUES ('paymob', '192036465', true, '{}');`;
    assert.ok(psql(url, webhook).ok);
    assert.match(psql(url, webhook).err, /webhook_events_once/);
    const again = psql(url, `INSERT INTO journal_entries (kind, donation_id) VALUES ('donation', '${ID.donation}');`);
    assert.match(again.err, /journal_one_entry_per_donation/);
  });

  it('matches the Drizzle schema: every table and column in schema.ts exists in the migration', () => {
    const source = readFileSync(SCHEMA_TS, 'utf8');
    const declared = new Map<string, string[]>();
    for (const match of source.matchAll(/pgTable\(\s*'(\w+)',\s*\{([\s\S]*?)\n\s*\}(?:,|\))/g)) {
      const columns = [...match[2]!.matchAll(/^\s+\w+: \w+\('(\w+)'/gm)].map((column) => column[1]!);
      declared.set(match[1]!, columns);
    }
    assert.ok(declared.size >= 20, `parsed ${declared.size} tables from schema.ts`);
    const rows = psql(url, `SELECT table_name || '.' || column_name FROM information_schema.columns WHERE table_schema = 'public';`);
    const actual = new Set(rows.out.split('\n'));
    for (const [table, columns] of declared) {
      for (const column of columns) assert.ok(actual.has(`${table}.${column}`), `${table}.${column} is declared in schema.ts but missing from the migration`);
    }
  });
});
