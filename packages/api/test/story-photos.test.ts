/**
 * «قصص نجاح» with real photos: staff with cases:edit upload one per closed case, the website reads it
 * only while the case is closed, and each story lists its contributors as the case page names them.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError } from '@yusr/core';
import { CasesService } from '../src/cases/cases.service';
import { FieldCipher } from '../src/common/cipher';
import { MemoryKv } from '../src/common/kv';
import { RateLimiter } from '../src/common/rate-limit';
import { PartnersService } from '../src/partners/partners.service';
import { USERS, actorOf, caseRow, setup } from './support/fixtures';

const CLOSED_ID = '00000000-0000-4000-8000-00000000c021';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([8, 0, 0, 0]), Buffer.from('WEBPVP8 ')]).toString('base64');

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(DomainError.is(error), String(error));
    assert.equal(error.code, code);
    return true;
  });
}

async function setupStories() {
  const context = await setup();
  const closedAt = new Date(context.clock.now().getTime() - 86_400_000);
  await context.db.seed(async (tx) => {
    await tx.cases.insert(caseRow({ id: CLOSED_ID, reference: 'YSR-10495', slug: 'closed-story', status: 'closed', fundedAt: closedAt, closedAt }));
  });
  const cipher = new FieldCipher(FieldCipher.randomKey());
  const limiter = new RateLimiter(new MemoryKv(context.clock));
  const partners = new PartnersService({ db: context.db, cipher, clock: context.clock, ids: context.ids, limiter, config: { codePepper: 'p' } });
  const cases = new CasesService({ db: context.db, cipher, clock: context.clock, ids: context.ids, partners, config: { nationalIdPepper: 'nid' } });
  return { ...context, cases };
}

const moderator = { actor: actorOf(USERS.moderator) };

describe('«قصص نجاح» photos and contributors', () => {
  it('lets content moderators add a photo to a closed case, and serves it until removed', async () => {
    const { cases } = await setupStories();
    assert.equal((await cases.stories(6)).find((story) => story.id === CLOSED_ID)?.photoVersion, null);
    await rejects(cases.setStoryPhoto(CLOSED_ID, { contentType: 'image/jpeg', dataBase64: JPEG }, { actor: actorOf(USERS.auditor) }), 'FORBIDDEN');
    const { version } = await cases.setStoryPhoto(CLOSED_ID, { contentType: 'image/jpeg', dataBase64: JPEG }, moderator);
    const story = (await cases.stories(6)).find((entry) => entry.id === CLOSED_ID);
    assert.equal(story?.photoVersion, version);
    assert.deepEqual(story?.contributors, []);
    const served = await cases.publicStoryPhoto(CLOSED_ID);
    assert.equal(served.type, 'image/jpeg');
    assert.equal(served.version, version);
    await cases.setStoryPhoto(CLOSED_ID, { contentType: 'image/webp', dataBase64: WEBP }, moderator);
    assert.equal((await cases.publicStoryPhoto(CLOSED_ID)).type, 'image/webp');
    await cases.removeStoryPhoto(CLOSED_ID, moderator);
    await rejects(cases.publicStoryPhoto(CLOSED_ID), 'NOT_FOUND');
  });

  it('refuses open cases and files that are not the picture they claim', async () => {
    const { cases } = await setupStories();
    await rejects(cases.setStoryPhoto('00000000-0000-4000-8000-00000000c001', { contentType: 'image/jpeg', dataBase64: JPEG }, moderator), 'VALIDATION_FAILED');
    await rejects(cases.setStoryPhoto(CLOSED_ID, { contentType: 'image/webp', dataBase64: JPEG }, moderator), 'VALIDATION_FAILED');
    await rejects(cases.publicStoryPhoto('00000000-0000-4000-8000-00000000c001'), 'NOT_FOUND');
  });
});
