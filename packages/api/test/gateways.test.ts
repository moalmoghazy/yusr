import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { DomainError } from '@yusr/core';
import type { CheckoutRequest, FetchLike, WebhookInput } from '../src/payments/gateway';
import { majorToMinor, minorToMajorString } from '../src/payments/gateway';
import { FawryGateway, egyptianMobile } from '../src/payments/gateways/fawry.gateway';
import { InstapayGateway } from '../src/payments/gateways/instapay.gateway';
import { MoyasarGateway } from '../src/payments/gateways/moyasar.gateway';
import { PaymobGateway, paymobSignature } from '../src/payments/gateways/paymob.gateway';
import { StripeGateway, parseStripeSignature } from '../src/payments/gateways/stripe.gateway';

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** A fetch double that records requests and answers with canned JSON. */
function fakeFetch(respond: (request: Recorded) => unknown, status = 200) {
  const calls: Recorded[] = [];
  const impl: FetchLike = async (input, init) => {
    const request: Recorded = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
      body: typeof init?.body === 'string' ? init.body : '',
    };
    calls.push(request);
    return new Response(JSON.stringify(respond(request)), { status, headers: { 'content-type': 'application/json' } });
  };
  return { impl, calls };
}

const checkout = (overrides: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
  donationId: '0190f0f0-0000-7000-8000-000000000001',
  reference: 'YSR-2026-000123',
  method: 'card',
  currency: 'EGP',
  amountMinor: 1_287_50,
  description: 'Donation to case YSR-10482',
  customer: { name: 'Mona Adel Hassan', email: 'mona@example.com', phone: '+201001234567' },
  locale: 'en',
  returnUrl: 'https://yusr.example/en/receipt?donation=x',
  notificationUrl: 'https://api.yusr.example/v1/webhooks/paymob',
  expiresAt: new Date('2026-09-26T09:30:00Z'),
  idempotencyKey: 'checkout-0190f0f0',
  ...overrides,
});

const input = (body: unknown, headers: WebhookInput['headers'] = {}, query: WebhookInput['query'] = {}): WebhookInput => ({
  rawBody: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  headers,
  query,
});

const invalidSignature = (error: unknown) => DomainError.is(error, 'INVALID_SIGNATURE');

describe('money helpers', () => {
  it('converts between provider decimal strings and minor units exactly', () => {
    assert.equal(majorToMinor('1250.5'), 125_050);
    assert.equal(majorToMinor(0.1 + 0.2), 30);
    assert.equal(minorToMajorString(125_050), '1250.50');
    assert.equal(minorToMajorString(7), '0.07');
    assert.equal(egyptianMobile('+201001234567'), '01001234567');
    assert.equal(egyptianMobile('+966501234567'), undefined);
  });
});

describe('Paymob', () => {
  const config = {
    secretKey: 'egy_sk_test',
    publicKey: 'egy_pk_test',
    hmacSecret: 'paymob-hmac-secret',
    integrations: { card: 4_101, wallet: 4_102, applePay: 4_103 },
  };
  const transaction = {
    id: 192_036_465,
    pending: false,
    amount_cents: 128_750,
    success: true,
    is_auth: false,
    is_capture: false,
    is_standalone_payment: true,
    is_voided: false,
    is_refunded: false,
    is_3d_secure: true,
    integration_id: 4_101,
    has_parent_transaction: false,
    error_occured: false,
    currency: 'EGP',
    owner: 302_852,
    created_at: '2026-09-26T09:03:11.412094',
    order: { id: 217_503_754, merchant_order_id: 'YSR-2026-000123' },
    source_data: { pan: '2346', type: 'card', sub_type: 'MasterCard' },
    data: { message: 'Approved' },
  };
  // Written out independently of the implementation, in Paymob's documented field order.
  const expectedHmac = createHmac('sha512', config.hmacSecret)
    .update('1287502026-09-26T09:03:11.412094EGPfalsefalse1920364654101truefalsefalsefalsetruefalse217503754302852false2346MasterCardcardtrue')
    .digest('hex');

  /** Paymob's API answering the server-to-server lookup with `stored` (the callback body is never trusted). */
  const paymobApi = (stored: Record<string, unknown> = transaction) =>
    fakeFetch((request) =>
      request.url.includes('/api/acceptance/transactions/') ? stored : { id: 'pi_test_1', client_secret: 'egy_csk_test_abc', intention_order_id: 217_503_754 },
    );
  const signed = (obj: Record<string, unknown>, hmac = expectedHmac) => input({ type: 'TRANSACTION', obj }, {}, { hmac });

  it('creates an intention and redirects to the unified checkout', async () => {
    const { impl, calls } = paymobApi();
    const gateway = new PaymobGateway(config, impl, () => new Date('2026-09-26T09:00:00Z'));
    const result = await gateway.createCheckout(checkout({ method: 'vodafone_cash' }));
    assert.equal(calls[0]?.url, 'https://accept.paymob.com/v1/intention/');
    assert.equal(calls[0]?.headers['authorization'], 'Token egy_sk_test');
    const body = JSON.parse(calls[0]!.body);
    assert.equal(body.amount, 1_287_50);
    assert.deepEqual(body.payment_methods, [4_102]);
    assert.equal(body.special_reference, 'YSR-2026-000123');
    assert.equal(body.expiration, 1_800);
    assert.equal(body.billing_data.first_name, 'Mona');
    assert.equal(body.billing_data.last_name, 'Adel Hassan');
    assert.deepEqual(result, {
      providerRef: 'pi_test_1',
      providerOrderRef: '217503754',
      status: 'requires_action',
      action: { type: 'redirect', provider: 'paymob', url: 'https://accept.paymob.com/unifiedcheckout/?publicKey=egy_pk_test&clientSecret=egy_csk_test_abc' },
    });
  });

  it('refuses a checkout whose intention has no order to match callbacks by', async () => {
    const { impl } = fakeFetch(() => ({ id: 'pi_test_1', client_secret: 'egy_csk_test_abc' }));
    await assert.rejects(new PaymobGateway(config, impl).createCheckout(checkout()), (error: unknown) => DomainError.is(error, 'PAYMENT_PROVIDER_ERROR'));
  });

  it('verifies the HMAC-SHA512 of a transaction callback, then reads the transaction back from Paymob', async () => {
    const { impl, calls } = paymobApi();
    const event = await new PaymobGateway(config, impl).parseWebhook(signed(transaction));
    assert.equal(calls[0]?.url, 'https://accept.paymob.com/api/acceptance/transactions/192036465');
    assert.equal(calls[0]?.method, 'GET');
    assert.equal(calls[0]?.headers['authorization'], 'Token egy_sk_test');
    assert.equal(event.outcome, 'succeeded');
    assert.equal(event.reference, 'YSR-2026-000123');
    assert.equal(event.providerOrderRef, '217503754');
    assert.equal(event.amountMinor, 128_750);
    assert.equal(event.providerRef, '192036465');
    assert.equal(event.eventId, '192036465:true:false:false:false');
  });

  it('takes the amount and status from Paymob, not from the callback', async () => {
    const { impl } = paymobApi({ ...transaction, amount_cents: 100, success: false, pending: true });
    const event = await new PaymobGateway(config, impl).parseWebhook(signed(transaction));
    assert.equal(event.amountMinor, 100);
    assert.equal(event.outcome, 'pending');
    assert.equal(event.eventId, '192036465:false:true:false:false', 'a later pending → paid callback is a new event');
  });

  it('rejects a tampered amount or a missing signature', async () => {
    const { impl, calls } = paymobApi();
    const gateway = new PaymobGateway(config, impl);
    await assert.rejects(gateway.parseWebhook(signed({ ...transaction, amount_cents: 1 })), invalidSignature);
    await assert.rejects(gateway.parseWebhook(input({ type: 'TRANSACTION', obj: transaction })), invalidSignature);
    assert.equal(calls.length, 0);
  });

  it('rejects callbacks whose signed digits were shifted between fields', async () => {
    const { impl, calls } = paymobApi();
    const gateway = new PaymobGateway(config, impl);
    const forgeries = [
      // created_at's first digit moved into amount_cents: 1,287,502 instead of 128,750.
      { ...transaction, amount_cents: 1_287_502, created_at: '026-09-26T09:03:11.412094' },
      // integration_id's first digit moved into id: points at another transaction.
      { ...transaction, id: 1_920_364_654, integration_id: 101 },
      // is_voided's text swallowed the order id's first digit: points at another order.
      { ...transaction, is_voided: 'false2', order: { id: 17_503_754, merchant_order_id: 'YSR-2026-000999' } },
    ];
    for (const forged of forgeries) {
      assert.equal(paymobSignature(forged, config.hmacSecret), expectedHmac, 'the separator-less HMAC still matches');
      await assert.rejects(gateway.parseWebhook(signed(forged)), invalidSignature);
    }
    assert.equal(calls.length, 1, 'only the plausible forgery reached Paymob, which disagreed');
  });

  it('rejects a callback that Paymob does not confirm', async () => {
    const { impl } = paymobApi({ ...transaction, order: { id: 217_503_999, merchant_order_id: 'YSR-2026-000123' } });
    await assert.rejects(new PaymobGateway(config, impl).parseWebhook(signed(transaction)), invalidSignature);
  });

  it('refunds by transaction id', async () => {
    const { impl, calls } = fakeFetch(() => ({ id: 192_040_001, pending: false, success: true }));
    const result = await new PaymobGateway(config, impl).refund({
      providerRef: '192036465',
      reference: 'YSR-2026-000123',
      amountMinor: 500_00,
      currency: 'EGP',
      reason: 'donor request',
      idempotencyKey: 'rf-1',
    });
    assert.equal(calls[0]?.url, 'https://accept.paymob.com/api/acceptance/void_refund/refund');
    assert.deepEqual(JSON.parse(calls[0]!.body), { transaction_id: '192036465', amount_cents: 500_00 });
    assert.deepEqual(result, { providerRef: '192040001', status: 'processed' });
  });
});

describe('Fawry', () => {
  const config = { baseUrl: 'https://atfawry.fawrystaging.com', merchantCode: 'siYxylRjSPyU', secureKey: 'fawry-secure-key' };

  it('signs the PAYATFAWRY charge and returns the outlet reference', async () => {
    const { impl, calls } = fakeFetch(() => ({
      type: 'ChargeResponse',
      referenceNumber: 963_455_678,
      merchantRefNumber: 'YSR-2026-000123',
      expirationTime: 1_790_500_000_000,
      statusCode: 200,
      statusDescription: 'Operation done successfully',
    }));
    const gateway = new FawryGateway(config, impl);
    const result = await gateway.createCheckout(checkout({ method: 'fawry' }));
    const body = JSON.parse(calls[0]!.body);
    const expected = createHash('sha256').update('siYxylRjSPyUYSR-2026-000123PAYATFAWRY1287.50fawry-secure-key').digest('hex');
    assert.equal(body.signature, expected);
    assert.equal(body.amount, '1287.50');
    assert.equal(body.customerMobile, '01001234567');
    assert.equal(calls[0]?.url, 'https://atfawry.fawrystaging.com/ECommerceWeb/Fawry/payments/charge');
    assert.deepEqual(result.action, { type: 'fawry_reference', referenceNumber: '963455678', expiresAt: new Date(1_790_500_000_000).toISOString() });
    assert.equal(result.status, 'awaiting_transfer');
  });

  it('verifies the V2 notification signature and reads the fee', () => {
    const gateway = new FawryGateway(config);
    const notification = {
      requestId: 'c72827d084ea4b88949d91dd2db4996e',
      fawryRefNumber: '963455678',
      merchantRefNumber: 'YSR-2026-000123',
      paymentAmount: 1287.5,
      orderAmount: 1287.5,
      fawryFees: 20.3,
      orderStatus: 'PAID',
      paymentMethod: 'PayAtFawry',
      paymentRefrenceNumber: '24002193',
    };
    const signature = createHash('sha256').update('963455678YSR-2026-0001231287.501287.50PAIDPayAtFawry24002193fawry-secure-key').digest('hex');
    const event = gateway.parseWebhook(input({ ...notification, messageSignature: signature }));
    assert.equal(event.outcome, 'succeeded');
    assert.equal(event.amountMinor, 128_750);
    assert.equal(event.feeMinor, 20_30);
    assert.equal(event.eventId, '963455678:PAID');
    assert.throws(() => gateway.parseWebhook(input({ ...notification, paymentAmount: 1, messageSignature: signature })), invalidSignature);

    const expiredSignature = createHash('sha256').update('963455678YSR-2026-0001231287.501287.50EXPIREDPayAtFawryfawry-secure-key').digest('hex');
    const { paymentRefrenceNumber: _unused, ...unpaid } = notification;
    const expired = gateway.parseWebhook(input({ ...unpaid, orderStatus: 'EXPIRED', messageSignature: expiredSignature }));
    assert.equal(expired.outcome, 'expired');
  });
});

describe('Stripe', () => {
  const config = { secretKey: 'sk_test_123', publishableKey: 'pk_test_123', webhookSecret: 'whsec_test_secret' };
  const now = new Date('2026-09-26T09:05:00Z');
  const timestamp = Math.floor(now.getTime() / 1000);
  const event = {
    id: 'evt_3Q1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_3Q1',
        object: 'payment_intent',
        amount: 51_75,
        amount_received: 51_75,
        currency: 'usd',
        metadata: { reference: 'YSR-2026-000124', donation_id: 'd1' },
      },
    },
  };
  const raw = JSON.stringify(event);
  const sign = (t: number, body = raw) => createHmac('sha256', config.webhookSecret).update(`${t}.${body}`).digest('hex');

  it('creates a PaymentIntent for the app with an idempotency key and returns its client secret', async () => {
    const { impl, calls } = fakeFetch(() => ({ id: 'pi_3Q1', client_secret: 'pi_3Q1_secret_x' }));
    const result = await new StripeGateway(config, impl).createCheckout(
      checkout({ currency: 'USD', amountMinor: 51_75, method: 'card', returnUrl: 'yusr://receipt?donation=x&token=t' }),
    );
    assert.ok(calls[0]!.url.endsWith('/v1/payment_intents'));
    const form = new URLSearchParams(calls[0]!.body);
    assert.equal(calls[0]?.headers['content-type'], 'application/x-www-form-urlencoded');
    assert.equal(calls[0]?.headers['idempotency-key'], 'checkout-0190f0f0');
    assert.equal(form.get('amount'), '5175');
    assert.equal(form.get('currency'), 'usd');
    assert.equal(form.get('metadata[reference]'), 'YSR-2026-000123');
    assert.deepEqual(result.action, { type: 'stripe_client_secret', clientSecret: 'pi_3Q1_secret_x', publishableKey: 'pk_test_123' });
  });

  it('sends website donors to a hosted Checkout session whose PaymentIntent carries our reference', async () => {
    const { impl, calls } = fakeFetch(() => ({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }));
    const result = await new StripeGateway(config, impl, () => now).createCheckout(
      checkout({ currency: 'USD', amountMinor: 51_75, method: 'apple_pay', expiresAt: new Date(now.getTime() + 10 * 60_000) }),
    );
    assert.ok(calls[0]!.url.endsWith('/v1/checkout/sessions'));
    assert.equal(calls[0]?.headers['idempotency-key'], 'checkout-0190f0f0');
    const form = new URLSearchParams(calls[0]!.body);
    assert.equal(form.get('mode'), 'payment');
    assert.equal(form.get('line_items[0][price_data][unit_amount]'), '5175');
    assert.equal(form.get('line_items[0][price_data][currency]'), 'usd');
    assert.equal(form.get('success_url'), 'https://yusr.example/en/receipt?donation=x');
    assert.equal(form.get('payment_intent_data[metadata][reference]'), 'YSR-2026-000123');
    assert.equal(form.get('customer_email'), 'mona@example.com');
    // A 10-minute checkout window is stretched to Stripe's 30-minute minimum.
    assert.ok(Number(form.get('expires_at')) >= Math.floor(now.getTime() / 1000) + 30 * 60);
    assert.deepEqual(result.action, { type: 'redirect', provider: 'stripe', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    assert.equal(result.providerRef, 'cs_test_1');
  });

  it('accepts any valid v1 signature within the tolerance window', () => {
    const gateway = new StripeGateway(config, undefined, () => now);
    const parsed = gateway.parseWebhook(input(raw, { 'Stripe-Signature': `t=${timestamp},v1=deadbeef,v1=${sign(timestamp)}` }));
    assert.equal(parsed.outcome, 'succeeded');
    assert.equal(parsed.reference, 'YSR-2026-000124');
    assert.equal(parsed.amountMinor, 51_75);
    assert.equal(parsed.currency, 'USD');
  });

  it('rejects replays outside the tolerance, bad signatures and malformed headers', () => {
    const gateway = new StripeGateway(config, undefined, () => now);
    const old = timestamp - 3_600;
    assert.throws(() => gateway.parseWebhook(input(raw, { 'stripe-signature': `t=${old},v1=${sign(old)}` })), invalidSignature);
    assert.throws(() => gateway.parseWebhook(input(raw, { 'stripe-signature': `t=${timestamp},v1=${sign(timestamp, '{}')}` })), invalidSignature);
    assert.throws(() => gateway.parseWebhook(input(raw, { 'stripe-signature': 'garbage' })), invalidSignature);
    assert.equal(parseStripeSignature(undefined), null);
  });
});

describe('Moyasar', () => {
  const config = { secretKey: 'sk_test_moyasar', webhookToken: 'moyasar-webhook-token' };

  it('creates a hosted invoice with basic auth', async () => {
    const { impl, calls } = fakeFetch(() => ({ id: 'inv_9d1', status: 'initiated', url: 'https://checkout.moyasar.com/invoices/inv_9d1' }));
    const result = await new MoyasarGateway(config, impl).createCheckout(checkout({ currency: 'SAR', amountMinor: 250_00, method: 'mada' }));
    assert.equal(calls[0]?.headers['authorization'], `Basic ${Buffer.from('sk_test_moyasar:').toString('base64')}`);
    assert.equal(JSON.parse(calls[0]!.body).metadata.reference, 'YSR-2026-000123');
    assert.deepEqual(result.action, { type: 'redirect', provider: 'moyasar', url: 'https://checkout.moyasar.com/invoices/inv_9d1' });
  });

  it('trusts only webhooks carrying the shared secret token and records the fee', () => {
    const gateway = new MoyasarGateway(config);
    const body = {
      id: 'evt_moy_1',
      type: 'payment_paid',
      secret_token: 'moyasar-webhook-token',
      data: { id: 'pay_77', status: 'paid', amount: 250_00, fee: 2_50, currency: 'SAR', metadata: { reference: 'YSR-2026-000125' }, source: { type: 'mada' } },
    };
    const event = gateway.parseWebhook(input(body));
    assert.deepEqual([event.outcome, event.feeMinor, event.providerRef, event.reference], ['succeeded', 2_50, 'pay_77', 'YSR-2026-000125']);
    assert.throws(() => gateway.parseWebhook(input({ ...body, secret_token: 'guess' })), invalidSignature);
  });
});

describe('InstaPay', () => {
  it('gives the donor our payment address and the receipt number as the transfer reference', async () => {
    const gateway = new InstapayGateway({ ipa: 'yusr@instapay', accountName: 'Yusr Foundation' });
    const result = await gateway.createCheckout(checkout({ method: 'instapay' }));
    assert.deepEqual(result.action, {
      type: 'bank_transfer',
      ipa: 'yusr@instapay',
      accountName: 'Yusr Foundation',
      reference: 'YSR-2026-000123',
      expiresAt: '2026-09-26T09:30:00.000Z',
    });
    assert.throws(
      () => gateway.parseWebhook(),
      (error: unknown) => DomainError.is(error, 'VALIDATION_FAILED'),
    );
  });
});
