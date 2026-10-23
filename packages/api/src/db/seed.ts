/**
 * Demo data built from the same stories as the prototype (@yusr/sdk/mock), written
 * through the persistence ports so every row obeys the real rules: each donation has
 * a balanced ledger entry, case totals equal their ledger credits, payouts pass four
 * eyes, and statuses carry a transition history.
 *
 * Used by YUSR_STORAGE=memory and by `pnpm db:seed` against PostgreSQL.
 * Staff accounts share one demo authenticator secret (DEMO_TOTP_SECRET) — never in production.
 */
import { createHash } from 'node:crypto';
import {
  CURRENCY_META,
  buildDonationPostings,
  buildPayoutPostings,
  buildPlatformFeePostings,
  computeDonationBreakdown,
  formatReceiptNumber,
  resolveProvider,
  type CaseStatus,
  type Currency,
  type Localized,
  type PaymentMethod,
  type Role,
} from '@yusr/core';
import { DEMO_PARTNER_REGISTRY, DEMO_PARTNERS, demoPartnerFor, DONORS, SEED_CASES, seedAmounts, STAFF, VOLUNTEERS, type SeedCase } from '@yusr/sdk/mock';
import type { FieldCipher } from '../common/cipher';
import { yusrCodeHash } from '../partners/partners.service';
import type { Tx } from './ports';
import type { CaseRow, DonationRow, UserRow } from './rows';

export const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Stable UUID-shaped id from a name, so re-seeding produces the same ids. */
export function stableId(name: string): string {
  const hex = createHash('sha256').update(`yusr-seed:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Small deterministic PRNG (mulberry32). */
function random(seed: string) {
  let state = parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(next: () => number, items: readonly T[], weights?: readonly number[]): T {
  const total = weights ? weights.reduce((sum, weight) => sum + weight, 0) : items.length;
  let roll = next() * total;
  for (let index = 0; index < items.length; index += 1) {
    roll -= weights ? weights[index]! : 1;
    if (roll <= 0) return items[index]!;
  }
  return items[items.length - 1]!;
}

const METHODS: Readonly<Record<Currency, { methods: PaymentMethod[]; weights: number[] }>> = {
  EGP: { methods: ['card', 'vodafone_cash', 'instapay', 'fawry', 'apple_pay'], weights: [50, 18, 14, 10, 8] },
  SAR: { methods: ['mada', 'apple_pay', 'card'], weights: [55, 30, 15] },
  USD: { methods: ['card', 'apple_pay'], weights: [70, 30] },
};

function user(id: string, name: string, roles: Role[], extra: Partial<UserRow>, at: Date): UserRow {
  return {
    id,
    phone: null,
    email: null,
    displayName: name,
    locale: 'ar',
    roles,
    region: null,
    mfaEnabled: false,
    totpSecretCipher: null,
    totpLastStep: null,
    mfaEnrollmentExpiresAt: null,
    marketingOptIn: false,
    status: 'active',
    createdAt: at,
    updatedAt: at,
    ...extra,
  };
}

/** Breaks `totalMinor` into gifts that look like real giving (many small, a few large). */
function splitGifts(totalMinor: number, currency: Currency, next: () => number): number[] {
  const presets = CURRENCY_META[currency].quickAmounts;
  const choices = [...presets, presets[presets.length - 1]! * 2, presets[presets.length - 1]! * 4, presets[presets.length - 1]! * 10];
  const weights = [30, 26, 18, 12, 6, 4, 2].slice(0, choices.length);
  const gifts: number[] = [];
  let left = totalMinor;
  const min = CURRENCY_META[currency].minDonationMinor;
  while (left > 0) {
    let gift = pick(next, choices, weights) * 100;
    if (gift >= left || left - gift < min) gift = left;
    gifts.push(gift);
    left -= gift;
  }
  return gifts;
}

export interface SeedSummary {
  users: number;
  cases: number;
  donations: number;
  payouts: number;
}

/**
 * `codePepper` is the server secret the API hashes «كود يُسر» with (PartnersService), so the demo
 * partners' fixed codes (DEMO_PARTNER_REGISTRY) work on the submission form.
 */
export async function seedDemo(tx: Tx, options: { now: Date; cipher: FieldCipher; codePepper: string }): Promise<SeedSummary> {
  const { now, cipher, codePepper } = options;
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const summary: SeedSummary = { users: 0, cases: 0, donations: 0, payouts: 0 };
  const staffId = (id: string) => stableId(`staff:${id}`);

  // ------------------------------------------------------------------ people
  let phone = 0;
  const nextPhone = () => `+2010000${String((phone += 1)).padStart(5, '0')}`;
  for (const member of STAFF) {
    const id = staffId(member.id);
    await tx.users.insert(
      user(
        id,
        member.name.ar,
        member.roles,
        {
          email: member.email,
          phone: nextPhone(),
          mfaEnabled: member.mfa,
          totpSecretCipher: member.mfa ? cipher.encrypt(DEMO_TOTP_SECRET, `totp:${id}`) : null,
          region: 'EG-C',
        },
        ago(120),
      ),
    );
    summary.users += 1;
  }
  const donorIds = new Map<string, string>();
  for (const donor of DONORS) {
    const id = stableId(`donor:${donor.id}`);
    donorIds.set(donor.id, id);
    await tx.users.insert(
      user(
        id,
        donor.name.ar,
        ['donor'],
        { email: `${donor.id}@donors.yusr.example`, region: donor.region, locale: donor.region === 'INT' ? 'en' : 'ar' },
        ago(200),
      ),
    );
    summary.users += 1;
  }
  const volunteerIds: string[] = [];
  for (const volunteer of VOLUNTEERS) {
    const id = stableId(`volunteer:${volunteer.id}`);
    volunteerIds.push(id);
    await tx.users.insert(user(id, volunteer.name.ar, ['volunteer'], { phone: nextPhone(), region: volunteer.region }, ago(300)));
    await tx.users.insertVolunteer({
      userId: id,
      status: volunteer.status,
      region: volunteer.region,
      skills: ['field_visits'],
      baserowRowId: null,
      joinedAt: ago(300),
    });
    summary.users += 1;
  }

  // ------------------------------------------------------------------ approved partners
  const partnerIds = new Map<string, string>();
  for (const partner of DEMO_PARTNERS) {
    const registry = DEMO_PARTNER_REGISTRY.find((entry) => entry.registrationNumber === partner.registrationNumber)!;
    const id = stableId(`partner:${partner.registrationNumber}`);
    partnerIds.set(partner.registrationNumber, id);
    const at = new Date(`${registry.contractSignedOn}T10:00:00Z`);
    await tx.partners.insert({
      id,
      name: partner.name,
      registrationNumber: partner.registrationNumber,
      region: registry.region,
      contractSignedOn: registry.contractSignedOn,
      contactName: partner.contactName,
      contactPhone: partner.contactPhone,
      status: 'active',
      suspendedAt: null,
      codeHash: yusrCodeHash(codePepper, registry.yusrCode),
      codeCipher: cipher.encrypt(registry.yusrCode, `partner-code:${id}`),
      codeIssuedAt: at,
      createdBy: staffId('u_youssef'),
      createdAt: at,
      updatedAt: at,
    });
  }

  // ------------------------------------------------------------------ cases
  const receiptYear = now.getUTCFullYear();
  for (const [index, seed] of SEED_CASES.entries()) {
    const next = random(seed.slug);
    const caseId = stableId(`case:${seed.slug}`);
    const beneficiaryId = stableId(`beneficiary:${seed.slug}`);
    const createdAt = ago(seed.createdDaysAgo);
    const publishedAt = seed.publishedDaysAgo !== undefined ? ago(seed.publishedDaysAgo) : null;
    const verifiedAt = publishedAt
      ? new Date(publishedAt.getTime() - DAY)
      : seed.status === 'field_verified'
        ? ago(Math.max(0, seed.createdDaysAgo - 2))
        : null;
    const fundedAt = seed.fundedDaysAgo !== undefined ? ago(seed.fundedDaysAgo) : null;
    const closedAt = seed.closedDaysAgo !== undefined ? ago(seed.closedDaysAgo) : null;
    const auditorId = seed.auditorId ? staffId(seed.auditorId) : null;
    const submittedBy = seed.submittedBy.relation === 'volunteer' ? volunteerIds[index % volunteerIds.length]! : stableId('donor:d01');

    await tx.cases.insertBeneficiary({
      id: beneficiaryId,
      pseudonym: seed.beneficiary,
      nationalIdHash: null,
      nationalIdCipher: null,
      phoneCipher: null,
      region: seed.region,
      householdSize: null,
      createdAt,
    });

    const row: CaseRow = {
      id: caseId,
      reference: `YSR-${seed.ref}`,
      slug: seed.slug,
      category: seed.category,
      status: seed.status,
      beneficiaryId,
      submittedBy,
      submitterRelation: 'association',
      association: demoPartnerFor(seed.slug),
      partnerId: partnerIds.get(demoPartnerFor(seed.slug).registrationNumber)!,
      title: seed.title,
      summary: seed.summary,
      shareText: seed.shareText ?? null,
      story: seed.story,
      region: seed.region,
      currency: seed.currency,
      goalMinor: seedAmounts(seed).goalMinor,
      platformFeeMinor: seedAmounts(seed).platformFeeMinor,
      raisedMinor: 0,
      donorsCount: 0,
      isUrgent: seed.urgentInHours !== undefined,
      deadline: seed.urgentInHours !== undefined ? new Date(now.getTime() + seed.urgentInHours * HOUR) : null,
      zakatEligible: seed.zakat,
      priority: seed.priority ?? (seed.urgentInHours !== undefined ? 60 : 20),
      coverSeed: index * 7 + 3,
      auditorId,
      verifiedAt,
      publishedAt,
      fundedAt,
      closedAt,
      createdAt,
      updatedAt: closedAt ?? fundedAt ?? publishedAt ?? createdAt,
    };
    await tx.cases.insert(row);
    summary.cases += 1;

    await seedHistory(tx, seed, row, staffId);
    const lineIds = seed.plan.map((_, position) => stableId(`line:${seed.slug}:${position}`));
    await tx.cases.insertLines(
      seed.plan.map((line, position) => ({
        id: lineIds[position]!,
        caseId,
        payeeType: line.payeeType,
        payee: line.payee,
        purpose: line.purpose,
        amountMinor: line.amount * 100,
        payeeAccountMasked: `•••••••••${String(4400 + position * 17 + index).slice(-4)}`,
        position,
      })),
    );
    for (const [position, document] of seed.documents.entries()) {
      const documentId = stableId(`document:${seed.slug}:${position}`);
      await tx.cases.insertDocument({
        id: documentId,
        caseId,
        kind: document.kind,
        storageKey: `seed/${seed.slug}/${document.kind}.pdf`,
        redactedKey: publishedAt ? `cases/${caseId}/${documentId}.pdf` : null,
        sha256: createHash('sha256').update(`${seed.slug}:${position}`).digest('hex'),
        pages: document.pages,
        uploadedBy: submittedBy,
        redactedBy: publishedAt ? staffId('u_youssef') : null,
        createdAt,
      });
    }
    if (verifiedAt && auditorId) {
      await tx.verification.insert({
        id: stableId(`task:${seed.slug}`),
        caseId,
        auditorId,
        assignedBy: staffId('u_youssef'),
        status: 'completed',
        visitAt: new Date(verifiedAt.getTime() - 6 * HOUR),
        checklist: { identity: true, residence: true, documents: true, cost: true, alternatives: true },
        recommendedMinor: row.goalMinor - row.platformFeeMinor,
        notes: null,
        baserowRowId: null,
        completedAt: verifiedAt,
        createdAt: new Date(createdAt.getTime() + 6 * HOUR),
      });
    } else if (seed.status === 'under_review' && index % 2 === 0) {
      await tx.verification.insert({
        id: stableId(`task:${seed.slug}`),
        caseId,
        auditorId: staffId('u_mahmoud'),
        assignedBy: staffId('u_youssef'),
        status: 'scheduled',
        visitAt: new Date(now.getTime() + DAY),
        checklist: { identity: true, residence: false, documents: true, cost: false, alternatives: false },
        recommendedMinor: null,
        notes: null,
        baserowRowId: null,
        completedAt: null,
        createdAt: ago(1),
      });
    }

    // ------------------------------------------------------------------ donations to reach `raised`
    if (seed.raised > 0 && publishedAt) {
      await tx.ledger.ensureCaseFund(caseId, seed.currency);
      const until = (fundedAt ?? now).getTime();
      for (const netMinor of splitGifts(seedAmounts(seed).raisedMinor, seed.currency, next)) {
        const method = pick(next, METHODS[seed.currency].methods, METHODS[seed.currency].weights);
        const coverFees = next() < 0.6;
        // Solve for the amount whose net credit equals the planned gift, whichever way the fee is paid.
        const probe = computeDonationBreakdown({ amountMinor: netMinor, currency: seed.currency, method, coverFees: true, caseCurrency: seed.currency });
        const amountMinor = coverFees ? netMinor : probe.chargedMinor;
        const breakdown = computeDonationBreakdown({ amountMinor, currency: seed.currency, method, coverFees, caseCurrency: seed.currency });
        const provider = resolveProvider(method, seed.currency)!;
        const at = new Date(publishedAt.getTime() + next() * (until - publishedAt.getTime()));
        const donorKey = pick(
          next,
          DONORS.map((donor) => donor.id),
          DONORS.map((donor) => donor.weight),
        );
        const guest = next() < 0.25;
        const donationId = stableId(`donation:${seed.slug}:${summary.donations}`);
        const sequence = await tx.donations.nextReceiptSequence(receiptYear);
        const donation: DonationRow = {
          id: donationId,
          caseId,
          donorId: guest ? null : donorIds.get(donorKey)!,
          guestContact: guest ? { name: null, email: `guest${summary.donations}@example.com`, phone: null } : null,
          idempotencyKey: `seed-${donationId}`,
          requestHash: 'seed',
          type: seed.zakat && next() < 0.3 ? 'zakat' : 'sadaqah',
          anonymous: next() < 0.2,
          dedication: null,
          currency: seed.currency,
          amountMinor,
          coverFees,
          estimatedFeeMinor: breakdown.estimatedFeeMinor,
          feeMinor: breakdown.estimatedFeeMinor,
          chargedMinor: breakdown.chargedMinor,
          caseCurrency: seed.currency,
          fxRate: 1,
          netToCaseMinor: netMinor,
          method,
          provider,
          status: 'succeeded',
          receiptNo: formatReceiptNumber(receiptYear, sequence),
          receiptTokenHash: 'seed',
          locale: 'ar',
          channel: next() < 0.45 ? 'mobile' : 'web',
          expiresAt: new Date(at.getTime() + 30 * 60_000),
          succeededAt: at,
          createdAt: new Date(at.getTime() - 2 * 60_000),
          updatedAt: at,
        };
        await tx.donations.insert(donation);
        await tx.ledger.post({
          kind: 'donation',
          donationId,
          memo: donation.receiptNo,
          postedAt: at,
          lines: buildDonationPostings({
            caseId,
            provider,
            currency: seed.currency,
            chargedMinor: donation.chargedMinor,
            feeMinor: donation.feeMinor!,
            caseCurrency: seed.currency,
            netToCaseMinor: netMinor,
            fxRate: 1,
          }),
        });
        await tx.cases.credit(caseId, netMinor, 1);
        summary.donations += 1;
      }
    }

    // ------------------------------------------------------------------ Yusr's fee, then payouts for funded work
    if (fundedAt && seedAmounts(seed).platformFeeMinor > 0) {
      await tx.ledger.post({
        kind: 'platform_fee',
        memo: `YSR-${seed.ref}`,
        postedAt: fundedAt,
        lines: buildPlatformFeePostings(caseId, seedAmounts(seed).platformFeeMinor, seed.currency),
      });
    }
    if (seed.payout && fundedAt) {
      for (const [position, line] of seed.plan.entries()) {
        const payoutId = stableId(`payout:${seed.slug}:${position}`);
        const paid = seed.payout === 'paid';
        const approvedAt = new Date(fundedAt.getTime() + 20 * HOUR);
        const paidAt = paid ? new Date(approvedAt.getTime() + 20 * HOUR) : null;
        await tx.payouts.insert({
          id: payoutId,
          reference: `PO-${seed.ref}${position}`,
          caseId,
          lineId: lineIds[position]!,
          amountMinor: line.amount * 100,
          currency: seed.currency,
          payeeAccountMasked: '•••••••••4410',
          status: paid ? 'paid' : 'approved',
          requestedBy: staffId('u_heba'),
          approvedBy: staffId('u_karim'),
          approvedAt,
          paidAt,
          paidBy: paid ? staffId('u_karim') : null,
          bankReference: paid ? `CIB-TRX-${seed.ref}${position}` : null,
          proofDocumentId: null,
          createdAt: new Date(fundedAt.getTime() + 8 * HOUR),
        });
        if (paid) {
          await tx.ledger.post({
            kind: 'payout',
            payoutId,
            memo: `PO-${seed.ref}${position}`,
            postedBy: staffId('u_heba'),
            postedAt: paidAt!,
            lines: buildPayoutPostings(caseId, line.amount * 100, seed.currency),
          });
        }
        summary.payouts += 1;
      }
    }
  }

  // ------------------------------------------------------------------ money on its way (finance's reconciliation queue)
  // InstaPay transfers the donors said they sent, and a Fawry reference not yet paid at an outlet.
  const open = SEED_CASES.filter((seed) => seed.status === 'published' && seed.currency === 'EGP').slice(0, 4);
  for (const [position, seed] of open.entries()) {
    const method = position === 3 ? 'fawry' : 'instapay';
    const amountMinor = [750_00, 2_000_00, 300_00, 1_000_00][position]!;
    const breakdown = computeDonationBreakdown({ amountMinor, currency: 'EGP', method, coverFees: position % 2 === 0, caseCurrency: 'EGP' });
    const provider = resolveProvider(method, 'EGP')!;
    const createdAt = new Date(now.getTime() - (position + 1) * 3 * HOUR);
    const expiresAt = new Date(createdAt.getTime() + (method === 'fawry' ? 72 : 48) * HOUR);
    const donationId = stableId(`donation:pending:${seed.slug}`);
    const donorKey = DONORS[(position * 3) % DONORS.length]!.id;
    const receiptNo = formatReceiptNumber(receiptYear, await tx.donations.nextReceiptSequence(receiptYear));
    await tx.donations.insert({
      id: donationId,
      caseId: stableId(`case:${seed.slug}`),
      donorId: donorIds.get(donorKey) ?? null,
      guestContact: null,
      idempotencyKey: `seed-${donationId}`,
      requestHash: 'seed',
      type: 'sadaqah',
      anonymous: false,
      dedication: null,
      currency: 'EGP',
      amountMinor,
      coverFees: position % 2 === 0,
      estimatedFeeMinor: breakdown.estimatedFeeMinor,
      feeMinor: null,
      chargedMinor: breakdown.chargedMinor,
      caseCurrency: 'EGP',
      fxRate: 1,
      netToCaseMinor: breakdown.netToCaseMinor,
      method,
      provider,
      status: 'awaiting_transfer',
      receiptNo,
      receiptTokenHash: 'seed',
      locale: 'ar',
      channel: position % 2 === 0 ? 'mobile' : 'web',
      expiresAt,
      succeededAt: null,
      createdAt,
      updatedAt: createdAt,
    });
    await tx.donations.insertAttempt({
      id: stableId(`attempt:pending:${seed.slug}`),
      donationId,
      provider,
      providerRef: method === 'fawry' ? `9${String(receiptNo.replace(/\D/g, '')).slice(-8)}` : null,
      providerOrderRef: null,
      status: 'action_required',
      amountMinor: breakdown.chargedMinor,
      currency: 'EGP',
      action:
        method === 'fawry'
          ? { type: 'fawry_reference', referenceNumber: `9${String(receiptNo.replace(/\D/g, '')).slice(-8)}`, expiresAt: expiresAt.toISOString() }
          : { type: 'bank_transfer', ipa: 'yusr@instapay', accountName: 'Yusr Foundation', reference: receiptNo, expiresAt: expiresAt.toISOString() },
      failureCode: null,
      createdAt,
    });
    summary.donations += 1;
  }
  return summary;
}

/** Transition rows and audit entries that tell how each seeded case got to its status. */
async function seedHistory(tx: Tx, seed: SeedCase, row: CaseRow, staffId: (id: string) => string): Promise<void> {
  const moderator = staffId('u_youssef');
  const steps: Array<{ from: CaseStatus; to: CaseStatus; at: Date | null; actor: string | null; reason?: string }> = [];
  if (row.status !== 'draft') steps.push({ from: 'draft', to: 'under_review', at: row.createdAt, actor: row.submittedBy });
  if (row.verifiedAt) steps.push({ from: 'under_review', to: 'field_verified', at: row.verifiedAt, actor: row.auditorId });
  if (row.status === 'rejected')
    steps.push({
      from: 'under_review',
      to: 'rejected',
      at: new Date(row.createdAt.getTime() + 2 * DAY),
      actor: moderator,
      reason: seed.reason ?? 'Did not meet the criteria',
    });
  if (row.publishedAt) steps.push({ from: 'field_verified', to: 'published', at: row.publishedAt, actor: moderator });
  if (row.status === 'paused')
    steps.push({
      from: 'published',
      to: 'paused',
      at: new Date(row.updatedAt.getTime() + DAY),
      actor: moderator,
      reason: seed.reason ?? 'Waiting for an updated quote',
    });
  if (row.fundedAt) steps.push({ from: 'published', to: 'funded', at: row.fundedAt, actor: null });
  if (row.closedAt) steps.push({ from: 'funded', to: 'closed', at: row.closedAt, actor: staffId('u_heba') });
  for (const step of steps) {
    await tx.cases.insertTransition({
      caseId: row.id,
      fromStatus: step.from,
      toStatus: step.to,
      actorId: step.actor,
      reason: step.reason ?? null,
      createdAt: step.at ?? undefined,
    });
    if (step.to !== 'under_review') {
      await tx.audit.record({
        actorId: step.actor,
        actorRole:
          step.actor === null ? null : step.actor === row.auditorId ? 'field_auditor' : step.actor === moderator ? 'content_moderator' : 'financial_officer',
        action: `case.${step.to}`,
        entityType: 'case',
        entityId: row.id,
        before: { status: step.from },
        after: { status: step.to, ...(step.reason ? { reason: step.reason } : {}) },
        createdAt: step.at ?? undefined,
      });
    }
  }
}

export const localized = (ar: string, en: string): Localized => ({ ar, en });

/** `pnpm db:seed`: loads the demo data into the PostgreSQL database in DATABASE_URL. */
export async function main(): Promise<void> {
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { DrizzleDatabase } = await import('./drizzle');
  const { schema } = await import('./schema');
  const { FieldCipher } = await import('../common/cipher');
  const { loadConfig } = await import('../config/env');
  const config = loadConfig();
  // Demo data includes demo staff with a published authenticator key: never in production.
  if (config.nodeEnv === 'production') throw new Error('Refusing to load demo data into a production database (NODE_ENV=production).');
  const pool = new Pool({ connectionString: config.databaseUrl });
  const db = new DrizzleDatabase(drizzle(pool, { schema }));
  const cipher = new FieldCipher(config.crypto.dataKeyBase64);
  let result: SeedSummary | undefined;
  await db.seed(async (tx) => {
    result = await seedDemo(tx, { now: new Date(), cipher, codePepper: config.crypto.nationalIdPepper });
  });
  console.log(`seed: ${result?.users} users, ${result?.cases} cases, ${result?.donations} donations, ${result?.payouts} payouts`);
  await pool.end();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
