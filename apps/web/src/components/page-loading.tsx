import type { Locale } from '@yusr/core';
import { textFor } from '@yusr/ui';

/**
 * What a public demo shows while a page waits for the API: on a free host the API sleeps after a
 * quiet spell and needs up to a minute to wake (see the Suspense boundary in [locale]/layout.tsx).
 */
export function PageLoading({ locale }: { locale: Locale }) {
  const { t } = textFor(locale);
  return (
    <div role="status" className="container-page flex min-h-[50vh] flex-col items-center justify-center gap-3 py-16 text-center">
      <span aria-hidden className="size-8 animate-spin rounded-full border-[3px] border-primary/25 border-t-primary motion-reduce:animate-none" />
      <p className="font-semibold">{t('common.loading')}</p>
      <p className="max-w-md text-sm text-muted-foreground">{t('demo.waking')}</p>
    </div>
  );
}
