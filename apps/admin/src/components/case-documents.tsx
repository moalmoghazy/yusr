'use client';

import type { CaseDocumentPublic, Locale } from '@yusr/core';
import { Badge, buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { confirmRedactedUpload, openOriginal, requestRedactedUpload } from '@/app/(hub)/cases/[id]/actions';

const CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 20 * 1024 * 1024;

type Status = { kind: 'busy' } | { kind: 'done'; message: string } | { kind: 'error'; message: string };

/**
 * The case's documents as staff see them. The original opens through a five-minute link (audited); the
 * redacted copy (names, ID numbers and faces hidden) is what donors may see once the case is published.
 * At least one document needs its redacted copy before the case can be published.
 */
export function CaseDocuments({
  locale,
  caseId,
  documents,
  canOpen,
  canRedact,
}: {
  locale: Locale;
  caseId: string;
  documents: CaseDocumentPublic[];
  canOpen: boolean;
  canRedact: boolean;
}) {
  const { t, f, l } = textFor(locale);
  const router = useRouter();
  const [status, setStatus] = useState<Record<string, Status>>({});
  const set = (id: string, value: Status) => setStatus((current) => ({ ...current, [id]: value }));

  async function open(documentId: string) {
    // Opened before the request so the browser does not treat it as an unrequested pop-up.
    const tab = window.open('', '_blank');
    set(documentId, { kind: 'busy' });
    const result = await openOriginal(documentId).catch(() => ({ ok: false as const, message: t('errors.SERVICE_UNAVAILABLE') }));
    if (result.ok) {
      if (tab) tab.location.href = result.url;
      else window.location.href = result.url;
      setStatus((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== documentId)));
    } else {
      tab?.close();
      set(documentId, { kind: 'error', message: result.message });
    }
  }

  async function upload(documentId: string, file: File | undefined) {
    if (!file) return;
    if (!CONTENT_TYPES.includes(file.type) || file.size === 0 || file.size > MAX_BYTES) {
      set(documentId, { kind: 'error', message: t('admin.caseDetail.documents.fileInvalid') });
      return;
    }
    set(documentId, { kind: 'busy' });
    try {
      const grant = await requestRedactedUpload(documentId, { contentType: file.type, sizeBytes: file.size });
      if (!grant.ok) throw new Error(grant.message);
      // The browser sets Content-Length itself (a script may not).
      const headers = Object.fromEntries(Object.entries(grant.ticket.headers).filter(([name]) => name.toLowerCase() !== 'content-length'));
      const response = await fetch(grant.ticket.url, { method: 'PUT', headers, body: file }).catch(() => null);
      if (!response?.ok) throw new Error(t('admin.caseDetail.documents.uploadFailed'));
      const confirmed = await confirmRedactedUpload(caseId, documentId, grant.ticket.key);
      if (!confirmed?.ok) throw new Error(confirmed?.message ?? t('admin.caseDetail.documents.uploadFailed'));
      set(documentId, { kind: 'done', message: confirmed.message });
      router.refresh();
    } catch (error) {
      set(documentId, { kind: 'error', message: error instanceof Error && error.message ? error.message : t('admin.caseDetail.documents.uploadFailed') });
    }
  }

  if (documents.length === 0) return <p className="text-sm text-muted-foreground">{t('admin.caseDetail.documents.none')}</p>;

  return (
    <ul className="flex flex-col divide-y divide-border">
      {documents.map((document) => {
        const current = status[document.id];
        const busy = current?.kind === 'busy';
        const inputId = `redacted-${document.id}`;
        return (
          <li key={document.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Icon name="file-text" size={18} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-semibold">{l(document.title)}</p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={document.issuedAt}>{f.date(document.issuedAt)}</time>
                  </p>
                </div>
                {document.redacted ? (
                  <Badge tone="success" icon="check">
                    {t('admin.caseDetail.documents.redacted')}
                  </Badge>
                ) : (
                  <Badge tone="warning" icon="eye-off">
                    {t('admin.caseDetail.documents.notRedacted')}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {canOpen && (
                  <button type="button" disabled={busy} onClick={() => open(document.id)} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
                    <Icon name="external" size={15} />
                    {t('admin.caseDetail.documents.openOriginal')}
                  </button>
                )}
                {canRedact && (
                  <label
                    htmlFor={inputId}
                    className={buttonClasses({
                      variant: document.redacted ? 'outline' : 'primary',
                      size: 'sm',
                      className: cn('cursor-pointer', busy && 'pointer-events-none opacity-60'),
                    })}
                  >
                    <Icon name="upload" size={15} />
                    {document.redacted ? t('admin.caseDetail.documents.replace') : t('admin.caseDetail.documents.upload')}
                    <input
                      id={inputId}
                      type="file"
                      accept={CONTENT_TYPES.join(',')}
                      disabled={busy}
                      className="sr-only"
                      onChange={(event) => {
                        void upload(document.id, event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
            {current && (
              <p
                role="status"
                className={cn(
                  'text-xs font-semibold',
                  current.kind === 'error' ? 'text-destructive' : current.kind === 'done' ? 'text-success' : 'text-muted-foreground',
                )}
              >
                {current.kind === 'busy' ? t('admin.caseDetail.documents.working') : current.message}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
