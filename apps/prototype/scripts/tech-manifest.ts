/**
 * Facts for the architecture page, read from the repository at build time so the page
 * cannot drift from the code:
 *   - the REST routes, from the API's endpoint table (packages/api/src/http/endpoints),
 *   - the data model, parsed from the PostgreSQL migration,
 *   - the workspace packages, from their package.json files and sources,
 *   - the last verification run (src/tech/verified.json, written by scripts/verify.mjs).
 * Run by build.mjs:  node --conditions=@yusr/source --import tsx scripts/tech-manifest.ts
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const prototype = join(here, '..');
const root = join(prototype, '..', '..');

// ---------------------------------------------------------------------------- endpoints
interface EndpointFact {
  id: string;
  method: string;
  path: string;
  access: string;
  tag: string;
  summary: string;
  permission: string | null;
  rateLimit: string | null;
  cacheSeconds: number | null;
  returns: string | null;
}

async function endpoints(): Promise<EndpointFact[]> {
  const module = (await import(join(root, 'packages/api/src/http/endpoints/index.ts'))) as { ENDPOINTS?: unknown[]; default?: { ENDPOINTS?: unknown[] } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the endpoint table is read dynamically from the API's sources
  const list = (module.ENDPOINTS ?? module.default?.ENDPOINTS ?? []) as Array<Record<string, any>>;
  return list
    .filter((route) => route['tag'] !== 'Development')
    .map((route) => ({
      id: route['id'],
      method: route['method'],
      path: route['version'] ? `/v${route['version']}${route['path']}` : route['path'],
      access: route['access'],
      tag: route['tag'],
      summary: route['summary'],
      permission: route['permission'] ?? null,
      rateLimit: route['rateLimit'] ? `${route['rateLimit'].limit}/${route['rateLimit'].windowSeconds}s/${route['rateLimit'].by}` : null,
      cacheSeconds: route['cache']?.seconds ?? null,
      returns: route['returns'] ?? null,
    }));
}

// ---------------------------------------------------------------------------- data model
interface ColumnFact {
  name: string;
  type: string;
  pk: boolean;
  fk: string | null;
  notNull: boolean;
  note: string | null;
}
interface TableFact {
  name: string;
  domain: 'identity' | 'cases' | 'money' | 'operations';
  note: string | null;
  columns: ColumnFact[];
  checks: number;
}

const DOMAINS: Record<string, TableFact['domain']> = {
  users: 'identity',
  auth_identities: 'identity',
  refresh_tokens: 'identity',
  volunteer_profiles: 'identity',
  beneficiaries: 'cases',
  cases: 'cases',
  case_documents: 'cases',
  case_updates: 'cases',
  case_status_rules: 'cases',
  case_transitions: 'cases',
  verification_tasks: 'cases',
  disbursement_lines: 'cases',
  donations: 'money',
  receipt_counters: 'money',
  payment_attempts: 'money',
  webhook_events: 'money',
  payouts: 'money',
  refunds: 'money',
  ledger_accounts: 'money',
  journal_entries: 'money',
  journal_lines: 'money',
  audit_logs: 'operations',
  outbox_events: 'operations',
  notifications: 'operations',
};

const KEYWORDS = /\s(NOT|NULL|DEFAULT|PRIMARY|REFERENCES|UNIQUE|CHECK|GENERATED|COLLATE)\b/;

function schema() {
  const sql = readFileSync(join(root, 'packages/api/src/db/migrations/0000_init.sql'), 'utf8');
  const tables: TableFact[] = [];
  for (const match of sql.matchAll(/(?:--([^\n]*)\n)?CREATE TABLE (\w+) \(\n([\s\S]*?)\n\);/g)) {
    const [, comment, name, body] = match;
    const columns: ColumnFact[] = [];
    let checks = 0;
    const tablePk =
      /^\s*PRIMARY KEY \(([^)]+)\)/m
        .exec(body!)?.[1]
        ?.split(',')
        .map((column) => column.trim()) ?? [];
    for (const raw of body!.split('\n')) {
      const [code, ...rest] = raw.split(' -- ');
      const line = code!.trim().replace(/,$/, '');
      if (!line) continue;
      if (/^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY|EXCLUDE)\b/.test(line)) {
        if (/\bCHECK\b/.test(line)) checks += 1;
        continue;
      }
      const columnName = line.split(/\s+/)[0]!;
      const afterName = line.slice(columnName.length).trim();
      const cut = KEYWORDS.exec(` ${afterName}`);
      const type = (cut ? ` ${afterName}`.slice(0, cut.index) : afterName).trim();
      if (/\bCHECK\b/.test(line)) checks += 1;
      columns.push({
        name: columnName,
        type,
        pk: /\bPRIMARY KEY\b/.test(line) || tablePk.includes(columnName),
        fk: /REFERENCES (\w+)/.exec(line)?.[1] ?? null,
        notNull: /\bNOT NULL\b/.test(line) || /\bPRIMARY KEY\b/.test(line),
        note: rest.join(' -- ').trim() || null,
      });
    }
    const note = comment && !comment.includes('----') ? comment.trim() : null;
    tables.push({ name: name!, domain: DOMAINS[name!] ?? 'operations', note, columns, checks });
  }
  const views = [...sql.matchAll(/(?:--\s*([^\n]*)\n)?CREATE VIEW (\w+) AS/g)].map((match) => ({ name: match[2]!, note: match[1]?.trim() ?? null }));
  const count = (pattern: RegExp) => (sql.match(pattern) ?? []).length;
  return {
    tables,
    views,
    enums: count(/^CREATE TYPE \w+ AS ENUM/gm),
    indexes: count(/^CREATE (?:UNIQUE )?INDEX/gm),
    triggers: count(/^CREATE (?:CONSTRAINT )?TRIGGER/gm),
    functions: count(/^CREATE FUNCTION/gm),
    lines: sql.split('\n').length,
  };
}

// ---------------------------------------------------------------------------- packages
function walk(directory: string, files: string[] = []): string[] {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

function packages() {
  const result: Array<{
    name: string;
    dir: string;
    description: string;
    workspaceDeps: string[];
    sourceFiles: number;
    sourceLines: number;
    testFiles: number;
  }> = [];
  for (const group of ['apps', 'packages']) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base).sort()) {
      const manifestPath = join(base, entry, 'package.json');
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name: string;
        description?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
      const sources = walk(join(base, entry)).filter(
        (file) => /\.(ts|tsx|sql|css)$/.test(file) && !file.endsWith('.d.ts') && !file.includes(`${entry}/test/`) && !file.endsWith('manifest.json'),
      );
      const tests = walk(join(base, entry, 'test')).filter((file) => /\.test\.tsx?$/.test(file));
      result.push({
        name: manifest.name,
        dir: relative(root, join(base, entry)),
        description: manifest.description ?? '',
        workspaceDeps: Object.keys(deps).filter((dep) => dep.startsWith('@yusr/') && dep !== '@yusr/config'),
        sourceFiles: sources.length,
        sourceLines: sources.reduce((sum, file) => sum + readFileSync(file, 'utf8').split('\n').length, 0),
        testFiles: tests.length,
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------- output
const verifiedPath = join(prototype, 'src/tech/verified.json');
const manifest = {
  generatedAt: new Date().toISOString(),
  endpoints: await endpoints(),
  schema: schema(),
  packages: packages(),
  verified: existsSync(verifiedPath) ? JSON.parse(readFileSync(verifiedPath, 'utf8')) : null,
};
writeFileSync(join(prototype, 'src/tech/manifest.json'), `${JSON.stringify(manifest)}\n`);
console.log(`tech manifest: ${manifest.endpoints.length} endpoints, ${manifest.schema.tables.length} tables, ${manifest.packages.length} packages`);
