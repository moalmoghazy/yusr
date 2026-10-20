import { DomainError, type DomainErrorCode } from '@yusr/core';

/**
 * One place that decides the HTTP status for every domain error. The body keeps the
 * shape the SDK parses — { error: { code, message, details } } — plus RFC 9457 fields
 * (type, title, status) for generic HTTP tooling. Messages are for developers; apps
 * show the localized text for `code` from @yusr/i18n.
 */
export const STATUS_BY_CODE: Readonly<Record<DomainErrorCode, number>> = {
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  SESSION_REVOKED: 401,
  OTP_INVALID: 422,
  OTP_EXPIRED: 410,
  RATE_LIMITED: 429,
  AMOUNT_TOO_LOW: 422,
  AMOUNT_ABOVE_REMAINING: 422,
  AMOUNT_TOO_HIGH_FOR_GUEST: 422,
  CASE_NOT_DONATABLE: 409,
  ZAKAT_NOT_ELIGIBLE: 422,
  METHOD_NOT_AVAILABLE: 422,
  DEDICATION_TOO_LONG: 422,
  INVALID_TRANSITION: 409,
  FORBIDDEN_TRANSITION: 403,
  REASON_REQUIRED: 422,
  LEDGER_UNBALANCED: 409,
  CURRENCY_MISMATCH: 422,
  AMOUNT_MISMATCH: 422,
  IDEMPOTENCY_CONFLICT: 409,
  PAYMENT_PROVIDER_ERROR: 502,
  INVALID_SIGNATURE: 401,
  DONATION_NOT_REFUNDABLE: 409,
  REFUND_EXCEEDS_DONATION: 422,
  INSUFFICIENT_CASE_FUNDS: 409,
  SELF_APPROVAL_FORBIDDEN: 403,
};

export interface Problem {
  status: number;
  headers: Record<string, string>;
  body: {
    type: string;
    title: string;
    status: number;
    error: { code: DomainErrorCode | 'INTERNAL'; message: string; details?: Record<string, unknown> };
    requestId: string | null;
  };
}

/** Details that are safe to show to clients (never stack traces or provider payloads). */
const PUBLIC_DETAIL_KEYS = new Set([
  'field',
  'fields',
  'issues',
  'minMinor',
  'maxMinor',
  'currency',
  'status',
  'from',
  'to',
  'permission',
  'max',
  'attemptsLeft',
  'retryAfterSeconds',
  'mfaRequired',
  'expectedMinor',
  'receivedMinor',
  'availableMinor',
  'heldMinor',
  'neededMinor',
  'plannedMinor',
  'goalMinor',
  'missing',
  'chargedMinor',
  'committedMinor',
  'lineMinor',
  'alreadyMinor',
  'method',
  'provider',
]);

export function problemFor(error: unknown, requestId: string | null): Problem {
  if (DomainError.is(error)) {
    const status = STATUS_BY_CODE[error.code] ?? 400;
    const details = error.details ? Object.fromEntries(Object.entries(error.details).filter(([key]) => PUBLIC_DETAIL_KEYS.has(key))) : undefined;
    const headers: Record<string, string> = { 'content-type': 'application/problem+json' };
    const retry = error.details?.['retryAfterSeconds'];
    if (status === 429 && typeof retry === 'number') headers['retry-after'] = String(Math.ceil(retry));
    return {
      status,
      headers,
      body: {
        type: `https://docs.yusr.example/errors/${error.code.toLowerCase().replace(/_/g, '-')}`,
        title: error.code,
        status,
        // Upstream (provider) failures keep a generic message: their text can include customer data.
        error: {
          code: error.code,
          message: status === 502 ? 'Payment provider unavailable' : error.message,
          ...(details && Object.keys(details).length ? { details } : {}),
        },
        requestId,
      },
    };
  }
  return {
    status: 500,
    headers: { 'content-type': 'application/problem+json' },
    body: {
      type: 'https://docs.yusr.example/errors/internal',
      title: 'INTERNAL',
      status: 500,
      error: { code: 'INTERNAL', message: 'Something went wrong on our side' },
      requestId,
    },
  };
}
