/**
 * Boots the whole service graph in memory mode (what `YUSR_STORAGE=memory pnpm dev` runs)
 * and walks a donation through the simulated gateway: create → signed webhook → ledger →
 * receipt → outbox delivery. No NestJS, PostgreSQL or Redis involved.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createServices } from '../src/app.services';
import { ManualClock } from '../src/common/clock';
import { isLocalDatabase, loadConfig } from '../src/config/env';
import { mapPgError, parseCursor } from '../src/db/drizzle';
import { clientIp, dispatch } from '../src/http/dispatch';
import { endpoint, type RawRequest } from '../src/http/endpoint';
import { problemFor } from '../src/http/problem';
import { HttpChannels, LogChannels } from '../src/notifications/channels';
import type { FetchLike } from '../src/payments/gateway';
import { DomainError, DOMAIN_ERROR_CODES } from '@yusr/core';

describe('service graph in memory mode', () => {
  it('runs a full donation with the simulated gateway', async () => {
    const clock = new ManualClock('2026-09-26T09:00:00Z');
    const sent: string[] = [];
    const services = await createServices(loadConfig({ YUSR_STORAGE: 'memory', PUBLIC_API_URL: 'http://localhost:4000' }), {
      clock,
      log: (line) => sent.push(line),
    });
    try {
      const page = await services.cases.list({ limit: 3 });
      const target = page.items[0]!;
      const created = await services.donations.create(
        {
          caseId: target.id,
          amountMinor: 250_00,
          currency: 'EGP',
          method: 'card',
          coverFees: true,
          anonymous: false,
          type: 'sadaqah',
          dedication: null,
          donor: { name: 'زائر', email: 'guest@example.com', phone: null },
          locale: 'ar',
          returnUrl: null,
        },
        { actor: null, idempotencyKey: 'integration-test-key-0001' },
      );
      assert.equal(created.action.type, 'redirect');
      assert.match(created.action.type === 'redirect' ? created.action.url : '', /^http:\/\/localhost:4000\/v1\/dev\/checkout\/YSR-2026-/);

      const simulator = services.simulators.get('paymob')!;
      const body = JSON.stringify({
        eventId: 'sim-1',
        reference: created.receiptNumber,
        outcome: 'succeeded',
        amountMinor: created.breakdown.chargedMinor,
        currency: 'EGP',
      });
      const result = await services.donations.handleWebhook('paymob', {
        rawBody: Buffer.from(body),
        headers: { 'x-yusr-simulator-signature': simulator.sign(body) },
        query: {},
      });
      assert.equal(result.status, 'processed');

      const receipt = await services.donations.receipt(created.donationId, { actor: null, token: created.receiptToken });
      assert.equal(receipt.status, 'succeeded');
      assert.ok((await services.worker.tick()) > 0);
      assert.ok(sent.some((line) => line.startsWith('[email] → guest@example.com')));

      const ready = await services.ready();
      assert.deepEqual(ready, { database: true, cache: true });
      const stats = await services.admin.publicStats();
      assert.ok(stats.raisedMinor > 0 && stats.casesFunded > 0);
      assert.ok((await services.donations.live(5)).length === 5);
    } finally {
      await services.close();
    }
  });

  it('refuses to start in production without secrets or with demo storage', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /Missing configuration: .*JWT_SECRET/);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', YUSR_STORAGE: 'memory' }), /development only/);
  });

  it('accepts the development secrets only with a database on this machine', () => {
    const local = loadConfig({ DATABASE_URL: 'postgres://yusr:yusr@localhost:5432/yusr' });
    assert.equal(local.auth.otpPepper, 'dev-only-otp-pepper');
    assert.equal(local.payments.simulatorSecret, 'dev-only-simulator-secret');
    assert.ok(loadConfig({ DATABASE_URL: 'postgres://yusr:yusr@127.0.0.1/yusr' }));
    assert.ok(loadConfig({ YUSR_STORAGE: 'memory' }));

    for (const url of ['postgres://yusr:pw@db.internal:5432/yusr', 'postgres://u:p@10.0.0.4/yusr', 'postgres://u:p@prod.example.com/yusr?sslmode=require']) {
      assert.throws(() => loadConfig({ DATABASE_URL: url }), /Missing configuration: .*JWT_SECRET.*OTP_PEPPER.*YUSR_ALLOW_DEV_SECRETS/, url);
    }
    const allowed = loadConfig({ DATABASE_URL: 'postgres://u:p@db.internal/yusr', YUSR_ALLOW_DEV_SECRETS: 'true' });
    assert.equal(allowed.auth.otpPepper, 'dev-only-otp-pepper', 'an explicit, throwaway staging override');
    assert.notEqual(allowed.payments.simulatorSecret, 'dev-only-simulator-secret', 'the simulator secret is never the public one there');
    assert.throws(() => loadConfig({ NODE_ENV: 'production', YUSR_ALLOW_DEV_SECRETS: 'true' }), /Missing configuration: .*JWT_SECRET/, 'never in production');

    assert.equal(isLocalDatabase(undefined), true);
    assert.equal(isLocalDatabase('postgres://u:p@[::1]:5432/yusr'), true);
    assert.equal(isLocalDatabase('postgres://u:p@localhost.evil.example/yusr'), false);
    assert.equal(isLocalDatabase('not a url'), false);
  });

  it('needs an SMS or WhatsApp provider in production, and reads the sign-in code limits', () => {
    const production = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@db.internal/yusr',
      JWT_SECRET: 'j',
      OTP_PEPPER: 'o',
      NATIONAL_ID_PEPPER: 'n',
      RECEIPT_TOKEN_SECRET: 'r',
      DATA_KEY_BASE64: Buffer.alloc(32, 1).toString('base64'),
      STRIPE_SECRET_KEY: 'sk',
      STRIPE_PUBLISHABLE_KEY: 'pk',
      STRIPE_WEBHOOK_SECRET: 'wh',
      S3_ENDPOINT: 'https://s3.example',
      S3_ACCESS_KEY_ID: 'a',
      S3_SECRET_ACCESS_KEY: 's',
    };
    assert.throws(() => loadConfig(production), /an SMS or WhatsApp provider/);
    const withSms = loadConfig({ ...production, SMS_PROVIDER_URL: 'https://sms.example/send', SMS_PROVIDER_TOKEN: 't' });
    assert.deepEqual(withSms.auth.otpCountryCodes, ['20', '966']);
    assert.equal(withSms.auth.otpHourlyBudget, 1_000);
    assert.equal(withSms.edgeSecret, null);
    const tuned = loadConfig({
      ...production,
      WHATSAPP_PHONE_NUMBER_ID: '1',
      WHATSAPP_TOKEN: 't',
      YUSR_OTP_COUNTRY_CODES: '+20, 966, 971',
      YUSR_OTP_HOURLY_BUDGET: '250',
      YUSR_EDGE_SECRET: 'edge',
    });
    assert.deepEqual(tuned.auth.otpCountryCodes, ['20', '966', '971']);
    assert.equal(tuned.auth.otpHourlyBudget, 250);
    assert.equal(tuned.edgeSecret, 'edge');
    assert.throws(() => loadConfig({ ...production, WHATSAPP_PHONE_NUMBER_ID: '1', WHATSAPP_TOKEN: 't', YUSR_OTP_COUNTRY_CODES: 'EG' }), /calling codes/);
  });

  it('runs a public demo on memory data with the payment simulator only', () => {
    const secrets = {
      JWT_SECRET: 'j',
      OTP_PEPPER: 'o',
      NATIONAL_ID_PEPPER: 'n',
      RECEIPT_TOKEN_SECRET: 'r',
      DATA_KEY_BASE64: Buffer.alloc(32, 1).toString('base64'),
    };
    const demo = loadConfig({
      NODE_ENV: 'production',
      YUSR_DEMO: 'true',
      YUSR_STORAGE: 'memory',
      STRIPE_SECRET_KEY: 'sk_live_x',
      STRIPE_PUBLISHABLE_KEY: 'pk_live_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      RENDER_EXTERNAL_URL: 'https://yusr-api.onrender.com',
      ...secrets,
    });
    assert.equal(demo.demo, true);
    assert.equal(demo.payments.mode, 'simulated', 'real gateway keys are ignored in a demo');
    assert.equal(demo.urls.api, 'https://yusr-api.onrender.com', "Render's public URL");
    assert.notEqual(demo.payments.simulatorSecret, 'dev-only-simulator-secret', 'without SIMULATOR_SECRET a demo makes up its own');
    assert.match(demo.payments.simulatorSecret, /^[\w-]{43}$/);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', YUSR_DEMO: 'true', ...secrets }), /needs YUSR_STORAGE=memory/, 'never with a real database');
    assert.throws(
      () => loadConfig({ NODE_ENV: 'production', YUSR_DEMO: 'true', YUSR_STORAGE: 'memory' }),
      /Missing configuration: .*JWT_SECRET/,
      'still needs real secrets',
    );
  });
});

describe('HTTP error contract', () => {
  it('maps every domain error to a status and the body the SDK parses', () => {
    for (const code of DOMAIN_ERROR_CODES) {
      const problem = problemFor(new DomainError(code), 'req-1');
      assert.ok(problem.status >= 400 && problem.status < 600, code);
      assert.equal(problem.body.error.code, code);
      assert.equal(problem.body.requestId, 'req-1');
    }
    const limited = problemFor(new DomainError('RATE_LIMITED', undefined, { retryAfterSeconds: 42.2, secret: 'x' }), null);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers['retry-after'], '43');
    assert.deepEqual(limited.body.error.details, { retryAfterSeconds: 42.2 });
    const upstream = problemFor(new DomainError('PAYMENT_PROVIDER_ERROR', 'paymob said: card 4111… declined for Mona'), null);
    assert.equal(upstream.status, 502);
    assert.equal(upstream.body.error.message, 'Payment provider unavailable');
    assert.equal(problemFor(new Error('boom'), null).status, 500);
  });
});

describe('development channels', () => {
  it('masks sign-in codes and recipients outside a developer machine, and keeps a bounded history', async () => {
    const lines: string[] = [];
    const channels = new LogChannels((line) => lines.push(line), { keep: 3 });
    await channels.sendOtp('+201001234567', '482913', 'en');
    await channels.email('mona@example.com', 'Your receipt', 'Thank you.');
    assert.equal(lines.join('\n').includes('482913'), false, 'no code in the log');
    assert.equal(lines.join('\n').includes('+201001234567'), false, 'no phone number in the log');
    assert.match(lines[0]!, /^\[sms\] → •+4567: Yusr code: •{6}\./);
    assert.equal(lines.join('\n').includes('mona@example.com'), false);
    for (let i = 0; i < 5; i += 1) await channels.push(`u${i}`, 'hello');
    assert.equal(channels.sent.length, 3);
    assert.equal(channels.sent.at(-1)?.to, 'u4');

    const dev: string[] = [];
    await new LogChannels((line) => dev.push(line), { reveal: true }).sendOtp('+201001234567', '482913', 'en');
    assert.match(dev[0]!, /\+201001234567: Yusr code: 482913/, 'a developer signs in from the terminal');
  });

  it('sends sign-in codes by WhatsApp when no SMS provider is set', async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      calls.push(String(input));
      return new Response('{}', { status: 200 });
    };
    await new HttpChannels({ whatsapp: { phoneNumberId: '123', token: 't' } }, fetchImpl).sendOtp('+201001234567', '482913', 'ar');
    assert.deepEqual(calls, ['https://graph.facebook.com/v21.0/123/messages']);
    await assert.rejects(new HttpChannels({ email: { apiKey: 'k', from: 'x' } }, fetchImpl).sendOtp('+201001234567', '482913', 'ar'));
  });
});

describe('request pipeline', () => {
  const request = (overrides: Partial<RawRequest> = {}): RawRequest => ({
    method: 'GET',
    path: '/v1/probe',
    params: {},
    query: {},
    headers: {},
    body: undefined,
    rawBody: null,
    ip: '10.0.0.5',
    requestId: 'req',
    ...overrides,
  });

  it('takes the visitor IP from the website server only when it proves itself with the edge secret', async () => {
    const forwarded = { 'x-yusr-edge-secret': 'edge-secret', 'x-yusr-client-ip': '41.33.1.1' };
    assert.equal(clientIp(request({ headers: forwarded }), 'edge-secret'), '41.33.1.1');
    assert.equal(clientIp(request({ headers: { ...forwarded, 'x-yusr-edge-secret': 'guess' } }), 'edge-secret'), '10.0.0.5');
    assert.equal(clientIp(request({ headers: forwarded }), null), '10.0.0.5', 'ignored when no edge secret is configured');
    assert.equal(clientIp(request({ headers: { ...forwarded, 'x-yusr-client-ip': 'not-an-ip' } }), 'edge-secret'), '10.0.0.5');
    assert.equal(clientIp(request({ headers: { ...forwarded, 'x-yusr-client-ip': '2001:db8::1' } }), 'edge-secret'), '2001:db8::1');

    const services = await createServices(loadConfig({ YUSR_STORAGE: 'memory', YUSR_EDGE_SECRET: 'edge-secret' }), { log: () => undefined });
    try {
      const seen: Array<string | null | undefined> = [];
      const route = endpoint({
        id: 'test.probe',
        method: 'GET',
        path: '/probe',
        version: '1',
        access: 'public',
        tag: 'Test',
        summary: 'probe',
        rateLimit: { name: 'test:probe', limit: 1, windowSeconds: 60, by: 'ip' },
        handle: async ({ ctx }) => {
          seen.push(ctx.ip);
          return { ok: true };
        },
      });
      const from = (ip: string, secret = 'edge-secret') =>
        dispatch(route, request({ headers: { 'x-yusr-edge-secret': secret, 'x-yusr-client-ip': ip } }), { services });
      assert.equal((await from('41.33.1.1')).status, 200);
      assert.equal((await from('41.33.1.2')).status, 200, 'two visitors behind one website server have their own limits');
      assert.equal((await from('41.33.1.1')).status, 429);
      assert.deepEqual(seen, ['41.33.1.1', '41.33.1.2']);
      assert.equal((await from('41.33.1.3', 'wrong')).status, 200, 'without the secret the server address counts');
      assert.equal((await from('41.33.1.4', 'wrong')).status, 429);
    } finally {
      await services.close();
    }
  });

  it('answers 404 for record ids that are not UUIDs, before any query runs', async () => {
    const services = await createServices(loadConfig({ YUSR_STORAGE: 'memory' }), { log: () => undefined });
    try {
      let called = 0;
      const route = endpoint({
        id: 'test.byId',
        method: 'GET',
        path: '/things/:id',
        version: '1',
        access: 'public',
        tag: 'Test',
        summary: 'by id',
        handle: async () => {
          called += 1;
          return { ok: true };
        },
      });
      for (const id of ['1', "x' OR 1=1", '__proto__', '00000000-0000-7000-8000-00000000000g']) {
        const result = await dispatch(route, request({ params: { id } }), { services });
        assert.equal(result.status, 404, id);
      }
      assert.equal(called, 0);
      assert.equal((await dispatch(route, request({ params: { id: '00000000-0000-7000-8000-000000000001' } }), { services })).status, 200);
    } finally {
      await services.close();
    }
  });
});

describe('PostgreSQL helpers', () => {
  it('reads page cursors as non-negative offsets only', () => {
    assert.equal(parseCursor(undefined), 0);
    assert.equal(parseCursor('24'), 24);
    assert.equal(parseCursor('-5'), 0);
    assert.equal(parseCursor('1e9'), 0);
    assert.equal(parseCursor('99999999999999'), 0);
  });

  it('never passes PostgreSQL wording or constraint names to clients', () => {
    const unique = mapPgError({ code: '23505', constraint: 'users_phone_key', message: 'duplicate key value violates unique constraint "users_phone_key"' });
    assert.ok(DomainError.is(unique, 'VALIDATION_FAILED'));
    assert.equal(unique.message.includes('users_phone_key'), false);
    assert.equal(unique.details, undefined);
    const check = mapPgError({ code: '23514', constraint: 'cases_goal_positive', message: 'new row for relation "cases" violates check constraint' });
    assert.ok(DomainError.is(check, 'VALIDATION_FAILED') && !check.message.includes('cases'));
    assert.ok(DomainError.is(mapPgError({ code: '22P02', message: 'invalid input syntax for type uuid: "x"' }), 'VALIDATION_FAILED'));
    const overdrawn = mapPgError({ code: 'P0001', message: 'case fund 0190… would be overdrawn by 500 EGP' });
    assert.ok(DomainError.is(overdrawn, 'INSUFFICIENT_CASE_FUNDS') && !overdrawn.message.includes('0190'));
    assert.ok(DomainError.is(mapPgError({ code: '23505', constraint: 'donations_idempotency_key_key' }), 'IDEMPOTENCY_CONFLICT'));
  });
});
