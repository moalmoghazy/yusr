#!/usr/bin/env node
// Checks that this machine can run Yusr and says what to fix, in Arabic and English.
//   node scripts/doctor.mjs        (or: pnpm run doctor)
// Nothing is changed; every check only looks.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
let failures = 0;
let warnings = 0;

const pass = (text) => console.log(`  ✓ ${text}`);
const warn = (text, ar, en) => {
  warnings += 1;
  console.log(`  ! ${text}\n      ${ar}\n      ${en}`);
};
const fail = (text, ar, en) => {
  failures += 1;
  console.log(`  ✗ ${text}\n      ${ar}\n      ${en}`);
};
const section = (title) => console.log(`\n${title}`);

function output(command, args = ['--version']) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: windows });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** KEY=value pairs from a .env file (comments and blanks ignored). */
function readEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]),
  );
}

/** Whether something accepts TCP connections at host:port (within a second). */
function reachable(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Whether a local port is free to listen on. */
function free(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

// ------------------------------------------------------------------ Tools
section('الأدوات · Tools');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 12)) pass(`Node ${process.versions.node}`);
else fail(`Node ${process.versions.node}`, 'ثبّت Node 22 LTS من https://nodejs.org', 'Install Node 22 LTS from https://nodejs.org');

const wanted = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).packageManager?.split('@')[1];
const pnpm = output('pnpm');
if (!pnpm) fail('pnpm', 'نفّذ: corepack enable (أو npm install -g pnpm@10)', 'Run: corepack enable (or npm install -g pnpm@10)');
else if (wanted && pnpm.split('.')[0] !== wanted.split('.')[0]) warn(`pnpm ${pnpm} (project uses ${wanted})`, 'نفّذ: corepack enable', 'Run: corepack enable');
else pass(`pnpm ${pnpm}`);

const git = output('git');
if (git) pass(git);
else warn('git', 'ثبّت Git لحفظ التعديلات ومشاركتها: https://git-scm.com', 'Install Git to save and share changes: https://git-scm.com');

const docker = output('docker');
if (docker) pass(docker);
else
  warn(
    'Docker',
    'اختياري: يلزم فقط لتشغيل PostgreSQL محليًا (pnpm dev:demo يعمل بدونه)',
    'Optional: only needed for local PostgreSQL (`pnpm dev:demo` works without it)',
  );

// ------------------------------------------------------------------ Project
section('المشروع · Project');
if (existsSync(join(root, 'node_modules', '.modules.yaml'))) pass('dependencies installed');
else fail('dependencies', 'نفّذ: node scripts/setup.mjs', 'Run: node scripts/setup.mjs');

for (const [file, template] of [
  ['packages/api/.env', 'packages/api/.env.example'],
  ['apps/web/.env.local', 'apps/web/.env.example'],
  ['apps/admin/.env.local', 'apps/admin/.env.example'],
  ['apps/mobile/.env', 'apps/mobile/.env.example'],
]) {
  if (existsSync(join(root, file))) pass(file);
  else warn(`${file} missing`, `نفّذ node scripts/setup.mjs لإنشائه من ${template}`, `Run \`node scripts/setup.mjs\` to create it from ${template}`);
}

const apiEnv = readEnv(join(root, 'packages/api/.env'));
for (const name of ['JWT_SECRET', 'OTP_PEPPER', 'RECEIPT_TOKEN_SECRET']) {
  if (/change-me/.test(apiEnv[name] ?? '')) {
    warn(`${name} is a placeholder`, 'مقبول للتجربة فقط — ضع قيمة عشوائية قبل أي نشر', 'Fine for development only — set a random value before any deployment');
  }
}

// ------------------------------------------------------------------ Services
section('الخدمات · Services');
const database = new URL(apiEnv.DATABASE_URL || 'postgres://yusr:yusr@localhost:5432/yusr');
const redis = new URL(apiEnv.REDIS_URL || 'redis://localhost:6379');
const memory = apiEnv.YUSR_STORAGE === 'memory';
if (await reachable(database.hostname, Number(database.port || 5432))) pass(`PostgreSQL at ${database.host}`);
else
  warn(
    `PostgreSQL not reachable at ${database.host}`,
    memory ? 'الـ API مضبوط على وضع الذاكرة، فلا حاجة لها' : 'شغّل: pnpm infra:up (يحتاج Docker) — أو استخدم pnpm dev:demo',
    memory ? 'The API is set to memory storage, so it is not needed' : 'Run: pnpm infra:up (needs Docker) — or use `pnpm dev:demo`',
  );
if (await reachable(redis.hostname, Number(redis.port || 6379))) pass(`Redis at ${redis.host}`);
else warn(`Redis not reachable at ${redis.host}`, 'شغّل: pnpm infra:up — أو استخدم pnpm dev:demo', 'Run: pnpm infra:up — or use `pnpm dev:demo`');

for (const [port, name] of [
  [3000, 'website'],
  [3001, 'control hub'],
  [4000, 'API'],
  [8081, 'Expo / Metro'],
]) {
  if (await free(port)) {
    pass(`port ${port} free (${name})`);
    continue;
  }
  if (port === 4000) {
    const health = await fetch('http://localhost:4000/health')
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    if (health) {
      pass(`API running on :4000 (release ${health.release})`);
      continue;
    }
  }
  warn(
    `port ${port} in use (${name})`,
    'قد يكون تشغيلًا سابقًا ما زال يعمل — أغلقه أو غيّر المنفذ',
    'Probably an earlier run is still going — stop it or change the port',
  );
}

// ------------------------------------------------------------------ Summary
console.log(
  failures
    ? `\n✗ ${failures} مشكلة تمنع التشغيل · ${failures} problem(s) to fix first\n`
    : warnings
      ? `\n✓ يمكنك التشغيل · Ready to run (${warnings} note(s) above)\n`
      : '\n✓ كل شيء سليم · All good\n',
);
process.exit(failures ? 1 : 0);
