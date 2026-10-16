import { DomainError, type Currency } from '@yusr/core';
import { hmacHex, safeEqual } from '../../common/crypto';
import type { CheckoutRequest, CheckoutResult, FetchLike, PaymentEvent, PaymentGateway, RefundCall, RefundResult, WebhookInput } from '../gateway';
import { callJson, parseJsonBody } from '../http';

/**
 * Paymob (Egypt): cards, Apple Pay and mobile wallets (Vodafone Cash) through the
 * Intention API and the hosted Unified Checkout. Card data never reaches our servers.
 *
 * Docs: https://developers.paymob.com — "Create Intention", "Transaction processed callback", "HMAC".
 */
export interface PaymobConfig {
  secretKey: string;
  publicKey: string;
  hmacSecret: string;
  integrations: { card: number; wallet: number; applePay?: number };
  baseUrl?: string;
}

interface IntentionResponse {
  id: string;
  client_secret: string;
}

/** Fields Paymob concatenates (in this order) to sign a TRANSACTION callback. */
export const PAYMOB_HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

function read(object: Record<string, unknown>, path: string): unknown {
  let current: unknown = object;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function paymobSignature(transaction: Record<string, unknown>, secret: string): string {
  const message = PAYMOB_HMAC_FIELDS.map((field) => {
    const value = read(transaction, field);
    return value === undefined || value === null ? '' : String(value);
  }).join('');
  return hmacHex('sha512', secret, message);
}

function splitName(name: string | null): [string, string] {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return ['Yusr', 'Donor'];
  if (parts.length === 1) return [parts[0]!, parts[0]!];
  return [parts[0]!, parts.slice(1).join(' ')];
}

export class PaymobGateway implements PaymentGateway {
  readonly provider = 'paymob' as const;
  private readonly baseUrl: string;

  constructor(
    private readonly config: PaymobConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.baseUrl = (config.baseUrl ?? 'https://accept.paymob.com').replace(/\/$/, '');
  }

  private integrationFor(request: CheckoutRequest): number {
    const { integrations } = this.config;
    if (request.method === 'vodafone_cash') return integrations.wallet;
    if (request.method === 'apple_pay') return integrations.applePay ?? integrations.card;
    return integrations.card;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (request.currency !== 'EGP') throw new DomainError('METHOD_NOT_AVAILABLE', 'Paymob is configured for EGP', { currency: request.currency });
    const [firstName, lastName] = splitName(request.customer.name);
    const expiresInSeconds = Math.max(300, Math.round((request.expiresAt.getTime() - this.now().getTime()) / 1000));
    const intention = await callJson<IntentionResponse>(this.fetchImpl, 'paymob', `${this.baseUrl}/v1/intention/`, {
      headers: { authorization: `Token ${this.config.secretKey}` },
      body: {
        amount: request.amountMinor,
        currency: request.currency,
        payment_methods: [this.integrationFor(request)],
        items: [{ name: request.reference, amount: request.amountMinor, description: request.description.slice(0, 255), quantity: 1 }],
        billing_data: {
          first_name: firstName,
          last_name: lastName,
          email: request.customer.email ?? 'receipts@yusr.example',
          phone_number: request.customer.phone ?? 'NA',
          country: 'EG',
          city: 'NA',
          street: 'NA',
          building: 'NA',
          floor: 'NA',
          apartment: 'NA',
        },
        special_reference: request.reference,
        notification_url: request.notificationUrl,
        redirection_url: request.returnUrl,
        expiration: expiresInSeconds,
        extras: { donation_id: request.donationId, locale: request.locale },
      },
    });
    const url = `${this.baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(this.config.publicKey)}&clientSecret=${encodeURIComponent(intention.client_secret)}`;
    return { providerRef: String(intention.id), status: 'requires_action', action: { type: 'redirect', provider: 'paymob', url } };
  }

  parseWebhook(input: WebhookInput): PaymentEvent {
    const body = parseJsonBody(input.rawBody, 'paymob');
    const transaction = body['obj'];
    if (body['type'] !== 'TRANSACTION' || !transaction || typeof transaction !== 'object') {
      throw new DomainError('VALIDATION_FAILED', 'Unsupported Paymob callback type');
    }
    const tx = transaction as Record<string, unknown>;
    const received = (input.query['hmac'] ?? '').toLowerCase();
    if (!received || !safeEqual(paymobSignature(tx, this.config.hmacSecret), received)) {
      throw new DomainError('INVALID_SIGNATURE', 'Paymob HMAC mismatch');
    }

    const order = (tx['order'] ?? {}) as Record<string, unknown>;
    const reference = String(order['merchant_order_id'] ?? tx['special_reference'] ?? '');
    const success = tx['success'] === true;
    const pending = tx['pending'] === true;
    const outcome = tx['is_refunded'] === true ? 'refunded' : tx['is_voided'] === true ? 'failed' : pending ? 'pending' : success ? 'succeeded' : 'failed';
    const data = (tx['data'] ?? {}) as Record<string, unknown>;

    return {
      provider: 'paymob',
      eventId: String(tx['id']),
      reference,
      providerRef: String(tx['id']),
      outcome,
      amountMinor: Number(tx['amount_cents']),
      currency: String(tx['currency'] ?? 'EGP').toUpperCase() as Currency,
      feeMinor: null,
      failureCode: outcome === 'failed' ? String(data['txn_response_code'] ?? data['message'] ?? 'declined') : null,
      payload: body,
    };
  }

  async refund(call: RefundCall): Promise<RefundResult> {
    const response = await callJson<{ id: number | string; success?: boolean; pending?: boolean }>(
      this.fetchImpl,
      'paymob',
      `${this.baseUrl}/api/acceptance/void_refund/refund`,
      {
        headers: { authorization: `Token ${this.config.secretKey}` },
        body: { transaction_id: call.providerRef, amount_cents: call.amountMinor },
      },
    );
    return { providerRef: String(response.id), status: response.pending ? 'pending' : 'processed' };
  }
}
