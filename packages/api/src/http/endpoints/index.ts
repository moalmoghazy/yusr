/** Every route of the API, in matching order (static segments before parameters). */
import { endpoint, type AnyEndpoint } from '../endpoint';
import { buildOpenApi } from '../openapi';
import { accountEndpoints } from './account.endpoints';
import { caseOperations, financeOperations, peopleOperations } from './operations.endpoints';
import { partnerApplicationEndpoints, partnerOperations } from './partners.endpoints';
import { publicEndpoints } from './public.endpoints';
import { devEndpoints, systemEndpoints } from './system.endpoints';

let document: ReturnType<typeof buildOpenApi> | null = null;

const openApi = endpoint({
  id: 'openapi',
  method: 'GET',
  path: '/openapi.json',
  version: '1',
  access: 'public',
  tag: 'System',
  summary: 'This API as OpenAPI 3.1',
  cache: { seconds: 300 },
  returns: 'OpenAPI document',
  handle: async ({ services }) => (document ??= buildOpenApi(ENDPOINTS, { serverUrl: services.config.urls.api, release: services.config.release })),
});

export const ENDPOINTS: readonly AnyEndpoint[] = [
  ...systemEndpoints,
  openApi,
  ...publicEndpoints,
  ...partnerApplicationEndpoints,
  ...accountEndpoints,
  ...caseOperations,
  ...financeOperations,
  ...peopleOperations,
  ...partnerOperations,
  ...devEndpoints,
];
