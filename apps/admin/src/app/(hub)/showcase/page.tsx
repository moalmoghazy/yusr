import type { Locale, Partner } from '@yusr/core';
import { Badge, Icon, textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { CreatePartnerForm } from '@/components/partner-forms';
import { LogoUpload, ProfileForm, RemoveLogoForm, RenamePartnerForm, ShowcaseSwitch } from '@/components/showcase-forms';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.nav.showcase') };
}

/**
 * «شركاء الموقع»: the website's «شركاء يُسر» row, managed here. Each partner's logo, name and
 * registration number, whether it shows, and its «جديد» badge. The website reads this uncached.
 */
export default async function ShowcasePage() {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t } = textFor(locale);
  if (!staff.permissions.has('partners:manage')) return <NoAccess message={t('admin.noAccess')} />;

  const partners = await (await adminApi()).partners();
  // Same order as the website: the most recent contract first.
  const ordered = [...partners].sort((a, b) => b.contractSignedOn.localeCompare(a.contractSignedOn) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const onSite = ordered.filter((partner) => partner.status === 'active' && partner.showcased);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold">{t('admin.showcase.title')}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{t('admin.showcase.subtitle')}</p>
      </header>

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-sm" aria-labelledby="preview-title">
        <div className="flex flex-col gap-0.5">
          <h2 id="preview-title" className="font-bold">
            {t('admin.showcase.preview')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('admin.showcase.previewHint')}</p>
        </div>
        {onSite.length === 0 ? (
          <p className="rounded-control border border-dashed border-border-strong p-5 text-center text-sm text-muted-foreground">
            {t('admin.showcase.previewEmpty')}
          </p>
        ) : (
          <ul className="flex gap-8 overflow-x-auto rounded-control bg-background px-4 pb-3 pt-5">
            {onSite.map((partner) => (
              <li key={partner.id} className="flex shrink-0 items-center gap-3">
                <LogoTile locale={locale} partner={partner} badge />
                <span className="flex flex-col gap-0.5">
                  <span className="whitespace-nowrap font-bold leading-snug" dir="auto">
                    {partner.name}
                  </span>
                  <RegistrationLine locale={locale} number={partner.registrationNumber} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="group rounded-card border border-border bg-card shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-bold">
          <span className="inline-flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
              <Icon name="plus" size={17} />
            </span>
            {t('admin.showcase.add')}
          </span>
          <Icon name="chevron-down" size={18} className="text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-4 border-t border-border p-4">
          <p className="flex items-start gap-2 rounded-control bg-info-soft p-3 text-sm text-info-soft-foreground">
            <Icon name="info" size={17} className="mt-0.5 shrink-0" />
            {t('admin.showcase.addHint')} {t('admin.partners.addHint')}
          </p>
          <CreatePartnerForm locale={locale} />
        </div>
      </details>

      <section className="flex flex-col gap-3" aria-labelledby="showcase-list">
        <h2 id="showcase-list" className="text-lg font-bold">
          {t('admin.showcase.list')} · {t('admin.partners.count', { count: partners.length })}
        </h2>
        {ordered.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong p-8 text-center text-sm text-muted-foreground">{t('admin.partners.empty')}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {ordered.map((partner) => {
              const suspended = partner.status !== 'active';
              const visible = !suspended && partner.showcased;
              return (
                <li key={partner.id} className="flex flex-col gap-4 rounded-card border border-border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <LogoTile locale={locale} partner={partner} badge />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="font-bold" dir="auto">
                          {partner.name}
                        </p>
                        <RegistrationLine locale={locale} number={partner.registrationNumber} />
                      </div>
                    </div>
                    <Badge tone={visible ? 'success' : 'neutral'}>{visible ? t('admin.showcase.shown') : t('admin.showcase.hidden')}</Badge>
                  </div>

                  {suspended && (
                    <p className="flex items-start gap-2 rounded-control bg-muted p-3 text-xs text-muted-foreground">
                      <Icon name="pause" size={15} className="mt-0.5 shrink-0" />
                      {t('admin.showcase.suspendedNote')}
                    </p>
                  )}

                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {t('admin.showcase.logo')}
                      {!partner.logo && <span className="font-normal"> · {t('admin.showcase.noLogo')}</span>}
                    </p>
                    <div className="flex flex-wrap items-start gap-2">
                      <LogoUpload locale={locale} partnerId={partner.id} hasLogo={partner.logo !== null} />
                      {partner.logo && <RemoveLogoForm locale={locale} partnerId={partner.id} />}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('admin.showcase.logoHint')}</p>
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-border pt-3">
                    <ShowcaseSwitch locale={locale} partnerId={partner.id} field="showcased" on={partner.showcased} disabled={suspended} />
                    <ShowcaseSwitch locale={locale} partnerId={partner.id} field="newBadge" on={partner.newBadge} />
                  </div>

                  <details className="group/profile flex flex-col gap-2 border-t border-border pt-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        {t('admin.showcase.profile.title')}
                        <Badge tone={partner.profile ? 'success' : 'neutral'}>
                          {partner.profile ? t('admin.showcase.profile.live') : t('admin.showcase.profile.none')}
                        </Badge>
                      </span>
                      <Icon name="chevron-down" size={16} className="transition-transform group-open/profile:rotate-180" />
                    </summary>
                    <div className="mt-3 flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">{t('admin.showcase.profile.hint')}</p>
                      <ProfileForm key={partner.updatedAt} locale={locale} partnerId={partner.id} profile={partner.profile} />
                    </div>
                  </details>

                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted-foreground">{t('admin.showcase.edit')}</p>
                    <RenamePartnerForm
                      key={`${partner.name}|${partner.registrationNumber}`}
                      locale={locale}
                      partnerId={partner.id}
                      name={partner.name}
                      registrationNumber={partner.registrationNumber}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The logo as the website shows it (through the hub's own route), or the name's first letter. */
function LogoTile({ locale, partner, badge }: { locale: Locale; partner: Partner; badge?: boolean }) {
  const { t } = textFor(locale);
  return (
    <span className="relative shrink-0">
      {badge && partner.newBadge && (
        <span className="absolute -top-2 start-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-highlight px-1.5 text-[0.68rem] font-bold leading-snug text-highlight-foreground shadow-sm rtl:translate-x-1/2">
          {t('landing.partners.new')}
        </span>
      )}
      <span className="grid size-14 place-items-center overflow-hidden rounded-2xl border border-border bg-white">
        {partner.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small logo from the hub's own route
          <img
            src={`/partner-logos/${encodeURIComponent(partner.id)}?v=${partner.logo.version}`}
            alt=""
            width={56}
            height={56}
            className="size-full object-contain"
          />
        ) : (
          <span aria-hidden className="font-display text-xl font-bold text-primary">
            {firstLetter(partner.name)}
          </span>
        )}
      </span>
    </span>
  );
}

function RegistrationLine({ locale, number }: { locale: Locale; number: string }) {
  const { t } = textFor(locale);
  return (
    <span className="whitespace-nowrap text-xs text-muted-foreground">
      {t('landing.partners.registration')}{' '}
      <span dir="ltr" className="font-mono">
        {number}
      </span>
    </span>
  );
}

/** The first letter of the association's own name, past «جمعية» / «مؤسسة» (as on the website). */
function firstLetter(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/);
  const own = words.find((word, index) => index > 0 || !/^(جمعية|مؤسسة|association|foundation)$/i.test(word)) ?? words[0] ?? '';
  return Array.from(own.replace(/^ال/, ''))[0] ?? '';
}
