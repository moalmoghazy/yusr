import type { DonationReceipt, DonationStatus } from '@yusr/core';
import { ApiError } from '@yusr/sdk';
import { Badge, buttonClasses, cn, Icon, Logo, textFor, type BadgeTone, type IconName } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton, ReceiptRefresh } from '@/components/receipt-client';
import { ShareCase } from '@/components/share-case';
import { live } from '@/lib/api';
import { href } from '@/lib/i18n';
import { requestOrigin } from '@/lib/origin';
import { one, pageLocale, type LocaleParams } from '@/lib/page';

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Outcome = 'done' | 'waiting' | 'failed';

const OUTCOME: Record<DonationStatus, Outcome> = {
  succeeded: 'done',
  partially_refunded: 'done',
  refunded: 'done',
  pending: 'waiting',
  requires_action: 'waiting',
  awaiting_transfer: 'waiting',
  needs_review: 'waiting',
  failed: 'failed',
  canceled: 'failed',
  expired: 'failed',
};

const STATUS_TONE: Record<Outcome, BadgeTone> = { done: 'success', waiting: 'warning', failed: 'urgent' };
const OUTCOME_ICON: Record<Outcome, IconName> = { done: 'check', waiting: 'clock', failed: 'x' };

/**
 * The receipt a gateway returns the donor to (`/ar/receipt?donation=…&token=…`). The token is an
 * HMAC of the donation id, so a guest sees their own receipt without an account and nobody can
 * enumerate others'. Never cached, never indexed.
 */
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: LocaleParams;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await pageLocale(params);
  const query = await searchParams;
  const id = one(query['donation']);
  const token = one(query['token']);
  if (!id || !token) notFound();

  let receipt: DonationReceipt;
  try {
    receipt = await live(locale).getDonation(id, token);
  } catch (error) {
    if (error instanceof ApiError && [400, 403, 404, 422].includes(error.status)) notFound();
    throw error;
  }

  const { t, f, l } = textFor(locale);
  const outcome = OUTCOME[receipt.status];
  const title = outcome === 'done' ? t('donate.successTitle') : outcome === 'waiting' ? t('donate.pendingTitle') : t('donate.failedTitle');
  const body =
    outcome === 'done'
      ? t('donate.successBody', { amount: f.money(receipt.netToCaseMinor, receipt.caseCurrency) })
      : outcome === 'waiting'
        ? t('donate.processing')
        : t('donate.failedBody');
  const rows: Array<[string, string]> = [
    [t('receipt.date'), f.dateTime(receipt.succeededAt ?? receipt.createdAt)],
    [t('receipt.method'), t(`payment.methods.${receipt.method}`)],
    [t('receipt.amount'), f.money(receipt.chargedMinor, receipt.currency)],
    [t('receipt.fee'), f.money(receipt.feeMinor, receipt.currency)],
    [t('receipt.net'), f.money(receipt.netToCaseMinor, receipt.caseCurrency)],
    [t('donate.type'), t(`donationType.${receipt.type}`)],
  ];

  return (
    <div className="container-page flex max-w-2xl flex-col gap-6 py-10">
      {(receipt.status === 'pending' || receipt.status === 'requires_action') && <ReceiptRefresh />}

      <header className="flex flex-col items-center gap-3 text-center" aria-live="polite">
        <span
          className={cn(
            'grid size-14 place-items-center rounded-full',
            outcome === 'done'
              ? 'bg-success-soft text-success-soft-foreground'
              : outcome === 'waiting'
                ? 'bg-warning-soft text-warning-soft-foreground'
                : 'bg-destructive-soft text-destructive-soft-foreground',
          )}
        >
          <Icon name={OUTCOME_ICON[outcome]} size={28} strokeWidth={2.2} />
        </span>
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="max-w-md text-muted-foreground">{body}</p>
      </header>

      <section
        aria-labelledby="receipt-title"
        className="flex flex-col gap-4 rounded-card border border-border bg-card p-6 shadow-sm print:border-0 print:shadow-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="receipt-title" className="font-bold">
              {t('receipt.title')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('donate.receiptNumber')}:{' '}
              <span className="font-mono text-foreground" dir="ltr">
                {receipt.receiptNumber}
              </span>
            </p>
          </div>
          <Logo locale={locale} size={36} />
        </div>
        <p className="rounded-control bg-muted/70 p-3 text-sm">
          <span className="text-muted-foreground">{t('receipt.case')}: </span>
          <Link href={href(locale, `/cases/${receipt.caseSlug}`)} className="font-semibold text-primary hover:underline">
            {l(receipt.caseTitle)}
          </Link>
        </p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 border-b border-border/70 pb-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t('receipt.status')}</dt>
            <dd>
              <Badge tone={STATUS_TONE[outcome]}>{t(`donationStatus.${receipt.status}`)}</Badge>
            </dd>
          </div>
        </dl>
        {receipt.dedication && <p className="rounded-control border border-dashed border-highlight/60 p-3 text-sm">«{receipt.dedication}»</p>}
        <p className="text-xs text-muted-foreground">{t('receipt.note')}</p>
      </section>

      {outcome === 'done' && (
        <ShareCase
          locale={locale}
          url={`${await requestOrigin()}/${locale}/cases/${receipt.caseSlug}`}
          title={l(receipt.caseTitle)}
          lead={t('share.afterDonation')}
          className="print:hidden"
        />
      )}

      <div className="flex flex-wrap justify-center gap-3 print:hidden">
        <Link href={href(locale, `/cases/${receipt.caseSlug}#transparency`)} className={buttonClasses({})}>
          <Icon name="eye" size={17} />
          {t('case.transparency')}
        </Link>
        {outcome === 'done' && <PrintButton label={t('donate.viewReceipt')} />}
        <Link href={href(locale, '/cases')} className={buttonClasses({ variant: 'ghost' })}>
          {t('donate.anotherDonation')}
        </Link>
      </div>
    </div>
  );
}
