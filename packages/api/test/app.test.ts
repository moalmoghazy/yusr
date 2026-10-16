/**
 * Boots the whole service graph in memory mode (what `YUSR_STORAGE=memory pnpm dev` runs)
 * and walks a donation through the simulated gateway: create → signed webhook → ledger →
 * receipt → outbox delivery. No NestJS, PostgreSQL or Redis involved.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createServices } from '../src/app.services';
import { ManualClock } from '../src/common/clock';
import { loadConfig } from '../src/config/env';
import { problemFor } from '../src/http/problem';
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
