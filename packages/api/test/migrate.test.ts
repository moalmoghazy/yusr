/**
 * The migration runner (src/db/migrate.ts) on a real PostgreSQL: applies each file once, is a no-op
 * when the database is current, refuses an applied file that was edited, and rolls a failing file
 * back without recording it.
 *
 * Needs YUSR_TEST_DATABASE_URL (an account allowed to CREATE DATABASE), like the SQL suite:
 *   YUSR_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test
 */
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Client } from 'pg';
import { migrate, migrationFiles } from '../src/db/migrate';

const ADMIN_URL = process.env['YUSR_TEST_DATABASE_URL'];
const SKIP = ADMIN_URL ? false : 'set YUSR_TEST_DATABASE_URL to run the migration tests';
const MIGRATIONS = join(__dirname, '..', 'src', 'db', 'migrations');
const DB_NAME = `yusr_migrate_${process.pid}`;

function databaseUrl(name: string): string {
  const url = new URL(ADMIN_URL!);
  url.pathname = `/${name}`;
  return url.toString();
}

async function admin(sql: string): Promise<void> {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function query<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  const client = new Client({ connectionString: databaseUrl(DB_NAME) });
  await client.connect();
  try {
    return (await client.query<T>(sql)).rows;
  } finally {
    await client.end();
  }
}

/** A copy of the real migrations folder that a test can add to or tamper with. */
function scratchFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'yusr-migrations-'));
  for (const file of migrationFiles(MIGRATIONS)) copyFileSync(join(MIGRATIONS, file.name), join(dir, file.name));
  return dir;
}

describe('migration runner', { skip: SKIP }, () => {
  const folders: string[] = [];

  before(async () => {
    await admin(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await admin(`CREATE DATABASE ${DB_NAME}`);
  });

  after(async () => {
    for (const dir of folders) rmSync(dir, { recursive: true, force: true });
    await admin(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  });

  it('applies every file once, in order, and records it', async () => {
    const files = migrationFiles(MIGRATIONS).map((file) => file.name);
    const first = await migrate(databaseUrl(DB_NAME));
    assert.deepEqual(first.applied, files);
    const second = await migrate(databaseUrl(DB_NAME));
    assert.deepEqual(second, { applied: [], upToDate: files });
    const recorded = await query<{ name: string }>('SELECT name FROM yusr_migrations ORDER BY name');
    assert.deepEqual(
      recorded.map((row) => row.name),
      files,
    );
    const [cases] = await query<{ exists: boolean }>(`SELECT to_regclass('public.cases') IS NOT NULL AS exists`);
    assert.equal(cases?.exists, true, 'the schema is in place');
  });

  it('refuses an applied migration that was edited afterwards', async () => {
    const dir = scratchFolder();
    folders.push(dir);
    const [firstFile] = migrationFiles(dir);
    writeFileSync(join(dir, firstFile!.name), `${firstFile!.sql}\n-- edited later\n`);
    await assert.rejects(migrate(databaseUrl(DB_NAME), { dir }), /has changed since it was applied/);
  });

  it('rolls a failing migration back and leaves it unrecorded, then applies its fix', async () => {
    const dir = scratchFolder();
    folders.push(dir);
    writeFileSync(join(dir, '9998_demo_table.sql'), 'CREATE TABLE migration_demo (id int PRIMARY KEY);');
    writeFileSync(join(dir, '9999_broken.sql'), 'ALTER TABLE migration_demo ADD COLUMN note text;\nSELECT no_such_function();');
    await assert.rejects(migrate(databaseUrl(DB_NAME), { dir }), /9999_broken\.sql failed and was rolled back/);

    const recorded = await query<{ name: string }>(`SELECT name FROM yusr_migrations WHERE name LIKE '999%' ORDER BY name`);
    assert.deepEqual(
      recorded.map((row) => row.name),
      ['9998_demo_table.sql'],
      'the good file before it stays applied',
    );
    const columns = await query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'migration_demo'`);
    assert.deepEqual(
      columns.map((row) => row.column_name),
      ['id'],
      'the half-run file left nothing behind',
    );

    writeFileSync(join(dir, '9999_broken.sql'), 'ALTER TABLE migration_demo ADD COLUMN note text;');
    const fixed = await migrate(databaseUrl(DB_NAME), { dir });
    assert.deepEqual(fixed.applied, ['9999_broken.sql']);
  });
});

describe('staff:create', { skip: SKIP }, () => {
  const KEY = Buffer.alloc(32, 9).toString('base64');
  const STAFF_DB = `yusr_staff_${process.pid}`;

  before(async () => {
    await admin(`DROP DATABASE IF EXISTS ${STAFF_DB}`);
    await admin(`CREATE DATABASE ${STAFF_DB}`);
    await migrate(databaseUrl(STAFF_DB));
  });

  after(async () => {
    await admin(`DROP DATABASE IF EXISTS ${STAFF_DB} WITH (FORCE)`);
  });

  it('makes the first super admin with a working authenticator key, and audits it', async () => {
    const { createStaff } = await import('../src/db/create-staff');
    const { FieldCipher } = await import('../src/common/cipher');
    const { totpAt } = await import('../src/auth/totp');
    const first = await createStaff({ databaseUrl: databaseUrl(STAFF_DB), dataKeyBase64: KEY, phone: '+201001234567', name: 'سارة', roles: ['super_admin'] });
    assert.equal(first.created, true);
    assert.deepEqual(first.user.roles, ['super_admin']);
    assert.ok(first.secret && /^[A-Z2-7]{32}$/.test(first.secret), 'a base32 key');
    const stored = new FieldCipher(KEY).decrypt(first.user.totpSecretCipher!, `totp:${first.user.id}`);
    assert.equal(stored, first.secret, 'stored encrypted, bound to the user');
    assert.match(totpAt(stored, new Date()), /^\d{6}$/);

    // Running it again adds a role and keeps the key unless a reset is asked for.
    const again = await createStaff({
      databaseUrl: databaseUrl(STAFF_DB),
      dataKeyBase64: KEY,
      phone: '+201001234567',
      roles: ['super_admin', 'financial_officer'],
    });
    assert.equal(again.created, false);
    assert.equal(again.secret, null);
    assert.deepEqual([...again.user.roles].sort(), ['financial_officer', 'super_admin']);

    // A lost phone: the new key also ends every session signed in with the old one.
    const sessions = new Client({ connectionString: databaseUrl(STAFF_DB) });
    await sessions.connect();
    await sessions.query(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, mfa, expires_at) VALUES ($1, gen_random_uuid(), 'h1', true, now() + interval '1 day')`,
      [first.user.id],
    );
    const { DrizzleDatabase } = await import('../src/db/drizzle');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { schema } = await import('../src/db/schema');
    const db = new DrizzleDatabase(drizzle(sessions, { schema }));
    assert.equal(await db.transaction((tx) => tx.users.claimTotpStep(first.user.id, 100)), true);
    assert.equal(await db.transaction((tx) => tx.users.claimTotpStep(first.user.id, 100)), false, 'a step is used once');
    assert.equal(await db.transaction((tx) => tx.users.claimTotpStep(first.user.id, 99)), false, 'older steps too');
    assert.equal(await db.transaction((tx) => tx.users.claimTotpStep(first.user.id, 101)), true);

    const reset = await createStaff({
      databaseUrl: databaseUrl(STAFF_DB),
      dataKeyBase64: KEY,
      phone: '+201001234567',
      roles: ['super_admin'],
      resetAuthenticator: true,
    });
    assert.ok(reset.secret && reset.secret !== first.secret);
    assert.deepEqual(reset.user.roles, ['super_admin'], 'roles not listed are removed');
    const live = await sessions.query<{ revoked: boolean; last: string | null }>(
      `SELECT t.revoked_at IS NOT NULL AS revoked, u.totp_last_step AS last FROM refresh_tokens t JOIN users u ON u.id = t.user_id WHERE t.user_id = $1`,
      [first.user.id],
    );
    await sessions.end();
    assert.deepEqual(live.rows, [{ revoked: true, last: null }], 'sessions revoked, the new key starts with no used step');

    const client = new Client({ connectionString: databaseUrl(STAFF_DB) });
    await client.connect();
    const audit = await client.query<{ action: string }>(`SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY created_at, id`, [first.user.id]);
    await client.end();
    assert.deepEqual(
      audit.rows.map((row) => row.action),
      ['staff.created_from_cli', 'staff.updated_from_cli', 'staff.updated_from_cli'],
    );
  });
});
