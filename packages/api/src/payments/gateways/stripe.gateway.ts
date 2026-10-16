import { DomainError, type Currency } from '@yusr/core';
import { hmacHex, safeEqual } from '../../common/crypto';
import type {
  CheckoutRequest,
  CheckoutResult,
  FetchLike,
  PaymentEvent,
  PaymentGateway,
  PaymentOutcome,
  RefundCall,
  RefundResult,
  WebhookInput,
} from '../gateway';
import { header } from '../gateway';
import { callJson, parseJsonBody } from '../http';

/**
 * Stripe for international (USD) cards and Apple Pay / Google Pay, called over REST (no SDK
 * on the server). Two checkouts, chosen by where the donor returns to:
 *  - the website (an https return URL) → a hosted Stripe Checkout session, like every other
 *    gateway on the site: the donor is redirected and comes back to the receipt;
 *  - the app (its own `yusr:` scheme) → a PaymentIntent whose client secret the app confirms
 *    in Stripe's native Payment Sheet.
 * Either way the money is a PaymentIntent carrying our reference in its metadata, so one set of
 * webhook events (payment_intent.*) settles both, and refunds use the PaymentIntent id.
 *
 * Webhooks are verified exactly like Stripe's libraries do: HMAC-SHA256 over
 * "<timestamp>.<raw body>" with the endpoint secret, against any v1 signature,
 * within a 5-minute tolerance.
 */
export interface StripeConfig {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  toleranceSeconds?: number;
  baseUrl?: string;
}

const EVENTS: Readonly<Record<string, PaymentOutcome>> = {
  'payment_intent.succeeded': 'succeeded',
  'payment_intent.payment_failed': 'failed',
  'payment_intent.canceled': 'failed',
  'payment_intent.processing': 'pending',
  'charge.refunded': 'refunded',
};

export function parseStripeSignature(value: string | undefined): { timestamp: number; signatures: string[] } | null {
  if (!value) return null;
  let timestamp = Number.NaN;
  const signatures: string[] = [];
  for (const part of value.split(',')) {
    const [key, item] = part.split('=', 2);
    if (key?.trim() === 't') timestamp = Number(item);
    if (key?.trim() === 'v1' && item) signatures.push(item.trim());
  }
  return Number.isFinite(timestamp) && signatures.length > 0 ? { timestamp, signatures } : null;
}

export class StripeGateway implements PaymentGateway {
  readonly provider = 'stripe' as const;
  private readonly baseUrl: string;

  constructor(
    private readonly config: StripeConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.baseUrl = (config.baseUrl ?? 'https://api.stripe.com').replace(/\/$/, '');
  }

  private headers(idempotencyKey: string): Record<string, string> {
    return { authorization: `Bearer ${this.config.secretKey}`, 'idempotency-key': idempotencyKey };
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    return /^https?:/i.test(request.returnUrl) ? this.hostedCheckout(request) : this.paymentIntent(request);
  }

  /** Website: a Stripe Checkout session; its PaymentIntent inherits our reference for the webhooks. */
  private async hostedCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const now = this.now().getTime();
    // Stripe accepts a session expiry between 30 minutes and 24 hours from now.
    const expiresAt = Math.min(Math.max(request.expiresAt.getTime(), now + 31 * 60_000), now + 23 * 3_600_000);
    const form = new URLSearchParams({
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': request.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(request.amountMinor),
      'line_items[0][price_data][product_data][name]': request.description,
      success_url: request.returnUrl,
      // Backing out lands on the same receipt page, which shows the payment as not completed.
      cancel_url: request.returnUrl,
      client_reference_id: request.donationId,
      expires_at: String(Math.floor(expiresAt / 1000)),
      'metadata[reference]': request.reference,
      'metadata[donation_id]': request.donationId,
      'payment_intent_data[description]': request.description,
      'payment_intent_data[metadata][reference]': request.reference,
      'payment_intent_data[metadata][donation_id]': request.donationId,
    });
    if (request.customer.email) form.set('customer_email', request.customer.email);
    const session = await callJson<{ id: string; url: string }>(this.fetchImpl, 'stripe', `${this.baseUrl}/v1/checkout/sessions`, {
      headers: this.headers(request.idempotencyKey),
      body: form,
    });
    return { providerRef: session.id, status: 'requires_action', action: { type: 'redirect', provider: 'stripe', url: session.url } };
  }

  /** App: a PaymentIntent confirmed in the native Payment Sheet (cards, Apple Pay, Google Pay). */
  private async paymentIntent(request: CheckoutRequest): Promise<CheckoutResult> {
    const form = new URLSearchParams({
      amount: String(request.amountMinor),
      currency: request.currency.toLowerCase(),
      'automatic_payment_methods[enabled]': 'true',
      description: request.description,
      'metadata[reference]': request.reference,
      'metadata[donation_id]': request.donationId,
    });
    if (request.customer.email) form.set('receipt_email', request.customer.email);
    const intent = await callJson<{ id: string; client_secret: string }>(this.fetchImpl, 'stripe', `${this.baseUrl}/v1/payment_intents`, {
      headers: this.headers(request.idempotencyKey),
      body: form,
    });
    return {
      providerRef: intent.id,
      status: 'requires_action',
      action: { type: 'stripe_client_secret', clientSecret: intent.client_secret, publishableKey: this.config.publishableKey },
    };
  }

  parseWebhook(input: WebhookInput): PaymentEvent {
    const parsed = parseStripeSignature(header(input.headers, 'stripe-signature'));
    if (!parsed) throw new DomainError('INVALID_SIGNATURE', 'Missing or malformed Stripe-Signature header');
    const expected = hmacHex('sha256', this.config.webhookSecret, `${parsed.timestamp}.${input.rawBody.toString('utf8')}`);
    if (!parsed.signatures.some((signature) => safeEqual(signature, expected))) {
      throw new DomainError('INVALID_SIGNATURE', 'Stripe signature mismatch');
    }
    const age = Math.abs(this.now().getTime() / 1000 - parsed.timestamp);
    if (age > (this.config.toleranceSeconds ?? 300)) throw new DomainError('INVALID_SIGNATURE', 'Stripe signature timestamp outside tolerance');

    const event = parseJsonBody(input.rawBody, 'stripe');
    const type = String(event['type'] ?? '');
    const object = ((event['data'] as Record<string, unknown> | undefined)?.['object'] ?? {}) as Record<string, unknown>;
    const metadata = (object['metadata'] ?? {}) as Record<string, unknown>;
    const outcome = EVENTS[type] ?? 'pending';
    const isCharge = type.startsWith('charge.');
    const amount = isCharge ? object['amount_refunded'] : (object['amount_received'] as number) || object['amount'];
    const lastError = (object['last_payment_error'] ?? null) as Record<string, unknown> | null;
    return {
      provider: 'stripe',
      eventId: String(event['id']),
      reference: String(metadata['reference'] ?? ''),
      providerRef: String(isCharge ? (object['payment_intent'] ?? object['id']) : object['id']),
      outcome,
      amountMinor: Number(amount ?? 0),
      currency: String(object['currency'] ?? 'usd').toUpperCase() as Currency,
      feeMinor: null,
      failureCode: outcome === 'failed' ? String(lastError?.['code'] ?? lastError?.['decline_code'] ?? type) : null,
      payload: event,
    };
  }

  async refund(call: RefundCall): Promise<RefundResult> {
    const form = new URLSearchParams({ payment_intent: call.providerRef, amount: String(call.amountMinor), 'metadata[reference]': call.reference });
    const refund = await callJson<{ id: string; status: string }>(this.fetchImpl, 'stripe', `${this.baseUrl}/v1/refunds`, {
      headers: this.headers(call.idempotencyKey),
      body: form,
    });
    return { providerRef: refund.id, status: refund.status === 'succeeded' ? 'processed' : 'pending' };
  }
}
