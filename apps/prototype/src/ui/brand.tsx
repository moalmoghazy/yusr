import { brand, lockup, wordmark, type LogoGeometry, type WordmarkGeometry } from '@yusr/theme';
import { useI18n } from '@yusr/i18n/react';
import { useId } from 'react';
import { cx } from './primitives';

/**
 * The shapes of the mark for a given geometry: the bowl, the two dots of ي and the golden ḍamma.
 * `size` is the rendered size in px, used to simplify the dots when the mark gets small.
 */
export function MarkShapes({
  logo = brand.logo,
  bowl,
  drop,
  size,
  maskId,
  dotClassName,
}: {
  logo?: LogoGeometry;
  bowl: string;
  drop: string;
  size: number;
  maskId: string;
  dotClassName?: string;
}) {
  const small = size < logo.dotsMinSize;
  const cutout = logo.dots.style === 'cutout';
  const [left, right] = logo.dots.items;
  return (
    <>
      {cutout && !small && <DotsMask id={maskId} logo={logo} holeClassName={dotClassName} />}
      <path
        d={logo.bowl.d}
        fill="none"
        stroke={bowl}
        strokeWidth={logo.bowl.strokeWidth}
        strokeLinecap="round"
        mask={cutout && !small ? `url(#${maskId})` : undefined}
      />
      {!cutout &&
        (small ? (
          // Too small for two dots: they join into one short stroke, as ي is written by hand in Ruqʿa.
          <line x1={left.cx} y1={left.cy} x2={right.cx} y2={right.cy} stroke={bowl} strokeWidth={left.r * 2} strokeLinecap="round" />
        ) : (
          logo.dots.items.map((dot) => <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill={bowl} className={dotClassName} />)
        ))}
      <path d={logo.drop.d} fill={drop} transform={logo.drop.transform} />
    </>
  );
}

export function LogoMark({
  size = 32,
  bowl = 'var(--primary)',
  drop = 'var(--highlight)',
  className,
  title,
  logo = brand.logo,
}: {
  size?: number;
  bowl?: string;
  drop?: string;
  className?: string;
  title?: string;
  logo?: LogoGeometry;
}) {
  const maskId = `yd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      viewBox={logo.viewBox}
      width={size}
      height={size}
      className={cx('logo-mark', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <MarkShapes logo={logo} bowl={bowl} drop={drop} size={size} maskId={maskId} />
    </svg>
  );
}

/** The lettered «يُسر» (see @yusr/theme wordmark.ts): one round-capped stroke, the dots of ي, the golden ḍamma. */
export function WordmarkShapes({ ink, drop, word = wordmark }: { ink: string; drop: string; word?: WordmarkGeometry }) {
  return (
    <>
      <path d={word.stroke.d} fill="none" stroke={ink} strokeWidth={word.stroke.width} strokeLinecap="round" strokeLinejoin="round" />
      {word.dots.map((dot) => (
        <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill={ink} />
      ))}
      <path d={word.damma.d} transform={word.damma.transform} fill={drop} />
    </>
  );
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The name alone (splash screens, receipts): set in the logo face, or drawn with the mark's pen when
 * brand.wordmark is 'lettered'. `height` is in px.
 */
export function Wordmark({
  height,
  ink = 'var(--primary)',
  drop = 'var(--highlight)',
  className,
}: {
  height: number;
  ink?: string;
  drop?: string;
  className?: string;
}) {
  if (brand.wordmark === 'typeset') {
    return (
      <span className={cx('wordmark-text', className)} style={{ color: ink, fontSize: height * 0.8 }} lang="ar" dir="rtl">
        {brand.name.ar}
      </span>
    );
  }
  const { x, y, width, height: h } = wordmark.bounds;
  return (
    <svg viewBox={`${x} ${y} ${width} ${h}`} height={height} width={round((height * width) / h)} className={cx('wordmark', className)} aria-hidden>
      <WordmarkShapes ink={ink} drop={drop} />
    </svg>
  );
}

/**
 * Mark + name. The name is set in the logo face (Reem Kufi) beside the mark — the mark leads in the
 * reading direction. With brand.wordmark = 'lettered', «يُسر» is instead drawn with the mark's own
 * pen on the mark's grid. `size` is the mark's size in px.
 */
export function Lockup({
  lang,
  size = 30,
  bowl = 'var(--primary)',
  drop = 'var(--highlight)',
  ink = bowl,
  className,
}: {
  lang: 'ar' | 'en';
  size?: number;
  bowl?: string;
  drop?: string;
  ink?: string;
  className?: string;
}) {
  const maskId = `yl${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (lang === 'ar' && brand.wordmark === 'lettered') {
    const scale = size / 64;
    return (
      <svg
        viewBox={lockup.viewBox}
        width={round(lockup.width * scale)}
        height={round(lockup.height * scale)}
        className={cx('lockup-svg', className)}
        aria-hidden
      >
        <WordmarkShapes ink={ink} drop={drop} />
        <g transform={`translate(${lockup.markX} 0)`}>
          <MarkShapes bowl={bowl} drop={drop} size={size} maskId={maskId} />
        </g>
      </svg>
    );
  }
  return (
    <span className={cx('lockup', className)} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <LogoMark size={size} bowl={bowl} drop={drop} />
      <span className="lockup-word" style={{ color: ink, fontSize: size * (lang === 'ar' ? 0.84 : 0.78) }}>
        {brand.name[lang]}
      </span>
    </span>
  );
}

/** The header logo; the word follows the interface language. */
export function Logo({ size = 30, inverse = false, className }: { size?: number; inverse?: boolean; className?: string }) {
  const { locale, t } = useI18n();
  return (
    <span className={cx('logo', inverse && 'logo-inverse', className)} aria-label={t('a11y.logo')} role="img">
      <Lockup lang={locale} size={size} bowl={inverse ? '#FFFFFF' : 'var(--primary)'} />
    </span>
  );
}

/** For the cut-out variant: keeps the bowl and punches the two dots of ي out of it, so they stay hollow on any background. */
export function DotsMask({ id, logo = brand.logo, holeClassName }: { id: string; logo?: LogoGeometry; holeClassName?: string }) {
  return (
    <defs>
      <mask id={id} maskUnits="userSpaceOnUse" x={-8} y={-8} width={80} height={80}>
        <rect x={-8} y={-8} width={80} height={80} fill="#fff" />
        {logo.dots.items.map((dot) => (
          <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} fill="#000" className={holeClassName} />
        ))}
      </mask>
    </defs>
  );
}
