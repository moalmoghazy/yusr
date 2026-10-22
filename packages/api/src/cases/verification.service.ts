/**
 * Field verification: a moderator assigns a field auditor, the auditor visits the
 * family, ticks the checklist (identity, residence, documents, cost, alternatives)
 * and recommends the verified goal. Completing the task is the only way a case
 * reaches field_verified. Tasks are mirrored to the volunteers' Baserow board
 * through the outbox.
 */
import { DomainError, caseAmountsFor, hasPermission } from '@yusr/core';
import { primaryRole, requirePermission, type CallContext } from '../common/actor';
import type { Clock } from '../common/clock';
import type { IdGenerator } from '../common/ids';
import type { Database } from '../db/ports';
import type { ChecklistKey, VerificationTaskRow } from '../db/rows';
import type { CasesService } from './cases.service';

const CHECKLIST: readonly ChecklistKey[] = ['identity', 'residence', 'documents', 'cost', 'alternatives'];

export interface VerificationDeps {
  db: Database;
  cases: CasesService;
  clock: Clock;
  ids: IdGenerator;
}

export class VerificationService {
  constructor(private readonly deps: VerificationDeps) {}

  async assign(caseId: string, input: { auditorId: string; visitAt?: Date | null }, context: CallContext): Promise<VerificationTaskRow> {
    const actor = requirePermission(context.actor, 'verifications:assign');
    const { db, clock, ids } = this.deps;
    return db.transaction(async (tx) => {
      const item = await tx.cases.byId(caseId, 'update');
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      if (item.status !== 'under_review') throw new DomainError('VALIDATION_FAILED', `Only cases under review can be visited (this one is ${item.status})`);
      const auditor = await tx.users.byId(input.auditorId);
      if (!auditor || !auditor.roles.includes('field_auditor')) throw new DomainError('VALIDATION_FAILED', 'Choose a field auditor', { field: 'auditorId' });
      if (auditor.id === item.submittedBy) throw new DomainError('VALIDATION_FAILED', 'The submitter cannot audit their own case');
      const task: VerificationTaskRow = {
        id: ids(),
        caseId,
        auditorId: auditor.id,
        assignedBy: actor.id,
        status: input.visitAt ? 'scheduled' : 'assigned',
        visitAt: input.visitAt ?? null,
        checklist: { identity: false, residence: false, documents: false, cost: false, alternatives: false },
        recommendedMinor: null,
        notes: null,
        baserowRowId: null,
        completedAt: null,
        createdAt: clock.now(),
      };
      await tx.verification.insert(task);
      await tx.cases.update(caseId, { auditorId: auditor.id });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'verification.assigned',
        entityType: 'verification',
        entityId: task.id,
        after: { caseId, auditorId: auditor.id, visitAt: task.visitAt?.toISOString() ?? null },
      });
      await tx.outbox.enqueue({
        type: 'verification.assigned',
        aggregateId: task.id,
        payload: {
          taskId: task.id,
          caseId,
          reference: item.reference,
          region: item.region,
          auditorId: auditor.id,
          visitAt: task.visitAt?.toISOString() ?? null,
        },
      });
      return task;
    });
  }

  private async ownTask(taskId: string, context: CallContext) {
    const actor = requirePermission(context.actor, 'verifications:perform');
    const task = await this.deps.db.read.verification.byId(taskId);
    if (!task) throw new DomainError('NOT_FOUND', 'Task not found');
    if (task.auditorId !== actor.id && !actor.roles.includes('super_admin')) throw new DomainError('FORBIDDEN', 'This visit is assigned to another auditor');
    if (task.status === 'completed' || task.status === 'cancelled') throw new DomainError('VALIDATION_FAILED', `Task is ${task.status}`);
    return { actor, task };
  }

  async updateChecklist(
    taskId: string,
    patch: Partial<Record<ChecklistKey, boolean>> & { visitAt?: Date | null; notes?: string | null },
    context: CallContext,
  ): Promise<VerificationTaskRow> {
    const { task } = await this.ownTask(taskId, context);
    const checklist = { ...task.checklist };
    for (const key of CHECKLIST) if (typeof patch[key] === 'boolean') checklist[key] = patch[key]!;
    const next: Partial<VerificationTaskRow> = { checklist };
    if (patch.visitAt !== undefined) {
      next.visitAt = patch.visitAt;
      next.status = patch.visitAt ? 'scheduled' : 'assigned';
    }
    if (patch.notes !== undefined) next.notes = patch.notes?.slice(0, 4_000) ?? null;
    await this.deps.db.transaction((tx) => tx.verification.update(taskId, next));
    return { ...task, ...next };
  }

  /** Signs off the visit: sets the verified need (the goal adds Yusr's fee) and moves the case to field_verified. */
  async complete(taskId: string, input: { recommendedMinor: number; notes?: string | null }, context: CallContext): Promise<VerificationTaskRow> {
    const { actor, task } = await this.ownTask(taskId, context);
    if (!hasPermission(actor.roles, 'cases:verify')) throw new DomainError('FORBIDDEN', 'Missing permission cases:verify');
    const missing = CHECKLIST.filter((key) => !task.checklist[key]);
    if (missing.length) throw new DomainError('VALIDATION_FAILED', 'Complete every checklist item first', { missing });
    if (!Number.isInteger(input.recommendedMinor) || input.recommendedMinor <= 0) throw new DomainError('VALIDATION_FAILED', 'Recommend a goal');
    const { db, clock, cases } = this.deps;
    return db.transaction(async (tx) => {
      const item = await tx.cases.byId(task.caseId, 'update');
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      const completedAt = clock.now();
      await tx.verification.update(task.id, { status: 'completed', completedAt, recommendedMinor: input.recommendedMinor, notes: input.notes ?? task.notes });
      const amounts = caseAmountsFor(input.recommendedMinor);
      if (amounts.goalMinor !== item.goalMinor || amounts.platformFeeMinor !== item.platformFeeMinor) {
        await tx.cases.update(item.id, { goalMinor: amounts.goalMinor, platformFeeMinor: amounts.platformFeeMinor });
        await tx.audit.record({
          actorId: actor.id,
          actorRole: primaryRole(actor),
          action: 'case.goal_adjusted',
          entityType: 'case',
          entityId: item.id,
          before: { goalMinor: item.goalMinor, platformFeeMinor: item.platformFeeMinor },
          after: { goalMinor: amounts.goalMinor, platformFeeMinor: amounts.platformFeeMinor },
        });
      }
      await cases.move(tx, { ...item, goalMinor: amounts.goalMinor, platformFeeMinor: amounts.platformFeeMinor }, 'field_verified', actor, null, context);
      return { ...task, status: 'completed', completedAt, recommendedMinor: input.recommendedMinor };
    });
  }
}
