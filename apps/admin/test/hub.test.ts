import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiEdge } from '../src/lib/env';
import { formId } from '../src/lib/form';
import { safeNext } from '../src/lib/safe-next';

describe('safeNext (after sign-in)', () => {
  it('keeps paths on this site', () => {
    assert.equal(safeNext('/cases'), '/cases');
    assert.equal(safeNext('/cases?status=published#top'), '/cases?status=published#top');
    assert.equal(safeNext('/finance/../audit'), '/audit');
  });

  it('refuses other origins and anything a browser could read as one', () => {
    for (const value of [
      null,
      '',
      'cases',
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/\r\n/evil.example',
      '/\n/evil.example',
      '/\x00/evil.example',
      '\t//evil.example',
      'javascript:alert(1)',
    ]) {
      assert.equal(safeNext(value), '/', JSON.stringify(value));
    }
  });
});

describe('formId (hub actions)', () => {
  const form = (value: string) => {
    const data = new FormData();
    data.set('caseId', value);
    return data;
  };

  it('accepts a UUID and refuses anything else', () => {
    assert.equal(formId(form(' 0b6f2a4e-7d9c-4e1a-8f3b-2c5d6e7f8a9b '), 'caseId'), '0b6f2a4e-7d9c-4e1a-8f3b-2c5d6e7f8a9b');
    for (const value of ['', '..', '../admin/team', '0b6f2a4e-7d9c-4e1a-8f3b-2c5d6e7f8a9b/../x', 'pay_00001']) {
      assert.equal(formId(form(value), 'caseId'), null, value);
    }
    assert.equal(formId(new FormData(), 'caseId'), null);
  });
});

describe('apiEdge (visitor address for the API)', () => {
  const incoming = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

  it('sends nothing without YUSR_EDGE_SECRET', () => {
    delete process.env['YUSR_EDGE_SECRET'];
    assert.equal(apiEdge(incoming({ 'x-real-ip': '203.0.113.7' })), undefined);
  });

  it('prefers x-real-ip, then the first x-forwarded-for entry', () => {
    process.env['YUSR_EDGE_SECRET'] = 's3cret';
    try {
      assert.deepEqual(apiEdge(incoming({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' })), {
        secret: 's3cret',
        clientIp: '203.0.113.7',
      });
      assert.deepEqual(apiEdge(incoming({ 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1' })), { secret: 's3cret', clientIp: '198.51.100.1' });
      assert.deepEqual(apiEdge(incoming({})), { secret: 's3cret', clientIp: null });
    } finally {
      delete process.env['YUSR_EDGE_SECRET'];
    }
  });
});
