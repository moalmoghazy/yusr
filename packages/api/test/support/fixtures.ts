import { DomainError, type Currency, type PaymentProvider, type Role } from '@yusr/core';
import type { RequestActor } from '../../src/common/actor';
import { ManualClock } from '../../src/common/clock';
import { sequentialIds } from '../../src/common/ids';
import { MemoryDatabase } from '../../src/db/memory';
import type { CaseRow, UserRow } from '../../src/db/rows';
import { DEFAULT_CHECKOUT_WINDOWS, DonationsService, type DonationsConfig } from '../../src/donations/donations.service';
import { StaticFx } from '../../src/payments/fx';
import type { CheckoutRequest, CheckoutResult, PaymentEvent, PaymentGateway, RefundCall, RefundResult, WebhookInput } from '../../src/payments/gateway';
import { GatewayRegistry } from '../../src/payments/registry';

export const CASE_ID = '00000000-0000-4000-8000-00000000c001';
export const SAR_CASE_ID = '00000000-0000-4000-8000-00000000c002';
export const DRAFT_CASE_ID = '00000000-0000-4000-8000-00000000c003';
export const BENEFICIARY_ID = '00000000-0000-4000-8000-00000000b001';

const at = new Date('2026-09-01T08:00:00Z');

function user(id: string, name: string, roles: Role[], phone: string): UserRow {
  return {
    id,
    phone,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@yusr.example`,
    displayName: name,
    locale: 'ar',
    roles,
    region: 'EG-C',
    mfaEnabled: roles.some((role) => role !== 'donor'),
    totpSecretCipher: null,
    totpLastStep: null,
    mfaEnrollmentExpiresAt: null,
    marketingOptIn: false,
    status: 'active',
    createdAt: at,
    updatedAt: at,
  };
}

export const USERS = {
  donor: user('00000000-0000-4000-8000-0000000000d1', 'Mona Adel', ['donor'], '+201001110001'),
  financeA: user('00000000-0000-4000-8000-0000000000f1', 'Karim Finance', ['financial_officer'], '+201001110002'),
  financeB: user('00000000-0000-4000-8000-0000000000f2', 'Laila Finance', ['financial_officer'], '+201001110003'),
  moderator: user('00000000-0000-4000-8000-0000000000a1', 'Hana Moderator', ['content_moderator'], '+201001110004'),
  auditor: user('00000000-0000-4000-8000-0000000000a2', 'Omar Auditor', ['field_auditor'], '+201001110005'),
  volunteer: user('00000000-0000-4000-8000-0000000000e1', 'Youssef Volunteer', ['volunteer'], '+201001110006'),
} as const;

export function actorOf(row: UserRow, mfa = true): RequestActor {
  return { id: row.id, name: row.displayName, roles: [...row.roles], mfa };
}

export function caseRow(overrides: Partial<CaseRow> & { id: string }): CaseRow {
  return {
    reference: `YSR-${overrides.id.slice(-4)}`,
    slug: `case-${overrides.id.slice(-4)}`,
    category: 'medical',
    status: 'published',
    beneficiaryId: BENEFICIARY_ID,
    submittedBy: USERS.volunteer.id,
    submitterRelation: 'volunteer',
    association: null,
    title: { ar: 'عملية قلب مفتوح لطفل', en: 'Open-heart surgery for a child' },
    summary: { ar: 'ملخص', en: 'Summary' },
    shareText: null,
    story: { ar: 'القصة', en: 'Story' },
    region: 'EG-C',
    currency: 'EGP',
    goalMinor: 50_000_00,
    platformFeeMinor: 0,
    raisedMinor: 0,
    donorsCount: 0,
    isUrgent: false,
    deadline: null,
    zakatEligible: true,
    priority: 10,
    coverSeed: 3,
    auditorId: USERS.auditor.id,
    verifiedAt: at,
    publishedAt: at,
    fundedAt: null,
    closedAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

/** A gateway double: records calls and trusts webhooks carrying `x-test-signature: valid`. */
export class FakeGateway implements PaymentGateway {
  readonly checkouts: CheckoutRequest[] = [];
  readonly refunds: RefundCall[] = [];
  failNextCheckout = false;

  constructor(readonly provider: PaymentProvider) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (this.failNextCheckout) {
      this.failNextCheckout = false;
      throw new DomainError('PAYMENT_PROVIDER_ERROR', `${this.provider} unavailable`);
    }
    this.checkouts.push(request);
    const async = this.provider === 'fawry' || this.provider === 'instapay';
    return {
      providerRef: `ref_${request.reference}_${this.checkouts.length}`,
      status: async ? 'awaiting_transfer' : 'requires_action',
      action: { type: 'redirect', provider: this.provider, url: `https://pay.example/${this.provider}/${request.reference}` },
    };
  }

  parseWebhook(input: WebhookInput): PaymentEvent {
    if (input.headers['x-test-signature'] !== 'valid') throw new DomainError('INVALID_SIGNATURE');
    const body = JSON.parse(input.rawBody.toString('utf8')) as Record<string, unknown>;
    return {
      provider: this.provider,
      eventId: String(body['eventId']),
      reference: String(body['reference']),
      providerRef: (body['providerRef'] as string | undefined) ?? `txn_${String(body['eventId'])}`,
      outcome: body['outcome'] as PaymentEvent['outcome'],
      amountMinor: Number(body['amountMinor']),
      currency: body['currency'] as Currency,
      feeMinor: (body['feeMinor'] as number | undefined) ?? null,
      failureCode: (body['failureCode'] as string | undefined) ?? null,
      payload: body,
    };
  }

  async refund(call: RefundCall): Promise<RefundResult> {
    this.refunds.push(call);
    return { providerRef: `rf_${call.reference}_${this.refunds.length}`, status: 'processed' };
  }
}

export function webhook(body: Record<string, unknown>, signature = 'valid'): WebhookInput {
  return { rawBody: Buffer.from(JSON.stringify(body)), headers: { 'x-test-signature': signature }, query: {} };
}

export const TEST_CONFIG: DonationsConfig = {
  publicApiUrl: 'https://api.yusr.example',
  publicWebUrl: 'https://yusr.example',
  allowedReturnHosts: ['yusr.example', 'localhost:3000'],
  appScheme: 'yusr',
  receiptSecret: 'test-receipt-secret',
  feePolicy: 'case_absorbs',
  checkoutWindowMs: DEFAULT_CHECKOUT_WINDOWS,
};

export async function setup() {
  const clock = new ManualClock('2026-09-26T09:00:00Z');
  const ids = sequentialIds();
  const db = new MemoryDatabase(() => clock.now());
  await db.seed(async (tx) => {
    for (const row of Object.values(USERS)) await tx.users.insert(row);
    await tx.cases.insertBeneficiary({
      id: BENEFICIARY_ID,
      pseudonym: { ar: 'أم سارة، ٣٤', en: 'Um Sara, 34' },
      nationalIdHash: null,
      nationalIdCipher: null,
      phoneCipher: null,
      region: 'EG-C',
      householdSize: 4,
      createdAt: at,
    });
    await tx.cases.insert(caseRow({ id: CASE_ID, reference: 'YSR-10482', slug: 'heart-surgery' }));
    await tx.cases.insert(
      caseRow({ id: SAR_CASE_ID, reference: 'YSR-10483', slug: 'riyadh-rent', currency: 'SAR', goalMinor: 12_000_00, region: 'SA-01', zakatEligible: false }),
    );
    await tx.cases.insert(caseRow({ id: DRAFT_CASE_ID, reference: 'YSR-10484', slug: 'draft-case', status: 'draft', verifiedAt: null, publishedAt: null }));
  });
  const gateways = {
    paymob: new FakeGateway('paymob'),
    fawry: new FakeGateway('fawry'),
    stripe: new FakeGateway('stripe'),
    moyasar: new FakeGateway('moyasar'),
    instapay: new FakeGateway('instapay'),
  };
  const registry = new GatewayRegistry(Object.values(gateways));
  const fx = new StaticFx();
  const donations = new DonationsService({ db, gateways: registry, fx, clock, ids, config: TEST_CONFIG });
  return { clock, ids, db, gateways, registry, fx, donations };
}

let keyCounter = 0;
/** A fresh valid Idempotency-Key. */
export function key(label = 'donation'): string {
  keyCounter += 1;
  return `${label}-${String(keyCounter).padStart(12, '0')}`;
}
