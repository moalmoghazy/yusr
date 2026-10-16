import type { CheckoutAction, Currency, Locale, PaymentMethod, PaymentProvider } from '@yusr/core';

/** What the donations service asks a gateway to set up. */
export interface CheckoutRequest {
  donationId: string;
  /** Our merchant reference: the receipt number (YSR-2026-000123), unique per donation. */
  reference: string;
  method: PaymentMethod;
  currency: Currency;
  /** Amount to charge, in minor units (includes any fee the donor chose to cover). */
  amountMinor: number;
  description: string;
  customer: { name: string | null; email: string | null; phone: string | null };
  locale: Locale;
  /** Where the donor lands after paying (the web or app receipt screen). */
  returnUrl: string;
  /** Our webhook endpoint for this provider. */
  notificationUrl: string;
  expiresAt: Date;
  /** Forwarded to providers that support idempotent requests (Stripe). */
  idempotencyKey: string;
}

export interface CheckoutResult {
  providerRef: string;
  action: CheckoutAction;
  /** `awaiting_transfer` for flows where the money arrives later (outlet cash, bank transfer). */
  status: 'requires_action' | 'awaiting_transfer';
}

export interface WebhookInput {
  rawBody: Buffer;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  query: Readonly<Record<string, string | undefined>>;
}

export type PaymentOutcome = 'succeeded' | 'failed' | 'pending' | 'expired' | 'refunded';

/** A verified, normalized gateway notification. */
export interface PaymentEvent {
  provider: PaymentProvider;
  /** Provider event or transaction id, used to acknowledge replays without re-applying them. */
  eventId: string;
  /** Our merchant reference (receipt number). */
  reference: string;
  providerRef: string | null;
  outcome: PaymentOutcome;
  amountMinor: number;
  currency: Currency;
  /** Actual processing fee when the provider reports it, in minor units of `currency`. */
  feeMinor: number | null;
  failureCode: string | null;
  payload: unknown;
}

export interface RefundCall {
  providerRef: string;
  reference: string;
  amountMinor: number;
  currency: Currency;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  providerRef: string;
  status: 'processed' | 'pending';
}

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  /** Verifies the signature and normalizes the payload. Throws DomainError('INVALID_SIGNATURE'). */
  parseWebhook(input: WebhookInput): PaymentEvent;
  refund(call: RefundCall): Promise<RefundResult>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const PAYMENT_GATEWAYS = Symbol('PAYMENT_GATEWAYS');

/** Reads one header regardless of case or array form. */
export function header(headers: WebhookInput['headers'], name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

/** 1250.5 EGP → 125050 without floating point surprises. */
export function majorToMinor(value: number | string): number {
  const text = typeof value === 'number' ? value.toFixed(2) : value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) throw new RangeError(`Not a money amount: ${value}`);
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return text.startsWith('-') ? -minor : minor;
}

/** 125050 → "1250.50" (the two-decimal format Fawry signs). */
export function minorToMajorString(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
