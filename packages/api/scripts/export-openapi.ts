/**
 * Writes the API's OpenAPI 3.1 description to docs/api/openapi.json — the same document the running
 * API serves at /v1/openapi.json. Import it into Postman, Insomnia, Bruno or Swagger UI, or generate
 * a client from it. Run after changing an endpoint:  pnpm api:openapi
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { ENDPOINTS } from '../src/http/endpoints';
import { buildOpenApi } from '../src/http/openapi';

const root = join(__dirname, '..', '..', '..');
const out = join(root, 'docs', 'api', 'openapi.json');
const document = buildOpenApi(ENDPOINTS, { serverUrl: process.env['PUBLIC_API_URL'] ?? 'http://localhost:4000', release: 'docs' });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
const paths = Object.keys((document as { paths: Record<string, unknown> }).paths).length;
console.log(`openapi: ${paths} paths → ${relative(root, out)}`);
