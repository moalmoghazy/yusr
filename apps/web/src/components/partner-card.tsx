'use client';

import type { Locale, Localized, PublicPartner } from '@yusr/core';
import { buttonClasses, Icon, RegionLabel, textFor } from '@yusr/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const OPEN_EVENT = 'yusr:partner-card';

/**
 * One association in «شركاء يُسر», as a button: clicking it opens its card (`PartnerCardDialog`, once per
 * page) without leaving the page. The marquee's repeats are for the eye, so they stay out of tab order.
 */
export function PartnerCardButton({ partnerId, label, repeat, children }: { partnerId: string; label: string; repeat?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={label}
      tabIndex={repeat ? -1 : undefined}
      onClick={() => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: partnerId }))}
      className="flex cursor-pointer items-center gap-[1.125rem] rounded-card text-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {children}
    </button>
  );
}

/**
 * The association's card: logo, name and رقم الإشهار, its region, since when it is a partner and how many
 * of its cases Yusr published, then «نبذة عن الجمعية» and «عطاؤها» as staff wrote them in the hub.
 */
export function PartnerCardDialog({ locale, partners }: { locale: Locale; partners: PublicPartner[] }) {
  const { t, f } = textFor(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const [partner, setPartner] = useState<PublicPartner | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      const found = partners.find((entry) => entry.id === (event as CustomEvent<string>).detail);
      if (!found) return;
      setPartner(found);
      if (!dialog.current?.open) dialog.current?.showModal();
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [partners]);

  // English left empty in the hub: the Arabic shows instead.
  const text = (value: Localized) => value[locale].trim() || value.ar;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="partner-card-title"
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself, outside the card) closes it.
        if (event.target === dialog.current) dialog.current.close();
      }}
      className="m-auto outline-none max-h-[min(44rem,calc(100dvh-2rem))] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-card border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-foreground/40 backdrop:backdrop-blur-sm"
    >
      {partner && (
        <div className="flex flex-col gap-5 p-5 md:p-6">
          <div className="flex items-start gap-4">
            <span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-[1.5rem] border border-border bg-white">
              {partner.logoVersion ? (
                // eslint-disable-next-line @next/next/no-img-element -- a small logo from our own route
                <img
                  src={`/partner-logos/${encodeURIComponent(partner.id)}?v=${partner.logoVersion}`}
                  alt=""
                  width={96}
                  height={96}
                  className="size-full object-contain"
                />
              ) : (
                <Icon name="hand-heart" size={40} className="text-primary" />
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 id="partner-card-title" className="font-display text-xl font-bold leading-snug" dir="auto">
                {partner.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('landing.partners.registration')}{' '}
                <span dir="ltr" className="font-mono">
                  {partner.registrationNumber}
                </span>
              </p>
              <RegionLabel code={partner.region} locale={locale} className="text-sm text-muted-foreground" />
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label={t('landing.partners.close')}
              className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'size-9 shrink-0 px-0' })}
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          <ul className="flex flex-wrap gap-2 text-xs font-semibold">
            <li className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-primary-soft-foreground">
              <Icon name="shield-check" size={14} />
              {t('landing.partners.supervised')}
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-muted-foreground">
              <Icon name="calendar" size={14} />
              {t('landing.partners.joined', { date: f.date(`${partner.joinedOn}T12:00:00Z`, 'medium') })}
            </li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-muted-foreground">
              <Icon name="heart" size={14} />
              {t('landing.partners.cases', { count: partner.casesCount })}
            </li>
          </ul>

          {partner.profile ? (
            <>
              <section className="flex flex-col gap-1.5">
                <h3 className="font-bold">{t('landing.partners.about')}</h3>
                <p className="whitespace-pre-line leading-relaxed text-muted-foreground" dir="auto">
                  {text(partner.profile.about)}
                </p>
              </section>
              <section className="flex flex-col gap-1.5 rounded-control border border-highlight/40 bg-highlight/10 p-4">
                <h3 className="inline-flex items-center gap-2 font-bold">
                  <Icon name="gift" size={18} className="text-highlight" />
                  {t('landing.partners.giving')}
                </h3>
                <p className="whitespace-pre-line leading-relaxed" dir="auto">
                  {text(partner.profile.giving)}
                </p>
              </section>
            </>
          ) : (
            <p className="rounded-control bg-muted/60 p-4 text-sm text-muted-foreground">{t('landing.partners.noProfile')}</p>
          )}
        </div>
      )}
    </dialog>
  );
}
