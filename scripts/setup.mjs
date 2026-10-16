#!/usr/bin/env node
// First-time setup for a fresh copy of Yusr — works the same on Windows, macOS and Linux.
//
//   node scripts/setup.mjs          install everything and create your local settings files
//   node scripts/setup.mjs --db     …and also start PostgreSQL/Redis/MinIO in Docker, create the
//                                   tables and load the demo data
//
// It never overwrites a settings file you already have. Run it again at any time.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const withDb = process.argv.includes('--db');
const windows = process.platform === 'win32';

const step = (ar, en) => console.log(`\n▸ ${ar}\n  ${en}`);
const ok = (text) => console.log(`  ✓ ${text}`);
const stop = (ar, en) => {
  console.error(`\n✗ ${ar}\n  ${en}\n`);
  process.exit(1);
};

/** Runs a command in the repository, showing its output. */
function run(command, args) {
  return spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: windows }).status === 0;
}

/** A command's trimmed output, or null when it is missing or fails. */
function output(command, args = ['--version']) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: windows });
  return result.status === 0 ? result.stdout.trim() : null;
}

// ------------------------------------------------------------------ 1. Node and pnpm
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  stop(
    `إصدار Node الحالي ${process.versions.node} قديم. ثبّت Node 22 (LTS) من https://nodejs.org ثم أعد التشغيل.`,
    `Node ${process.versions.node} is too old. Install Node 22 LTS from https://nodejs.org and run this again.`,
  );
}
ok(`Node ${process.versions.node}`);

let pnpm = output('pnpm');
if (!pnpm) {
  step('تفعيل pnpm (مدير الحزم) عبر corepack…', 'Enabling pnpm (the package manager) through corepack…');
  run('corepack', ['enable']);
  pnpm = output('pnpm');
}
if (!pnpm) {
  stop(
    'لم يتم العثور على pnpm. نفّذ الأمر: npm install -g pnpm@10 ثم أعد تشغيل هذا الملف.',
    'pnpm is not available. Run: npm install -g pnpm@10, then run this script again.',
  );
}
ok(`pnpm ${pnpm}`);

// ------------------------------------------------------------------ 2. Dependencies
step('تثبيت الحزم — أول مرة قد تستغرق بضع دقائق…', 'Installing dependencies — the first time can take a few minutes…');
if (!run('pnpm', ['install', '--frozen-lockfile'])) {
  stop('فشل التثبيت. راجع الرسائل أعلاه، أو شغّل: node scripts/doctor.mjs', 'Install failed. Read the messages above, or run: node scripts/doctor.mjs');
}
ok('dependencies installed');

// ------------------------------------------------------------------ 3. Local settings (.env files)
const secret = (bytes = 32) => randomBytes(bytes).toString('base64url');
const ENV_FILES = [
  {
    template: 'packages/api/.env.example',
    target: 'packages/api/.env',
    // Fresh development secrets, so a copied file is never shipping the template's placeholders.
    fill: (text) =>
      text
        .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret(48)}`)
        .replace(/^OTP_PEPPER=.*$/m, `OTP_PEPPER=${secret()}`)
        .replace(/^NATIONAL_ID_PEPPER=.*$/m, `NATIONAL_ID_PEPPER=${secret()}`)
        .replace(/^RECEIPT_TOKEN_SECRET=.*$/m, `RECEIPT_TOKEN_SECRET=${secret()}`)
        .replace(/^SIMULATOR_SECRET=.*$/m, `SIMULATOR_SECRET=${secret()}`)
        .replace(/^DATA_KEY_BASE64=.*$/m, `DATA_KEY_BASE64=${randomBytes(32).toString('base64')}`),
  },
  { template: 'apps/web/.env.example', target: 'apps/web/.env.local' },
  { template: 'apps/admin/.env.example', target: 'apps/admin/.env.local' },
  { template: 'apps/mobile/.env.example', target: 'apps/mobile/.env' },
];

step('ملفات الإعدادات المحلية (.env)…', 'Local settings files (.env)…');
for (const { template, target, fill } of ENV_FILES) {
  const targetPath = join(root, target);
  if (existsSync(targetPath)) {
    ok(`${target} (kept yours)`);
    continue;
  }
  const text = readFileSync(join(root, template), 'utf8');
  writeFileSync(targetPath, fill ? fill(text) : text);
  ok(`${target} (created from ${template})`);
}

// ------------------------------------------------------------------ 4. Optional: database
if (withDb) {
  step('تشغيل قاعدة البيانات في Docker وتجهيز الجداول والبيانات التجريبية…', 'Starting the databases in Docker, creating the tables and loading demo data…');
  if (!output('docker', ['--version'])) {
    stop(
      'Docker غير مثبت. ثبّت Docker Desktop من https://www.docker.com/products/docker-desktop ثم أعد المحاولة — أو استخدم pnpm dev:demo بدون قاعدة بيانات.',
      'Docker is not installed. Install Docker Desktop, then try again — or use `pnpm dev:demo`, which needs no database.',
    );
  }
  if (!run('docker', ['compose', '-f', 'infra/docker-compose.yml', 'up', '-d', '--wait'])) {
    stop('تعذّر تشغيل الحاويات. تأكد أن Docker Desktop يعمل.', 'Could not start the containers. Make sure Docker Desktop is running.');
  }
  if (!run('pnpm', ['db:migrate']) || !run('pnpm', ['db:seed'])) {
    stop('تعذّر تجهيز قاعدة البيانات. شغّل node scripts/doctor.mjs لمعرفة السبب.', 'Setting up the database failed. Run `node scripts/doctor.mjs` to see why.');
  }
  ok('PostgreSQL, Redis and MinIO are running; tables created; demo data loaded');
}

// ------------------------------------------------------------------ Next steps
console.log(`
✓ جاهز — Ready.

  pnpm dev:demo     الموقع + لوحة التحكم + الـ API ببيانات تجريبية، بدون قاعدة بيانات (أسرع طريقة)
                    website + control hub + API on demo data, no database needed
  pnpm dev          نفس الشيء على PostgreSQL الحقيقي (بعد: node scripts/setup.mjs --db)
                    the same on real PostgreSQL (after: node scripts/setup.mjs --db)
  pnpm dev:mobile   تطبيق الجوال (Expo)  ·  the mobile app (Expo)
  pnpm check        كل فحوص الجودة قبل أي رفع  ·  every quality check before you push
  pnpm run doctor   تشخيص أي مشكلة في البيئة  ·  diagnose your environment

  الموقع / Website         http://localhost:3000
  لوحة التحكم / Hub         http://localhost:3001   (دخول تجريبي: 01000000001 — راجع docs/GUIDE.ar.md)
  الـ API                   http://localhost:4000/v1/openapi.json

  الدليل الكامل بالعربي: docs/GUIDE.ar.md
`);
