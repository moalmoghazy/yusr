'use client';

import { shareUrl, SHARE_PLATFORMS, type Locale, type SharePlatform } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useEffect, useState } from 'react';

/**
 * «شارك الحالة»: one button per platform, each opening that platform's own share page in a new tab
 * with the case link and a short message (no SDKs or tracking scripts). Instagram has no share page
 * for websites, so it uses the phone's share sheet where there is one, and otherwise copies the link
 * and says where to paste it. Below them: copy the link, and — on phones — the system share sheet,
 * which reaches every installed app.
 */
export function ShareCase({ locale, url, title, lead, className }: { locale: Locale; url: string; title: string; lead: string; className?: string }) {
  const { t } = textFor(locale);
  const message = t('share.message', { title });
  const [native, setNative] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setNative(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const copy = async (then?: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice(then ?? t('share.copied'));
      return true;
    } catch {
      return false;
    }
  };
  const systemShare = async () => {
    try {
      await navigator.share({ title, text: message, url });
    } catch {
      // Closed without sharing: nothing to do.
    }
  };
  const instagram = async () => {
    if (native) return systemShare();
    await copy(t('share.instagramHint'));
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
  };

  const button = 'h-11 justify-start gap-2.5 px-3.5 text-sm';
  return (
    <section aria-labelledby="share-title" className={cn('flex flex-col gap-3 rounded-card border border-border bg-card p-5', className)}>
      <div className="flex flex-col gap-1">
        <h2 id="share-title" className="inline-flex items-center gap-2 font-bold">
          <Icon name="share" size={18} className="text-primary" />
          {t('share.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{lead}</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
        {SHARE_PLATFORMS.map((platform: SharePlatform) => {
          const name = t(`share.platforms.${platform}`);
          const address = shareUrl(platform, url, message);
          const label = (
            <>
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-foreground">
                {name.slice(0, 1)}
              </span>
              <span className="truncate">{name}</span>
            </>
          );
          return (
            <li key={platform}>
              {address ? (
                <a
                  href={address}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('share.via', { platform: name })}
                  className={buttonClasses({ variant: 'outline', block: true, className: button })}
                >
                  {label}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => void instagram()}
                  aria-label={t('share.via', { platform: name })}
                  className={buttonClasses({ variant: 'outline', block: true, className: button })}
                >
                  {label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copy()} className={buttonClasses({ variant: 'soft', size: 'sm', className: 'flex-1' })}>
          <Icon name="copy" size={16} />
          {t('share.copy')}
        </button>
        {native && (
          <button type="button" onClick={() => void systemShare()} className={buttonClasses({ variant: 'soft', size: 'sm', className: 'flex-1' })}>
            <Icon name="share" size={16} />
            {t('share.more')}
          </button>
        )}
      </div>
      <p aria-live="polite" className={cn('text-sm text-success', !notice && 'sr-only')}>
        {notice}
      </p>
    </section>
  );
}
