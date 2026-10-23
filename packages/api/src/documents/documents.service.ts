import { DomainError, hasPermission, type DocumentKind } from '@yusr/core';
import { primaryRole, requirePermission, type CallContext } from '../common/actor';
import type { Clock } from '../common/clock';
import type { IdGenerator } from '../common/ids';
import type { RateLimiter } from '../common/rate-limit';
import type { Database } from '../db/ports';
import type { ObjectStorage } from './storage';

const EXTENSIONS: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};
const MAX_BYTES = 20 * 1024 * 1024;

export class DocumentsService {
  constructor(private readonly deps: { db: Database; storage: ObjectStorage; limiter: RateLimiter; clock: Clock; ids: IdGenerator }) {}

  /** Step 1 of submitting a document: a 10-minute upload link into the private bucket. */
  async presignUpload(input: { kind: DocumentKind; contentType: string; sizeBytes: number }, context: CallContext) {
    const actor = context.actor;
    if (!actor) throw new DomainError('UNAUTHENTICATED', 'Sign in to upload documents');
    const extension = EXTENSIONS[input.contentType];
    if (!extension) throw new DomainError('VALIDATION_FAILED', 'Upload a PDF or a photo', { field: 'contentType' });
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_BYTES) {
      throw new DomainError('VALIDATION_FAILED', 'Files are limited to 20 MB', { field: 'sizeBytes' });
    }
    await this.deps.limiter.consume(`uploads:${actor.id}`, { limit: 40, windowSeconds: 3_600 });
    const key = `uploads/${actor.id}/${this.deps.ids()}.${extension}`;
    const upload = await this.deps.storage.presignPut({
      bucket: 'private',
      key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: 600,
    });
    return { key, ...upload, expiresAt: new Date(this.deps.clock.now().getTime() + 600_000).toISOString() };
  }

  /**
   * Staff with documents:read_private open originals through a 5-minute link; every opening is audited.
   * A field auditor opens only the documents of cases assigned to them (the case's auditor, or an open
   * verification task); people who assign verifications (moderators, super admins) open any.
   */
  async openOriginal(documentId: string, context: CallContext): Promise<{ url: string; expiresInSeconds: number }> {
    const actor = requirePermission(context.actor, 'documents:read_private');
    const { db, storage } = this.deps;
    const document = await db.read.cases.document(documentId);
    if (!document) throw new DomainError('NOT_FOUND', 'Document not found');
    if (!hasPermission(actor.roles, 'verifications:assign')) {
      const item = await db.read.cases.byId(document.caseId);
      const assigned =
        item?.auditorId === actor.id || (await db.read.verification.list({ auditorId: actor.id, open: true })).some((task) => task.caseId === document.caseId);
      if (!assigned) throw new DomainError('FORBIDDEN', 'This case is not assigned to you');
    }
    await db.transaction((tx) =>
      tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'document.viewed',
        entityType: 'case',
        entityId: document.caseId,
        after: { documentId, kind: document.kind },
        ip: context.ip ?? null,
        requestId: context.requestId ?? null,
      }),
    );
    return { url: await storage.presignGet({ bucket: 'private', key: document.storageKey, expiresInSeconds: 300 }), expiresInSeconds: 300 };
  }

  /** Moderators upload the redacted copy (names, ID numbers and faces removed) into the public bucket. */
  async presignRedacted(documentId: string, input: { contentType: string; sizeBytes: number }, context: CallContext) {
    requirePermission(context.actor, 'documents:redact');
    const document = await this.deps.db.read.cases.document(documentId);
    if (!document) throw new DomainError('NOT_FOUND', 'Document not found');
    const extension = EXTENSIONS[input.contentType];
    if (!extension || input.sizeBytes > MAX_BYTES) throw new DomainError('VALIDATION_FAILED', 'Upload a PDF or a photo up to 20 MB');
    const key = `cases/${document.caseId}/${document.id}.${extension}`;
    const upload = await this.deps.storage.presignPut({
      bucket: 'public',
      key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: 600,
    });
    return { key, ...upload };
  }

  async confirmRedacted(documentId: string, key: string, context: CallContext): Promise<{ publicUrl: string }> {
    const actor = requirePermission(context.actor, 'documents:redact');
    const { db, storage } = this.deps;
    return db.transaction(async (tx) => {
      const document = await tx.cases.document(documentId);
      if (!document) throw new DomainError('NOT_FOUND', 'Document not found');
      if (!key.startsWith(`cases/${document.caseId}/${document.id}.`)) throw new DomainError('VALIDATION_FAILED', 'Unexpected key for this document');
      await tx.cases.updateDocument(document.id, { redactedKey: key, redactedBy: actor.id });
      await tx.audit.record({
        actorId: actor.id,
        actorRole: primaryRole(actor),
        action: 'document.redacted',
        entityType: 'case',
        entityId: document.caseId,
        after: { documentId, kind: document.kind },
      });
      return { publicUrl: storage.publicUrl(key) };
    });
  }
}
