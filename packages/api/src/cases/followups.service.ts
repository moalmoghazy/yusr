/**
 * Follow-up after funding («متابعة ما بعد الصرف»). Donations reach the partner association directly and it
 * pays the institution; Yusr then checks, as an independent third party, that the help reached the
 * beneficiary, and keeps checking after the case closes. Any staff member who can read cases sees the
 * board; field auditors and content moderators (cases:follow_up) log calls and visits. The log is
 * append-only and every entry is audited.
 */
import { DomainError, FOLLOWUP_STATUSES, cairoDay, compareFollowups, followupState, type CaseFollowup, type FollowupCase, type FollowupLog } from '@yusr/core';
import type { RecordFollowupInput } from '@yusr/core/schemas';
import { primaryRole, requirePermission, type CallContext } from '../common/actor';
import type { Clock } from '../common/clock';
import type { IdGenerator } from '../common/ids';
import type { Tx, Database } from '../db/ports';
import type { CaseFollowupRow, CaseRow } from '../db/rows';

export interface FollowupsDeps {
  db: Database;
  clock: Clock;
  ids: IdGenerator;
}

/** The board covers at most this many cases (newest funding first, 50 per page). */
const BOARD_LIMIT = 500;

const followed = (status: CaseRow['status']): status is FollowupCase['status'] => (FOLLOWUP_STATUSES as readonly string[]).includes(status);

export class FollowupsService {
  constructor(private readonly deps: FollowupsDeps) {}

  /** Every funded and closed case with its latest check, most pressing first. */
  async board(context: CallContext): Promise<FollowupCase[]> {
    requirePermission(context.actor, 'cases:read');
    const { db, clock } = this.deps;
    const cases: CaseRow[] = [];
    let cursor: string | null = null;
    do {
      const page = await db.read.cases.search({ statuses: FOLLOWUP_STATUSES, sort: 'newest', limit: 50, cursor });
      cases.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor && cases.length < BOARD_LIMIT);
    const rows = await db.read.cases.followups(cases.map((item) => item.id));
    const names = await this.names(db.read, rows);
    const today = cairoDay(clock.now());
    return cases
      .map((item) => {
        const own = rows.filter((row) => row.caseId === item.id);
        return this.toCase(item, own, names, today);
      })
      .sort(compareFollowups);
  }

  /** One case's whole log, newest first. */
  async log(caseId: string, context: CallContext): Promise<FollowupLog> {
    requirePermission(context.actor, 'cases:read');
    const { db, clock } = this.deps;
    return this.readLog(db.read, caseId, cairoDay(clock.now()));
  }

  /** Logs a call or visit on a funded or closed case. */
  async record(caseId: string, input: RecordFollowupInput, context: CallContext): Promise<FollowupLog> {
    const actor = requirePermission(context.actor, 'cases:follow_up');
    const { db, clock, ids } = this.deps;
    const now = clock.now();
    const today = cairoDay(now);
    if (input.nextDueOn && input.nextDueOn <= today) {
      throw new DomainError('VALIDATION_FAILED', 'The next check must be after today', { field: 'nextDueOn' });
    }
    return db.transaction(async (tx) => {
      const item = await tx.cases.byId(caseId, 'update');
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      if (!followed(item.status)) throw new DomainError('VALIDATION_FAILED', `Only funded or closed cases are followed up (this one is ${item.status})`);
      const row: CaseFollowupRow = {
        id: ids(),
        caseId,
        kind: input.kind,
        outcome: input.outcome,
        note: input.note.trim(),
        nextDueOn: input.nextDueOn ?? null,
        recordedBy: actor.id,
        recordedAt: now,
      };
      await tx.cases.insertFollowup(row);
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'case.followup_recorded',
        entityType: 'case',
        entityId: caseId,
        before: null,
        // The note can name the beneficiary's circumstances: it stays in the log, not the audit trail.
        after: { kind: row.kind, outcome: row.outcome, nextDueOn: row.nextDueOn },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      return this.readLog(tx, caseId, today);
    });
  }

  private async readLog(tx: Tx, caseId: string, today: string): Promise<FollowupLog> {
    const item = await tx.cases.byId(caseId);
    if (!item || !followed(item.status)) throw new DomainError('NOT_FOUND', 'Case not found');
    const rows = await tx.cases.followups([caseId]);
    const names = await this.names(tx, rows);
    return this.toCase(item, rows, names, today);
  }

  private async names(tx: Tx, rows: readonly CaseFollowupRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((row) => row.recordedBy))];
    const users = await Promise.all(ids.map((id) => tx.users.byId(id)));
    return new Map(ids.map((id, index) => [id, users[index]?.displayName ?? '—']));
  }

  private toEntry(row: CaseFollowupRow, names: Map<string, string>): CaseFollowup {
    return {
      id: row.id,
      caseId: row.caseId,
      kind: row.kind,
      outcome: row.outcome,
      note: row.note,
      nextDueOn: row.nextDueOn,
      recordedBy: { id: row.recordedBy, name: names.get(row.recordedBy) ?? '—' },
      recordedAt: row.recordedAt.toISOString(),
    };
  }

  /** `rows` are this case's entries, newest first. */
  private toCase(item: CaseRow, rows: readonly CaseFollowupRow[], names: Map<string, string>, today: string): FollowupCase {
    const entries = rows.map((row) => this.toEntry(row, names));
    const last = entries[0] ?? null;
    return {
      caseId: item.id,
      reference: item.reference,
      slug: item.slug,
      title: item.title,
      category: item.category,
      status: item.status as FollowupCase['status'],
      partnerName: item.association?.name ?? null,
      fundedAt: item.fundedAt?.toISOString() ?? null,
      closedAt: item.closedAt?.toISOString() ?? null,
      state: followupState(last, today),
      count: rows.length,
      last,
      entries,
      nextDueOn: last?.nextDueOn ?? null,
    };
  }
}
