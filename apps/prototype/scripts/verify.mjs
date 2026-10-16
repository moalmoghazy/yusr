/**
 * Runs every package's test suite and records the results for the architecture page
 * (src/tech/verified.json). PostgreSQL tests run when YUSR_TEST_DATABASE_URL is set.
 *   node scripts/verify.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const suites = ['packages/core', 'packages/i18n', 'packages/theme', 'packages/sdk', 'packages/ui', 'packages/api'];

const results = [];
for (const dir of suites) {
  const cwd = join(root, dir);
  if (!existsSync(join(cwd, 'test'))) continue;
  const run = spawnSync(process.execPath, ['--conditions=@yusr/source', '--import', 'tsx', '--test', '--test-reporter=tap', ...listTests(cwd)], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const read = (label) => Number(new RegExp(`^# ${label} (\\d+)`, 'm').exec(run.stdout)?.[1] ?? 0);
  // A test cancelled by a failing hook did not pass: count it as a failure.
  const failed = read('fail') + read('cancelled');
  results.push({
    package: dir.split('/')[1],
    tests: read('tests'),
    pass: read('pass'),
    fail: failed,
    skipped: read('skipped'),
    durationMs: Math.round(read('duration_ms')),
  });
  console.log(`${dir}: ${read('pass')}/${read('tests')} passed${failed ? `, ${failed} FAILED` : ''}${read('skipped') ? `, ${read('skipped')} skipped` : ''}`);
}

function listTests(cwd) {
  return spawnSync('bash', ['-c', 'ls test/*.test.ts test/*.test.tsx 2>/dev/null'], { cwd, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
}

const postgres = spawnSync('psql', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null;
const summary = {
  at: new Date().toISOString(),
  node: process.version,
  postgres: process.env.YUSR_TEST_DATABASE_URL ? postgres : null,
  suites: results,
  total: results.reduce((sum, suite) => sum + suite.pass, 0),
  failed: results.reduce((sum, suite) => sum + suite.fail, 0),
};
writeFileSync(join(here, '..', 'src', 'tech', 'verified.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`verified: ${summary.total} passing, ${summary.failed} failing`);
process.exit(summary.failed ? 1 : 0);
