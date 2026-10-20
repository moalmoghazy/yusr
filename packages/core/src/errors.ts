export const DOMAIN_ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'FORBIDDEN',
  'AMOUNT_TOO_LOW',
  'AMOUNT_TOO_HIGH_FOR_GUEST',
  'AMOUNT_ABOVE_REMAINING',
  'CASE_NOT_DONATABLE',
  'ZAKAT_NOT_ELIGIBLE',
  'METHOD_NOT_AVAILABLE',
  'DEDICATION_TOO_LONG',
  'INVALID_TRANSITION',
  'FORBIDDEN_TRANSITION',
  'REASON_REQUIRED',
  'LEDGER_UNBALANCED',
  'CURRENCY_MISMATCH',
  'AMOUNT_MISMATCH',
  'IDEMPOTENCY_CONFLICT',
  'PAYMENT_PROVIDER_ERROR',
  'INVALID_SIGNATURE',
  'DONATION_NOT_REFUNDABLE',
  'REFUND_EXCEEDS_DONATION',
  'INSUFFICIENT_CASE_FUNDS',
  'SELF_APPROVAL_FORBIDDEN',
  'RATE_LIMITED',
  'UNAUTHENTICATED',
  'OTP_INVALID',
  'OTP_EXPIRED',
  'SESSION_REVOKED',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

/**
 * Error raised by domain rules. `code` is stable and localized by @yusr/i18n
 * (messages.errors.<code>), so clients never show raw server text.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: DomainErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }

  static is(value: unknown, code?: DomainErrorCode): value is DomainError {
    return value instanceof DomainError && (code === undefined || value.code === code);
  }
}
