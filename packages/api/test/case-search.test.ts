/**
 * Staff lists ask for statuses themselves: the in-memory store (the public demo) must return cases
 * under review and drafts too, or a case sent from «قدّم حالة» never reaches the hub.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { caseRow, setup } from './support/fixtures';

describe('case search in the in-memory store', () => {
  it('returns cases under review when staff ask for them, and only public ones to the public', async () => {
    const { db } = await setup();
    await db.seed(async (tx) => {
      await tx.cases.insert(
        caseRow({ id: '00000000-0000-4000-8000-00000000c031', status: 'under_review', title: { ar: 'جراحة قلب عاجلة', en: 'Urgent heart surgery' } }),
      );
      await tx.cases.insert(caseRow({ id: '00000000-0000-4000-8000-00000000c032', status: 'draft' }));
    });
    const staff = await db.read.cases.search({ statuses: ['under_review'], limit: 50 });
    assert.deepEqual(
      staff.items.map((item) => item.id),
      ['00000000-0000-4000-8000-00000000c031'],
    );
    const searched = await db.read.cases.search({ statuses: ['draft', 'under_review', 'published'], q: 'جراحة قلب', limit: 50 });
    assert.ok(searched.items.some((item) => item.id === '00000000-0000-4000-8000-00000000c031'));
    const publicList = await db.read.cases.search({ statuses: ['published'], limit: 50 });
    assert.ok(publicList.items.every((item) => item.status === 'published'));
  });
});
