import { randomUUID } from 'node:crypto';
import { DomainError, type Currency, type PaymentProvider } from '@yusr/core';
import { hmacHex, safeEqual } from '../../common/crypto';
import {
  header,
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentEvent,
  type PaymentGateway,
  type RefundCall,
  type RefundResult,
  type WebhookInput,
} from '../gateway';
import { parseJsonBody } from '../http';

/**
 * Stand-in for a real provider in local development and demo mode (no sandbox keys needed).
 * Checkout points to the API's own /v1/dev/checkout page, which posts a webhook signed
 * with a local secret — so the full asynchronous flow (webhook → ledger → receipt) runs.
 */
export class SimulatedGateway implements PaymentGateway {
  constructor(
    readonly provider: PaymentProvider,
    private readonly options: { apiBaseUrl: string; secret: string },
  ) {}

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const providerRef = `sim_${this.provider}_${request.reference}`;
    if (this.provider === 'fawry') {
      const referenceNumber = String(900_000_000 + (parseInt(request.reference.replace(/\D/g, '').slice(-8), 10) % 99_999_999));
      return { providerRef, status: 'awaiting_transfer', action: { type: 'fawry_reference', referenceNumber, expiresAt: request.expiresAt.toISOString() } };
    }
    const query = new URLSearchParams({ provider: this.provider, return: request.returnUrl, sig: this.linkSignature(request.reference, request.returnUrl) });
    const url = `${this.options.apiBaseUrl.replace(/\/$/, '')}/v1/dev/checkout/${encodeURIComponent(request.reference)}?${query}`;
    return { providerRef, status: 'requires_action', action: { type: 'redirect', provider: this.provider, url } };
  }

  sign(body: string): string {
    return hmacHex('sha256', this.options.secret, body);
  }

  /** Like a real hosted checkout, the page only sends the donor back to the return URL it was created with. */
  linkSignature(reference: string, returnUrl: string): string {
    return hmacHex('sha256', this.options.secret, `checkout:${reference}:${returnUrl}`).slice(0, 32);
  }

  verifyLink(reference: string, returnUrl: string, signature: string): boolean {
    return safeEqual(this.linkSignature(reference, returnUrl), signature);
  }

  /** The signed notification the provider would send when the donor finishes the checkout. */
  completion(input: { reference: string; amountMinor: number; currency: Currency; outcome: 'succeeded' | 'failed' }): {
    rawBody: Buffer;
    headers: Record<string, string>;
  } {
    const body = JSON.stringify({
      eventId: `sim_evt_${randomUUID()}`,
      reference: input.reference,
      providerRef: `sim_${this.provider}_${input.reference}`,
      outcome: input.outcome,
      amountMinor: input.amountMinor,
      currency: input.currency,
    });
    return { rawBody: Buffer.from(body), headers: { 'content-type': 'application/json', 'x-yusr-simulator-signature': this.sign(body) } };
  }

  parseWebhook(input: WebhookInput): PaymentEvent {
    const signature = header(input.headers, 'x-yusr-simulator-signature') ?? '';
    if (!safeEqual(this.sign(input.rawBody.toString('utf8')), signature)) throw new DomainError('INVALID_SIGNATURE', 'Simulator signature mismatch');
    const body = parseJsonBody(input.rawBody, 'simulator');
    return {
      provider: this.provider,
      eventId: String(body['eventId']),
      reference: String(body['reference']),
      providerRef: String(body['providerRef'] ?? `sim_${this.provider}_${String(body['reference'])}`),
      outcome: body['outcome'] === 'failed' ? 'failed' : 'succeeded',
      amountMinor: Number(body['amountMinor']),
      currency: String(body['currency']) as Currency,
      feeMinor: typeof body['feeMinor'] === 'number' ? body['feeMinor'] : null,
      failureCode: body['outcome'] === 'failed' ? 'simulated_decline' : null,
      payload: body,
    };
  }

  async refund(call: RefundCall): Promise<RefundResult> {
    return { providerRef: `sim_refund_${call.reference}`, status: 'processed' };
  }
}
