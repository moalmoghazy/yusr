/**
 * Applies the SQL migrations in ./migrations to the database in DATABASE_URL, in file-name order,
 * each exactly once.
 *
 *   pnpm db:migrate                       (development, from the TypeScript sources)
 *   node dist/db/migrate.js               (production image / release step, after `nest build`)
 *
 * Migrations are hand-written PostgreSQL because the ledger invariants, the append-only triggers
 * and the case-status backstop are database features. To change the schema, add the next numbered
 * file (0001_short_name.sql, …) and mirror the change in schema.ts. Never edit a file that has been
 * applied anywhere: each file is recorded with a checksum in `yusr_migrations`, and a changed file
 * stops the run instead of being skipped silently.
 *
 * Every file runs in its own transaction, and a PostgreSQL advisory lock keeps two deploys from
 * migrating the same database at once.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

/** Arbitrary but fixed: the advisory-lock key every migration run takes ("yusr" in ASCII). */
const LOCK_KEY = 0x79757372;
const FILE = /^\d{4}_[\w-]+\.sql$/;

export interface MigrationResult {
  applied: string[];
  upToDate: string[];
}

export function migrationFiles(dir: string): Array<{ name: string; sql: string; checksum: string }> {
  return readdirSync(dir)
    .filter((name) => FILE.test(name))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

export async function migrate(databaseUrl: string, options: { dir?: string; log?: (line: string) => void } = {}): Promise<MigrationResult> {
  const dir = options.dir ?? join(__dirname, 'migrations');
  const log = options.log ?? (() => undefined);
  const files = migrationFiles(dir);
  if (files.length === 0) throw new Error(`No migrations found in ${dir}`);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const result: MigrationResult = { applied: [], upToDate: [] };
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS yusr_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM yusr_migrations');
    const recorded = new Map(rows.map((row) => [row.name, row.checksum]));

    for (const file of files) {
      const previous = recorded.get(file.name);
      if (previous !== undefined) {
        if (previous !== file.checksum) {
          throw new Error(`${file.name} has changed since it was applied. Put the change in a new migration file instead of editing an applied one.`);
        }
        result.upToDate.push(file.name);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query('INSERT INTO yusr_migrations (name, checksum) VALUES ($1, $2)', [file.name, file.checksum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${file.name} failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
      result.applied.push(file.name);
      log(`applied ${file.name}`);
    }
    return result;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set (see packages/api/.env.example)');
  const { applied, upToDate } = await migrate(url, { log: (line) => console.log(`migrate: ${line}`) });
  console.log(
    applied.length > 0
      ? `migrate: ${applied.length} applied, ${upToDate.length} already in place`
      : `migrate: database is up to date (${upToDate.length} migrations)`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
