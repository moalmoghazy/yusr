import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError, createHttpAdminClient, createHttpClient, type HttpClientOptions } from '../src/index';

/** A fetch that records what the client sent and answers 200 `{}`. */
function recorder() {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), headers: { ...(init?.headers as Record<string, string>) } });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetch };
}

const BASE = 'https://api.example/v1';

describe('HTTP client paths', () => {
  it('encodes ids so they stay one path segment', async () => {
    const { calls, fetch } = recorder();
    const admin = createHttpAdminClient({ baseUrl: BASE, fetch });
    await admin.transitionCase('../../auth/otp?x=1#', 'published');
    await admin.approvePayout('a/b');
    await admin.updateChecklist('t%2F', 'identity', true);
    assert.equal(calls[0]!.url, `${BASE}/admin/cases/..%2F..%2Fauth%2Fotp%3Fx%3D1%23/transitions`);
    assert.equal(calls[1]!.url, `${BASE}/admin/payouts/a%2Fb/approve`);
    assert.equal(calls[2]!.url, `${BASE}/admin/verification-tasks/t%252F/checklist`);
    // The URL parser keeps the encoded id inside its own segment.
    assert.equal(new URL(calls[0]!.url).pathname, '/v1/admin/cases/..%2F..%2Fauth%2Fotp%3Fx%3D1%23/transitions');
  });

  it('refuses dot segments and empty ids before calling the API', async () => {
    const { calls, fetch } = recorder();
    const admin = createHttpAdminClient({ baseUrl: BASE, fetch });
    for (const id of ['..', '.', '']) {
      await assert.rejects(
        async () => admin.approveRefund(id),
        (error: unknown) => error instanceof ApiError && error.code === 'VALIDATION_FAILED',
      );
    }
    assert.equal(calls.length, 0);
  });
});

describe('HTTP client edge headers', () => {
  const headersFor = async (edge: HttpClientOptions['edge']) => {
    const { calls, fetch } = recorder();
    await createHttpClient({ baseUrl: BASE, fetch, ...(edge ? { edge } : {}) }).stats();
    return calls[0]!.headers;
  };

  it('sends the edge secret and the visitor address when configured', async () => {
    const headers = await headersFor({ secret: 's3cret', clientIp: '203.0.113.7' });
    assert.equal(headers['x-yusr-edge-secret'], 's3cret');
    assert.equal(headers['x-yusr-client-ip'], '203.0.113.7');
  });

  it('sends nothing without a secret, and no address when it is unknown', async () => {
    const none = await headersFor(undefined);
    assert.equal(none['x-yusr-edge-secret'], undefined);
    assert.equal(none['x-yusr-client-ip'], undefined);
    const empty = await headersFor({ secret: '', clientIp: '203.0.113.7' });
    assert.equal(empty['x-yusr-edge-secret'], undefined);
    assert.equal(empty['x-yusr-client-ip'], undefined);
    const noIp = await headersFor({ secret: 's3cret', clientIp: null });
    assert.equal(noIp['x-yusr-edge-secret'], 's3cret');
    assert.equal(noIp['x-yusr-client-ip'], undefined);
  });
});
