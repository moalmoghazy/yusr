import { LOCALES } from '@yusr/core';
import { dirOf } from '@yusr/i18n';
import { defaultTheme } from '@yusr/theme';
import { cn, DemoBanner, textFor } from '@yusr/ui';
import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Reem_Kufi } from 'next/font/google';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';
import { Suspense, type ReactNode } from 'react';
import { PageLoading } from '@/components/page-loading';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { WhatsAppButton } from '@/components/whatsapp-button';
import { currentDonor } from '@/lib/api';
import { siteUrl } from '@/lib/env';
import { THEME_COOKIE, themeFrom } from '@/lib/i18n';
import { OG_IMAGE } from '@/lib/og';
import { pageLocale, type LocaleParams } from '@/lib/page';
import { site } from '@/lib/site';
import '../globals.css';

const sans = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex-arabic', display: 'swap' });
// The logo face: the English name beside the mark stays in Reem Kufi whatever the headings use.
const logo = Reem_Kufi({ subsets: ['arabic', 'latin'], weight: ['700'], variable: '--font-reem-kufi', display: 'swap' });
// Palestine: the main page titles and the opening line, in Arabic. Its Latin letters are blank, so
// the face covers Arabic and digits only and anything else falls back to the text face.
const wordmark = localFont({
  src: '../../fonts/palestine-regular.otf',
  weight: '400',
  variable: '--font-palestine',
  display: 'swap',
  declarations: [{ prop: 'unicode-range', value: 'U+0020-0040, U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF' }],
});
// KAF FODA's digits (the face «يُسر» is drawn in) for the home's stats band, in Arabic: only ٠–٩, so the
// words and separators around them stay in the heading face.
const digits = localFont({
  src: '../../fonts/kaf-foda-digits.ttf',
  weight: '700',
  variable: '--font-kaf-digits',
  display: 'swap',
  declarations: [{ prop: 'unicode-range', value: 'U+0660-0669' }],
});
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: LocaleParams }): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { t } = textFor(locale);
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${t('common.appName')} — ${t('landing.eyebrow')}`, template: `%s · ${t('common.appName')}` },
    description: t('landing.heroBody'),
    alternates: { canonical: `/${locale}`, languages: { ar: '/ar', en: '/en', 'x-default': '/ar' } },
    openGraph: {
      siteName: t('common.appName'),
      locale: locale === 'ar' ? 'ar_EG' : 'en_US',
      type: 'website',
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
    formatDetection: { telephone: false },
    ...(site.demo ? { robots: { index: false, follow: false } } : {}),
  };
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: defaultTheme.colors.light.background },
    { media: '(prefers-color-scheme: dark)', color: defaultTheme.colors.dark.background },
  ],
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: LocaleParams }) {
  const locale = await pageLocale(params);
  const theme = themeFrom((await cookies()).get(THEME_COOKIE)?.value);
  const { t } = textFor(locale);
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={cn(sans.variable, logo.variable, wordmark.variable, digits.variable, mono.variable, theme !== 'system' && theme)}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          {t('a11y.skipToContent')}
        </a>
        {site.demo && <DemoBanner locale={locale} />}
        <SiteHeader locale={locale} theme={theme} donor={await currentDonor()} />
        {/* In a public demo, stream a loading state at once while the (possibly sleeping) API wakes up.
            A real deployment renders pages whole, so missing pages keep their 404 status. */}
        <main id="main">{site.demo ? <Suspense fallback={<PageLoading locale={locale} />}>{children}</Suspense> : children}</main>
        <SiteFooter locale={locale} />
        {site.whatsapp && <WhatsAppButton number={site.whatsapp} label={t('nav.whatsapp')} />}
      </body>
    </html>
  );
}
