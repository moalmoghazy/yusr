import type { Currency, DonationReceipt, DonationStatus } from '@yusr/core';
import { ApiError } from '@yusr/sdk';
import { Badge, buttonClasses, Icon, Logo, textFor, type BadgeTone } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SignInForm } from '@/components/sign-in-form';
import { signOut } from '@/lib/account';
import { currentDonor, live } from '@/lib/api';
import { href } from '@/lib/i18n';
import { pageLocale, type LocaleParams } from '@/lib/page';

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const { t } = textFor(await pageLocale(params));
  return { title: t('portal.title'), robots: { index: false, follow: false } };
}

const TONE: Partial<Record<DonationStatus, BadgeTone>> = {
  succeeded: 'success',
  pending: 'warning',
  requires_action: 'warning',
  awaiting_transfer: 'warning',
  needs_review: 'warning',
  failed: 'urgent',
  canceled: 'urgent',
  expired: 'urgent',
};

const COUNTED: DonationStatus[] = ['succeeded', 'partially_refunded'];

/**
 * «عطائي»: a donor's own donations and receipts. Signed out, the same address shows the sign-in
 * (phone and a code), so the header link is one link either way. Never cached, never indexed.
 */
export default async function AccountPage({ params }: { params: LocaleParams }) {
  const locale = await pageLocale(params);
  const { t, f, l } = textFor(locale);
  const donor = await currentDonor();

  let donations: DonationReceipt[] | null = null;
  if (donor) {
    try {
      donations = await (await live(locale)).myDonations();
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
  }

  if (!donor || !donations) {
    return (
      <div className="container-page grid place-items-center py-12">
        <section className="flex w-full max-w-sm flex-col gap-6 rounded-sheet border border-border bg-card p-7 shadow-lg" aria-labelledby="sign-in-title">
          <Logo locale={locale} size={34} />
          <div className="flex flex-col gap-1.5">
            <h1 id="sign-in-title" className="font-display text-2xl font-bold">
              {t('account.signInTitle')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('account.signInBody')}</p>
          </div>
          <SignInForm locale={locale} />
        </section>
      </div>
    );
  }

  const given = donations.filter((donation) => COUNTED.includes(donation.status));
  const totals = new Map<Currency, number>();
  for (const donation of given) totals.set(donation.currency, (totals.get(donation.currency) ?? 0) + donation.chargedMinor);
  const helped = new Set(given.map((donation) => donation.caseId)).size;
  const receiptHref = (id: string) => `${href(locale, '/receipt')}?donation=${encodeURIComponent(id)}`;

  return (
    <div className="container-page flex max-w-4xl flex-col gap-8 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-primary">{t('portal.title')}</p>
          <h1 className="font-display text-3xl font-bold">{t('portal.greeting', { name: donor.name })}</h1>
        </div>
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
            <Icon name="log-out" size={16} />
            {t('account.signOut')}
          </button>
        </form>
      </header>

      <section aria-label={t('portal.impactTitle')} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-card border border-border bg-card p-5">
          <span className="text-sm text-muted-foreground">{t('portal.totalGiven')}</span>
          <strong className="font-display text-2xl tabular-nums">
            {totals.size === 0 ? f.money(0, 'EGP') : [...totals].map(([currency, minor]) => f.money(minor, currency)).join(' + ')}
          </strong>
        </div>
        <div className="flex flex-col gap-1 rounded-card border border-border bg-highlight-soft p-5">
          <span className="text-sm text-muted-foreground">{t('portal.casesHelped')}</span>
          <strong className="font-display text-2xl tabular-nums">{f.number(helped)}</strong>
        </div>
      </section>

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="flex items-center gap-2 text-lg font-bold">
          <Icon name="receipt" size={18} />
          {t('portal.history')}
        </h2>
        {donations.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground">{t('portal.empty')}</p>
            <Link href={href(locale, '/cases')} className={buttonClasses({ size: 'sm' })}>
              <Icon name="heart" size={16} />
              {t('common.donateNow')}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
            {donations.map((donation) => (
              <li key={donation.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="flex min-w-0 basis-full flex-col gap-0.5 sm:basis-0 sm:flex-1">
                  <Link href={href(locale, `/cases/${donation.caseSlug}`)} className="line-clamp-2 font-semibold hover:text-primary hover:underline">
                    {l(donation.caseTitle)}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {f.date(donation.succeededAt ?? donation.createdAt, 'short')} · {t(`payment.methods.${donation.method}`)} ·{' '}
                    <span dir="ltr" className="font-mono">
                      {donation.receiptNumber}
                    </span>
                  </span>
                </div>
                <strong className="tabular-nums">{f.money(donation.chargedMinor, donation.currency)}</strong>
                <Badge tone={TONE[donation.status] ?? 'neutral'}>{t(`donationStatus.${donation.status}`)}</Badge>
                <Link href={receiptHref(donation.id)} className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'ms-auto' })}>
                  <Icon name="receipt" size={16} />
                  {t('account.viewReceipt')}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t('account.guestNote')}</p>
      </section>
    </div>
  );
}
