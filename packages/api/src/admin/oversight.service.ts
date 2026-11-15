/**
 * «قسم المراجعة والتدقيق على العمل»: the super admin (oversight:review) looks again at the team's work:
 * every case, every live field verification and every followed case, with what the rules in
 * `@yusr/core` (oversightBoard) raise, and records a verdict on each. Verdicts are append-only; the audit
 * log keeps the verdict, not the note (it may name people).
 */
import { CASE_STATUSES, DomainError, oversightBoard, type AdminCase, type OversightItem, type OversightReview } from '@yusr/core';
import type { OversightReviewInput } from '@yusr/core/schemas';
import { primaryRole, requirePermission, type CallContext } from '../common/actor';
import type { Clock } from '../common/clock';
import type { IdGenerator } from '../common/ids';
import type { CasesService } from '../cases/cases.service';
import type { FollowupsService } from '../cases/followups.service';
import type { Database } from '../db/ports';
import type { OversightReviewRow } from '../db/rows';
import type { AdminQueries } from './admin.queries';

export interface OversightDeps {
  db: Database;
  clock: Clock;
  ids: IdGenerator;
  cases: CasesService;
  admin: AdminQueries;
  followups: FollowupsService;
}

/** The board looks at most this many cases (newest first), and this many verdicts. */
const CASE_LIMIT = 500;
const REVIEW_LIMIT = 2000;

export class OversightService {
  constructor(private readonly deps: OversightDeps) {}

  async board(context: CallContext): Promise<OversightItem[]> {
    requirePermission(context.actor, 'oversight:review');
    const { db, clock, cases, admin, followups } = this.deps;
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await db.read.cases.search({ statuses: CASE_STATUSES, sort: 'newest', limit: 50, cursor });
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor && ids.length < CASE_LIMIT);
    const all: AdminCase[] = [];
    for (const id of ids) all.push(await cases.adminCase(id, context));
    const [tasks, board, reviews] = await Promise.all([admin.verificationTasks(context), followups.board(context), this.reviews()]);
    return oversightBoard({ cases: all, tasks, followups: board, reviews }, clock.now());
  }

  async record(input: OversightReviewInput, context: CallContext): Promise<OversightReview> {
    const actor = requirePermission(context.actor, 'oversight:review');
    const { db, clock, ids } = this.deps;
    return db.transaction(async (tx) => {
      const item = await tx.cases.byId(input.caseId);
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      if (input.area === 'verification') {
        const task = await tx.verification.byId(input.subjectId);
        if (!task || task.caseId !== input.caseId) throw new DomainError('NOT_FOUND', 'Verification not found');
      } else if (input.subjectId !== input.caseId) {
        throw new DomainError('VALIDATION_FAILED', 'Case reviews name the case itself', { field: 'subjectId' });
      }
      const row: OversightReviewRow = {
        id: ids(),
        area: input.area,
        subjectId: input.subjectId,
        caseId: input.caseId,
        verdict: input.verdict,
        note: input.note.trim(),
        reviewerId: actor.id,
        createdAt: clock.now(),
      };
      await tx.cases.insertOversightReview(row);
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: `oversight.${input.verdict}`,
        entityType: input.area === 'verification' ? 'verification_task' : 'case',
        entityId: input.subjectId,
        after: { area: input.area, verdict: input.verdict },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      return this.toReview(row, actor.name);
    });
  }

  private async reviews(): Promise<OversightReview[]> {
    const { db } = this.deps;
    const rows = await db.read.cases.oversightReviews(REVIEW_LIMIT);
    const names = new Map<string, string>();
    for (const id of new Set(rows.map((row) => row.reviewerId))) names.set(id, (await db.read.users.byId(id))?.displayName ?? '');
    return rows.map((row) => this.toReview(row, names.get(row.reviewerId) ?? ''));
  }

  private toReview(row: OversightReviewRow, name: string): OversightReview {
    return {
      id: row.id,
      area: row.area,
      subjectId: row.subjectId,
      caseId: row.caseId,
      verdict: row.verdict,
      note: row.note,
      reviewer: { id: row.reviewerId, name },
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }
}
