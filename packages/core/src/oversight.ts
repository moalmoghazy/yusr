/**
 * «قسم المراجعة والتدقيق على العمل»: the super admin's second look at the team's work. It reads the
 * case list, the field verifications and the follow-up board, raises what looks wrong (each rule below,
 * with the operating plan's limits), and keeps the director's verdict on every item in an append-only log.
 */
import type { AdminCase, VerificationTask } from './admin-types';
import type { FollowupCase } from './followups';
import type { Localized } from './types';

export const OVERSIGHT_AREAS = ['cases', 'verification', 'followups'] as const;
export type OversightArea = (typeof OVERSIGHT_AREAS)[number];

export const OVERSIGHT_VERDICTS = ['approved', 'needs_action', 'escalated'] as const;
export type OversightVerdict = (typeof OVERSIGHT_VERDICTS)[number];

export const OVERSIGHT_FLAGS = [
  // cases
  'published_unverified',
  'no_documents',
  'review_stalled',
  'payout_late',
  'closed_unpaid',
  'overfunded',
  // field verification
  'visit_overdue',
  'visit_unscheduled',
  'checklist_incomplete',
  'above_recommendation',
  // follow-up after payout
  'followup_concern',
  'followup_overdue',
  'followup_missing',
  'closed_unconfirmed',
] as const;
export type OversightFlag = (typeof OVERSIGHT_FLAGS)[number];

/** High: money or trust is at risk now. Medium: the work is late or incomplete. */
export const FLAG_SEVERITY: Readonly<Record<OversightFlag, 'high' | 'medium'>> = {
  published_unverified: 'high',
  no_documents: 'high',
  review_stalled: 'medium',
  payout_late: 'high',
  closed_unpaid: 'high',
  overfunded: 'medium',
  visit_overdue: 'high',
  visit_unscheduled: 'medium',
  checklist_incomplete: 'high',
  above_recommendation: 'medium',
  followup_concern: 'high',
  followup_overdue: 'medium',
  followup_missing: 'high',
  closed_unconfirmed: 'medium',
};

/** The operating plan's limits, in days. */
export const OVERSIGHT_LIMITS = {
  /** A case waits at most this long under review before someone acts. */
  reviewDays: 5,
  /** Payout within 7 days of full funding, straight to the provider. */
  payoutDays: 7,
  /** A visit this late after its date counts as missed. */
  visitGraceDays: 1,
  /** An assigned visit should be scheduled within this. */
  scheduleDays: 3,
  /** The first follow-up after funding is due within this. */
  firstFollowupDays: 14,
  /** The requested need may exceed the auditor's recommendation by at most this share. */
  recommendationTolerance: 0.1,
} as const;

export interface OversightReview {
  id: string;
  area: OversightArea;
  /** The case id (cases, follow-ups) or the verification task id. */
  subjectId: string;
  caseId: string;
  verdict: OversightVerdict;
  note: string;
  reviewer: { id: string; name: string };
  createdAt: string;
}

export interface OversightItem {
  area: OversightArea;
  subjectId: string;
  caseId: string;
  reference: string;
  title: Localized;
  /** Who did the work under review (auditor, partner…), for the card. */
  owner: string | null;
  flags: OversightFlag[];
  /** Highest severity among the flags; null when nothing was raised. */
  severity: 'high' | 'medium' | null;
  /** Every verdict on this item, newest first. */
  reviews: OversightReview[];
}

const DAY = 86_400_000;
const daysSince = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / DAY : 0);
const PAID_OUT = ['funded', 'closed'] as const;

function caseFlags(item: AdminCase, now: Date): OversightFlag[] {
  const flags: OversightFlag[] = [];
  const live = item.status === 'published' || item.status === 'funded' || item.status === 'closed' || item.status === 'paused';
  if (live && !item.verifiedAt) flags.push('published_unverified');
  if (live && item.documents.length === 0) flags.push('no_documents');
  if (item.status === 'under_review' && daysSince(item.createdAt, now) > OVERSIGHT_LIMITS.reviewDays) flags.push('review_stalled');
  const unpaid = item.disbursements.length === 0 || item.disbursements.some((line) => line.status !== 'paid');
  if (item.status === 'funded' && unpaid && daysSince(item.fundedAt, now) > OVERSIGHT_LIMITS.payoutDays) flags.push('payout_late');
  if (item.status === 'closed' && unpaid) flags.push('closed_unpaid');
  if (item.raisedMinor > item.goalMinor) flags.push('overfunded');
  return flags;
}

function verificationFlags(task: VerificationTask, item: AdminCase | undefined, now: Date): OversightFlag[] {
  const flags: OversightFlag[] = [];
  if (task.status === 'scheduled' && task.visitAt && daysSince(task.visitAt, now) > OVERSIGHT_LIMITS.visitGraceDays) flags.push('visit_overdue');
  if (task.status === 'assigned' && item && daysSince(item.createdAt, now) > OVERSIGHT_LIMITS.scheduleDays) flags.push('visit_unscheduled');
  if (task.status === 'completed' && Object.values(task.checklist).some((done) => !done)) flags.push('checklist_incomplete');
  if (task.status === 'completed' && item && task.recommendedMinor !== null) {
    const need = item.goalMinor - item.platformFeeMinor;
    if (need > task.recommendedMinor * (1 + OVERSIGHT_LIMITS.recommendationTolerance)) flags.push('above_recommendation');
  }
  return flags;
}

function followupFlags(entry: FollowupCase, now: Date): OversightFlag[] {
  const flags: OversightFlag[] = [];
  if (entry.state === 'concern') flags.push('followup_concern');
  if (entry.state === 'due') flags.push('followup_overdue');
  if (entry.state === 'pending' && daysSince(entry.fundedAt, now) > OVERSIGHT_LIMITS.firstFollowupDays) flags.push('followup_missing');
  if (entry.status === 'closed' && !entry.entries.some((check) => check.outcome === 'confirmed')) flags.push('closed_unconfirmed');
  return flags;
}

function severityOf(flags: readonly OversightFlag[]): OversightItem['severity'] {
  if (flags.some((flag) => FLAG_SEVERITY[flag] === 'high')) return 'high';
  return flags.length ? 'medium' : null;
}

/**
 * Everything the section shows: one item per case (drafts and rejected ones left out), per live
 * verification task, and per followed case, with what was raised and the verdicts given. Raised and
 * unreviewed first, high before medium.
 */
export function oversightBoard(
  input: { cases: readonly AdminCase[]; tasks: readonly VerificationTask[]; followups: readonly FollowupCase[]; reviews: readonly OversightReview[] },
  now: Date,
): OversightItem[] {
  const byId = new Map(input.cases.map((item) => [item.id, item]));
  const reviewsOf = (area: OversightArea, subjectId: string) =>
    input.reviews.filter((review) => review.area === area && review.subjectId === subjectId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const item = (area: OversightArea, subjectId: string, base: AdminCase | FollowupCase, owner: string | null, flags: OversightFlag[]): OversightItem => ({
    area,
    subjectId,
    caseId: 'caseId' in base ? base.caseId : base.id,
    reference: base.reference,
    title: base.title,
    owner,
    flags,
    severity: severityOf(flags),
    reviews: reviewsOf(area, subjectId),
  });

  const items: OversightItem[] = [
    ...input.cases
      .filter((entry) => entry.status !== 'draft' && entry.status !== 'rejected')
      .map((entry) => item('cases', entry.id, entry, entry.submittedBy.association?.name ?? entry.submittedBy.name, caseFlags(entry, now))),
    ...input.tasks
      .filter((task) => task.status !== 'cancelled')
      .flatMap((task) => {
        const base = byId.get(task.caseId);
        return base ? [item('verification', task.id, base, task.auditorName, verificationFlags(task, base, now))] : [];
      }),
    ...input.followups
      .filter((entry) => (PAID_OUT as readonly string[]).includes(entry.status))
      .map((entry) => item('followups', entry.caseId, entry, entry.partnerName, followupFlags(entry, now))),
  ];
  const rank = (entry: OversightItem) => (!entry.severity ? 3 : entry.reviews.length ? 2 : entry.severity === 'high' ? 0 : 1);
  return items.sort((a, b) => rank(a) - rank(b));
}
