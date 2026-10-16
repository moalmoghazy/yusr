/**
 * Mounts the endpoint table on NestJS: one controller per tag, one handler per endpoint,
 * each built with Nest's own decorators (Get/Post…, Version, Req, Res), so routes show up
 * in Nest's route map, URI versioning (/v1) applies, and DI provides the services.
 * Every handler hands the request to dispatch(), the same pipeline the tests exercise.
 */
import { Controller, Delete, Get, Inject, Logger, Patch, Post, Put, Req, Res, VERSION_NEUTRAL, Version, type Type } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Response } from 'express';
import { SERVICES, type Services } from '../../app.services';
import { dispatch, type HttpResult } from '../dispatch';
import type { AnyEndpoint, HttpMethod, RawRequest } from '../endpoint';
import type { AppRequest } from '../request';

const ROUTE: Readonly<Record<HttpMethod, (path: string) => MethodDecorator>> = { GET: Get, POST: Post, PUT: Put, PATCH: Patch, DELETE: Delete };
const logger = new Logger('HTTP');

/** Express request → the host-neutral shape dispatch() reads. */
export function toRawRequest(request: AppRequest): RawRequest {
  const params: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.params ?? {})) {
    // Express 5 gives wildcard segments (/*key) as an array.
    params[name] = Array.isArray(value) ? value.join('/') : String(value);
  }
  const query: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(request.query ?? {})) {
    query[name] = typeof value === 'string' ? value : Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined;
  }
  const raw = Buffer.isBuffer(request.body) ? request.body : null;
  return {
    method: request.method as HttpMethod,
    path: request.path,
    params,
    query,
    headers: request.headers,
    body: raw ? undefined : request.body,
    rawBody: raw ?? request.rawBody ?? null,
    ip: request.ip ?? null,
    requestId: request.requestId ?? null,
  };
}

export function send(response: Response, result: HttpResult): void {
  response.status(result.status);
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
  if (result.body === null) response.end();
  else response.end(result.body);
}

function reportError(error: unknown, request: RawRequest): void {
  logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error), `requestId=${request.requestId ?? 'none'}`);
  Sentry.captureException(error, { tags: { requestId: request.requestId ?? 'none', path: request.path } });
}

export function endpointControllers(endpoints: readonly AnyEndpoint[]): Type[] {
  const groups = new Map<string, AnyEndpoint[]>();
  for (const route of endpoints) groups.set(route.tag, [...(groups.get(route.tag) ?? []), route]);

  return [...groups].map(([tag, routes]) => {
    class EndpointController {
      constructor(@Inject(SERVICES) readonly services: Services) {}
    }
    Object.defineProperty(EndpointController, 'name', { value: `${tag.replace(/[^A-Za-z]+/g, '')}Controller` });

    for (const route of routes) {
      const target = EndpointController.prototype as unknown as Record<string, unknown>;
      target[route.id] = async function handle(this: EndpointController, request: AppRequest, response: Response) {
        send(response, await dispatch(route, toRawRequest(request), { services: this.services, onError: reportError }));
      };
      const descriptor = Object.getOwnPropertyDescriptor(target, route.id)!;
      ROUTE[route.method](route.path)(target, route.id, descriptor);
      Version(route.version ?? VERSION_NEUTRAL)(target, route.id, descriptor);
      Req()(target, route.id, 0);
      Res()(target, route.id, 1);
    }
    Controller()(EndpointController);
    return EndpointController;
  });
}
