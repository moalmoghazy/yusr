import { PLATFORM_FEE_BPS, type CaseDetail, type DisbursementStatus, type Locale } from '@yusr/core';
import {
  Badge,
  buttonClasses,
  CaseCover,
  CategoryBadge,
  CountdownBadge,
  DonationProgress,
  Icon,
  RegionLabel,
  StatusBadge,
  textFor,
  VerifiedBadge,
  ZakatBadge,
  type BadgeTone,
} from '@yusr/ui';
import { caseShareMessage } from '@yusr/i18n';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { DonatePanel } from '@/components/donate-panel';
import { ShareCase } from '@/components/share-case';
import { catalog } from '@/lib/api';
import { href, isLocale } from '@/lib/i18n';
import { OG_IMAGE } from '@/lib/og';
import { requestOrigin } from '@/lib/origin';
import { one } from '@/lib/page';

type Params = Promise<{ locale: string; slug: string }>;

async function load(params: Params): Promise<{ locale: Locale; item: CaseDetail }> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const item = await catalog(locale).getCase(slug);
  if (!item) notFound();
  return { locale, item };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, item } = await load(params);
  const { t, l } = textFor(locale);
  const message = caseShareMessage(t, locale, item);
  return {
    title: l(item.title),
    description: l(item.summary),
    alternates: { canonical: `/${locale}/cases/${item.slug}`, languages: { ar: `/ar/cases/${item.slug}`, en: `/en/cases/${item.slug}` } },
    openGraph: { title: l(item.title), description: message, type: 'article', images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: l(item.title), description: message, images: [OG_IMAGE.url] },
  };
}

const DISBURSEMENT_TONE: Record<DisbursementStatus, BadgeTone> = { planned: 'neutral', approved: 'info', paid: 'success' };

export default async function CasePage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale, item } = await load(params);
  const { t, f, l } = textFor(locale);
  const open = item.status === 'published';
  const presetMinor = Number(one((await searchParams)['amount'])) || null;
  const plannedMinor = item.disbursements.reduce((sum, line) => sum + line.amountMinor, 0);
  const caseUrl = `${await requestOrigin()}/${locale}/cases/${item.slug}`;

  return (
    <div className="container-page grid grid-cols-1 gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <article className="flex min-w-0 flex-col gap-8" aria-labelledby="case-title">
        <header className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-card border border-border">
            <CaseCover category={item.category} seed={item.coverSeed} className="aspect-[16/7] w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <CategoryBadge category={item.category} locale={locale} />
            {item.verifiedAt && <VerifiedBadge locale={locale} />}
            {item.zakatEligible && <ZakatBadge locale={locale} />}
            {!open && <StatusBadge status={item.status} locale={locale} />}
          </div>
          <h1 id="case-title" className="font-display text-[clamp(1.7rem,1.2rem+1.6vw,2.4rem)] font-bold leading-snug">
            {l(item.title)}
          </h1>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Meta label={t('case.location')}>
              <RegionLabel code={item.region} locale={locale} />
            </Meta>
            <Meta label={t('case.reference')}>
              <span className="font-mono" dir="ltr">
                {item.reference}
              </span>
            </Meta>
            <Meta label={t('case.beneficiary')}>{l(item.beneficiary)}</Meta>
          </dl>
          {item.partner && (
            <div className="flex items-start gap-3 rounded-card border border-border bg-card p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                <Icon name="landmark" size={20} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-semibold text-muted-foreground">{t('case.partner')}</span>
                <span className="font-bold">{item.partner.name}</span>
                <span className="text-xs text-muted-foreground">{t('case.partnerRegistration', { number: item.partner.registrationNumber })}</span>
                <span className="mt-1 text-sm text-muted-foreground">{t('case.partnerRole')}</span>
              </div>
            </div>
          )}
        </header>

        {!open && (
          <p className="flex items-start gap-2 rounded-card bg-highlight-soft p-4 text-sm text-highlight-soft-foreground">
            <Icon name="info" size={18} className="mt-0.5" />
            {item.status === 'paused' ? t('case.pausedNotice') : t('case.fundedNotice')}
          </p>
        )}

        <Section id="story" title={t('case.story')}>
          <p className="whitespace-pre-line text-[1.02rem] leading-loose">{l(item.story)}</p>
        </Section>

        <Section id="transparency" title={t('case.disbursementPlan')} lead={t('case.paidDirectly')}>
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {item.disbursements.map((line) => (
              <li key={line.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary-soft-foreground">
                  <Icon name="landmark" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {l(line.payee)} <span className="text-xs font-normal text-muted-foreground">· {t(`case.payees.${line.payeeType}`)}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{l(line.purpose)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-bold tabular-nums">{f.money(line.amountMinor, item.currency, { fractionDigits: 0 })}</span>
                  <Badge tone={DISBURSEMENT_TONE[line.status]} icon={line.status === 'paid' ? 'check' : undefined}>
                    {t(`case.disbursement.${line.status}`)}
                    {line.paidAt && ` · ${f.date(line.paidAt, 'short')}`}
                  </Badge>
                </div>
              </li>
            ))}
            {item.platformFeeMinor > 0 && (
              <li className="flex flex-wrap items-center gap-3 p-4">
                <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Icon name="receipt" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t('case.platformFee', { percent: f.percent(PLATFORM_FEE_BPS / 100) })}</p>
                  <p className="text-sm text-muted-foreground">{t('case.platformFeeNote')}</p>
                </div>
                <span className="font-bold tabular-nums">{f.money(item.platformFeeMinor, item.currency, { fractionDigits: 0 })}</span>
              </li>
            )}
            <li className="flex items-center justify-between bg-muted/60 p-4 text-sm font-bold">
              <span>{t('case.goal')}</span>
              <span className="tabular-nums">{f.money(plannedMinor + item.platformFeeMinor, item.currency, { fractionDigits: 0 })}</span>
            </li>
          </ul>
        </Section>

        <Section id="documents" title={t('case.documents')} lead={t('case.redactedNotice')}>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {item.documents.map((document) => (
              <li key={document.id} className="flex gap-3 rounded-card border border-border bg-card p-4">
                <Icon name="file-text" size={22} className="mt-0.5 text-primary" />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-semibold">{l(document.title)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`case.documentKinds.${document.kind}`)} · {t('units.pages', { count: document.pages })} · {f.date(document.issuedAt, 'short')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('case.verifiedBy')}: {l(document.verifiedBy)}
                  </p>
                  {document.redacted && (
                    <Badge tone="slate" icon="eye-off" className="self-start">
                      {t('case.redacted')}
                    </Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="verification" title={t('case.verification')}>
          <ol className="relative flex flex-col gap-5 border-s-2 border-border ps-6">
            {item.timeline.map((event) => (
              <li key={`${event.kind}-${event.at}`} className="relative">
                <span aria-hidden className="absolute -start-[1.95rem] top-1.5 size-3.5 rounded-full border-2 border-card bg-primary" />
                <p className="font-semibold">{t(`case.timeline.${event.kind}`)}</p>
                <p className="text-sm text-muted-foreground">
                  <time dateTime={event.at}>{f.date(event.at, 'medium')}</time> · {l(event.actor)}
                </p>
                {event.note && <p className="mt-1 text-sm">{l(event.note)}</p>}
              </li>
            ))}
          </ol>
        </Section>

        {item.updates.length > 0 && (
          <Section id="updates" title={t('case.updates')}>
            <ul className="flex flex-col gap-3">
              {item.updates.map((update) => (
                <li key={update.id} className="rounded-card border border-border bg-card p-4">
                  <time dateTime={update.at} className="text-xs text-muted-foreground">
                    {f.date(update.at, 'medium')}
                  </time>
                  <p className="mt-1">{l(update.body)}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </article>

      <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
        <section id="donate" aria-labelledby="donate-title" className="flex flex-col gap-5 rounded-card border border-border bg-card p-5 shadow-md">
          <div className="flex items-center justify-between gap-2">
            <h2 id="donate-title" className="text-lg font-bold">
              {t('donate.title')}
            </h2>
            {item.isUrgent && open && <CountdownBadge deadline={item.deadline} locale={locale} initialNow={Date.now()} />}
          </div>
          <DonationProgress
            raisedMinor={item.raisedMinor}
            goalMinor={item.goalMinor}
            currency={item.currency}
            locale={locale}
            donors={item.donorsCount}
            size="lg"
          />
          {open ? (
            <DonatePanel
              locale={locale}
              caseId={item.id}
              currency={item.currency}
              zakatEligible={item.zakatEligible}
              initialAmountMinor={presetMinor}
              attemptKey={crypto.randomUUID()}
              remainingMinor={Math.max(0, item.goalMinor - item.raisedMinor)}
            />
          ) : (
            <Link href="#transparency" className={buttonClasses({ variant: 'soft', block: true })}>
              <Icon name="receipt" size={17} />
              {t('case.transparency')}
            </Link>
          )}
        </section>

        <ShareCase locale={locale} url={caseUrl} title={l(item.title)} message={caseShareMessage(t, locale, item)} lead={t('share.lead')} />

        <section aria-labelledby="recent-title" className="rounded-card border border-border bg-card p-5">
          <h2 id="recent-title" className="mb-3 font-bold">
            {t('case.recentDonors')}
          </h2>
          {item.recentDonations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('case.noDonationsYet')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {item.recentDonations.map((gift) => (
                <li key={gift.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Icon name="heart" size={15} className="shrink-0 text-highlight" />
                    <span className="truncate">{gift.displayName ?? t('case.anonymous')}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{f.money(gift.amountMinor, item.currency, { fractionDigits: 0 })}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href={href(locale, '/cases')} className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'mt-3' })}>
            {t('case.similar')}
            <Icon name="arrow-forward" size={16} />
          </Link>
        </section>
      </aside>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="sr-only">{label}</dt>
      <dd className="inline-flex items-center gap-1">{children}</dd>
    </div>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-3">
      <h2 id={`${id}-title`} className="text-xl font-bold">
        {title}
      </h2>
      {lead && <p className="text-sm text-muted-foreground">{lead}</p>}
      {children}
    </section>
  );
}
