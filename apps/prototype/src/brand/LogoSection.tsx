import type { Locale } from '@yusr/core';
import {
  APP_ICON_SHARE,
  LOGO_VARIANTS,
  brand,
  centreMark,
  lockup,
  logoBackgroundSvg,
  mix,
  shineBandPath,
  type BackgroundTone,
  type LogoGeometry,
  type LogoVariant,
} from '@yusr/theme';
import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { Lockup, LogoMark, MarkShapes, MarkShine, WordmarkShapes } from '../ui/brand';
import { Icon } from '../ui/icons';
import { DocSectionHead } from '../ui/page-nav';

const GRID = Array.from({ length: 17 }, (_, i) => i * 4);

/** Which explored version is live: the one brand.logo points to in packages/theme/src/brand.ts. */
const LIVE_VARIANT = (Object.keys(LOGO_VARIANTS) as LogoVariant[]).find((key) => LOGO_VARIANTS[key] === brand.logo) ?? 'lit';
const VARIANT_ORDER: readonly LogoVariant[] = [LIVE_VARIANT, ...(Object.keys(LOGO_VARIANTS) as LogoVariant[]).filter((key) => key !== LIVE_VARIANT)];

export function LogoSection({ index }: { index: string }) {
  const { t, f, locale } = useT();
  const { theme } = usePrototype();
  const light = theme.colors.light;
  const deep = mix(light.primary, '#03110E', 0.62);
  const other: Locale = locale === 'ar' ? 'en' : 'ar';

  return (
    <section id="brand-logo" className="doc-section">
      <div className="container">
        <DocSectionHead index={index} title={t('proto.brand.nav.logo')} />

        <div className="logo-intro">
          <figure className="construction">
            <Construction />
            <figcaption className="sr-only">{t('proto.brand.constructionBody')}</figcaption>
          </figure>
          <div className="anatomy">
            <h3>{t('proto.brand.construction')}</h3>
            <p className="muted">{t('proto.brand.constructionBody')}</p>
            <ol className="anatomy-list">
              {(['bowl', 'shine', 'gold', 'fade'] as const).map((part, i) => (
                <li key={part}>
                  <span className={`anatomy-num anatomy-num-${part}`}>{f.number(i + 1)}</span>
                  <span>{t(`proto.brand.anatomy.${part}`)}</span>
                </li>
              ))}
            </ol>
            <div className="lockup-pair">
              {([locale, other] as const).map((lang) => (
                <div key={lang} className="lockup-tile">
                  <Lockup lang={lang} bowl={light.primary} drop={light.highlight} size={46} />
                  <span className="lockup-descriptor" lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                    {brand.descriptor[lang]}
                  </span>
                </div>
              ))}
            </div>
            <p className="muted lockup-note">{t('proto.brand.lockupsBody')}</p>
          </div>
        </div>

        {brand.wordmark === 'lettered' && (
          <div className="wordmark-block">
            <figure className="construction wordmark-figure">
              <WordmarkConstruction />
              <figcaption className="muted">{t('proto.brand.wordmarkGuides')}</figcaption>
            </figure>
            <div className="anatomy">
              <h3>{t('proto.brand.wordmark')}</h3>
              <p className="muted">{t('proto.brand.wordmarkBody')}</p>
              <ol className="anatomy-list">
                {WORDMARK_PARTS.map((part, i) => (
                  <li key={part}>
                    <span className={part === 'damma' ? 'anatomy-num anatomy-num-drop' : 'anatomy-num'}>{f.number(i + 1)}</span>
                    <span>{t(`proto.brand.wordmarkParts.${part}`)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        <h3 className="doc-h3">{t('proto.brand.variants')}</h3>
        <div className="usage-grid">
          <UsageTile label={t('proto.brand.onLight')} stage={{ background: '#FFFFFF' }}>
            <Lockup lang={locale} bowl={light.primary} drop={light.highlight} size={44} />
          </UsageTile>
          <UsageTile label={t('proto.brand.onDark')} stage={{ background: deep }}>
            <Lockup lang={locale} bowl="#FFFFFF" drop={light.highlight} size={44} />
          </UsageTile>
          <UsageTile label={t('proto.brand.appIcon')} stage={{ background: 'var(--muted)' }}>
            <span className="app-icon-row">
              <AppIcon size={76} />
              <AppIcon size={76} shape="circle" />
            </span>
          </UsageTile>
          <UsageTile label={t('proto.brand.mono')} stage={{ background: 'var(--muted)' }}>
            <span className="mono-row">
              <span className="mono-chip" style={{ background: '#FFFFFF' }}>
                <LogoMark size={44} bowl="#132326" drop="#132326" />
              </span>
              <span className="mono-chip" style={{ background: light.primary }}>
                <LogoMark size={44} bowl="#FFFFFF" drop="#FFFFFF" />
              </span>
            </span>
          </UsageTile>
        </div>

        <h3 className="doc-h3">{t('proto.brand.backgrounds')}</h3>
        <p className="muted iterations-note">{t('proto.brand.backgroundsBody')}</p>
        <div className="backgrounds-grid">
          {BACKGROUND_TONES.map((tone) => (
            <Background key={tone} tone={tone} label={t(`proto.brand.backgroundTones.${tone}`)} />
          ))}
        </div>

        <h3 className="doc-h3">{t('proto.brand.iterations')}</h3>
        <p className="muted iterations-note">{t('proto.brand.iterationsBody')}</p>
        <div className="iterations-grid">
          {VARIANT_ORDER.map((key) => (
            <figure key={key} className={key === LIVE_VARIANT ? 'iteration-tile is-live' : 'iteration-tile'}>
              <div className="iteration-stage">
                <LogoMark logo={LOGO_VARIANTS[key]} size={112} bowl={light.primary} drop={light.highlight} />
                <span className="iteration-small">
                  <AppIcon logo={LOGO_VARIANTS[key]} size={56} />
                  <LogoMark logo={LOGO_VARIANTS[key]} size={32} bowl={light.primary} drop={light.highlight} />
                  <LogoMark logo={LOGO_VARIANTS[key]} size={18} bowl={light.primary} drop={light.highlight} />
                </span>
              </div>
              <figcaption>
                <span className={key === LIVE_VARIANT ? 'badge badge-primary' : 'badge badge-neutral'}>
                  {t(key === LIVE_VARIANT ? 'proto.brand.iterationLive' : 'proto.brand.iterationPrevious')}
                </span>
                <strong>{t(`proto.brand.iteration.${key}`)}</strong>
                <code className="mono">brand.logo = LOGO_VARIANTS.{key}</code>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="logo-bottom">
          <div className="min-sizes">
            <h3 className="doc-h3">{t('proto.brand.minSize')}</h3>
            <p className="muted size-note">{t('proto.brand.minSizeNote')}</p>
            <div className="size-row">
              {[64, 48, 32, 24, 16].map((size) => (
                <figure key={size} className="size-item">
                  <AppIcon size={size} />
                  <figcaption className="mono">{f.number(size)}px</figcaption>
                </figure>
              ))}
            </div>
          </div>
          <div className="donts">
            <h3 className="doc-h3">{t('proto.brand.dontsTitle')}</h3>
            <div className="donts-grid">
              <Dont label={t('proto.brand.donts.recolor')}>
                <LogoMark size={48} bowl={light.primary} drop="#4A7BD0" />
              </Dont>
              <Dont label={t('proto.brand.donts.stretch')}>
                <span style={{ display: 'inline-flex', transform: 'scaleX(1.5) scaleY(0.8)' }}>
                  <LogoMark size={48} bowl={light.primary} drop={light.highlight} />
                </span>
              </Dont>
              <Dont label={t('proto.brand.donts.rotate')}>
                <span style={{ display: 'inline-flex', transform: 'rotate(-32deg)' }}>
                  <LogoMark size={48} bowl={light.primary} drop={light.highlight} />
                </span>
              </Dont>
              <Dont label={t('proto.brand.donts.effects')}>
                <span style={{ display: 'inline-flex', filter: `drop-shadow(0 5px 3px rgba(0,0,0,.45)) drop-shadow(0 0 8px ${light.highlight})` }}>
                  <LogoMark size={48} bowl={light.primary} drop={light.highlight} />
                </span>
              </Dont>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Construction drawing on the 64-unit grid, with the guides the mark is built from (all read from the geometry). */
function Construction() {
  const { t, f } = useT();
  const { logo } = brand;
  const { bowl } = logo.guides;
  const shine = logo.shine;
  const low = bowl.cy + bowl.ry; // lowest point of the curve's centre line
  const [outerBand, innerBand] = shine?.bands ?? [];
  const fade = shine?.fade;
  const markers = [
    { n: 1, x: 3.6, y: bowl.cy + 4, from: [6.8, bowl.cy + 4.6], to: [10.2, bowl.cy + 6] },
    outerBand && { n: 2, x: 10, y: low + 9, from: [12.4, low + 7.2], to: [20.6, low + 0.9] },
    innerBand && { n: 3, x: 21.6, y: low + 12.8, from: [23.6, low + 10.6], to: [27.4, low - 0.4] },
    fade && { n: 4, x: fade.x2 + 7.4, y: fade.y2 - 7.4, from: [fade.x2 + 5, fade.y2 - 5], to: [fade.x2 + 0.6, fade.y2 - 0.6] },
  ].filter((marker): marker is { n: number; x: number; y: number; from: number[]; to: number[] } => Boolean(marker));
  return (
    <svg viewBox="-8 -8 80 80" className="construction-svg" role="img" aria-label={t('proto.brand.construction')}>
      <g className="cg-grid">
        {GRID.map((v) => (
          <line key={`v${v}`} x1={v} y1={0} x2={v} y2={64} className={v % 16 === 0 ? 'is-major' : undefined} />
        ))}
        {GRID.map((v) => (
          <line key={`h${v}`} x1={0} y1={v} x2={64} y2={v} className={v % 16 === 0 ? 'is-major' : undefined} />
        ))}
      </g>
      <line x1={bowl.cx} y1={-5} x2={bowl.cx} y2={69} className="cg-axis" />
      <line x1={-5} y1={bowl.cy} x2={69} y2={bowl.cy} className="cg-axis" />
      <ellipse cx={bowl.cx} cy={bowl.cy} rx={bowl.rx} ry={bowl.ry} className="cg-guide" />
      <path d={logo.bowl.d} fill="none" className="cg-bowl" strokeWidth={logo.bowl.strokeWidth} strokeLinecap="round" />
      <MarkShine logo={logo} shine="var(--logo-shine)" gold="var(--highlight)" id="construction-shine" />
      {/* Each band is an ellipse whose edge is crisp and whose light fades towards the middle. */}
      {shine && outerBand && <path d={shineBandPath(outerBand, shine.top)} className="cg-guide cg-guide-dot" />}
      {shine && innerBand && <path d={shineBandPath(innerBand, shine.top)} className="cg-guide cg-guide-gold" />}
      {/* The light fades along this line, up the right arm. */}
      {fade && <line x1={fade.x1} y1={fade.y1} x2={fade.x2} y2={fade.y2} className="cg-axis cg-axis-strong" />}
      <g className="cg-points">
        <circle cx={bowl.cx - bowl.rx} cy={bowl.cy} r={1} />
        <circle cx={bowl.cx + bowl.rx} cy={bowl.cy} r={1} />
        <circle cx={bowl.cx} cy={low} r={1} />
        {fade && <circle cx={fade.x1} cy={fade.y1} r={0.7} />}
        {fade && <circle cx={fade.x2} cy={fade.y2} r={0.7} />}
      </g>
      {markers.map((marker) => (
        <g key={marker.n} className="cg-marker">
          <line x1={marker.from[0]} y1={marker.from[1]} x2={marker.to[0]} y2={marker.to[1]} />
          <circle cx={marker.x} cy={marker.y} r={3.4} />
          <text x={marker.x} y={marker.y + 1.45} textAnchor="middle">
            {f.number(marker.n)}
          </text>
        </g>
      ))}
    </svg>
  );
}

const WORDMARK_PARTS = ['teeth', 'ra', 'dots', 'damma'] as const;

/**
 * The approved lettering of «يُسر» beside the mark, on the mark's grid (@yusr/theme wordmark.ts),
 * with its four features pointed out.
 */
function WordmarkConstruction() {
  const { t, f } = useT();
  const [vx, vy, vw, vh] = lockup.viewBox.split(' ').map(Number) as [number, number, number, number];
  const box = { x: vx - 7, y: vy - 3, w: vw + 14, h: vh + 16 };
  const row = vy + vh + 8.2;
  const grid = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = Math.ceil(box.x / 4) * 4; x <= box.x + box.w; x += 4) xs.push(x);
    for (let y = Math.ceil(box.y / 4) * 4; y <= box.y + box.h; y += 4) ys.push(y);
    return { xs, ys };
  }, [box.x, box.y, box.w, box.h]);
  // Points on the traced shapes (the mark's grid), measured from the approved artwork.
  const markers = [
    // 1 — the pointed teeth of س.
    { n: 1, x: -36.8, y: vy + 4, to: [-36.8, 25.4] },
    // 2 — ر sweeping out in a long hairline.
    { n: 2, x: -80, y: row, to: [-80, 55.6] },
    // 3 — the dots of ي, two joined diamonds.
    { n: 3, x: -9.8, y: row, to: [-9.8, 50] },
    // 4 — the golden ḍamma.
    { n: 4, x: -32, y: vy + 6, to: [-21, 19.6] },
  ] as const;
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className="construction-svg wordmark-svg" role="img" aria-label={t('proto.brand.wordmark')}>
      <g className="cg-grid">
        {grid.xs.map((x) => (
          <line key={`v${x}`} x1={x} y1={box.y} x2={x} y2={box.y + box.h} className={x % 16 === 0 ? 'is-major' : undefined} />
        ))}
        {grid.ys.map((y) => (
          <line key={`h${y}`} x1={box.x} y1={y} x2={box.x + box.w} y2={y} className={y % 16 === 0 ? 'is-major' : undefined} />
        ))}
      </g>
      <g className="cg-shapes">
        <WordmarkShapes ink="var(--primary)" drop="var(--highlight)" />
        <g transform={`translate(${lockup.markX} 0)`}>
          <MarkShapes bowl="var(--primary)" drop="var(--highlight)" size={200} maskId="wordmark-construction-dots" />
        </g>
      </g>
      {markers.map((marker) => (
        <g key={marker.n} className="cg-marker">
          <line x1={marker.x} y1={marker.y + (marker.y > marker.to[1] ? -3.4 : 3.4)} x2={marker.to[0]} y2={marker.to[1]} />
          <circle cx={marker.x} cy={marker.y} r={3.4} />
          <text x={marker.x} y={marker.y + 1.45} textAnchor="middle">
            {f.number(marker.n)}
          </text>
        </g>
      ))}
    </svg>
  );
}

const BACKGROUND_TONES: readonly BackgroundTone[] = ['brand', 'light', 'dark'];

/**
 * A screen background from @yusr/theme (logoBackgroundSvg), in the current theme. Drawn inline, not
 * as an image, so the name picks up the logo face the page has loaded.
 */
function Background({ tone, label }: { tone: BackgroundTone; label: string }) {
  const { theme } = usePrototype();
  const svg = useMemo(() => logoBackgroundSvg({ tone }, theme).replace('<svg ', '<svg class="background-svg" aria-hidden="true" '), [tone, theme]);
  return (
    <figure className="background-tile">
      {/* Generated by our own theme code from brand geometry and colours: no user content. */}
      <div className="background-frame" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption>
        <span>{label}</span>
        <span className="mono muted" dir="ltr">
          1920 × 1200
        </span>
      </figcaption>
    </figure>
  );
}

/** App icon — same geometry as appIconSvg() in @yusr/theme, rendered live from the current theme. */
export function AppIcon({ size, shape = 'squircle', logo = brand.logo }: { size: number; shape?: 'squircle' | 'circle'; logo?: LogoGeometry }) {
  const { theme } = usePrototype();
  const id = useId().replace(/:/g, '');
  const { primary, primaryHover, highlight } = theme.colors.light;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="app-icon" aria-hidden>
      <defs>
        <linearGradient id={`ai${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={primary} />
          <stop offset="1" stopColor={primaryHover} />
        </linearGradient>
      </defs>
      {shape === 'circle' ? <circle cx={32} cy={32} r={32} fill={`url(#ai${id})`} /> : <rect width={64} height={64} rx={14.4} fill={`url(#ai${id})`} />}
      <g transform={centreMark(logo, 64, APP_ICON_SHARE)}>
        <MarkShapes logo={logo} bowl="#FFFFFF" drop={highlight} size={size * APP_ICON_SHARE} maskId={`aid${id}`} />
      </g>
    </svg>
  );
}

function UsageTile({ label, stage, children }: { label: string; stage: CSSProperties; children: ReactNode }) {
  return (
    <figure className="usage-tile">
      <div className="usage-stage" style={stage}>
        {children}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function Dont({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="dont-tile">
      <div className="dont-stage">
        {children}
        <span className="dont-x" aria-hidden>
          <Icon name="x" size={13} strokeWidth={2.6} />
        </span>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
