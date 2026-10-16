/**
 * The REST contract as data. Each endpoint says who may call it, what it accepts (zod
 * schemas shared with the apps through @yusr/core/schemas), how it is rate-limited and
 * cached, and which service method answers it. One table drives everything else:
 *  - dispatch.ts runs a request through it (auth → limits → cache → validation → handler → errors),
 *  - nest/endpoint.controllers.ts mounts it as NestJS controllers,
 *  - openapi.ts publishes it as OpenAPI 3.1,
 *  - the end-to-end tests serve it over plain node:http and drive it with the real SDK.
 * Rules about money, permissions and state live in the services, never here.
 */
import type { Permission } from '@yusr/core';
import type { ZodType } from 'zod';
import type { Services } from '../app.services';
import type { CallContext } from '../common/actor';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Who may call: `public` accepts guests (and reads the session when one is sent),
 * `user` needs a signed-in person, `staff` a staff role. The exact permission and the
 * two-factor requirement are enforced by the service itself (requirePermission).
 */
export type Access = 'public' | 'user' | 'staff';

/** A request as the host (NestJS/Express, or node:http in tests) hands it over. */
export interface RawRequest {
  method: HttpMethod;
  /** Path without the query string, e.g. /v1/cases. */
  path: string;
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string | undefined>>;
  /** Lower-cased names. */
  headers: Readonly<Record<string, string | string[] | undefined>>;
  /** Parsed JSON or form body (undefined for raw bodies). */
  body: unknown;
  /** Exact bytes: webhook signatures and file uploads. */
  rawBody: Buffer | null;
  ip: string | null;
  requestId: string | null;
}

export interface HandlerInput<B, Q> {
  services: Services;
  ctx: CallContext;
  params: Readonly<Record<string, string>>;
  query: Q;
  body: B;
  request: RawRequest;
}

/** Anything other than a plain JSON 200/201. */
export type Reply =
  | { kind: 'json'; status: number; body: unknown; headers?: Record<string, string> }
  | { kind: 'content'; status: number; body: string | Buffer; contentType: string; headers?: Record<string, string> }
  | { kind: 'redirect'; status: 302 | 303; location: string; headers?: Record<string, string> }
  | { kind: 'empty'; status: 202 | 204; headers?: Record<string, string> };

const REPLY = Symbol('yusr.reply');
type Tagged = Reply & { [REPLY]: true };

export const reply = {
  json: (status: number, body: unknown, headers?: Record<string, string>): Reply => tag({ kind: 'json', status, body, headers }),
  html: (body: string, headers?: Record<string, string>): Reply =>
    tag({ kind: 'content', status: 200, body, contentType: 'text/html; charset=utf-8', headers }),
  content: (body: string | Buffer, contentType: string, headers?: Record<string, string>): Reply =>
    tag({ kind: 'content', status: 200, body, contentType, headers }),
  redirect: (location: string, status: 302 | 303 = 303, headers?: Record<string, string>): Reply => tag({ kind: 'redirect', status, location, headers }),
  empty: (status: 202 | 204 = 204): Reply => tag({ kind: 'empty', status }),
};

function tag(value: Reply): Reply {
  return Object.assign(value, { [REPLY]: true as const });
}

export function isReply(value: unknown): value is Reply {
  return typeof value === 'object' && value !== null && (value as Tagged)[REPLY] === true;
}

export interface RateLimit {
  /** Counter name, e.g. donations:create. */
  name: string;
  limit: number;
  windowSeconds: number;
  /** Counted per client IP, or per signed-in person (falling back to the IP). */
  by: 'ip' | 'actor';
}

export interface Endpoint<B = unknown, Q = unknown> {
  /** Stable operation id (OpenAPI operationId and the NestJS handler name), e.g. donations.create. */
  id: string;
  method: HttpMethod;
  /** Express-style path: /cases/:slug, or a trailing /*key for the rest of the path. */
  path: string;
  /** '1' mounts under /v1; null for unversioned paths (health, dev storage). */
  version: '1' | null;
  access: Access;
  tag: string;
  summary: string;
  description?: string;
  /** Documented here; enforced by the service. */
  permission?: Permission;
  body?: ZodType<B>;
  query?: ZodType<Q>;
  /** Hand the exact request bytes to the handler (webhooks, uploads). */
  rawBody?: boolean;
  /** Status for a plain result (default 200). */
  status?: 200 | 201 | 202;
  rateLimit?: RateLimit;
  /** Public GET responses cached in Redis for guests, with a matching Cache-Control. */
  cache?: { seconds: number };
  /** Request headers worth documenting (Idempotency-Key, X-Receipt-Token…). */
  headers?: ReadonlyArray<{ name: string; required: boolean; description: string }>;
  /** Response type for the docs (a @yusr/core type name). */
  returns?: string;
  /** Endpoints that exist only in some setups (the payment simulator, dev storage). */
  enabled?: (services: Services) => boolean;
  handle(input: HandlerInput<B, Q>): Promise<unknown>;
}

/** Identity helper that keeps B and Q inferred from the schemas. */
export function endpoint<B = undefined, Q = undefined>(definition: Endpoint<B, Q>): Endpoint<B, Q> {
  return definition;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEndpoint = Endpoint<any, any>;

/** The public path of an endpoint, e.g. /v1/cases/:slug. */
export function fullPath(route: Pick<AnyEndpoint, 'path' | 'version'>): string {
  return route.version ? `/v${route.version}${route.path}` : route.path;
}

export function header(request: RawRequest, name: string): string | null {
  const value = request.headers[name.toLowerCase()];
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : null;
}
