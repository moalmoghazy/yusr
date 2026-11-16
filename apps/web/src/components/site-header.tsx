import type { Locale } from '@yusr/core';
import { buttonClasses, Icon, textFor } from '@yusr/ui';
import Link from 'next/link';
import { href, type ThemePreference } from '@/lib/i18n';
import { LiquidGlass } from './liquid-glass';
import { LocaleSwitch } from './locale-switch';
import { NavLink } from './nav-link';
import { ThemeSwitch } from './theme-switch';
import { WritingLogo } from './writing-logo';

/** `donor`: the signed-in donor's name, or null; the account link reads «عطائي» or «تسجيل الدخول». */
export function SiteHeader({ locale, theme, donor }: { locale: Locale; theme: ThemePreference; donor: { name: string } | null }) {
  const { t } = textFor(locale);
  const links = [
    { href: href(locale), label: t('nav.home'), exact: true },
    { href: href(locale, '/cases'), label: t('nav.cases') },
    { href: href(locale, '/submit'), label: t('nav.submitCase') },
    { href: href(locale, '/about'), label: t('nav.about') },
  ];
  return (
    // A floating pane of «liquid glass» (components/liquid-glass.tsx) that the page scrolls under.
    <header className="pointer-events-none sticky top-0 z-40 px-2 pt-2.5 sm:px-4 sm:pt-3">
      <LiquidGlass className="pointer-events-auto mx-auto max-w-[78rem] rounded-[1.75rem]">
        {/* From md up: three columns, the menu in the middle and the logo centred in the space between the edge and the menu. */}
        <div className="flex h-16 items-center justify-between gap-3 px-3 sm:px-5 md:grid md:grid-cols-[1fr_auto_1fr]">
          <Link href={href(locale)} className="rounded-control outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:justify-self-center">
            {/* «خطّ اليُسر» writes itself when the page opens, and again when the pointer comes back to it. */}
            <WritingLogo label={t('a11y.logo')} height={44} loop className="max-sm:h-9 max-sm:w-auto" />
          </Link>
          <nav aria-label={t('nav.menu')} className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <NavLink key={link.href} href={link.href} exact={link.exact}>
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 md:justify-self-end">
            <ThemeSwitch initial={theme} labels={{ title: t('nav.theme'), system: t('nav.system'), light: t('nav.light'), dark: t('nav.dark') }} />
            <LocaleSwitch locale={locale} label={t('nav.switchLanguage')} />
            <Link
              href={href(locale, '/account')}
              aria-label={donor ? t('nav.account') : t('common.signIn')}
              className={buttonClasses({ variant: 'outline', size: 'sm', className: 'max-sm:size-9 max-sm:px-0' })}
            >
              <Icon name="user" size={16} />
              <span className="max-sm:sr-only">{donor ? t('nav.account') : t('common.signIn')}</span>
            </Link>
            <Link href={href(locale, '/cases')} className={buttonClasses({ size: 'sm', className: 'max-sm:hidden' })}>
              <Icon name="heart" size={16} />
              {t('common.donateNow')}
            </Link>
          </div>
        </div>
        <nav aria-label={t('nav.menu')} className="-mt-1 flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] md:hidden">
          {links.map((link) => (
            <NavLink key={link.href} href={link.href} exact={link.exact}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </LiquidGlass>
    </header>
  );
}
