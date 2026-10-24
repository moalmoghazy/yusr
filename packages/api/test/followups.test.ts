/**
 * Follow-up after funding («متابعة ما بعد الصرف»): who may read and log, which cases take entries, how the
 * board ranks cases, and that every entry is audited without its note.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DomainError, cairoDay, followupState } from '@yusr/core';
import { FollowupsService } from '../src/cases/followups.service';
import { CASE_ID, USERS, actorOf, caseRow, setup } from './support/fixtures';

const FUNDED_ID = '00000000-0000-4000-8000-00000000c010';
const CLOSED_ID = '00000000-0000-4000-8000-00000000c011';
const DAY = 24 * 60 * 60 * 1000;

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(DomainError.is(error), String(error));
    assert.equal(error.code, code);
    return true;
  });
}

async function setupFollowups() {
  const context = await setup();
  const fundedAt = new Date(context.clock.now().getTime() - 3 * DAY);
  await context.db.seed(async (tx) => {
    await tx.cases.insert(caseRow({ id: FUNDED_ID, reference: 'YSR-10490', slug: 'funded-case', status: 'funded', fundedAt }));
    await tx.cases.insert(
      caseRow({
        id: CLOSED_ID,
        reference: 'YSR-10491',
        slug: 'closed-case',
        status: 'closed',
        fundedAt: new Date(fundedAt.getTime() - 9 * DAY),
        closedAt: fundedAt,
      }),
    );
  });
  const followups = new FollowupsService({ db: context.db, clock: context.clock, ids: context.ids });
  return { ...context, followups };
}

const auditor = { actor: actorOf(USERS.auditor) };
const moderator = { actor: actorOf(USERS.moderator) };
const finance = { actor: actorOf(USERS.financeA) };

describe('follow-up after funding', () => {
  it('ranks the board: concern, due, not started, then all well', async () => {
    const { followups, clock } = await setupFollowups();
    const tomorrow = cairoDay(new Date(clock.now().getTime() + DAY));
    await followups.record(CLOSED_ID, { kind: 'beneficiary_call', outcome: 'confirmed', note: 'وصلت المساعدة', nextDueOn: tomorrow }, auditor);
    let board = await followups.board(finance);
    assert.deepEqual(
      board.map((item) => [item.caseId, item.state]),
      [
        [FUNDED_ID, 'pending'],
        [CLOSED_ID, 'ok'],
      ],
    );
    assert.equal(
      board.some((item) => item.caseId === CASE_ID),
      false,
      'published cases are not followed up',
    );

    clock.advance(2 * DAY);
    board = await followups.board(finance);
    assert.equal(board.find((item) => item.caseId === CLOSED_ID)?.state, 'due', 'the next check came due');

    await followups.record(FUNDED_ID, { kind: 'partner_call', outcome: 'concern', note: 'الجمعية لم تسدد بعد' }, moderator);
    board = await followups.board(finance);
    assert.deepEqual(
      board.map((item) => item.state),
      ['concern', 'due'],
    );
  });

  it('keeps the whole log, newest first, with who logged each entry', async () => {
    const { followups, clock } = await setupFollowups();
    await followups.record(CLOSED_ID, { kind: 'partner_call', outcome: 'confirmed', note: 'أكدت الجمعية السداد' }, moderator);
    clock.advance(DAY);
    const log = await followups.record(CLOSED_ID, { kind: 'field_visit', outcome: 'unreachable', note: 'لم نجد الأسرة في المنزل' }, auditor);
    assert.equal(log.count, 2);
    assert.deepEqual(
      log.entries.map((entry) => [entry.kind, entry.recordedBy.name]),
      [
        ['field_visit', USERS.auditor.displayName],
        ['partner_call', USERS.moderator.displayName],
      ],
    );
    assert.equal(log.state, 'due', 'an unreachable family is checked again');
    assert.deepEqual(await followups.log(CLOSED_ID, finance), log);
  });

  it('lets field auditors and moderators log, and anyone who reads cases read', async () => {
    const { followups } = await setupFollowups();
    const entry = { kind: 'beneficiary_call', outcome: 'confirmed', note: 'تمام' } as const;
    await rejects(followups.record(CLOSED_ID, entry, finance), 'FORBIDDEN');
    await rejects(followups.board({ actor: actorOf(USERS.donor) }), 'FORBIDDEN');
    await rejects(followups.board({ actor: actorOf(USERS.volunteer) }), 'FORBIDDEN');
    assert.equal((await followups.record(CLOSED_ID, entry, auditor)).count, 1);
  });

  it('takes entries only on funded or closed cases, with a next check after today', async () => {
    const { followups, clock } = await setupFollowups();
    const entry = { kind: 'beneficiary_call', outcome: 'confirmed', note: 'تمام' } as const;
    await rejects(followups.record(CASE_ID, entry, auditor), 'VALIDATION_FAILED');
    await rejects(followups.log(CASE_ID, auditor), 'NOT_FOUND');
    await rejects(followups.record('00000000-0000-4000-8000-00000000ffff', entry, auditor), 'NOT_FOUND');
    await rejects(followups.record(FUNDED_ID, { ...entry, nextDueOn: cairoDay(clock.now()) }, auditor), 'VALIDATION_FAILED');
  });

  it('audits each entry without its note', async () => {
    const { followups, db } = await setupFollowups();
    await followups.record(FUNDED_ID, { kind: 'payee_check', outcome: 'confirmed', note: 'المستشفى أكد استلام المبلغ' }, auditor);
    const [audit] = await db.read.audit.list({ limit: 5, entityId: FUNDED_ID });
    assert.equal(audit?.action, 'case.followup_recorded');
    assert.deepEqual(audit?.after, { kind: 'payee_check', outcome: 'confirmed', nextDueOn: null });
    assert.equal(JSON.stringify(audit).includes('المستشفى'), false);
  });
});

describe('followupState', () => {
  it('reads the latest entry', () => {
    assert.equal(followupState(null, '2026-10-24'), 'pending');
    assert.equal(followupState({ outcome: 'concern', nextDueOn: '2026-12-01' }, '2026-10-24'), 'concern');
    assert.equal(followupState({ outcome: 'unreachable', nextDueOn: null }, '2026-10-24'), 'due');
    assert.equal(followupState({ outcome: 'confirmed', nextDueOn: '2026-10-24' }, '2026-10-24'), 'due');
    assert.equal(followupState({ outcome: 'confirmed', nextDueOn: '2026-10-25' }, '2026-10-24'), 'ok');
    assert.equal(followupState({ outcome: 'confirmed', nextDueOn: null }, '2026-10-24'), 'ok');
  });
});
