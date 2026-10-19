/**
 * Cases: the public catalog and case pages, the submission portal, and the staff
 * pipeline draft → under_review → field_verified → published → funded → closed.
 *
 * Every status change goes through @yusr/core's transition table and the actor's
 * permissions, is written to case_transitions and the audit log, and emits an outbox
 * event (Slack #field-ops, Baserow board, donor notifications). "funded" is reached
 * only by the donations service when the ledger says so.
 */
import {
  DomainError,
  assertTransition,
  isPubliclyVisible,
  permissionsFor,
  type AdminCase,
  type CaseDetail,
  type CaseDocumentPublic,
  type CaseFilters,
  type CaseStatus,
  type CaseSummary,
  type DisbursementLine,
  type DocumentKind,
  type Localized,
  type Page,
  type PayeeType,
  type PublicDonation,
  type TimelineEvent,
} from '@yusr/core';
import type { SubmitCaseInput } from '@yusr/core/schemas';
import { primaryRole, requirePermission, type CallContext, type RequestActor } from '../common/actor';
import type { FieldCipher } from '../common/cipher';
import type { Clock } from '../common/clock';
import { hmacHex, mask } from '../common/crypto';
import type { IdGenerator } from '../common/ids';
import type { Database, Tx } from '../db/ports';
import type { CaseRow } from '../db/rows';
import { toCaseSummary } from './mappers';

export interface CasesConfig {
  /** Keyed hash for national IDs: finds duplicates without storing the number in the clear. */
  nationalIdPepper: string;
}

export interface CasesDeps {
  db: Database;
  cipher: FieldCipher;
  clock: Clock;
  ids: IdGenerator;
  config: CasesConfig;
}

/** A validated POST /cases body (submitCaseSchema in @yusr/core/schemas). */
export type SubmissionInput = SubmitCaseInput;

/** Submitters write in one language; the other slot starts as a copy until moderators translate it. */
function bothLanguages(text: { ar?: string | undefined; en?: string | undefined } | null | undefined, fallback: Localized): Localized {
  const ar = text?.ar?.trim() || text?.en?.trim() || fallback.ar;
  const en = text?.en?.trim() || text?.ar?.trim() || fallback.en;
  return { ar, en };
}

const DOCUMENT_TITLES: Readonly<Record<DocumentKind, Localized>> = {
  national_id: { ar: 'بطاقة الرقم القومي (محجوبة)', en: 'National ID (redacted)' },
  medical_report: { ar: 'تقرير طبي', en: 'Medical report' },
  price_quote: { ar: 'عرض سعر', en: 'Price quote' },
  invoice: { ar: 'فاتورة', en: 'Invoice' },
  debt_proof: { ar: 'إثبات مديونية', en: 'Proof of debt' },
  court_ruling: { ar: 'حكم قضائي', en: 'Court ruling' },
  school_record: { ar: 'إفادة مدرسية', en: 'School record' },
  field_report: { ar: 'تقرير الزيارة الميدانية', en: 'Field visit report' },
  disbursement_proof: { ar: 'إيصال الصرف', en: 'Proof of payment' },
};

const SYSTEM: Localized = { ar: 'منصة يُسر', en: 'Yusr' };

function slugify(title: string, reference: string): string {
  const latin = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return `${latin || 'case'}-${reference.toLowerCase()}`.replace(/-+/g, '-');
}

export class CasesService {
  constructor(private readonly deps: CasesDeps) {}

  // ------------------------------------------------------------------ public
  async list(filters: CaseFilters): Promise<Page<CaseSummary>> {
    const statuses: CaseStatus[] = filters.includeFunded ? ['published', 'funded', 'closed'] : ['published'];
    const page = await this.deps.db.read.cases.search({ ...filters, statuses });
    return { items: page.items.map(toCaseSummary), total: page.total, nextCursor: page.nextCursor };
  }

  async detail(slug: string): Promise<CaseDetail> {
    const item = await this.deps.db.read.cases.bySlug(slug);
    if (!item || !isPubliclyVisible(item.status)) throw new DomainError('NOT_FOUND', 'Case not found');
    return this.assemble(item, false);
  }

  /** The staff view of a case: every document (with its redaction state), history with names. */
  async adminCase(caseId: string, context: CallContext): Promise<AdminCase> {
    requirePermission(context.actor, 'cases:read');
    const { db } = this.deps;
    const item = await db.read.cases.byId(caseId);
    if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
    const [detail, submitter, auditor, transitions] = await Promise.all([
      this.assemble(item, true),
      db.read.users.byId(item.submittedBy),
      item.auditorId ? db.read.users.byId(item.auditorId) : Promise.resolve(null),
      db.read.cases.transitions(item.id),
    ]);
    const names = new Map<string, string>();
    for (const change of transitions) {
      if (change.actorId && !names.has(change.actorId)) names.set(change.actorId, (await db.read.users.byId(change.actorId))?.displayName ?? '—');
    }
    return {
      ...detail,
      submittedBy: { name: submitter?.displayName ?? '—', relation: item.submitterRelation },
      auditor: auditor ? { id: auditor.id, name: auditor.displayName } : null,
      history: transitions.map((change) => ({
        from: change.fromStatus,
        to: change.toStatus,
        at: change.createdAt.toISOString(),
        actorName: change.actorId ? (names.get(change.actorId) ?? '—') : 'system',
        reason: change.reason,
      })),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private async assemble(item: CaseRow, staff: boolean): Promise<CaseDetail> {
    const { db } = this.deps;
    const [beneficiary, documents, transitions, lines, payouts, recent, auditor] = await Promise.all([
      db.read.cases.beneficiary(item.beneficiaryId),
      db.read.cases.documents(item.id),
      db.read.cases.transitions(item.id),
      db.read.cases.lines(item.id),
      db.read.payouts.forCase(item.id),
      db.read.donations.recentForCase(item.id, 12),
      item.auditorId ? db.read.users.byId(item.auditorId) : Promise.resolve(null),
    ]);
    const verifier: Localized = auditor ? { ar: `المدقق الميداني ${auditor.displayName}`, en: `Field auditor ${auditor.displayName}` } : SYSTEM;

    // Only redacted copies are ever public; originals stay in the private bucket.
    const publicDocuments: CaseDocumentPublic[] = documents
      .filter((document) => staff || document.redactedKey)
      .map((document) => ({
        id: document.id,
        kind: document.kind,
        title: DOCUMENT_TITLES[document.kind],
        pages: document.pages,
        redacted: Boolean(document.redactedKey),
        verifiedBy: verifier,
        issuedAt: document.createdAt.toISOString(),
      }));

    const timeline: TimelineEvent[] = [{ kind: 'submitted', at: item.createdAt.toISOString(), actor: SYSTEM }];
    for (const change of transitions) {
      const at = change.createdAt.toISOString();
      if (change.toStatus === 'field_verified')
        timeline.push({ kind: 'visit_completed', at, actor: verifier }, { kind: 'documents_verified', at, actor: verifier });
      if (change.toStatus === 'published') timeline.push({ kind: 'published', at, actor: SYSTEM });
      if (change.toStatus === 'funded') timeline.push({ kind: 'funded', at, actor: SYSTEM });
      if (change.toStatus === 'closed') timeline.push({ kind: 'closed', at, actor: SYSTEM });
    }
    for (const payout of payouts.filter((row) => row.status === 'paid' && row.paidAt)) {
      timeline.push({ kind: 'disbursed', at: payout.paidAt!.toISOString(), actor: SYSTEM });
    }
    timeline.sort((a, b) => a.at.localeCompare(b.at));

    const disbursements: DisbursementLine[] = lines.map((line) => {
      const forLine = payouts.filter((row) => row.lineId === line.id);
      const paid = forLine.find((row) => row.status === 'paid');
      const approved = forLine.some((row) => row.status === 'approved');
      return {
        id: line.id,
        payeeType: line.payeeType,
        payee: line.payee,
        purpose: line.purpose,
        amountMinor: line.amountMinor,
        status: paid ? 'paid' : approved ? 'approved' : 'planned',
        paidAt: paid?.paidAt?.toISOString() ?? null,
      };
    });

    const recentDonations: PublicDonation[] = [];
    for (const donation of recent) {
      let displayName: string | null = null;
      if (!donation.anonymous) {
        displayName = donation.donorId ? ((await db.read.users.byId(donation.donorId))?.displayName ?? null) : (donation.guestContact?.name ?? null);
      }
      recentDonations.push({
        id: donation.id,
        displayName,
        amountMinor: donation.netToCaseMinor,
        createdAt: (donation.succeededAt ?? donation.createdAt).toISOString(),
      });
    }

    return {
      ...toCaseSummary(item),
      story: item.story,
      beneficiary: beneficiary?.pseudonym ?? { ar: 'مستفيد', en: 'Beneficiary' },
      documents: publicDocuments,
      timeline,
      disbursements,
      updates: [],
      recentDonations,
    };
  }

  // ------------------------------------------------------------------ submission portal
  async submit(input: SubmissionInput, context: CallContext): Promise<Pick<CaseRow, 'id' | 'reference' | 'status'> & { possibleDuplicate: boolean }> {
    const actor = context.actor;
    if (!actor) throw new DomainError('UNAUTHENTICATED', 'Sign in to submit a case');
    if (input.consent !== true) throw new DomainError('VALIDATION_FAILED', 'Consent is required', { field: 'consent' });
    if (input.isUrgent && !input.deadline) throw new DomainError('VALIDATION_FAILED', 'Urgent cases need a deadline', { field: 'deadline' });
    for (const document of input.documents) {
      if (!document.storageKey.startsWith(`uploads/${actor.id}/`)) {
        throw new DomainError('FORBIDDEN', 'Documents must be uploaded by the submitter', { storageKey: document.storageKey });
      }
    }
    const { db, cipher, clock, ids, config } = this.deps;
    const now = clock.now();
    const nationalId = input.beneficiary.nationalId?.replace(/\D/g, '') || null;
    const nationalIdHash = nationalId ? hmacHex('sha256', config.nationalIdPepper, nationalId) : null;

    return db.transaction(async (tx) => {
      const existing = nationalIdHash ? await tx.cases.beneficiaryByNationalIdHash(nationalIdHash) : null;
      const beneficiaryId = existing?.id ?? ids();
      if (!existing) {
        await tx.cases.insertBeneficiary({
          id: beneficiaryId,
          pseudonym: bothLanguages(input.beneficiary.pseudonym, { ar: 'مستفيد', en: 'Beneficiary' }),
          nationalIdHash,
          nationalIdCipher: nationalId ? cipher.encrypt(nationalId, `nid:${beneficiaryId}`) : null,
          phoneCipher: input.beneficiary.phone ? cipher.encrypt(input.beneficiary.phone, `phone:${beneficiaryId}`) : null,
          region: input.region,
          householdSize: input.beneficiary.householdSize ?? null,
          createdAt: now,
        });
      }
      const id = ids();
      const title = bothLanguages(input.title, { ar: '', en: '' });
      const story = bothLanguages(input.story, { ar: '', en: '' });
      const created = await tx.cases.insert({
        id,
        slug: `pending-${id}`,
        category: input.category,
        status: 'under_review',
        beneficiaryId,
        submittedBy: actor.id,
        submitterRelation: input.submitterRelation,
        title,
        summary: { ar: story.ar.slice(0, 180), en: story.en.slice(0, 180) },
        shareText: null,
        story,
        region: input.region,
        currency: input.currency,
        goalMinor: input.goalMinor,
        raisedMinor: 0,
        donorsCount: 0,
        isUrgent: input.isUrgent,
        deadline: input.deadline ? new Date(input.deadline) : null,
        zakatEligible: false,
        priority: input.isUrgent ? 50 : 0,
        coverSeed: Math.floor(Math.random() * 1_000),
        auditorId: null,
        verifiedAt: null,
        publishedAt: null,
        fundedAt: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.cases.update(id, { slug: slugify(input.title.en ?? '', created.reference) });
      await tx.cases.insertTransition({ caseId: id, fromStatus: 'draft', toStatus: 'under_review', actorId: actor.id, reason: null });
      for (const document of input.documents) {
        await tx.cases.insertDocument({
          id: ids(),
          caseId: id,
          kind: document.kind,
          storageKey: document.storageKey,
          redactedKey: null,
          sha256: document.sha256,
          pages: 1,
          uploadedBy: actor.id,
          redactedBy: null,
          createdAt: now,
        });
      }
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'case.submitted',
        entityType: 'case',
        entityId: id,
        after: { reference: created.reference, category: input.category, goalMinor: input.goalMinor, possibleDuplicate: Boolean(existing) },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
      await tx.outbox.enqueue({
        type: 'case.submitted',
        aggregateId: id,
        payload: {
          caseId: id,
          reference: created.reference,
          category: input.category,
          region: input.region,
          urgent: input.isUrgent,
          possibleDuplicate: Boolean(existing),
        },
      });
      return { id, reference: created.reference, status: 'under_review' as const, possibleDuplicate: Boolean(existing) };
    });
  }

  // ------------------------------------------------------------------ staff pipeline
  async transition(caseId: string, input: { to: CaseStatus; reason?: string | null }, context: CallContext): Promise<CaseRow> {
    const actor = requirePermission(context.actor, 'cases:read');
    const { db } = this.deps;
    return db.transaction(async (tx) => {
      const item = await tx.cases.byId(caseId, 'update');
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      assertTransition(item.status, input.to, permissionsFor(actor.roles), input.reason);
      if (input.to === 'field_verified') {
        throw new DomainError('INVALID_TRANSITION', 'Complete the field verification task to verify a case');
      }
      if (input.to === 'published') await this.assertPublishable(tx, item);
      return this.move(tx, item, input.to, actor, input.reason ?? null, context);
    });
  }

  /** A case can go live only with a disbursement plan that adds up to its goal and redacted public documents. */
  private async assertPublishable(tx: Tx, item: CaseRow): Promise<void> {
    const lines = await tx.cases.lines(item.id);
    const planned = lines.reduce((sum, line) => sum + line.amountMinor, 0);
    if (planned !== item.goalMinor) {
      throw new DomainError('VALIDATION_FAILED', 'The disbursement plan must add up to the goal before publishing', {
        plannedMinor: planned,
        goalMinor: item.goalMinor,
      });
    }
    const documents = await tx.cases.documents(item.id);
    if (!documents.some((document) => document.redactedKey)) {
      throw new DomainError('VALIDATION_FAILED', 'Publish at least one redacted supporting document');
    }
  }

  async move(tx: Tx, item: CaseRow, to: CaseStatus, actor: RequestActor, reason: string | null, context: CallContext): Promise<CaseRow> {
    const updated = await tx.cases.setStatus(item.id, to);
    await tx.cases.insertTransition({ caseId: item.id, fromStatus: item.status, toStatus: to, actorId: actor.id, reason });
    await tx.audit.record({
      actorId: actor.id,
      actorRole: primaryRole(actor),
      action: `case.${to}`,
      entityType: 'case',
      entityId: item.id,
      before: { status: item.status },
      after: { status: to, ...(reason ? { reason } : {}) },
      ip: context.ip ?? null,
      requestId: context.requestId ?? null,
    });
    await tx.outbox.enqueue({
      type: `case.${to}`,
      aggregateId: item.id,
      payload: { caseId: item.id, reference: item.reference, from: item.status, to, reason },
    });
    return updated;
  }

  async prioritize(caseId: string, priority: number, context: CallContext): Promise<void> {
    const actor = requirePermission(context.actor, 'cases:prioritize');
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw new DomainError('VALIDATION_FAILED', 'priority is 0–100');
    await this.deps.db.transaction(async (tx) => {
      const item = await tx.cases.byId(caseId, 'update');
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      await tx.cases.update(caseId, { priority });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'case.prioritized',
        entityType: 'case',
        entityId: caseId,
        before: { priority: item.priority },
        after: { priority },
      });
    });
  }

  /** Content edits by moderators (wording, redacted documents, the plan) before or after publishing. */
  async editContent(
    caseId: string,
    patch: Partial<Pick<CaseRow, 'title' | 'summary' | 'shareText' | 'story' | 'zakatEligible' | 'isUrgent' | 'deadline'>>,
    context: CallContext,
  ): Promise<void> {
    const actor = requirePermission(context.actor, 'cases:edit');
    await this.deps.db.transaction(async (tx) => {
      const item = await tx.cases.byId(caseId, 'update');
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      if (patch.isUrgent && !(patch.deadline ?? item.deadline)) throw new DomainError('VALIDATION_FAILED', 'Urgent cases need a deadline');
      await tx.cases.update(caseId, patch);
      const before: Record<string, unknown> = {};
      for (const key of Object.keys(patch) as Array<keyof typeof patch>) before[key] = item[key];
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'case.edited',
        entityType: 'case',
        entityId: caseId,
        before,
        after: { ...patch },
      });
    });
  }

  async setDisbursementPlan(
    caseId: string,
    lines: ReadonlyArray<{ payeeType: PayeeType; payee: Localized; purpose: Localized; amountMinor: number; payeeAccount?: string | null }>,
    context: CallContext,
  ): Promise<void> {
    const actor = requirePermission(context.actor, 'cases:edit');
    const { db, ids } = this.deps;
    await db.transaction(async (tx) => {
      const item = await tx.cases.byId(caseId, 'update');
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      if (!['under_review', 'field_verified'].includes(item.status)) throw new DomainError('VALIDATION_FAILED', 'The plan is fixed once a case is published');
      if ((await tx.cases.lines(caseId)).length > 0) throw new DomainError('VALIDATION_FAILED', 'A plan already exists for this case');
      await tx.cases.insertLines(
        lines.map(({ payeeAccount, ...line }, position) => ({
          id: ids(),
          caseId,
          position,
          ...line,
          payeeAccountMasked: payeeAccount ? mask(payeeAccount.replace(/\s+/g, '')) : null,
        })),
      );
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'case.plan_set',
        entityType: 'case',
        entityId: caseId,
        after: { lines: lines.length, totalMinor: lines.reduce((sum, line) => sum + line.amountMinor, 0) },
      });
    });
  }
}
