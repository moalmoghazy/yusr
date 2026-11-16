import { Logo, textFor, VineSweep } from '@yusr/ui';
import type { Metadata } from 'next';
import { LoginForm } from '@/components/login-form';
import { hubLocale } from '@/lib/i18n';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const locale = await hubLocale();
  const { t } = textFor(locale);
  const next = (await searchParams).next;
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <VineSweep growing delayMs={200} durationMs={2600} className="absolute bottom-8 start-[4%] h-52 w-auto text-logo-ink opacity-[0.14]" />
        <VineSweep growing flip delayMs={1200} durationMs={2000} className="absolute top-10 end-[5%] h-32 w-auto text-logo-ink opacity-[0.12]" />
      </div>
      <section className="relative flex w-full max-w-sm flex-col gap-6 rounded-sheet border border-border bg-card p-7 shadow-lg" aria-labelledby="login-title">
        <Logo locale={locale} size={34} />
        <div className="flex flex-col gap-1">
          <h1 id="login-title" className="text-xl font-bold">
            {t('auth.hubTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('admin.title')}</p>
        </div>
        <LoginForm locale={locale} next={typeof next === 'string' ? next : '/'} />
      </section>
    </main>
  );
}
