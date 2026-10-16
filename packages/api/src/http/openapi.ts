/**
 * OpenAPI 3.1 generated from the endpoint table: request bodies and query strings come
 * straight from the zod schemas the API validates with, so the document cannot drift.
 * Responses name their @yusr/core type; errors share one problem+json schema.
 */
import { DOMAIN_ERROR_CODES } from '@yusr/core';
import { z, type ZodType } from 'zod';
import { fullPath, type AnyEndpoint } from './endpoint';
import { STATUS_BY_CODE } from './problem';

type JsonSchema = Record<string, unknown>;

function toJsonSchema(schema: ZodType): JsonSchema {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema;
  return rest;
}

function queryParameters(route: AnyEndpoint) {
  if (!route.query) return [];
  const schema = toJsonSchema(route.query);
  const properties = (schema['properties'] ?? {}) as Record<string, JsonSchema>;
  const required = new Set((schema['required'] ?? []) as string[]);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.has(name) && property['default'] === undefined,
    schema: property,
  }));
}

function pathParameters(route: AnyEndpoint) {
  return [...route.path.matchAll(/[:*]([A-Za-z]+)/g)].map((match) => ({ name: match[1]!, in: 'path', required: true, schema: { type: 'string' } }));
}

const ACCESS_NOTE: Record<AnyEndpoint['access'], string> = {
  public: 'Open to guests; a Bearer token is read when sent.',
  user: 'Requires a signed-in session.',
  staff: 'Requires a staff session with two-factor authentication.',
};

export function buildOpenApi(endpoints: readonly AnyEndpoint[], options: { serverUrl: string; release: string }) {
  const paths: Record<string, Record<string, unknown>> = {};
  const documented = endpoints.filter((route) => route.tag !== 'Development');
  for (const route of documented) {
    const path = fullPath(route).replace(/[:*]([A-Za-z]+)/g, '{$1}');
    const status = String(route.status ?? 200);
    const notes = [
      route.description,
      ACCESS_NOTE[route.access],
      route.permission ? `Permission: \`${route.permission}\`.` : null,
      route.rateLimit ? `Rate limit: ${route.rateLimit.limit} per ${route.rateLimit.windowSeconds}s per ${route.rateLimit.by === 'ip' ? 'IP' : 'user'}.` : null,
      route.cache ? `Cached for guests for ${route.cache.seconds}s.` : null,
    ].filter(Boolean);
    (paths[path] ??= {})[route.method.toLowerCase()] = {
      operationId: route.id,
      tags: [route.tag],
      summary: route.summary,
      description: notes.join('\n\n'),
      security: route.access === 'public' ? [{}, { bearer: [] }] : [{ bearer: [] }],
      parameters: [
        ...pathParameters(route),
        ...queryParameters(route),
        ...(route.headers ?? []).map((item) => ({
          name: item.name,
          in: 'header',
          required: item.required,
          description: item.description,
          schema: { type: 'string' },
        })),
      ],
      ...(route.body
        ? { requestBody: { required: true, content: { 'application/json': { schema: toJsonSchema(route.body) } } } }
        : route.rawBody
          ? { requestBody: { required: true, content: { 'application/json': { schema: { description: 'Provider payload, verified byte for byte' } } } } }
          : {}),
      ...(route.permission ? { 'x-permission': route.permission } : {}),
      responses: {
        [status]: route.returns
          ? { description: route.returns, content: { 'application/json': { schema: { description: `${route.returns} (see @yusr/core)` } } } }
          : { description: 'Done' },
        default: { description: 'Error', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Yusr API',
      version: options.release,
      description:
        'Donations, case pipeline and operations for the Yusr platform. Amounts are integers in minor units (piasters, halalas, cents). ' +
        'Text fields that face donors are `{ ar, en }`. Send `Accept-Language` for server-side messages and `X-Request-Id` to correlate support tickets.',
    },
    servers: [{ url: options.serverUrl }],
    tags: [...new Set(documented.map((route) => route.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Problem: {
          type: 'object',
          required: ['type', 'title', 'status', 'error', 'requestId'],
          properties: {
            type: { type: 'string', format: 'uri' },
            title: { type: 'string' },
            status: { type: 'integer' },
            requestId: { type: ['string', 'null'] },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', enum: [...DOMAIN_ERROR_CODES, 'INTERNAL'] },
                message: { type: 'string', description: 'For developers. Apps show the localized text for `code`.' },
                details: { type: 'object', additionalProperties: true },
              },
            },
          },
          'x-status-by-code': STATUS_BY_CODE,
        },
      },
    },
  };
}
