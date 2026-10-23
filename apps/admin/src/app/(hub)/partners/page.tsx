import { regionByCode, type PartnerStatus } from '@yusr/core';
import { Badge, Icon, textFor, type BadgeTone } from '@yusr/ui';
import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { CodeChip, CreatePartnerForm, PartnerStatusForm, RegenerateCodeForm } from '@/components/partner-forms';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.nav.partners') };
}

const STATUS_TONE: Record<PartnerStatus, BadgeTone> = { active: 'success', suspended: 'neutral' };

/**
 * The approved-partner registry. Only associations Yusr approved and signed a contract with are
 * listed here, and only their cases reach the catalog. Content moderators and super admins
 * (partners:manage) add them, hand over and regenerate their «كود يُسر», and suspend them.
 */
export default async function PartnersPage() {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t, f, l } = textFor(locale);
  if (!staff.permissions.has('partners:manage')) return <NoAccess message={t('admin.noAccess')} />;

  const partners = await (await adminApi()).partners();
  const region = (code: string) => {
    const found = regionByCode(code);
    return found ? l(found.name) : code;
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold">{t('admin.partners.title')}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t('admin.partners.subtitle')}</p>
      </header>

      <details className="group rounded-card border border-border bg-card shadow-sm" open={partners.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-bold">
          <span className="inline-flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
              <Icon name="plus" size={17} />
            </span>
            {t('admin.partners.add')}
          </span>
          <Icon name="chevron-down" size={18} className="text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 border-t border-border p-4">
          <p className="flex items-start gap-2 rounded-control bg-info-soft p-3 text-sm text-info-soft-foreground">
            <Icon name="info" size={17} className="mt-0.5 shrink-0" />
            {t('admin.partners.addHint')}
          </p>
          <CreatePartnerForm locale={locale} />
        </div>
      </details>

      <section className="flex flex-col gap-3" aria-labelledby="partners-list">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="partners-list" className="text-lg font-bold">
            {t('admin.partners.count', { count: partners.length })}
          </h2>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon name="lock" size={14} />
            {t('admin.partners.secretNote')}
          </p>
        </div>
        {partners.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong p-8 text-center text-sm text-muted-foreground">{t('admin.partners.empty')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {partners.map((partner) => (
              <li key={partner.id} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className="font-bold" dir="auto">
                      {partner.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('admin.partners.fields.registrationNumber')}:{' '}
                      <span dir="ltr" className="font-mono">
                        {partner.registrationNumber}
                      </span>{' '}
                      · {region(partner.region)}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[partner.status]}>{t(`admin.partners.statuses.${partner.status}`)}</Badge>
                </div>

                <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">{t('admin.partners.fields.code')}</dt>
                    <dd className="flex flex-wrap items-center gap-x-2">
                      <CodeChip locale={locale} code={partner.yusrCode} />
                      <span className="text-xs text-muted-foreground">{t('admin.partners.issuedAt', { date: f.date(partner.codeIssuedAt, 'medium') })}</span>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">{t('admin.partners.fields.contactName')}</dt>
                    <dd>
                      <span dir="auto">{partner.contactName}</span> ·{' '}
                      <span dir="ltr" className="font-mono text-xs">
                        {partner.contactPhone}
                      </span>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">{t('admin.partners.fields.contractSignedOn')}</dt>
                    <dd>
                      <time dateTime={partner.contractSignedOn}>{f.date(`${partner.contractSignedOn}T12:00:00Z`, 'medium')}</time>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">{t('admin.partners.fields.cases')}</dt>
                    <dd className="tabular-nums">{f.number(partner.casesCount)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">{t('admin.partners.fields.createdBy')}</dt>
                    <dd>
                      {partner.createdBy.name} · <time dateTime={partner.createdAt}>{f.date(partner.createdAt, 'medium')}</time>
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-start gap-2 border-t border-border pt-3">
                  <PartnerStatusForm locale={locale} partnerId={partner.id} status={partner.status} />
                  <RegenerateCodeForm locale={locale} partnerId={partner.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
