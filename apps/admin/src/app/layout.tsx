import { dirOf } from '@yusr/i18n';
import { cn, DemoBanner } from '@yusr/ui';
import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Reem_Kufi } from 'next/font/google';
import type { ReactNode } from 'react';
import { hubLocale, hubText } from '@/lib/i18n';
import './globals.css';

const sans = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex-arabic', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });
// The logo face: the English name beside the mark is set in Reem Kufi (the Arabic one is drawn).
const logo = Reem_Kufi({ subsets: ['arabic', 'latin'], weight: ['700'], variable: '--font-reem-kufi', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: { default: `${t('admin.title')} · ${t('common.appName')}`, template: `%s · ${t('admin.title')}` }, robots: { index: false, follow: false } };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await hubLocale();
  return (
    <html lang={locale} dir={dirOf(locale)} className={cn(sans.variable, mono.variable, logo.variable)} suppressHydrationWarning>
      <body className="min-h-dvh">
        {process.env['NEXT_PUBLIC_DEMO'] === 'true' && <DemoBanner locale={locale} />}
        {children}
      </body>
    </html>
  );
}
