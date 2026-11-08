/**
 * «اطلب الاطلاع على الوثائق». Public pages show a case's documents with personal details hidden, but the
 * donor keeps the full right to see them. Anyone may ask from the case page, with no account, giving a
 * name and a WhatsApp number; staff with documents:share send the documents there as view-once images
 * (no saving, no screenshots) and mark the request sent or declined. The number is staff only: it is
 * kept out of the audit log, and every change is audited.
 */
import { DomainError, isPubliclyVisible, type DocumentRequest, type DocumentRequestInbox, type DocumentRequestStatus } from '@yusr/core';
import type { DocumentRequestInput } from '@yusr/core/schemas';
import { primaryRole, requirePermission, type CallContext } from '../common/actor';
import type { Clock } from '../common/clock';
import type { IdGenerator } from '../common/ids';
import type { Database, Tx } from '../db/ports';
import type { DocumentRequestRow } from '../db/rows';

export interface DocumentRequestsDeps {
  db: Database;
  clock: Clock;
  ids: IdGenerator;
}

export class DocumentRequestsService {
  constructor(private readonly deps: DocumentRequestsDeps) {}

  /** A visitor asks to see a public case's documents. Asking again while a request waits adds nothing. */
  async request(slug: string, input: DocumentRequestInput, context: CallContext): Promise<{ received: true }> {
    const { db, clock, ids } = this.deps;
    await db.transaction(async (tx) => {
      const item = await tx.cases.bySlug(slug);
      if (!item || !isPubliclyVisible(item.status)) throw new DomainError('NOT_FOUND', 'Case not found');
      if (await tx.cases.openDocumentRequest(item.id, input.whatsapp)) return;
      const row: DocumentRequestRow = {
        id: ids(),
        caseId: item.id,
        name: input.name.trim(),
        whatsapp: input.whatsapp,
        status: 'new',
        handledBy: null,
        handledAt: null,
        createdAt: clock.now(),
      };
      await tx.cases.insertDocumentRequest(row);
      await tx.audit.record({
        actorId: context.actor?.id ?? null,
        actorRole: context.actor ? primaryRole(context.actor) : null,
        action: 'documents.requested',
        entityType: 'document_request',
        entityId: row.id,
        after: { caseId: item.id, reference: item.reference },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      });
    });
    return { received: true };
  }

  async inbox(context: CallContext, limit = 100): Promise<DocumentRequestInbox> {
    requirePermission(context.actor, 'documents:share');
    const { db } = this.deps;
    const [rows, waiting] = await Promise.all([db.read.cases.documentRequests(Math.min(Math.max(limit, 1), 200)), db.read.cases.waitingDocumentRequests()]);
    return { items: await Promise.all(rows.map((row) => this.toRequest(db.read, row))), waiting };
  }

  /** Marks a request sent (the documents went out on WhatsApp) or declined. */
  async setStatus(id: string, status: Exclude<DocumentRequestStatus, 'new'>, context: CallContext): Promise<DocumentRequest> {
    const actor = requirePermission(context.actor, 'documents:share');
    const { db, clock } = this.deps;
    return db.transaction(async (tx) => {
      const current = await tx.cases.documentRequestById(id, 'update');
      if (!current) throw new DomainError('NOT_FOUND', 'Request not found');
      if (current.status !== status) {
        await tx.cases.updateDocumentRequest(id, { status, handledBy: actor.id, handledAt: clock.now() });
        await tx.audit.record({
          actorId: actor.id,
          actorRole: primaryRole(actor),
          action: `documents.request_${status}`,
          entityType: 'document_request',
          entityId: id,
          before: { status: current.status },
          after: { status },
          ip: context.ip ?? null,
          requestId: context.requestId ?? null,
        });
      }
      return this.toRequest(tx, (await tx.cases.documentRequestById(id))!);
    });
  }

  private async toRequest(tx: Tx, row: DocumentRequestRow): Promise<DocumentRequest> {
    const [item, handler] = await Promise.all([tx.cases.byId(row.caseId), row.handledBy ? tx.users.byId(row.handledBy) : null]);
    return {
      id: row.id,
      case: { id: row.caseId, slug: item?.slug ?? '', reference: item?.reference ?? '', title: item?.title ?? { ar: '—', en: '—' } },
      name: row.name,
      whatsapp: row.whatsapp,
      status: row.status,
      handledBy: row.handledBy ? { id: row.handledBy, name: handler?.displayName ?? '—' } : null,
      handledAt: row.handledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
