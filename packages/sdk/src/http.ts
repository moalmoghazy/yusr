import { DOMAIN_ERROR_CODES, DomainError, type DomainErrorCode } from '@yusr/core';
import type { AdminClient, AuthClient, LedgerQuery, YusrClient } from './client';

export interface HttpClientOptions {
  /** e.g. https://api.yusr.example/v1 */
  baseUrl: string;
  /** Returns the current access token (JWT) or null for guests. */
  getAccessToken?: () => string | null | Promise<string | null>;
  locale?: 'ar' | 'en';
  fetch?: typeof fetch;
  timeoutMs?: number;
  /**
   * Server-side callers only (the Next.js servers): the shared secret that lets the API trust the
   * visitor's address sent alongside it, so rate limits apply per visitor and not per server.
   */
  edge?: { secret: string; clientIp?: string | null };
}

/** Error returned by the API: `{ error: { code, message, details } }`. */
export class ApiError extends DomainError {
  readonly status: number;
  constructor(status: number, code: DomainErrorCode, message?: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'ApiError';
    this.status = status;
  }
}

function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toQuery(params: object | undefined): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Ids and other values placed in a path: always one encoded segment, never `/`, `.` or `..`. */
function seg(value: string): string {
  if (value === '' || value === '.' || value === '..') throw new ApiError(0, 'VALIDATION_FAILED', 'Invalid path segment');
  return encodeURIComponent(value);
}

function createRequester(options: HttpClientOptions) {
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  return async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const token = await options.getAccessToken?.();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await fetcher(`${options.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.locale ? { 'Accept-Language': options.locale } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.edge?.secret ? { 'x-yusr-edge-secret': options.edge.secret } : {}),
          ...(options.edge?.secret && options.edge.clientIp ? { 'x-yusr-client-ip': options.edge.clientIp } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 204) return undefined as T;
      const payload = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
      if (!response.ok) {
        const raw = payload?.error?.code;
        const code = (DOMAIN_ERROR_CODES as readonly string[]).includes(raw ?? '') ? (raw as DomainErrorCode) : 'VALIDATION_FAILED';
        throw new ApiError(response.status, response.status === 429 ? 'RATE_LIMITED' : code, payload?.error?.message, payload?.error?.details);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'PAYMENT_PROVIDER_ERROR', error instanceof Error ? error.message : 'Network error');
    } finally {
      clearTimeout(timer);
    }
  };
}

export function createHttpClient(options: HttpClientOptions): YusrClient {
  const request = createRequester(options);
  return {
    stats: () => request('GET', '/stats'),
    listCases: (filters) => request('GET', `/cases${toQuery(filters)}`),
    getCase: async (slug) => {
      try {
        return await request('GET', `/cases/${seg(slug)}`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    liveDonations: (limit = 12) => request('GET', `/donations/live?limit=${limit}`),
    createDonation: (body, opts) => request('POST', '/donations', body, { 'Idempotency-Key': opts?.idempotencyKey ?? newIdempotencyKey() }),
    getDonation: (id, receiptToken) => request('GET', `/donations/${seg(id)}`, undefined, receiptToken ? { 'X-Receipt-Token': receiptToken } : {}),
    myDonations: () => request('GET', '/me/donations'),
    myNotifications: () => request('GET', '/me/notifications'),
    presignUpload: (body) => request('POST', '/uploads', body),
    submitCase: (body) => request('POST', '/cases', body),
  };
}

export function createHttpAdminClient(options: HttpClientOptions): AdminClient {
  const request = createRequester(options);
  const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
  return {
    overview: () => request('GET', '/admin/overview'),
    cases: (filter) => request('GET', `/admin/cases${toQuery(filter)}`),
    transitionCase: (caseId, to, reason) => post(`/admin/cases/${seg(caseId)}/transitions`, { to, reason }),
    setPriority: (caseId, priority) => request('PATCH', `/admin/cases/${seg(caseId)}/priority`, { priority }),
    editCase: (caseId, patch) => request('PATCH', `/admin/cases/${seg(caseId)}`, patch),
    assignAuditor: (caseId, auditorId) => post(`/admin/cases/${seg(caseId)}/verification`, { auditorId }),
    verificationTasks: () => request('GET', '/admin/verification-tasks'),
    updateChecklist: (taskId, item, checked) => request('PATCH', `/admin/verification-tasks/${seg(taskId)}/checklist`, { item, checked }),
    completeVerification: (taskId, recommendedMinor, notes) => post(`/admin/verification-tasks/${seg(taskId)}/complete`, { recommendedMinor, notes }),
    ledger: (query?: LedgerQuery) => request('GET', `/admin/ledger${toQuery(query)}`),
    donations: (filter) => request('GET', `/admin/donations${toQuery(filter)}`),
    confirmTransfer: (donationId, bankReference, receivedMinor) =>
      post(`/admin/donations/${seg(donationId)}/confirm-transfer`, { bankReference, receivedMinor }),
    refunds: () => request('GET', '/admin/refunds'),
    requestRefund: (donationId, reason, amountMinor) => post(`/admin/donations/${seg(donationId)}/refunds`, { reason, amountMinor }),
    approveRefund: (refundId) => post(`/admin/refunds/${seg(refundId)}/approve`),
    payouts: () => request('GET', '/admin/payouts'),
    requestPayout: (caseId, lineId) => post('/admin/payouts', { caseId, lineId }),
    approvePayout: (payoutId) => post(`/admin/payouts/${seg(payoutId)}/approve`),
    markPayoutPaid: (payoutId, bankReference) => post(`/admin/payouts/${seg(payoutId)}/mark-paid`, { bankReference }),
    donors: () => request('GET', '/admin/crm/donors'),
    volunteers: () => request('GET', '/admin/crm/volunteers'),
    team: () => request('GET', '/admin/team'),
    updateRoles: (userId, roles) => request('PUT', `/admin/team/${seg(userId)}/roles`, { roles }),
    audit: (limit = 100) => request('GET', `/admin/audit?limit=${limit}`),
    sentMessages: (limit = 100) => request('GET', `/admin/demo/messages?limit=${limit}`),
    partners: () => request('GET', '/admin/partners'),
    createPartner: (input) => post('/admin/partners', input),
    updatePartner: (partnerId, patch) => request('PATCH', `/admin/partners/${seg(partnerId)}`, patch),
    setPartnerStatus: (partnerId, status, reason) => post(`/admin/partners/${seg(partnerId)}/status`, { status, reason }),
    regeneratePartnerCode: (partnerId) => post(`/admin/partners/${seg(partnerId)}/code`),
  };
}

export function createHttpAuthClient(options: HttpClientOptions): AuthClient {
  const request = createRequester(options);
  return {
    requestOtp: (phone, locale) => request('POST', '/auth/otp', { phone, locale: locale ?? options.locale ?? 'ar' }),
    verifyOtp: (input) => request('POST', '/auth/otp/verify', input),
    signInWithProvider: (provider, input) => request('POST', `/auth/oauth/${seg(provider)}`, input),
    refresh: (refreshToken) => request('POST', '/auth/refresh', { refreshToken }),
    logout: (refreshToken) => request('POST', '/auth/logout', { refreshToken }),
  };
}
