/**
 * Creates or promotes a staff member and issues their authenticator-app key — how the first super
 * admin is made on a new database, and how staff are added afterwards.
 *
 *   pnpm staff:create --phone 01001234567 --name "سارة الشريف" --role super_admin
 *   node dist/db/create-staff.js --phone +201001234567 --name "…" --role field_auditor     (production)
 *
 * Roles: super_admin, financial_officer, content_moderator, field_auditor — repeat --role for several;
 * the list replaces the person's staff roles (other roles, like donor, are kept).
 * The key is printed once: the person adds it to Google Authenticator, Microsoft Authenticator or
 * 1Password ("enter a setup key"), then signs in to the control hub with their phone code + the app's
 * code. It is stored encrypted (DATA_KEY_BASE64). --reset-authenticator issues a new key to someone
 * who lost their phone. Every run is written to the audit log.
 */
import { parseArgs } from 'node:util';
import { STAFF_ROLES, toE164, type Role } from '@yusr/core';
import { otpauthUri, generateTotpSecret } from '../auth/totp';
import { FieldCipher } from '../common/cipher';
import { newId } from '../common/ids';
import { loadConfig } from '../config/env';
import type { UserRow } from './rows';

const USAGE = `Usage: staff:create --phone <number> [--name <name>] --role <role> [--role <role>…] [--locale ar|en] [--reset-authenticator]
Roles: ${STAFF_ROLES.join(', ')}`;

export interface StaffResult {
  user: UserRow;
  created: boolean;
  /** The new authenticator key, when one was issued. */
  secret: string | null;
}

export async function createStaff(options: {
  databaseUrl: string;
  dataKeyBase64: string;
  phone: string;
  name?: string;
  roles: Role[];
  locale?: 'ar' | 'en';
  resetAuthenticator?: boolean;
}): Promise<StaffResult> {
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { DrizzleDatabase } = await import('./drizzle');
  const { schema } = await import('./schema');
  const pool = new Pool({ connectionString: options.databaseUrl });
  const db = new DrizzleDatabase(drizzle(pool, { schema }));
  const cipher = new FieldCipher(options.dataKeyBase64);
  try {
    return await db.transaction(async (tx) => {
      const now = new Date();
      const existing = await tx.users.byPhone(options.phone);
      const user: UserRow = existing ?? {
        id: newId(),
        phone: options.phone,
        email: null,
        displayName: options.name?.trim() || options.phone,
        locale: options.locale ?? 'ar',
        roles: [],
        region: null,
        mfaEnabled: false,
        totpSecretCipher: null,
        totpLastStep: null,
        mfaEnrollmentExpiresAt: null,
        marketingOptIn: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      const roles = [...new Set([...user.roles.filter((role) => !STAFF_ROLES.includes(role) || options.roles.includes(role)), ...options.roles])];
      const issueKey = !user.mfaEnabled || Boolean(options.resetAuthenticator);
      const secret = issueKey ? generateTotpSecret() : null;
      const patch: Partial<UserRow> = {
        roles,
        status: 'active',
        updatedAt: now,
        ...(options.name?.trim() ? { displayName: options.name.trim() } : {}),
        ...(secret ? { mfaEnabled: true, totpSecretCipher: cipher.encrypt(secret, `totp:${user.id}`), totpLastStep: null, mfaEnrollmentExpiresAt: null } : {}),
      };

      let sessionsRevoked = 0;
      if (existing) {
        await tx.users.update(user.id, patch);
        // New roles or a new authenticator: sessions signed in before this run end now (a lost phone
        // must not stay signed in to the control hub).
        const rolesChanged = existing.roles.length !== roles.length || existing.roles.some((role) => !roles.includes(role));
        if (rolesChanged || secret || existing.status !== 'active') sessionsRevoked = await tx.refreshTokens.revokeAllForUser(user.id, now);
      } else {
        await tx.users.insert({ ...user, ...patch });
        await tx.users.insertIdentity({ id: newId(), userId: user.id, provider: 'phone', subject: options.phone, createdAt: now });
      }
      await tx.audit.record({
        actorId: null,
        actorRole: null,
        action: existing ? 'staff.updated_from_cli' : 'staff.created_from_cli',
        entityType: 'user',
        entityId: user.id,
        before: existing ? { roles: existing.roles, mfaEnabled: existing.mfaEnabled } : null,
        after: { roles, mfaEnabled: true, authenticatorIssued: Boolean(secret), sessionsRevoked },
      });
      return { user: { ...user, ...patch }, created: !existing, secret };
    });
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      phone: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', multiple: true },
      locale: { type: 'string' },
      'reset-authenticator': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const phone = toE164(values.phone ?? null, 'EG');
  const roles = (values.role ?? []) as Role[];
  const unknown = roles.filter((role) => !STAFF_ROLES.includes(role));
  if (!phone || roles.length === 0 || unknown.length > 0) {
    throw new Error(`${unknown.length ? `Unknown role: ${unknown.join(', ')}\n` : ''}${!phone ? 'A valid --phone is required\n' : ''}${USAGE}`);
  }
  const config = loadConfig();
  if (config.storage !== 'postgres') throw new Error('staff:create needs PostgreSQL (YUSR_STORAGE=postgres and DATABASE_URL)');

  const result = await createStaff({
    databaseUrl: config.databaseUrl,
    dataKeyBase64: config.crypto.dataKeyBase64,
    phone,
    roles,
    ...(values.name ? { name: values.name } : {}),
    ...(values.locale === 'en' ? { locale: 'en' as const } : {}),
    ...(values['reset-authenticator'] ? { resetAuthenticator: true } : {}),
  });

  console.log(`\n${result.created ? 'Created' : 'Updated'} ${result.user.displayName} (${phone}) — roles: ${result.user.roles.join(', ')}`);
  if (result.secret) {
    const grouped = result.secret.match(/.{1,4}/g)!.join(' ');
    console.log(`
Authenticator key (shown once — hand it over privately, then close this window):

    ${grouped}

In the authenticator app choose "Enter a setup key", account "Yusr", time-based. Or open this
link on the phone that has the app:

    ${otpauthUri(result.secret, phone)}

Sign in at the control hub with the phone number: the SMS code plus the app's 6-digit code.
`);
  } else {
    console.log('Their authenticator is already set up (use --reset-authenticator to issue a new key).');
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
