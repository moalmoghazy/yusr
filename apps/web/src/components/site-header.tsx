import type { Locale } from '@yusr/core';
import { buttonClasses, Icon, Logo, textFor } from '@yusr/ui';
import Link from 'next/link';
import { href, type ThemePreference } from '@/lib/i18n';
import { LocaleSwitch } from './locale-switch';
import { NavLink } from './nav-link';
import { ThemeSwitch } from './theme-switch';

export function SiteHeader({ locale, theme }: { locale: Locale; theme: ThemePreference }) {
  const { t } = textFor(locale);
  const links = [
    { href: href(locale), label: t('nav.home'), exact: true },
    { href: href(locale, '/cases'), label: t('nav.cases') },
    { href: `${href(locale)}#how`, label: t('nav.howItWorks') },
    { href: `${href(locale)}#transparency`, label: t('nav.transparency') },
    { href: href(locale, '/submit'), label: t('nav.submitCase') },
    { href: href(locale, '/identity'), label: t('nav.identity') },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-3">
        <Link href={href(locale)} className="rounded-control outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <Logo locale={locale} size={30} />
        </Link>
        <nav aria-label={t('nav.menu')} className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <NavLink key={link.href} href={link.href} exact={link.exact}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeSwitch initial={theme} labels={{ title: t('nav.theme'), system: t('nav.system'), light: t('nav.light'), dark: t('nav.dark') }} />
          <LocaleSwitch locale={locale} label={t('nav.switchLanguage')} />
          <Link href={href(locale, '/cases')} className={buttonClasses({ size: 'sm', className: 'max-sm:hidden' })}>
            <Icon name="heart" size={16} />
            {t('common.donateNow')}
          </Link>
        </div>
      </div>
      <nav aria-label={t('nav.menu')} className="container-page -mt-1 flex gap-1 overflow-x-auto pb-2 md:hidden">
        {links.map((link) => (
          <NavLink key={link.href} href={link.href} exact={link.exact}>
            {link.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
