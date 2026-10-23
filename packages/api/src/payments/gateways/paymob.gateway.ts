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
  /** The Paymob order behind the intention; its transactions carry it as `order.id`. */
  intention_order_id?: number | string;
}

/** The fields of a Paymob transaction we read (callback `obj` and GET /api/acceptance/transactions/:id). */
export interface PaymobTransaction {
  id: number | string;
  amount_cents: number | string;
  currency: string;
  success: boolean;
  pending: boolean;
  is_refunded: boolean;
  is_voided: boolean;
  integration_id: number | string;
  created_at: string;
  order: { id: number | string; merchant_order_id?: string | null } | number | string;
  data?: Record<string, unknown>;
  [field: string]: unknown;
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

/** A Paymob numeric id (a JSON number or a string of digits), as a string; null when it is not one. */
function numericId(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  if (typeof value === 'string') return /^[1-9]\d{0,17}$/.test(value) ? value : null;
  return null;
}

function orderIdOf(transaction: Record<string, unknown>): string | null {
  const order = transaction['order'];
  return numericId(order && typeof order === 'object' ? (order as Record<string, unknown>)['id'] : order);
}

/** Paymob's timestamp, e.g. 2026-09-26T09:03:11.412094 (optionally with a zone). */
function isPaymobTimestamp(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!match) return false;
  const parsed = new Date(`${match[1]}Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(match[1]!);
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
    const orderId = numericId(intention.intention_order_id);
    if (!orderId) throw new DomainError('PAYMENT_PROVIDER_ERROR', 'Paymob intention has no order id', { provider: 'paymob' });
    const url = `${this.baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(this.config.publicKey)}&clientSecret=${encodeURIComponent(intention.client_secret)}`;
    return { providerRef: String(intention.id), providerOrderRef: orderId, status: 'requires_action', action: { type: 'redirect', provider: 'paymob', url } };
  }

  private integrationIds(): string[] {
    const { card, wallet, applePay } = this.config.integrations;
    return [card, wallet, applePay].filter((id): id is number => id !== undefined).map(String);
  }

  /** Reads a transaction from Paymob itself (server to server, with our secret key). */
  async fetchTransaction(transactionId: string): Promise<PaymobTransaction> {
    return callJson<PaymobTransaction>(this.fetchImpl, 'paymob', `${this.baseUrl}/api/acceptance/transactions/${encodeURIComponent(transactionId)}`, {
      method: 'GET',
      headers: { authorization: `Token ${this.config.secretKey}` },
    });
  }

  /**
   * Paymob signs a callback by joining field values with no separator, so a valid signature does not
   * pin where one field ends and the next begins (digits of created_at can slide into amount_cents,
   * integration_id into id …), and the merchant reference is not signed at all. So a verified
   * callback is only a hint: its shape is checked, then the transaction is read back from Paymob and
   * everything that moves money (amount, currency, status flags, order) comes from that answer.
   */
  async parseWebhook(input: WebhookInput): Promise<PaymentEvent> {
    const body = parseJsonBody(input.rawBody, 'paymob');
    const transaction = body['obj'];
    if (body['type'] !== 'TRANSACTION' || !transaction || typeof transaction !== 'object') {
      throw new DomainError('VALIDATION_FAILED', 'Unsupported Paymob callback type');
    }
    const callback = transaction as Record<string, unknown>;
    const received = (input.query['hmac'] ?? '').toLowerCase();
    if (!received || !safeEqual(paymobSignature(callback, this.config.hmacSecret), received)) {
      throw new DomainError('INVALID_SIGNATURE', 'Paymob HMAC mismatch');
    }

    const transactionId = numericId(callback['id']);
    const orderId = orderIdOf(callback);
    const integrationId = numericId(callback['integration_id']);
    if (!transactionId || !orderId || !integrationId || !this.integrationIds().includes(integrationId) || !isPaymobTimestamp(callback['created_at'])) {
      throw new DomainError('INVALID_SIGNATURE', 'Paymob callback fields are malformed');
    }

    const tx = await this.fetchTransaction(transactionId);
    const confirmed = tx as unknown as Record<string, unknown>;
    if (numericId(confirmed['id']) !== transactionId || orderIdOf(confirmed) !== orderId || numericId(confirmed['integration_id']) !== integrationId) {
      throw new DomainError('INVALID_SIGNATURE', 'Paymob callback does not match the transaction');
    }
    const amountMinor = typeof tx.amount_cents === 'string' ? Number(tx.amount_cents) : tx.amount_cents;
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || typeof tx.currency !== 'string') {
      throw new DomainError('PAYMENT_PROVIDER_ERROR', 'Paymob transaction has no valid amount', { provider: 'paymob' });
    }

    const success = tx.success === true;
    const pending = tx.pending === true;
    const refunded = tx.is_refunded === true;
    const voided = tx.is_voided === true;
    const outcome = refunded ? 'refunded' : voided ? 'failed' : pending ? 'pending' : success ? 'succeeded' : 'failed';
    const data = (tx.data ?? {}) as Record<string, unknown>;
    const order = typeof tx.order === 'object' && tx.order ? tx.order : null;

    return {
      provider: 'paymob',
      // Paymob calls back again for the same transaction when its state changes (pending → paid,
      // paid → refunded); each state is a separate event, while an exact replay is still a duplicate.
      eventId: `${transactionId}:${success}:${pending}:${refunded}:${voided}`,
      reference: String(order?.merchant_order_id ?? ''),
      providerOrderRef: orderId,
      providerRef: transactionId,
      outcome,
      amountMinor,
      currency: tx.currency.toUpperCase() as Currency,
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
