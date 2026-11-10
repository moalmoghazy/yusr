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
  caseAmountsFor,
  caseNeedMinor,
  isPubliclyVisible,
  permissionsFor,
  STORY_CONTRIBUTORS_SHOWN,
  STORY_PHOTO_MAX_BYTES,
  type AdminCase,
  type AdminStory,
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
  type StoryPhotoType,
  type SuccessStory,
  type TimelineEvent,
} from '@yusr/core';
import type { CaseStoryInput, StoryPhotoInput, SubmitCaseInput } from '@yusr/core/schemas';
import { primaryRole, requirePermission, type CallContext, type RequestActor } from '../common/actor';
import type { FieldCipher } from '../common/cipher';
import type { Clock } from '../common/clock';
import { hmacHex, mask } from '../common/crypto';
import type { IdGenerator } from '../common/ids';
import type { Database, Tx } from '../db/ports';
import type { CaseRow, CaseStoryRow } from '../db/rows';
import { uploadPrefix } from '../documents/documents.service';
import type { PartnersService } from '../partners/partners.service';
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
  /** The approved-partner registry: association submissions are checked against it. */
  partners: PartnersService;
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

/** How a donor is named in public: first name and initial ("Sara A."), as on the live ticker. */
export function publicDonorName(full: string | null | undefined): string | null {
  const parts = full?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return null;
  const [first, second] = parts;
  return second ? `${first} ${Array.from(second)[0]}.` : first!;
}

export class CasesService {
  constructor(private readonly deps: CasesDeps) {}

  // ------------------------------------------------------------------ public
  async list(filters: CaseFilters): Promise<Page<CaseSummary>> {
    const statuses: CaseStatus[] = filters.includeFunded ? ['published', 'funded', 'closed'] : ['published'];
    const page = await this.deps.db.read.cases.search({ ...filters, statuses });
    return { items: page.items.map(toCaseSummary), total: page.total, nextCursor: page.nextCursor };
  }

  /**
   * «قصص نجاح» on the home page: closed cases (paid out with proof), the most recently closed first,
   * each with the day Yusr's follow-up last confirmed the help arrived. Follow-up notes stay private.
   */
  async stories(limit: number): Promise<SuccessStory[]> {
    const closed = await this.closedCases(50);
    const edits = await this.deps.db.read.cases.stories(closed.map((item) => item.id));
    const shown = closed.filter((item) => edits.find((row) => row.caseId === item.id)?.published !== false).slice(0, limit);
    return this.toStories(shown, edits);
  }

  /** The hub's «قصص النجاح» page: every closed case, published or not, with its own text to go back to. */
  async adminStories(context: CallContext): Promise<AdminStory[]> {
    requirePermission(context.actor, 'cases:read');
    const { db } = this.deps;
    const closed = await this.closedCases(100);
    const edits = await db.read.cases.stories(closed.map((item) => item.id));
    const stories = await this.toStories(closed, edits);
    return Promise.all(
      closed.map(async (item, index) => {
        const row = edits.find((edit) => edit.caseId === item.id);
        const by = row ? await db.read.users.byId(row.updatedBy) : null;
        return {
          story: stories[index]!,
          original: { title: item.title, story: item.story, outcome: item.summary },
          edited: row !== undefined,
          published: row?.published ?? true,
          updatedAt: row ? new Date(row.updatedAt).toISOString() : null,
          updatedBy: by?.displayName ?? null,
        };
      }),
    );
  }

  /** Staff (cases:edit) set what a closed case's story says on the home page, and whether it shows. */
  async saveStory(caseId: string, input: CaseStoryInput, context: CallContext): Promise<{ saved: true }> {
    const actor = requirePermission(context.actor, 'cases:edit');
    const { db, clock } = this.deps;
    const filled = (text: { ar: string; en: string }) => ({ ar: text.ar, en: text.en || text.ar });
    await db.transaction(async (tx) => {
      const item = await tx.cases.byId(caseId);
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      if (item.status !== 'closed') throw new DomainError('VALIDATION_FAILED', 'Only closed cases have a success story');
      await tx.cases.putStory({
        caseId,
        title: filled(input.title),
        story: filled(input.story),
        outcome: filled(input.outcome),
        published: input.published,
        updatedBy: actor.id,
        updatedAt: clock.now(),
      });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'case.story_saved',
        entityType: 'case',
        entityId: caseId,
        after: { published: input.published },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
    });
    return { saved: true };
  }

  private async closedCases(limit: number): Promise<Array<CaseRow & { closedAt: Date }>> {
    const page = await this.deps.db.read.cases.search({ statuses: ['closed'], sort: 'newest', limit });
    return page.items
      .filter((item): item is CaseRow & { closedAt: Date } => item.closedAt !== null)
      .sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime());
  }

  private async toStories(closed: Array<CaseRow & { closedAt: Date }>, edits: CaseStoryRow[]): Promise<SuccessStory[]> {
    const { db } = this.deps;
    const ids = closed.map((item) => item.id);
    const [followups, photos] = await Promise.all([db.read.cases.followups(ids), db.read.cases.storyPhotoTimes(ids)]);
    return Promise.all(
      closed.map(async (item) => {
        const confirmed = followups.find((row) => row.caseId === item.id && row.outcome === 'confirmed');
        const photo = photos.get(item.id);
        const edit = edits.find((row) => row.caseId === item.id);
        return {
          ...toCaseSummary(item),
          ...(edit ? { title: edit.title, summary: edit.outcome } : {}),
          story: edit?.story ?? item.story,
          closedAt: item.closedAt.toISOString(),
          confirmedAt: confirmed?.recordedAt.toISOString() ?? null,
          photoVersion: photo ? photo.getTime().toString(36) : null,
          contributors: await this.contributors(item.id),
        };
      }),
    );
  }

  /** Names as the case page shows them (first name and initial), newest first; null for anonymous gifts. */
  private async contributors(caseId: string): Promise<Array<string | null>> {
    const { db } = this.deps;
    const donations = await db.read.donations.recentForCase(caseId, STORY_CONTRIBUTORS_SHOWN);
    return Promise.all(
      donations.map(async (donation) => {
        if (donation.anonymous) return null;
        const full = donation.donorId ? ((await db.read.users.byId(donation.donorId))?.displayName ?? null) : (donation.guestContact?.name ?? null);
        return publicDonorName(full);
      }),
    );
  }

  /** A closed case's «قصص نجاح» photo, for the website (404 when it has none or is not closed). */
  async publicStoryPhoto(caseId: string): Promise<{ type: StoryPhotoType; bytes: Uint8Array; version: string }> {
    const { db } = this.deps;
    const item = await db.read.cases.byId(caseId).catch(() => null);
    const photo = item?.status === 'closed' ? await db.read.cases.storyPhoto(caseId) : null;
    if (!photo) throw new DomainError('NOT_FOUND', 'Photo not found');
    return { type: photo.photoType, bytes: photo.photo, version: photo.uploadedAt.getTime().toString(36) };
  }

  /** Staff (cases:edit) add or replace the real photo of a closed case's story; faces are blurred before upload. */
  async setStoryPhoto(caseId: string, input: StoryPhotoInput, context: CallContext): Promise<{ version: string }> {
    const actor = requirePermission(context.actor, 'cases:edit');
    const bytes = Uint8Array.from(Buffer.from(input.dataBase64, 'base64'));
    if (bytes.length === 0 || bytes.length > STORY_PHOTO_MAX_BYTES || !looksLike(input.contentType, bytes)) {
      throw new DomainError('VALIDATION_FAILED', 'Send a JPEG or WebP picture up to 450 KB', { field: 'photo' });
    }
    const { db, clock } = this.deps;
    const now = clock.now();
    await db.transaction(async (tx) => {
      const item = await tx.cases.byId(caseId);
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      if (item.status !== 'closed') throw new DomainError('VALIDATION_FAILED', 'Only closed cases have a success story');
      await tx.cases.putStoryPhoto({ caseId, photo: bytes, photoType: input.contentType, uploadedBy: actor.id, uploadedAt: now });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'case.story_photo_set',
        entityType: 'case',
        entityId: caseId,
        after: { type: input.contentType, bytes: bytes.length },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
    });
    return { version: now.getTime().toString(36) };
  }

  async removeStoryPhoto(caseId: string, context: CallContext): Promise<{ removed: true }> {
    const actor = requirePermission(context.actor, 'cases:edit');
    await this.deps.db.transaction(async (tx) => {
      await tx.cases.deleteStoryPhoto(caseId);
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'case.story_photo_removed',
        entityType: 'case',
        entityId: caseId,
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
    });
    return { removed: true };
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
      item.submittedBy ? db.read.users.byId(item.submittedBy) : Promise.resolve(null),
      item.auditorId ? db.read.users.byId(item.auditorId) : Promise.resolve(null),
      db.read.cases.transitions(item.id),
    ]);
    const names = new Map<string, string>();
    for (const change of transitions) {
      if (change.actorId && !names.has(change.actorId)) names.set(change.actorId, (await db.read.users.byId(change.actorId))?.displayName ?? '—');
    }
    return {
      ...detail,
      submittedBy: { name: item.association?.name ?? submitter?.displayName ?? '—', relation: item.submitterRelation, association: item.association },
      auditor: auditor ? { id: auditor.id, name: auditor.displayName } : null,
      history: transitions.map((change) => ({
        from: change.fromStatus,
        to: change.toStatus,
        at: change.createdAt.toISOString(),
        // A partner that submitted with its code has no account: its submission is shown under its name.
        actorName: change.actorId
          ? (names.get(change.actorId) ?? '—')
          : change.fromStatus === 'draft' && item.partnerId && item.association
            ? item.association.name
            : 'system',
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
    // A partner association's case is verified in the field and paid out by the association itself.
    const partner: Localized | null = item.association ? { ar: item.association.name, en: item.association.name } : null;
    const verifier: Localized = partner ?? (auditor ? { ar: `المدقق الميداني ${auditor.displayName}`, en: `Field auditor ${auditor.displayName}` } : SYSTEM);

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

    const timeline: TimelineEvent[] = [{ kind: 'submitted', at: item.createdAt.toISOString(), actor: partner ?? SYSTEM }];
    for (const change of transitions) {
      const at = change.createdAt.toISOString();
      if (change.toStatus === 'field_verified')
        timeline.push({ kind: 'visit_completed', at, actor: verifier }, { kind: 'documents_verified', at, actor: verifier });
      if (change.toStatus === 'published') timeline.push({ kind: 'published', at, actor: SYSTEM });
      if (change.toStatus === 'funded') timeline.push({ kind: 'funded', at, actor: SYSTEM });
      if (change.toStatus === 'closed') timeline.push({ kind: 'closed', at, actor: SYSTEM });
    }
    for (const payout of payouts.filter((row) => row.status === 'paid' && row.paidAt)) {
      timeline.push({ kind: 'disbursed', at: payout.paidAt!.toISOString(), actor: partner ?? SYSTEM });
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
        const full = donation.donorId ? ((await db.read.users.byId(donation.donorId))?.displayName ?? null) : (donation.guestContact?.name ?? null);
        displayName = staff ? full : publicDonorName(full);
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
  /**
   * Whether the beneficiary's national ID matches an earlier case is told to reviewers only (audit log,
   * Slack): telling the submitter would let anyone test whether a national ID is in the database.
   */
  async submit(input: SubmissionInput, context: CallContext): Promise<Pick<CaseRow, 'id' | 'reference' | 'status'>> {
    if (input.consent !== true) throw new DomainError('VALIDATION_FAILED', 'Consent is required', { field: 'consent' });
    if (input.isUrgent && !input.deadline) throw new DomainError('VALIDATION_FAILED', 'Urgent cases need a deadline', { field: 'deadline' });
    // An association's case always passes the registry check (رقم الإشهار + «كود يُسر»), signed in or not;
    // anyone else must be signed in.
    const association = input.submitterRelation === 'association' ? input.association : null;
    if (input.submitterRelation === 'association' && !association) {
      throw new DomainError('VALIDATION_FAILED', 'A partner association’s submission needs its details', { field: 'association' });
    }
    const partner = association ? await this.deps.partners.verify(association, context) : null;
    const actor = context.actor;
    if (!partner && !actor) throw new DomainError('UNAUTHENTICATED', 'Sign in to submit a case');
    // Documents must come from this submitter's own uploads (the partner's prefix, or the person's).
    const prefixes = [partner ? uploadPrefix({ partnerId: partner.id }) : null, actor ? uploadPrefix({ actorId: actor.id }) : null].filter(
      (prefix): prefix is string => prefix !== null,
    );
    for (const document of input.documents) {
      if (!prefixes.some((prefix) => document.storageKey.startsWith(prefix)) || document.storageKey.includes('..')) {
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
        submittedBy: actor?.id ?? null,
        submitterRelation: input.submitterRelation,
        // The public name and number come from the registry, never from what was typed.
        association:
          partner && association
            ? {
                name: partner.name,
                registrationNumber: partner.registrationNumber,
                contactName: association.contactName,
                contactPhone: association.contactPhone,
              }
            : null,
        partnerId: partner?.id ?? null,
        title,
        summary: { ar: story.ar.slice(0, 180), en: story.en.slice(0, 180) },
        shareText: null,
        story,
        region: input.region,
        currency: input.currency,
        // The partner writes what the case needs; donors are asked for that plus Yusr's 10%.
        goalMinor: caseAmountsFor(input.goalMinor).goalMinor,
        platformFeeMinor: caseAmountsFor(input.goalMinor).platformFeeMinor,
        raisedMinor: 0,
        donorsCount: 0,
        isUrgent: input.isUrgent,
        deadline: input.deadline ? new Date(input.deadline) : null,
        zakatEligible: false,
        priority: input.isUrgent ? 50 : 0,
        featuredAt: null,
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
      await tx.cases.insertTransition({ caseId: id, fromStatus: 'draft', toStatus: 'under_review', actorId: actor?.id ?? null, reason: null });
      for (const document of input.documents) {
        await tx.cases.insertDocument({
          id: ids(),
          caseId: id,
          kind: document.kind,
          storageKey: document.storageKey,
          redactedKey: null,
          sha256: document.sha256,
          pages: 1,
          uploadedBy: actor?.id ?? null,
          redactedBy: null,
          createdAt: now,
        });
      }
      await tx.audit.record({
        actorId: actor?.id ?? null,
        actorRole: actor ? primaryRole(actor) : null,
        action: 'case.submitted',
        entityType: 'case',
        entityId: id,
        after: {
          reference: created.reference,
          category: input.category,
          goalMinor: input.goalMinor,
          possibleDuplicate: Boolean(existing),
          ...(partner ? { partnerId: partner.id } : {}),
        },
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
      return { id, reference: created.reference, status: 'under_review' as const };
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

  /** A case can go live only with a disbursement plan that adds up to its need (goal less Yusr's fee) and redacted public documents. */
  private async assertPublishable(tx: Tx, item: CaseRow): Promise<void> {
    const lines = await tx.cases.lines(item.id);
    const planned = lines.reduce((sum, line) => sum + line.amountMinor, 0);
    if (planned !== caseNeedMinor(item)) {
      throw new DomainError('VALIDATION_FAILED', 'The disbursement plan must add up to the case need before publishing', {
        plannedMinor: planned,
        needMinor: caseNeedMinor(item),
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

  /** Adds a published case to the home page's «يحدث الآن» card, or takes it off. */
  async feature(caseId: string, featured: boolean, context: CallContext): Promise<void> {
    const actor = requirePermission(context.actor, 'cases:prioritize');
    await this.deps.db.transaction(async (tx) => {
      const item = await tx.cases.byId(caseId, 'update');
      if (!item) throw new DomainError('NOT_FOUND', 'Case not found');
      if (featured && item.status !== 'published') throw new DomainError('CASE_NOT_DONATABLE', 'Only a published case can be shown on the home page');
      if (featured === (item.featuredAt !== null)) return;
      const featuredAt = featured ? this.deps.clock.now() : null;
      await tx.cases.update(caseId, { featuredAt });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: featured ? 'case.featured' : 'case.unfeatured',
        entityType: 'case',
        entityId: caseId,
        before: { featured: item.featuredAt !== null },
        after: { featured },
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

/** JPEG starts FF D8 FF; WebP is a RIFF file whose form type is WEBP. */
function looksLike(type: StoryPhotoType, bytes: Uint8Array): boolean {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
}
