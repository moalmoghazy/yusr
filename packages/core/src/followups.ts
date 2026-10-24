import type { CaseCategory, CaseStatus, Localized } from './types';

/**
 * Follow-up after funding («متابعة ما بعد الصرف»). Donations go straight to the partner association, which
 * pays the institution; Yusr then checks, as an independent third party, that the help reached the
 * beneficiary, and keeps checking after the case closes. Staff log every call or visit on the case;
 * the log is append-only (0010_case_followups.sql).
 */
export const FOLLOWUP_KINDS = ['partner_call', 'beneficiary_call', 'payee_check', 'field_visit'] as const;
export type FollowupKind = (typeof FOLLOWUP_KINDS)[number];

export const FOLLOWUP_OUTCOMES = ['confirmed', 'concern', 'unreachable'] as const;
export type FollowupOutcome = (typeof FOLLOWUP_OUTCOMES)[number];

/** Cases followed up: funded (the association is paying) and closed (paid, with proof). */
export const FOLLOWUP_STATUSES = ['funded', 'closed'] as const satisfies readonly CaseStatus[];

/**
 * Where a case stands, most pressing first: a concern is open, a check is due, none was made yet, or
 * all is well until the next date (or for good, with no next date).
 */
export const FOLLOWUP_STATES = ['concern', 'due', 'pending', 'ok'] as const;
export type FollowupState = (typeof FOLLOWUP_STATES)[number];

/** A logged call or visit. */
export interface CaseFollowup {
  id: string;
  caseId: string;
  kind: FollowupKind;
  outcome: FollowupOutcome;
  note: string;
  /** When to check again (a calendar day), or null when nothing more is planned. */
  nextDueOn: string | null;
  recordedBy: { id: string; name: string };
  recordedAt: string;
}

/** A funded or closed case on the follow-up board, with its whole log (newest first). */
export interface FollowupCase {
  caseId: string;
  reference: string;
  slug: string;
  title: Localized;
  category: CaseCategory;
  status: (typeof FOLLOWUP_STATUSES)[number];
  partnerName: string | null;
  fundedAt: string | null;
  closedAt: string | null;
  state: FollowupState;
  count: number;
  last: CaseFollowup | null;
  /** Every check, newest first. */
  entries: CaseFollowup[];
  /** The latest check's next date. */
  nextDueOn: string | null;
}

/** One case's follow-up log (the board's entry for it). */
export type FollowupLog = FollowupCase;

/** Today in Egypt, as YYYY-MM-DD: follow-up dates are calendar days there. */
export const cairoDay = (now: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(now);

/** `today` is a calendar day (YYYY-MM-DD) in the platform's time zone. */
export function followupState(last: Pick<CaseFollowup, 'outcome' | 'nextDueOn'> | null, today: string): FollowupState {
  if (!last) return 'pending';
  if (last.outcome === 'concern') return 'concern';
  if (last.outcome === 'unreachable') return 'due';
  return last.nextDueOn !== null && last.nextDueOn <= today ? 'due' : 'ok';
}

/** Most pressing first, then the oldest funding first. */
export function compareFollowups(a: FollowupCase, b: FollowupCase): number {
  const rank = FOLLOWUP_STATES.indexOf(a.state) - FOLLOWUP_STATES.indexOf(b.state);
  if (rank !== 0) return rank;
  return (a.fundedAt ?? '').localeCompare(b.fundedAt ?? '');
}
