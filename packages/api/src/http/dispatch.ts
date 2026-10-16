/**
 * Runs one request through an endpoint, the same way under every host:
 * session → access → rate limit → cache → validation → handler → response.
 * Errors of any kind leave as problem+json with a stable domain code (problem.ts);
 * unexpected ones are reported through `onError` (logs, Sentry) without leaking details.
 */
import { DomainError, isStaff } from '@yusr/core';
import type { ZodType } from 'zod';
import type { Services } from '../app.services';
import type { CallContext, RequestActor } from '../common/actor';
import { header, isReply, type AnyEndpoint, type RawRequest, type Reply } from './endpoint';
import { problemFor } from './problem';

export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer | null;
}

export interface DispatchOptions {
  services: Services;
  /** Unexpected (5xx) failures: log them and send them to error tracking. */
  onError?: (error: unknown, request: RawRequest) => void;
}

/** Nothing personal is cached by browsers or proxies unless an endpoint says otherwise. */
const NO_STORE = 'no-store';

function authenticate(request: RawRequest, services: Services): RequestActor | null {
  const authorization = header(request, 'authorization');
  if (!authorization) return null;
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw new DomainError('UNAUTHENTICATED', 'Use a Bearer token');
  return services.auth.authenticate(token);
}

function channelOf(request: RawRequest): CallContext['channel'] {
  const channel = header(request, 'x-yusr-channel');
  return channel === 'mobile' || channel === 'admin' ? channel : 'web';
}

/** Validates with a shared schema; failures carry field-level issues the forms can show. */
export function validate<T>(schema: ZodType<T>, value: unknown, where: 'body' | 'query'): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.slice(0, 20).map((issue) => ({ path: issue.path.map(String).join('.'), code: issue.code, message: issue.message }));
  throw new DomainError('VALIDATION_FAILED', `Invalid ${where}`, { issues, fields: [...new Set(issues.map((issue) => issue.path))] });
}

/** Stable cache key: path + sorted query. */
function cacheKey(request: RawRequest): string {
  const query = Object.entries(request.query)
    .filter(([, value]) => value !== undefined && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return `http:${request.path}?${query}`;
}

function toReply(result: unknown, route: AnyEndpoint): Reply {
  if (isReply(result)) return result;
  return { kind: 'json', status: route.status ?? 200, body: result ?? null };
}

function serialize(out: Reply, cacheControl: string): HttpResult {
  const headers: Record<string, string> = { 'cache-control': cacheControl, ...(out.headers ?? {}) };
  switch (out.kind) {
    case 'json':
      return { status: out.status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body: JSON.stringify(out.body) };
    case 'content':
      return { status: out.status, headers: { 'content-type': out.contentType, ...headers }, body: out.body };
    case 'redirect':
      return { status: out.status, headers: { location: out.location, ...headers }, body: null };
    case 'empty':
      return { status: out.status, headers, body: null };
  }
}

export async function dispatch(route: AnyEndpoint, request: RawRequest, options: DispatchOptions): Promise<HttpResult> {
  const { services } = options;
  try {
    if (route.enabled && !route.enabled(services)) throw new DomainError('NOT_FOUND', 'Not available in this environment');

    const actor = authenticate(request, services);
    if (route.access !== 'public' && !actor) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue');
    if (route.access === 'staff' && actor && !isStaff(actor.roles)) throw new DomainError('FORBIDDEN', 'Staff only');
    const ctx: CallContext = { actor, ip: request.ip, requestId: request.requestId, channel: channelOf(request) };

    if (route.rateLimit) {
      const { name, by, limit, windowSeconds } = route.rateLimit;
      const who = by === 'actor' && actor ? `u:${actor.id}` : `ip:${request.ip ?? 'unknown'}`;
      await services.limiter.consume(`${name}:${who}`, { limit, windowSeconds });
    }

    // Guests share cached copies of public pages; signed-in callers always get fresh data.
    const cached = route.cache && request.method === 'GET' && !actor ? { key: cacheKey(request), seconds: route.cache.seconds } : null;
    const publicCache = cached ? `public, max-age=${cached.seconds}, stale-while-revalidate=${cached.seconds * 4}` : NO_STORE;
    if (cached) {
      const hit = await services.kv.get(cached.key).catch(() => null);
      if (hit !== null) {
        return { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': publicCache, 'x-cache': 'hit' }, body: hit };
      }
    }

    const query = route.query ? validate(route.query, request.query, 'query') : undefined;
    let body: unknown;
    if (route.rawBody) {
      if (!request.rawBody) throw new DomainError('VALIDATION_FAILED', 'Request body is required');
    } else if (route.body) {
      body = validate(route.body, request.body ?? {}, 'body');
    }

    const out = toReply(await route.handle({ services, ctx, params: request.params, query, body, request }), route);
    const result = serialize(out, publicCache);
    if (cached && out.kind === 'json' && out.status === 200 && typeof result.body === 'string') {
      await services.kv.set(cached.key, result.body, { ttlSeconds: cached.seconds }).catch(() => undefined);
      result.headers['x-cache'] = 'miss';
    }
    return result;
  } catch (error) {
    const problem = problemFor(error, request.requestId);
    if (problem.status >= 500) options.onError?.(error, request);
    return { status: problem.status, headers: { ...problem.headers, 'cache-control': NO_STORE }, body: JSON.stringify(problem.body) };
  }
}
