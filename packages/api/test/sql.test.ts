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
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { CASE_TRANSITIONS, buildDonationPostings, computeProgress, normalizeForSearch, type Posting } from '@yusr/core';

const ADMIN_URL = process.env['YUSR_TEST_DATABASE_URL'];
const HAS_PSQL = spawnSync('psql', ['--version']).status === 0;
const SKIP = !ADMIN_URL || !HAS_PSQL ? 'set YUSR_TEST_DATABASE_URL and install psql to run the SQL tests' : false;

const MIGRATIONS = join(__dirname, '..', 'src', 'db', 'migrations');
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
    // Every migration, in file-name order, as the runner applies them.
    for (const file of readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const migrated = psql(url, readFileSync(join(MIGRATIONS, file), 'utf8'));
      assert.ok(migrated.ok, `${file} failed: ${migrated.err}`);
    }
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

  it('posts a refund once, keeps the payer apart from the requester and each Paymob order on one attempt (0004)', () => {
    assert.match(psql(url, `UPDATE payouts SET paid_by = '${ID.financeA}' WHERE id = '${ID.payout}';`).err, /payouts_four_eyes/);
    assert.ok(psql(url, `UPDATE payouts SET paid_by = '${ID.financeB}' WHERE id = '${ID.payout}';`).ok);

    const refund = '00000000-0000-4000-8000-00000000f001';
    const sending = psql(
      url,
      `INSERT INTO refunds (id, donation_id, amount_minor, reason, status, requested_by, approved_by, provider_ref)
      VALUES ('${refund}', '${ID.donation}', 1000, 'Donor paid twice', 'sending', '${ID.financeA}', '${ID.financeB}', 'rf_1');`,
    );
    assert.ok(sending.ok, sending.err);
    const post = (entry: string) =>
      psql(
        url,
        `BEGIN;
        INSERT INTO journal_entries (id, kind, refund_id) VALUES ('${entry}', 'refund', '${refund}');
        INSERT INTO journal_lines (entry_id, account_code, direction, amount_minor, currency) VALUES
          ('${entry}', 'liability:case:${ID.case}', 'debit', 1000, 'EGP'),
          ('${entry}', 'asset:bank:operating', 'credit', 1000, 'EGP');
        COMMIT;`,
      );
    const first = post('00000000-0000-4000-8000-00000000e011');
    assert.ok(first.ok, first.err);
    assert.match(post('00000000-0000-4000-8000-00000000e012').err, /journal_one_entry_per_refund/);

    const attempt = `INSERT INTO payment_attempts (donation_id, provider, provider_ref, provider_order_ref, status, amount_minor, currency)
      VALUES ('${ID.donation}', 'paymob', NULL, '217503754', 'action_required', 128750, 'EGP');`;
    assert.ok(psql(url, attempt).ok);
    assert.match(psql(url, attempt).err, /payment_attempts_order_ref/);
  });

  it('keeps a preferred channel with its contact, and messages each donor at their latest choice (0007)', async () => {
    const give = (n: number, contact: string, channel: string, minutes: number) =>
      psql(
        url,
        `SET yusr.actor_kind = 'seed';
        INSERT INTO donations (id, case_id, donor_id, guest_contact, contact_channel, idempotency_key, request_hash, currency, amount_minor, cover_fees,
                               estimated_fee_minor, fee_minor, charged_minor, case_currency, net_to_case_minor, method, provider, status, receipt_no,
                               receipt_token_hash, expires_at, succeeded_at, created_at)
        VALUES ('00000000-0000-4000-8000-00000000d07${n}', '${ID.case}', '${ID.donor}', ${contact}, ${channel}, 'contact-key-00000000${n}', 'h', 'EGP', 10000,
                true, 300, 300, 10300, 'EGP', 10000, 'card', 'paymob', 'succeeded', 'YSR-2026-00007${n}', 't', now() + interval '30 minutes', now(),
                now() + interval '${minutes} minutes');`,
      );
    assert.match(give(1, `'{"name": null, "email": "m@example.com", "phone": null}'`, `'whatsapp'`, 1).err, /donations_contact_for_channel/);
    assert.match(give(1, `'{"name": null, "email": null, "phone": "01001234567"}'`, `'whatsapp'`, 1).err, /donations_contact_for_channel/, 'E.164 only');
    assert.match(give(1, `'{"name": null, "email": null, "phone": "+201001234567"}'`, `'sms'`, 1).err, /donations_contact_channel/);
    const first = give(1, `'{"name": null, "email": "m@example.com", "phone": null}'`, `'email'`, 1);
    assert.ok(first.ok, first.err);
    const latest = give(2, `'{"name": "منى", "email": null, "phone": "+201001234567"}'`, `'whatsapp'`, 2);
    assert.ok(latest.ok, latest.err);

    const { Client } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { DrizzleDatabase } = await import('../src/db/drizzle');
    const { schema } = await import('../src/db/schema');
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const contacts = await new DrizzleDatabase(drizzle(client, { schema })).read.donations.contactsForCase(ID.case);
      assert.equal(contacts.length, 1, 'one message per donor');
      assert.equal(contacts[0]?.contactChannel, 'whatsapp');
      assert.equal(contacts[0]?.guestContact?.phone, '+201001234567');
    } finally {
      await client.end();
    }
  });

  it('keeps the partner registry consistent and names association cases from it (0006)', () => {
    const partner = '00000000-0000-4000-8000-0000000000b7';
    const hash = (char: string) => char.repeat(64);
    const insertPartner = (id: string, number: string, codeHash: string, extra = '') =>
      `INSERT INTO partners (id, name, registration_number, region, contract_signed_on, contact_name, contact_phone, code_hash, code_cipher, created_by${extra ? ', status' : ''})
       VALUES ('${id}', 'جمعية الأمل', '${number}', 'EG-C', '2026-09-01', 'سعاد', '+201001234567', '${codeHash}', '\\x01', '${ID.donor}'${extra ? `, '${extra}'` : ''});`;
    const created = psql(url, insertPartner(partner, '4521/2018', hash('a')));
    assert.ok(created.ok, created.err);
    assert.match(psql(url, insertPartner('00000000-0000-4000-8000-0000000000b8', '4521/2018', hash('b'))).err, /partners_registration_number_key/);
    assert.match(psql(url, insertPartner('00000000-0000-4000-8000-0000000000b8', '1/2019', hash('a'))).err, /partners_code_hash_key/);
    assert.match(psql(url, insertPartner('00000000-0000-4000-8000-0000000000b8', '1 / 2019', hash('c'))).err, /registration_number_check/);
    assert.match(psql(url, insertPartner('00000000-0000-4000-8000-0000000000b8', '1/2019', hash('c'), 'suspended')).err, /partners_suspended_at/);

    const insertCase = (id: string, slug: string, partnerId: string | null, submittedBy: string | null, relation = 'association') =>
      `INSERT INTO cases (id, slug, category, status, beneficiary_id, submitted_by, submitter_relation, association, partner_id, title, summary, story, region, goal_minor)
       VALUES ('${id}', '${slug}', 'medical', 'under_review', '${ID.beneficiary}', ${submittedBy ? `'${submittedBy}'` : 'NULL'}, '${relation}',
               '{"name": "اسم مكتوب باليد", "registrationNumber": "999", "contactName": "منى", "contactPhone": "+201007654321"}',
               ${partnerId ? `'${partnerId}'` : 'NULL'}, '{"ar": "حالة"}', '{"ar": "ملخص"}', '{"ar": "القصة"}', 'EG-C', 100000);`;
    const caseId = '00000000-0000-4000-8000-00000000c0a1';
    const fromPartner = psql(url, insertCase(caseId, 'partner-case', partner, null));
    assert.ok(fromPartner.ok, fromPartner.err);
    assert.equal(
      psql(url, `SELECT association ->> 'name', association ->> 'registrationNumber', association ->> 'contactName' FROM cases WHERE id = '${caseId}';`).out,
      'جمعية الأمل|4521/2018|منى',
      'the public name and number come from the registry, the contact from the request',
    );
    assert.match(psql(url, insertCase('00000000-0000-4000-8000-00000000c0a2', 'no-partner', null, ID.donor)).err, /need a partner from the registry/);
    assert.match(psql(url, insertCase('00000000-0000-4000-8000-00000000c0a3', 'nobody', null, null, 'family')).err, /cases_submitter_known/);
    assert.match(
      psql(url, insertCase('00000000-0000-4000-8000-00000000c0a4', 'family-partner', partner, ID.donor, 'family')).err,
      /cases_partner_is_association/,
    );

    assert.ok(psql(url, `UPDATE partners SET name = 'جمعية الأمل للتنمية' WHERE id = '${partner}';`).ok);
    assert.equal(psql(url, `SELECT association ->> 'name' FROM cases WHERE id = '${caseId}';`).out, 'جمعية الأمل للتنمية', 'renames follow onto cases');
    assert.ok(psql(url, `UPDATE partners SET status = 'suspended', suspended_at = now() WHERE id = '${partner}';`).ok);
    assert.match(psql(url, insertCase('00000000-0000-4000-8000-00000000c0a5', 'suspended', partner, null)).err, /is suspended/);
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
