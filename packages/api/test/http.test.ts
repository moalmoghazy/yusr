/**
 * End to end over real HTTP: the endpoint table served by dispatch(), driven by the
 * @yusr/sdk client the apps use, against the in-memory service graph (seeded demo data,
 * simulated gateways, dev object storage). Covers the contract between SDK and API,
 * auth and two-factor, maker-checker finance, uploads, caching, limits and errors.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { CreateDonationRequest } from '@yusr/core';
import { ApiError, createHttpAdminClient, createHttpAuthClient, createHttpClient } from '@yusr/sdk';
import { createServices, type Services } from '../src/app.services';
import { totpAt } from '../src/auth/totp';
import { ManualClock } from '../src/common/clock';
import { loadConfig } from '../src/config/env';
import { DEMO_TOTP_SECRET } from '../src/db/seed';
import { fullPath } from '../src/http/endpoint';
import { ENDPOINTS } from '../src/http/endpoints';
import type { LogChannels } from '../src/notifications/channels';
import { serve, type TestServer } from './support/http-server';

let services: Services;
let server: TestServer;
let api: string;
/** Starts at the real time (seed dates stay recent) and moves only when a test says so. */
const clock = new ManualClock(new Date());

before(async () => {
  let current: Services | null = null;
  server = await serve(ENDPOINTS, () => current!);
  api = `${server.url}/v1`;
  current = services = await createServices(
    loadConfig({ YUSR_STORAGE: 'memory', PUBLIC_API_URL: server.url, PUBLIC_WEB_URL: 'http://localhost:3000', PUBLIC_ADMIN_URL: 'http://localhost:3001' }),
    { clock, log: () => undefined },
  );
});

after(async () => {
  assert.deepEqual(server.errors, [], 'no request failed unexpectedly (5xx)');
  await services.close();
  await server.close();
});

// ---------------------------------------------------------------------------- helpers

async function call(
  method: string,
  path: string,
  init: { body?: unknown; token?: string; headers?: Record<string, string>; form?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.token) headers['authorization'] = `Bearer ${init.token}`;
  let body: string | undefined;
  if (init.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(init.form).toString();
  } else if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  const response = await fetch(path.startsWith('http') ? path : `${server.url}${path}`, { method, headers, body, redirect: 'manual' });
  const text = await response.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, text, json };
}

function lastCode(phone: string): string {
  const sms = [...(services.channels as LogChannels).sent].reverse().find((message) => message.to === phone && message.channel === 'sms');
  const code = sms && /\b(\d{6})\b/.exec(sms.text)?.[1];
  assert.ok(code, `an SMS code was sent to ${phone}`);
  return code;
}

/** Signs in through the SDK's auth client, exactly as the control hub and the mobile app do. */
async function signIn(phone: string, options: { totp?: boolean; name?: string } = {}) {
  const auth = authClient();
  const challenge = await auth.requestOtp(phone);
  assert.ok(challenge.expiresInSeconds > 0 && challenge.resendInSeconds > 0);
  return auth.verifyOtp({
    phone,
    code: lastCode(phone),
    ...(options.totp ? { totp: totpAt(DEMO_TOTP_SECRET, clock.now()) } : {}),
    ...(options.name ? { name: options.name } : {}),
  });
}

async function staffPhone(id: string): Promise<string> {
  const staff = await services.db.read.users.staff();
  const member = staff.find((user) => user.email === `${id}@yusr.example`);
  assert.ok(member?.phone, `seeded staff member ${id}`);
  return member.phone;
}

const clientFor = (token?: string) => createHttpClient({ baseUrl: api, getAccessToken: () => token ?? null, locale: 'ar' });
const authClient = () => createHttpAuthClient({ baseUrl: api, locale: 'en' });
const adminFor = (token: string) => createHttpAdminClient({ baseUrl: api, getAccessToken: () => token });

async function isApiError(promise: Promise<unknown>, code: string, status: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ApiError, String(error));
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return true;
  });
}

/** Pays a simulated checkout the way a donor would: open the page, press the button, follow the redirect. */
async function payCheckout(url: string, outcome: 'succeeded' | 'failed' = 'succeeded') {
  const page = await call('GET', url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  const done = await call('POST', url, { form: { outcome } });
  assert.equal(done.status, 303);
  return { page, location: done.headers.get('location')! };
}

async function donationRequest(overrides: Partial<CreateDonationRequest> = {}): Promise<CreateDonationRequest> {
  const page = await clientFor().listCases({ limit: 5 });
  const target = page.items.find((item) => item.currency === 'EGP')!;
  return {
    caseId: target.id,
    amountMinor: 500_00,
    currency: 'EGP',
    method: 'card',
    coverFees: true,
    anonymous: false,
    type: 'sadaqah',
    dedication: null,
    donor: { name: 'منى', email: 'mona@example.com', phone: null },
    locale: 'ar',
    returnUrl: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------- tests

describe('public catalog', () => {
  it('serves guests from the catalog, with shared caching and validated filters', async () => {
    const client = clientFor();
    const stats = await client.stats();
    assert.ok(stats.raisedMinor > 0 && stats.casesFunded > 0 && stats.donors > 0);

    const first = await call('GET', '/v1/stats');
    const second = await call('GET', '/v1/stats');
    assert.equal(second.headers.get('x-cache'), 'hit');
    assert.match(second.headers.get('cache-control') ?? '', /^public, max-age=60/);
    assert.equal(second.text, first.text);

    const medical = await client.listCases({ categories: ['medical'], limit: 5 });
    assert.ok(medical.items.length > 0 && medical.items.every((item) => item.category === 'medical'));
    const detail = await client.getCase(medical.items[0]!.slug);
    assert.equal(detail?.id, medical.items[0]!.id);
    assert.equal(await client.getCase('no-such-case'), null);

    const invalid = await call('GET', '/v1/cases?limit=500&categories=spaceships');
    assert.equal(invalid.status, 422);
    assert.equal(invalid.json.error.code, 'VALIDATION_FAILED');
    assert.deepEqual([...invalid.json.error.details.fields].sort(), ['categories.0', 'limit']);
    assert.equal(invalid.headers.get('cache-control'), 'no-store');
  });
});

describe('giving', () => {
  it('takes a guest donation through the hosted checkout to a receipt, idempotently', async () => {
    const client = clientFor();
    const request = await donationRequest();
    const created = await client.createDonation(request, { idempotencyKey: 'e2e-guest-donation-0001' });
    assert.equal(created.status, 'requires_action');
    assert.ok(created.action.type === 'redirect' && created.action.url.startsWith(`${server.url}/v1/dev/checkout/${created.receiptNumber}?`));

    const replay = await client.createDonation(request, { idempotencyKey: 'e2e-guest-donation-0001' });
    assert.equal(replay.donationId, created.donationId, 'same key and body → same donation');
    await isApiError(client.createDonation({ ...request, amountMinor: 900_00 }, { idempotencyKey: 'e2e-guest-donation-0001' }), 'IDEMPOTENCY_CONFLICT', 409);

    const url = created.action.type === 'redirect' ? created.action.url : '';
    const forged = await call('GET', url.replace(/sig=[^&]+/, 'sig=0000000000000000000000000000dead'));
    assert.equal(forged.status, 403, 'a checkout link with a forged return address is refused');

    const { page, location } = await payCheckout(url);
    assert.ok(page.text.includes(created.receiptNumber));
    assert.match(page.headers.get('content-security-policy') ?? '', /form-action 'self' http:\/\/localhost:3000/);
    assert.ok(location.startsWith(`http://localhost:3000/ar/receipt?donation=${created.donationId}&token=`));

    const receipt = await client.getDonation(created.donationId, created.receiptToken);
    assert.equal(receipt.status, 'succeeded');
    assert.equal(receipt.chargedMinor, created.breakdown.chargedMinor);
    await isApiError(client.getDonation(created.donationId), 'NOT_FOUND', 404);
    await isApiError(client.getDonation(created.donationId, 'x'.repeat(40)), 'NOT_FOUND', 404);
  });

  it('refuses donations that break the rules, with a code the app can translate', async () => {
    const client = clientFor();
    await isApiError(client.createDonation(await donationRequest({ amountMinor: 1 }), { idempotencyKey: 'e2e-too-small-000001' }), 'AMOUNT_TOO_LOW', 422);
    const missingKey = await call('POST', '/v1/donations', { body: await donationRequest() });
    assert.equal(missingKey.status, 422);
    assert.equal(missingKey.json.error.details.field, 'Idempotency-Key');
    const malformed = await call('POST', '/v1/donations', {
      body: { caseId: 'not-a-uuid', amountMinor: -5 },
      headers: { 'idempotency-key': 'e2e-malformed-00001' },
    });
    assert.equal(malformed.status, 422);
    assert.ok(malformed.json.error.details.fields.includes('caseId'));
  });
});

describe('accounts', () => {
  const phone = '+201099887766';

  it('signs a donor in with a phone code, rotates the session and shows their own giving', async () => {
    const session = await signIn(phone, { name: 'Omar' });
    assert.deepEqual(session.user.roles, ['donor']);
    const again = await call('POST', '/v1/auth/otp', { body: { phone, locale: 'en' } });
    assert.equal(again.status, 429);
    assert.ok(Number(again.headers.get('retry-after')) > 0);

    const client = clientFor(session.accessToken);
    const created = await client.createDonation(await donationRequest({ donor: null, anonymous: true }), { idempotencyKey: 'e2e-donor-donation-001' });
    await payCheckout(created.action.type === 'redirect' ? created.action.url : '');
    const mine = await client.myDonations();
    assert.ok(mine.some((donation) => donation.id === created.donationId && donation.status === 'succeeded'));
    await services.worker.tick();
    const inbox = await client.myNotifications();
    assert.ok(inbox.some((item) => item.kind === 'receipt' && item.receiptNumber === created.receiptNumber));

    const me = await call('GET', '/v1/me', { token: session.accessToken });
    assert.equal(me.json.name, 'Omar');

    const auth = authClient();
    const rotated = await auth.refresh(session.refreshToken);
    assert.notEqual(rotated.refreshToken, session.refreshToken);
    assert.equal(rotated.user.id, session.user.id);
    await isApiError(auth.refresh(session.refreshToken), 'SESSION_REVOKED', 401);
    await assert.rejects(
      auth.refresh(rotated.refreshToken),
      (error: unknown) => error instanceof ApiError && error.status === 401,
      'reuse revokes the whole login',
    );
  });

  it('ends a login on sign-out', async () => {
    const session = await signIn('+201011122233');
    const auth = authClient();
    await auth.logout(session.refreshToken);
    await assert.rejects(auth.refresh(session.refreshToken), (error: unknown) => error instanceof ApiError && error.status === 401);
  });

  it('keeps staff routes behind a staff session with two-factor authentication', async () => {
    const anonymous = await call('GET', '/v1/admin/overview');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.json.error.code, 'UNAUTHENTICATED');

    const donor = await signIn('+201055544433');
    await isApiError(adminFor(donor.accessToken).overview(), 'FORBIDDEN', 403);

    const bad = await call('GET', '/v1/admin/overview', { token: 'not.a.jwt' });
    assert.equal(bad.status, 401);

    const auditorWithoutMfa = await signIn(await staffPhone('aya'));
    const refused = await call('GET', '/v1/admin/overview', { token: auditorWithoutMfa.accessToken });
    assert.equal(refused.status, 403);
    assert.equal(refused.json.error.details.mfaRequired, true);

    const auditor = await staffPhone('mahmoud');
    await call('POST', '/v1/auth/otp', { body: { phone: auditor, locale: 'en' } });
    const noTotp = await call('POST', '/v1/auth/otp/verify', { body: { phone: auditor, code: lastCode(auditor) } });
    assert.equal(noTotp.status, 401);
    assert.equal(noTotp.json.error.details.mfaRequired, true);
    clock.advance(61_000); // past the resend cooldown, so the auditor can sign in properly later
  });
});

describe('operations', () => {
  let heba: string;
  let karim: string;
  let youssef: string;
  let mahmoud: string;
  let sara: string;

  before(async () => {
    // Codes are per phone and rate-limited, so each officer signs in once for the suite.
    heba = (await signIn(await staffPhone('heba'), { totp: true })).accessToken;
    karim = (await signIn(await staffPhone('karim'), { totp: true })).accessToken;
    youssef = (await signIn(await staffPhone('youssef'), { totp: true })).accessToken;
    mahmoud = (await signIn(await staffPhone('mahmoud'), { totp: true })).accessToken;
    sara = (await signIn(await staffPhone('sara'), { totp: true })).accessToken;
  });

  it('reconciles an InstaPay transfer only for the amount the donor was asked to send', async () => {
    const finance = adminFor(heba);
    const pending = (await finance.donations({ status: 'awaiting_transfer' })).find((donation) => donation.method === 'instapay');
    assert.ok(pending, 'the demo data has an InstaPay transfer waiting');
    await isApiError(finance.confirmTransfer(pending.id, 'CIB-7781203', pending.chargedMinor - 1_00), 'AMOUNT_MISMATCH', 422);
    const confirmed = await finance.confirmTransfer(pending.id, 'CIB-7781203', pending.chargedMinor);
    assert.equal(confirmed.status, 'succeeded');
    await isApiError(adminFor(youssef).confirmTransfer(pending.id, 'CIB-7781203', pending.chargedMinor), 'FORBIDDEN', 403);
  });

  it('pays a hospital through maker-checker and records it in the ledger and the audit log', async () => {
    const maker = adminFor(heba);
    const checker = adminFor(karim);
    const published = await maker.cases({ status: 'published' });
    const payable = (item: (typeof published)[number]) => item.disbursements.find((line) => line.status === 'planned' && line.amountMinor <= item.raisedMinor);
    const target = published.find((item) => payable(item));
    assert.ok(target, 'a case whose fund already covers a planned line');
    const line = payable(target)!;

    const payout = await maker.requestPayout(target.id, line.id);
    assert.equal(payout.status, 'requested');
    await isApiError(maker.approvePayout(payout.id), 'SELF_APPROVAL_FORBIDDEN', 403);
    const approved = await checker.approvePayout(payout.id);
    assert.equal(approved.approvedBy?.name, 'كريم سامي');
    await isApiError(maker.markPayoutPaid(payout.id, ''), 'VALIDATION_FAILED', 422);
    const paid = await maker.markPayoutPaid(payout.id, 'CIB-TRX-99120');
    assert.equal(paid.status, 'paid');

    const ledger = await maker.ledger({ kind: 'payout', limit: 50 });
    const posted = ledger.filter((entry) => entry.reference === payout.reference);
    assert.equal(posted.length, 2, 'one debit and one credit');
    assert.equal(
      posted.reduce((sum, entry) => sum + (entry.direction === 'debit' ? entry.amountMinor : -entry.amountMinor), 0),
      0,
    );
    const audit = await call('GET', '/v1/admin/audit?limit=30', { token: heba });
    assert.equal(audit.status, 403, 'finance officers do not read the audit log');
    const trail = await adminFor(sara).audit(30);
    assert.ok(trail.some((entry) => entry.action === 'payout.paid' && entry.entityLabel === payout.reference));
  });

  it('accepts a submission with documents uploaded straight to storage, and audits every look at the original', async () => {
    const volunteer = await signIn('+201066677788', { name: 'Hala' });
    const client = clientFor(volunteer.accessToken);
    const bytes = Buffer.from('%PDF-1.7\n% medical report for the demo\n');
    const ticket = await client.presignUpload({ kind: 'medical_report', contentType: 'application/pdf', sizeBytes: bytes.length });
    assert.ok(ticket.key.startsWith(`uploads/${volunteer.user.id}/`));

    const tampered = await fetch(ticket.url.replace(/sig=[^&]+/, 'sig=nope'), { method: 'PUT', headers: ticket.headers, body: bytes });
    assert.equal(tampered.status, 403);
    const uploaded = await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: bytes });
    assert.equal(uploaded.status, 200);

    const result = await client.submitCase({
      category: 'medical',
      submitterRelation: 'volunteer',
      title: { ar: 'غسيل كلوي منتظم لأب من أسيوط' },
      story: { ar: 'يحتاج الأب إلى ثلاث جلسات غسيل كلوي أسبوعيًا، والأسرة لا تملك تكلفة المواصلات والأدوية بعد توقفه عن العمل. '.repeat(2) },
      region: 'EG-AST',
      currency: 'EGP',
      goalMinor: 36_000_00,
      isUrgent: false,
      deadline: null,
      beneficiary: { pseudonym: { ar: 'أبو محمود' }, nationalId: '27501011234567', householdSize: 5 },
      documents: [{ kind: 'medical_report', storageKey: ticket.key, sha256: createHash('sha256').update(bytes).digest('hex') }],
      consent: true,
    });
    assert.equal(result.status, 'under_review');
    assert.equal(result.possibleDuplicate, false);

    const submitted = await call('GET', `/v1/admin/cases/${result.id}`, { token: youssef });
    assert.equal(submitted.status, 200, submitted.text);
    assert.equal(submitted.json.beneficiary.ar, 'أبو محمود');
    const documentId = submitted.json.documents[0].id as string;
    const moderator = await call('GET', `/v1/admin/documents/${documentId}/original`, { token: youssef });
    assert.equal(moderator.status, 403, 'moderators work with redacted copies only');
    assert.equal(moderator.json.error.details.permission, 'documents:read_private');
    const link = await call('GET', `/v1/admin/documents/${documentId}/original`, { token: mahmoud });
    assert.equal(link.status, 200, link.text);
    const original = await fetch(link.json.url);
    assert.equal(original.status, 200);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
    assert.equal((await fetch(link.json.url.replace(/sig=[^&]+/, 'sig=x'))).status, 403);
    const views = await services.db.read.audit.list({ limit: 5 });
    assert.ok(views.some((row) => row.action === 'document.viewed' && row.entityId === result.id));
  });
});

describe('contract', () => {
  it('publishes every non-development route in OpenAPI, from the same schemas', async () => {
    const response = await call('GET', '/v1/openapi.json');
    assert.equal(response.status, 200);
    const document = response.json;
    assert.equal(document.openapi, '3.1.0');
    const operations = Object.values(document.paths as Record<string, Record<string, { operationId: string }>>).flatMap((item) =>
      Object.values(item).map((operation) => operation.operationId),
    );
    const expected = ENDPOINTS.filter((route) => route.tag !== 'Development').map((route) => route.id);
    assert.deepEqual([...operations].sort(), [...expected].sort());
    const create = document.paths['/v1/donations'].post;
    assert.ok(create.requestBody.content['application/json'].schema.properties.amountMinor);
    assert.ok(create.parameters.some((parameter: { name: string; required: boolean }) => parameter.name === 'Idempotency-Key' && parameter.required));
  });

  it('keeps routes and operation ids unique', () => {
    const ids = ENDPOINTS.map((route) => route.id);
    assert.equal(new Set(ids).size, ids.length);
    const routes = ENDPOINTS.map((route) => `${route.method} ${fullPath(route)}`);
    assert.equal(new Set(routes).size, routes.length);
  });

  it('answers webhooks only with a valid signature, and unknown routes with a problem', async () => {
    const unsigned = await call('POST', '/v1/webhooks/paymob', { body: { obj: { id: 1 } } });
    assert.equal(unsigned.status, 401);
    assert.equal(unsigned.json.error.code, 'INVALID_SIGNATURE');
    assert.equal((await call('POST', '/v1/webhooks/bitcoin', { body: {} })).status, 404);
    const missing = await call('GET', '/v1/nothing-here');
    assert.equal(missing.status, 404);
    assert.equal(missing.json.error.code, 'NOT_FOUND');
    const health = await call('GET', '/health/ready');
    assert.deepEqual(health.json, { status: 'ok', database: true, cache: true });
  });
});
