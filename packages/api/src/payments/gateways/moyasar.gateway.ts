import { DomainError, type Currency } from '@yusr/core';
import { safeEqual } from '../../common/crypto';
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
import { callJson, parseJsonBody } from '../http';

/**
 * Moyasar (Saudi Arabia): mada, Visa/Mastercard and Apple Pay in SAR through a hosted
 * invoice page. Webhooks carry the shared `secret_token` configured in the dashboard;
 * the fee is reported on the payment, so the ledger records the real cost.
 *
 * Docs: https://docs.moyasar.com — "Create invoice", "Webhooks", "Refund payment".
 */
export interface MoyasarConfig {
  secretKey: string;
  webhookToken: string;
  baseUrl?: string;
}

const EVENTS: Readonly<Record<string, PaymentOutcome>> = {
  payment_paid: 'succeeded',
  payment_captured: 'succeeded',
  payment_failed: 'failed',
  payment_voided: 'failed',
  payment_expired: 'expired',
  payment_refunded: 'refunded',
  payment_authorized: 'pending',
};

export class MoyasarGateway implements PaymentGateway {
  readonly provider = 'moyasar' as const;
  private readonly baseUrl: string;

  constructor(
    private readonly config: MoyasarConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {
    this.baseUrl = (config.baseUrl ?? 'https://api.moyasar.com').replace(/\/$/, '');
  }

  private get authorization(): string {
    return `Basic ${Buffer.from(`${this.config.secretKey}:`).toString('base64')}`;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (request.currency !== 'SAR') throw new DomainError('METHOD_NOT_AVAILABLE', 'Moyasar is configured for SAR', { currency: request.currency });
    const invoice = await callJson<{ id: string; url: string; status: string }>(this.fetchImpl, 'moyasar', `${this.baseUrl}/v1/invoices`, {
      headers: { authorization: this.authorization },
      body: {
        amount: request.amountMinor,
        currency: 'SAR',
        description: request.description,
        callback_url: request.notificationUrl,
        success_url: request.returnUrl,
        back_url: request.returnUrl,
        expired_at: request.expiresAt.toISOString(),
        metadata: { reference: request.reference, donation_id: request.donationId },
      },
    });
    return { providerRef: invoice.id, status: 'requires_action', action: { type: 'redirect', provider: 'moyasar', url: invoice.url } };
  }

  parseWebhook(input: WebhookInput): PaymentEvent {
    const body = parseJsonBody(input.rawBody, 'moyasar');
    if (!safeEqual(String(body['secret_token'] ?? ''), this.config.webhookToken)) {
      throw new DomainError('INVALID_SIGNATURE', 'Moyasar secret_token mismatch');
    }
    const payment = (body['data'] ?? {}) as Record<string, unknown>;
    const metadata = (payment['metadata'] ?? {}) as Record<string, unknown>;
    const source = (payment['source'] ?? {}) as Record<string, unknown>;
    const outcome = EVENTS[String(body['type'])] ?? 'pending';
    return {
      provider: 'moyasar',
      eventId: String(body['id']),
      reference: String(metadata['reference'] ?? ''),
      providerRef: String(payment['id'] ?? ''),
      outcome,
      amountMinor: Number(payment['amount'] ?? 0),
      currency: String(payment['currency'] ?? 'SAR').toUpperCase() as Currency,
      feeMinor: typeof payment['fee'] === 'number' ? payment['fee'] : null,
      failureCode: outcome === 'failed' ? String(source['message'] ?? payment['status'] ?? 'failed') : null,
      payload: body,
    };
  }

  async refund(call: RefundCall): Promise<RefundResult> {
    const payment = await callJson<{ id: string; status: string }>(
      this.fetchImpl,
      'moyasar',
      `${this.baseUrl}/v1/payments/${encodeURIComponent(call.providerRef)}/refund`,
      { headers: { authorization: this.authorization }, body: { amount: call.amountMinor } },
    );
    return { providerRef: payment.id, status: payment.status === 'refunded' ? 'processed' : 'pending' };
  }
}
