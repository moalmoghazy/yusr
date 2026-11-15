import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { oversightBoard, permissionsFor, type AdminCase, type FollowupCase, type OversightReview, type VerificationTask } from '../src/index';

const NOW = new Date('2026-11-15T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function adminCase(overrides: Partial<AdminCase> & { id: string }): AdminCase {
  return {
    slug: overrides.id,
    reference: `YSR-${overrides.id}`,
    category: 'medical',
    status: 'published',
    title: { ar: 'حالة', en: 'Case' },
    summary: { ar: 'ملخص', en: 'Summary' },
    shareText: null,
    region: 'EG-C',
    currency: 'EGP',
    goalMinor: 110_000_00,
    platformFeeMinor: 10_000_00,
    raisedMinor: 0,
    donorsCount: 0,
    isUrgent: false,
    deadline: null,
    zakatEligible: false,
    verifiedAt: daysAgo(10),
    publishedAt: daysAgo(9),
    fundedAt: null,
    priority: 0,
    coverSeed: 1,
    createdAt: daysAgo(12),
    story: { ar: '', en: '' },
    beneficiary: { ar: '', en: '' },
    documents: [
      { id: 'd', kind: 'medical_report', title: { ar: '', en: '' }, pages: 1, redacted: true, verifiedBy: { ar: '', en: '' }, issuedAt: daysAgo(12) },
    ],
    timeline: [],
    disbursements: [],
    updates: [],
    recentDonations: [],
    submittedBy: { name: 'جمعية', relation: 'association', association: null },
    auditor: null,
    history: [],
    updatedAt: daysAgo(1),
    ...overrides,
  };
}

const task = (overrides: Partial<VerificationTask> & { id: string; caseId: string }): VerificationTask => ({
  auditorId: 'a',
  auditorName: 'آية',
  status: 'completed',
  visitAt: daysAgo(11),
  checklist: { identity: true, residence: true, documents: true, cost: true, alternatives: true },
  recommendedMinor: 100_000_00,
  notes: null,
  ...overrides,
});

const followup = (overrides: Partial<FollowupCase> & { caseId: string }): FollowupCase => ({
  reference: `YSR-${overrides.caseId}`,
  slug: overrides.caseId,
  title: { ar: 'حالة', en: 'Case' },
  category: 'medical',
  status: 'funded',
  partnerName: 'جمعية',
  fundedAt: daysAgo(20),
  closedAt: null,
  state: 'pending',
  count: 0,
  last: null,
  entries: [],
  nextDueOn: null,
  storyPhotoVersion: null,
  ...overrides,
});

describe('«قسم المراجعة والتدقيق» rules', () => {
  it('raises what breaks the operating plan, and nothing on sound work', () => {
    const board = oversightBoard(
      {
        cases: [
          adminCase({ id: 'ok' }),
          adminCase({ id: 'unverified', verifiedAt: null, documents: [] }),
          adminCase({ id: 'stalled', status: 'under_review', verifiedAt: null, publishedAt: null, createdAt: daysAgo(6) }),
          adminCase({ id: 'late', status: 'funded', fundedAt: daysAgo(8), raisedMinor: 120_000_00 }),
          adminCase({ id: 'draft', status: 'draft', verifiedAt: null }),
        ],
        tasks: [
          task({ id: 't-ok', caseId: 'ok' }),
          task({ id: 't-missed', caseId: 'stalled', status: 'scheduled', visitAt: daysAgo(2) }),
          task({
            id: 't-short',
            caseId: 'late',
            checklist: { identity: true, residence: false, documents: true, cost: true, alternatives: true },
            recommendedMinor: 80_000_00,
          }),
        ],
        followups: [followup({ caseId: 'late' }), followup({ caseId: 'closed', status: 'closed', state: 'ok' })],
        reviews: [],
      },
      NOW,
    );
    const flagsOf = (area: string, id: string) => board.find((item) => item.area === area && item.subjectId === id)?.flags;
    assert.deepEqual(flagsOf('cases', 'ok'), []);
    assert.deepEqual(flagsOf('cases', 'unverified'), ['published_unverified', 'no_documents']);
    assert.deepEqual(flagsOf('cases', 'stalled'), ['review_stalled']);
    assert.deepEqual(flagsOf('cases', 'late'), ['payout_late', 'overfunded']);
    assert.equal(flagsOf('cases', 'draft'), undefined);
    assert.deepEqual(flagsOf('verification', 't-ok'), []);
    assert.deepEqual(flagsOf('verification', 't-missed'), ['visit_overdue']);
    assert.deepEqual(flagsOf('verification', 't-short'), ['checklist_incomplete', 'above_recommendation']);
    assert.deepEqual(flagsOf('followups', 'late'), ['followup_missing']);
    assert.deepEqual(flagsOf('followups', 'closed'), ['closed_unconfirmed']);
    assert.equal(board[0]?.severity, 'high');
  });

  it('keeps every verdict, newest first, and puts reviewed items after open ones', () => {
    const review = (id: string, createdAt: string): OversightReview => ({
      id,
      area: 'cases',
      subjectId: 'unverified',
      caseId: 'unverified',
      verdict: 'needs_action',
      note: 'اطلب المستندات',
      reviewer: { id: 'r', name: 'مدير' },
      createdAt,
    });
    const board = oversightBoard(
      {
        cases: [
          adminCase({ id: 'unverified', verifiedAt: null }),
          adminCase({ id: 'stalled', status: 'under_review', verifiedAt: null, createdAt: daysAgo(6) }),
        ],
        tasks: [],
        followups: [],
        reviews: [review('1', daysAgo(2)), review('2', daysAgo(1))],
      },
      NOW,
    );
    assert.equal(board[0]?.subjectId, 'stalled');
    assert.deepEqual(
      board[1]?.reviews.map((entry) => entry.id),
      ['2', '1'],
    );
  });

  it('is for the super admin only', () => {
    assert.ok(permissionsFor(['super_admin']).has('oversight:review'));
    for (const role of ['field_auditor', 'content_moderator', 'financial_officer'] as const) assert.ok(!permissionsFor([role]).has('oversight:review'));
  });
});
