import { andalusianPattern, brand, patternCssUrl, patternStyleFor } from '@yusr/theme';
import type { CSSProperties, ReactNode } from 'react';
import { useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { LogoMark, Wordmark } from '../ui/brand';
import { CaseCover } from '../ui/case-ui';
import { DocSectionHead } from '../ui/page-nav';
import { PatternDefs } from '../ui/pattern';

const TILE = andalusianPattern(144);
const PARTS = ['star', 'strapwork', 'rosette', 'seed'] as const;
const VERSE = '﴿كَمَثَلِ حَبَّةٍ أَنبَتَتْ سَبْعَ سَنَابِلَ فِي كُلِّ سُنبُلَةٍ مِّائَةُ حَبَّةٍ﴾';

/** «روضة العطاء»: the brand pattern — its meaning, one tile's construction, and where it is used. */
export function PatternSection({ index }: { index: string }) {
  const { t, f, locale } = useT();
  const { theme } = usePrototype();
  const light = theme.colors.light;
  const dark = theme.colors.dark;
  const swatch = (scheme: 'light' | 'dark'): CSSProperties => ({
    backgroundColor: theme.colors[scheme].background,
    backgroundImage: patternCssUrl(patternStyleFor(theme, scheme)),
    backgroundSize: `${TILE.tile}px`,
  });
  const onBrand = patternCssUrl({ stroke: '#FFFFFF', strokeOpacity: 0.12, fill: light.highlight, fillOpacity: 0.3 });

  return (
    <section id="brand-pattern" className="doc-section doc-section-tint">
      <div className="container">
        <DocSectionHead index={index} title={t('proto.brand.nav.pattern')} />

        <div className="pattern-intro">
          <div className="pattern-story">
            <h3>{t('proto.brand.pattern.title')}</h3>
            <p className="muted">{t('proto.brand.pattern.story')}</p>
            {/* The verse is always shown in Arabic; the English page adds a translation. */}
            <blockquote className="pattern-verse" lang="ar" dir="rtl">
              {VERSE}
            </blockquote>
            <p className="pattern-verse-source muted">
              {locale === 'en' && <span>{t('proto.brand.pattern.verse')} </span>}
              {t('proto.brand.pattern.verseSource')}
            </p>
            <ol className="anatomy-list">
              {PARTS.map((part, i) => (
                <li key={part}>
                  <span className="anatomy-num">{f.number(i + 1)}</span>
                  <span>{t(`proto.brand.pattern.parts.${part}`)}</span>
                </li>
              ))}
            </ol>
          </div>
          <figure className="pattern-construction">
            <PatternConstruction />
            <figcaption>{t('proto.brand.pattern.construction')}</figcaption>
          </figure>
        </div>

        <div className="pattern-swatches">
          <figure className="pattern-swatch" style={swatch('light')}>
            <figcaption style={{ color: light.foreground, background: light.card }}>{t('proto.brand.pattern.onLight')}</figcaption>
          </figure>
          <figure className="pattern-swatch" style={swatch('dark')}>
            <figcaption style={{ color: dark.foreground, background: dark.card }}>{t('proto.brand.pattern.onDark')}</figcaption>
          </figure>
        </div>

        <div className="pattern-uses">
          <Use label={t('proto.brand.pattern.usage.hero')}>
            <div className="use-hero" style={swatch('light')}>
              <span className="use-hero-eyebrow" style={{ color: light.primary }}>
                <LogoMark size={16} /> {brand.descriptor[locale]}
              </span>
              <strong style={{ color: light.foreground }}>{t('landing.heroTitle')}</strong>
              <span className="use-hero-cta" style={{ background: light.primary, color: light.primaryForeground }}>
                {t('landing.heroPrimary')}
              </span>
            </div>
          </Use>
          <Use label={t('proto.brand.pattern.usage.splash')}>
            <div
              className="use-splash"
              style={{
                backgroundImage: `${onBrand}, linear-gradient(160deg, ${light.primary}, ${light.primaryHover})`,
                backgroundSize: `${TILE.tile * 0.7}px, auto`,
              }}
            >
              <LogoMark size={54} bowl="#FFFFFF" />
              {locale === 'ar' ? (
                <Wordmark height={32} ink="#FFFFFF" drop={light.highlight} className="use-splash-word" />
              ) : (
                <span className="use-splash-name">{brand.name.en}</span>
              )}
              <span className="use-splash-tagline">{brand.tagline[locale]}</span>
            </div>
          </Use>
          <Use label={t('proto.brand.pattern.usage.receipt')}>
            <div className="use-receipt" style={{ background: light.card, color: light.foreground }}>
              <div className="use-receipt-band" style={{ ...swatch('light'), backgroundSize: `${TILE.tile * 0.6}px` }}>
                <LogoMark size={26} />
              </div>
              <strong>{t('proto.brand.pattern.receiptTitle')}</strong>
              <span className="mono use-receipt-no" style={{ color: light.mutedForeground }}>
                YSR-2026-004181
              </span>
              <span className="use-receipt-amount" style={{ color: light.primary }}>
                {f.money(500_00, 'EGP')}
              </span>
            </div>
          </Use>
          <Use label={t('proto.brand.pattern.usage.cover')}>
            <div className="use-cover">
              <CaseCover category="medical" seed={7} />
            </div>
          </Use>
        </div>
        <p className="muted pattern-note">{t('proto.brand.pattern.note')}</p>
      </div>
    </section>
  );
}

function Use({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="pattern-use">
      <div className="pattern-use-stage">{children}</div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/** One tile at full strength among its faded neighbours, with the four parts numbered. */
function PatternConstruction() {
  const { t, f } = useT();
  const T = TILE.tile;
  const c = T / 2;
  const star = 0.3 * T;
  const markers = [
    { n: 1, x: 172, y: 28, to: [c + star * 0.5, c - star * 0.5] },
    { n: 2, x: 172, y: c, to: [T - 10, c] },
    { n: 3, x: 172, y: 112, to: [c + 20, c + 20] },
    { n: 4, x: 172, y: 164, to: [T + 7, T + 7] },
  ] as const;
  return (
    <svg viewBox="-36 -36 222 216" className="pattern-construction-svg" role="img" aria-label={t('proto.brand.pattern.construction')}>
      <defs>
        <PatternDefs id="pattern-construction-tile" geometry={TILE} rosettes />
        <clipPath id="pattern-construction-clip">
          <rect x="-36" y="-36" width="216" height="216" rx="14" />
        </clipPath>
      </defs>
      <g clipPath="url(#pattern-construction-clip)">
        <rect x="-36" y="-36" width="216" height="216" className="pc-ground" />
        <rect x="-36" y="-36" width="216" height="216" fill="url(#pattern-construction-tile)" className="pc-neighbours" />
      </g>
      <rect x="0" y="0" width={T} height={T} className="pc-tile" />
      <circle cx={c} cy={c} r={star} className="pc-guide" />
      <path d={TILE.lattice} className="pc-lattice" />
      <path d={TILE.rosette} className="pc-rosette" />
      <path d={TILE.seeds} className="pc-rosette" />
      {markers.map((marker) => (
        <g key={marker.n} className="cg-marker pc-marker">
          <line x1={marker.x - 7} y1={marker.y} x2={marker.to[0]} y2={marker.to[1]} />
          <circle cx={marker.x} cy={marker.y} r={7} />
          <text x={marker.x} y={marker.y + 3} textAnchor="middle">
            {f.number(marker.n)}
          </text>
        </g>
      ))}
    </svg>
  );
}
