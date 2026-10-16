/**
 * Serves the endpoint table over plain node:http for end-to-end tests: same routes,
 * same dispatch() pipeline as the NestJS host, no framework needed. Routes match in
 * table order with Express path semantics (:param, trailing /*rest).
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Services } from '../../src/app.services';
import { dispatch } from '../../src/http/dispatch';
import { fullPath, type AnyEndpoint, type HttpMethod, type RawRequest } from '../../src/http/endpoint';

interface CompiledRoute {
  route: AnyEndpoint;
  pattern: RegExp;
  names: string[];
}

function compile(route: AnyEndpoint): CompiledRoute {
  const names: string[] = [];
  const source = fullPath(route)
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        names.push(segment.slice(1));
        return '([^/]+)';
      }
      if (segment.startsWith('*')) {
        names.push(segment.slice(1));
        return '(.+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { route, pattern: new RegExp(`^${source}$`), names };
}

export interface TestServer {
  url: string;
  errors: unknown[];
  close(): Promise<void>;
}

export async function serve(endpoints: readonly AnyEndpoint[], services: () => Services): Promise<TestServer> {
  const routes = endpoints.map(compile);
  const errors: unknown[] = [];
  const server = createServer(async (incoming, outgoing) => {
    const url = new URL(incoming.url ?? '/', 'http://localhost');
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);
    const method = (incoming.method ?? 'GET') as HttpMethod;

    let match: { compiled: CompiledRoute; params: Record<string, string> } | null = null;
    for (const compiled of routes) {
      if (compiled.route.method !== method) continue;
      const found = compiled.pattern.exec(url.pathname);
      if (found) {
        match = { compiled, params: Object.fromEntries(compiled.names.map((name, index) => [name, decodeURIComponent(found[index + 1]!)])) };
        break;
      }
    }
    if (!match) {
      outgoing.writeHead(404, { 'content-type': 'application/problem+json' });
      outgoing.end(
        JSON.stringify({ type: 'about:blank', title: 'Not Found', status: 404, error: { code: 'NOT_FOUND', message: 'No such route' }, requestId: null }),
      );
      return;
    }

    const route = match.compiled.route;
    const type = incoming.headers['content-type'] ?? '';
    let body: unknown;
    if (!route.rawBody && raw.length > 0) {
      if (type.includes('application/json')) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          outgoing.writeHead(400, { 'content-type': 'application/problem+json' });
          outgoing.end(JSON.stringify({ status: 400, error: { code: 'VALIDATION_FAILED', message: 'Request body is not valid JSON' } }));
          return;
        }
      } else if (type.includes('application/x-www-form-urlencoded')) {
        body = Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
      }
    }
    const request: RawRequest = {
      method,
      path: url.pathname,
      params: match.params,
      query: Object.fromEntries(url.searchParams),
      headers: incoming.headers,
      body,
      rawBody: route.rawBody ? raw : null,
      ip: incoming.socket.remoteAddress ?? null,
      requestId: (incoming.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    };
    const result = await dispatch(route, request, { services: services(), onError: (error) => errors.push(error) });
    outgoing.writeHead(result.status, { ...result.headers, 'x-request-id': request.requestId! });
    outgoing.end(result.body ?? undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    errors,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
