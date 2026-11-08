import type { Localized } from './types';

/**
 * «اطلب الاطلاع على الوثائق». Public pages show case documents with personal details hidden, but the
 * donor keeps the full right to see them: anyone may ask, from the case page, with a WhatsApp number.
 * The team sends the documents there as view-once images (no saving, no screenshots) to protect the
 * case's privacy. The number is staff only, never on a public page and never in the audit log
 * (0012_document_requests.sql).
 */
export const DOCUMENT_REQUEST_STATUSES = ['new', 'sent', 'declined'] as const;
export type DocumentRequestStatus = (typeof DOCUMENT_REQUEST_STATUSES)[number];

/** A request as staff with `documents:share` see it. */
export interface DocumentRequest {
  id: string;
  case: { id: string; slug: string; reference: string; title: Localized };
  name: string;
  /** E.164; the WhatsApp number the documents go to. */
  whatsapp: string;
  status: DocumentRequestStatus;
  handledBy: { id: string; name: string } | null;
  handledAt: string | null;
  createdAt: string;
}

/** The hub's inbox: newest first, with how many still wait (the nav counter). */
export interface DocumentRequestInbox {
  items: DocumentRequest[];
  waiting: number;
}
