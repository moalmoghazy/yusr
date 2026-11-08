import type { DocumentRequestStatus } from '@yusr/core';
import { Badge, buttonClasses, Icon, textFor, type BadgeTone } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DocumentRequestStatusForm } from '@/components/document-request-form';
import { NoAccess } from '@/components/no-access';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.nav.documentRequests') };
}

const TONE: Record<DocumentRequestStatus, BadgeTone> = { new: 'gold', sent: 'success', declined: 'neutral' };

/**
 * «طلبات الاطلاع على الوثائق»: visitors who asked, on a case page, to see its documents. Staff with
 * documents:share message each one on WhatsApp with the documents as view-once images, then mark the
 * request. The numbers are shown here only.
 */
export default async function DocumentRequestsPage() {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t, f, l } = textFor(locale);
  if (!staff.permissions.has('documents:share')) return <NoAccess message={t('admin.noAccess')} />;

  const { items, waiting } = await (await adminApi()).documentRequests();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{t('admin.documentRequests.title')}</h1>
          <Badge tone={waiting > 0 ? 'gold' : 'neutral'}>{t('admin.documentRequests.waiting', { count: waiting })}</Badge>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t('admin.documentRequests.subtitle')}</p>
      </header>

      <p className="flex max-w-3xl items-start gap-2 rounded-control bg-info-soft p-3 text-sm text-info-soft-foreground">
        <Icon name="eye-off" size={18} className="mt-0.5 shrink-0" />
        {t('admin.documentRequests.viewOnce')}
      </p>

      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
          {t('admin.documentRequests.empty')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {items.map((request) => {
            const message = t('admin.documentRequests.message', { name: request.name, reference: request.case.reference });
            return (
              <li key={request.id} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="font-bold" dir="auto">
                      {request.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <time dateTime={request.createdAt}>{t('admin.documentRequests.requestedOn', { date: f.date(request.createdAt, 'medium') })}</time>
                    </p>
                  </div>
                  <Badge tone={TONE[request.status]}>{t(`admin.documentRequests.statuses.${request.status}`)}</Badge>
                </div>
                <Link
                  href={`/cases?q=${encodeURIComponent(request.case.reference)}`}
                  className="flex items-center gap-2 rounded-control bg-muted/60 p-3 text-sm hover:bg-muted"
                >
                  <Icon name="file-text" size={18} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{l(request.case.title)}</span>
                  <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                    {request.case.reference}
                  </span>
                </Link>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  <span dir="ltr" className="font-mono text-xs">
                    {request.whatsapp}
                  </span>
                  <a
                    href={`https://wa.me/${request.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses({ variant: 'soft', size: 'sm' })}
                  >
                    <Icon name="message" size={15} />
                    {t('admin.documentRequests.openWhatsApp')}
                  </a>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  {request.status === 'new' ? <DocumentRequestStatusForm locale={locale} requestId={request.id} /> : <span />}
                  {request.handledBy && request.handledAt && (
                    <span className="text-xs text-muted-foreground">
                      {t('admin.documentRequests.handled', { name: request.handledBy.name, date: f.date(request.handledAt, 'medium') })}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
