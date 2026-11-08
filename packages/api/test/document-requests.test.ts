/**
 * «اطلب الاطلاع على الوثائق»: anyone may ask to see a public case's documents, staff with documents:share
 * see the requests with a waiting count and mark them, and the WhatsApp number never reaches the audit log.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError, hasPermission } from '@yusr/core';
import { documentRequestSchema } from '@yusr/core/schemas';
import { DocumentRequestsService } from '../src/cases/document-requests.service';
import { USERS, actorOf, setup } from './support/fixtures';

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(DomainError.is(error), String(error));
    assert.equal(error.code, code);
    return true;
  });
}

async function setupRequests() {
  const context = await setup();
  return { ...context, requests: new DocumentRequestsService({ db: context.db, clock: context.clock, ids: context.ids }) };
}

const visitor = { actor: null, ip: '203.0.113.9' };
const moderator = { actor: actorOf(USERS.moderator) };
const ask = { name: 'منى سامي', whatsapp: '+201022223333', viewOnly: true as const };

describe('requests to see case documents', () => {
  it('needs a name, an international WhatsApp number and agreement to view-only', () => {
    assert.equal(documentRequestSchema.safeParse(ask).success, true);
    assert.equal(documentRequestSchema.safeParse({ ...ask, whatsapp: '01022223333' }).success, false);
    assert.equal(documentRequestSchema.safeParse({ ...ask, viewOnly: false }).success, false);
    assert.equal(documentRequestSchema.safeParse({ name: 'منى', whatsapp: ask.whatsapp }).success, false);
  });

  it('takes a request on a public case without an account, once per number while it waits, and logs it without the number', async () => {
    const { requests, db } = await setupRequests();
    assert.deepEqual(await requests.request('heart-surgery', ask, visitor), { received: true });
    assert.deepEqual(await requests.request('heart-surgery', ask, visitor), { received: true });
    const inbox = await requests.inbox(moderator);
    assert.equal(inbox.items.length, 1);
    assert.equal(inbox.waiting, 1);
    assert.equal(inbox.items[0]?.case.reference, 'YSR-10482');
    assert.equal(inbox.items[0]?.whatsapp, '+201022223333');
    const [entry] = await db.read.audit.list({ limit: 1, entityType: 'document_request' });
    assert.equal(entry?.action, 'documents.requested');
    assert.doesNotMatch(JSON.stringify(entry), /201022223333/);
  });

  it('refuses cases that are not public', async () => {
    const { requests } = await setupRequests();
    await rejects(requests.request('draft-case', ask, visitor), 'NOT_FOUND');
    await rejects(requests.request('no-such-case', ask, visitor), 'NOT_FOUND');
  });

  it('shows requests to content moderators, not auditors or finance, and records who answered', async () => {
    const { requests } = await setupRequests();
    assert.equal(hasPermission(['content_moderator'], 'documents:share'), true);
    assert.equal(hasPermission(['super_admin'], 'documents:share'), true);
    await requests.request('heart-surgery', ask, visitor);
    await rejects(requests.inbox({ actor: actorOf(USERS.auditor) }), 'FORBIDDEN');
    await rejects(requests.inbox({ actor: actorOf(USERS.financeA) }), 'FORBIDDEN');
    const [first] = (await requests.inbox(moderator)).items;
    await rejects(requests.setStatus(first!.id, 'sent', { actor: actorOf(USERS.auditor) }), 'FORBIDDEN');
    const sent = await requests.setStatus(first!.id, 'sent', moderator);
    assert.equal(sent.status, 'sent');
    assert.equal(sent.handledBy?.id, USERS.moderator.id);
    assert.ok(sent.handledAt);
    assert.equal((await requests.inbox(moderator)).waiting, 0);
    // Once answered, the same number may ask again.
    await requests.request('heart-surgery', ask, visitor);
    assert.equal((await requests.inbox(moderator)).waiting, 1);
  });
});
