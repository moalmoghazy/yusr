import type { Locale } from '@yusr/core';
import moss from '@yusr/theme/assets/partners/moss-egypt.png';
import { textFor } from '@yusr/ui';
import Image from 'next/image';
import { site } from '@/lib/site';

/**
 * The regulator line above the hero's eyebrow: the Ministry of Social Solidarity's logo on a
 * white, rounded tile (the artwork is drawn for a white ground, so the tile keeps it legible in
 * dark mode), and beside it the supervision statement set in the eyebrow's type. The ministry's
 * name sits on its own line so it never breaks apart. The logo is decorative: the text names it.
 */
export function SupervisionBadge({ locale }: { locale: Locale }) {
  if (!site.supervision.enabled) return null;
  const { t } = textFor(locale);
  const number = site.supervision.registrationNumber;
  return (
    <p className="flex items-center gap-3">
      <span className="grid size-16 shrink-0 place-items-center rounded-2xl border border-border bg-white p-1 shadow-sm">
        <Image src={moss} alt="" width={56} height={56} className="size-full object-contain" priority />
      </span>
      <span className="text-[0.86rem] font-semibold leading-[1.7] text-primary">
        {t('landing.supervision.lead')} <span className="block">{t('landing.supervision.authority')}</span>
        {number && <span className="block text-xs font-medium text-muted-foreground">{t('landing.supervision.registration', { number })}</span>}
      </span>
    </p>
  );
}
