import { DomainError } from '@yusr/core';
import type { FetchLike } from './gateway';

export interface JsonRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  /** JSON body, or a URLSearchParams for form-encoded APIs (Stripe). */
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Calls a provider API and returns parsed JSON. Network errors, timeouts and non-2xx
 * responses become PAYMENT_PROVIDER_ERROR with the status and a short body excerpt
 * (never the full body — it can contain card or customer data).
 */
export async function callJson<T>(fetchImpl: FetchLike, provider: string, url: string, request: JsonRequest = {}): Promise<T> {
  const isForm = request.body instanceof URLSearchParams;
  const headers: Record<string, string> = { accept: 'application/json', ...request.headers };
  if (request.body !== undefined && !isForm) headers['content-type'] = 'application/json';
  if (isForm) headers['content-type'] = 'application/x-www-form-urlencoded';

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: request.method ?? (request.body === undefined ? 'GET' : 'POST'),
      headers,
      body: request.body === undefined ? undefined : isForm ? String(request.body) : JSON.stringify(request.body),
      signal: AbortSignal.timeout(request.timeoutMs ?? 15_000),
    });
  } catch (error) {
    throw new DomainError('PAYMENT_PROVIDER_ERROR', `${provider} unreachable: ${(error as Error).message}`, { provider });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new DomainError('PAYMENT_PROVIDER_ERROR', `${provider} responded ${response.status}`, {
      provider,
      status: response.status,
      excerpt: text.slice(0, 160),
    });
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new DomainError('PAYMENT_PROVIDER_ERROR', `${provider} returned invalid JSON`, { provider });
  }
}

export function parseJsonBody(rawBody: Buffer, provider: string): Record<string, unknown> {
  try {
    const value = JSON.parse(rawBody.toString('utf8')) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new DomainError('VALIDATION_FAILED', `${provider} webhook body is not a JSON object`);
}
