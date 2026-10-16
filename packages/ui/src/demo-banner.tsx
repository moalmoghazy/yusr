import type { Locale } from '@yusr/core';
import { Icon } from './icon';
import { textFor } from './text';

/**
 * The strip a public demo (NEXT_PUBLIC_DEMO=true) carries above every page: the cases are fictional
 * and no money is charged. Never shown on a real deployment.
 */
export function DemoBanner({ locale }: { locale: Locale }) {
  const { t } = textFor(locale);
  return (
    <div role="note" className="bg-warning-soft text-warning-soft-foreground">
      <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-sm font-semibold">
        <Icon name="info" size={16} />
        <span>{t('demo.banner')}</span>
      </p>
    </div>
  );
}
