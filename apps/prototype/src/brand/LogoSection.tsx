import type { Locale } from '@yusr/core';
import {
  LOGO_VARIANTS,
  brand,
  centreMark,
  lockup,
  logoBackgroundSvg,
  mix,
  wordmark,
  type BackgroundTone,
  type LogoGeometry,
  type LogoVariant,
} from '@yusr/theme';
import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { DotsMask, Lockup, LogoMark, MarkShapes, WordmarkShapes } from '../ui/brand';
import { Icon } from '../ui/icons';
import { DocSectionHead } from '../ui/page-nav';

const GRID = Array.from({ length: 17 }, (_, i) => i * 4);

/** Which explored version is live: the one brand.logo points to in packages/theme/src/brand.ts. */
const LIVE_VARIANT = (Object.keys(LOGO_VARIANTS) as LogoVariant[]).find((key) => LOGO_VARIANTS[key] === brand.logo) ?? 'dotsBelow';
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
              {(['bowl', 'dots', 'drop', 'smile'] as const).map((part, i) => (
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
                <LogoMark size={44} bowl="#10201C" drop="#10201C" />
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
            <p className="muted size-note">{t('proto.brand.minSizeNote', { size: brand.logo.dotsMinSize })}</p>
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
  const { bowl, drop } = logo.guides;
  const cutout = logo.dots.style === 'cutout';
  const [left, right] = logo.dots.items;
  const low = bowl.cy + bowl.ry; // lowest point of the curve's centre line
  const edge = logo.bowl.strokeWidth / 2;
  // Point on the outer edge of the stroke at `angle` (0 = right end, 90 = lowest point).
  const outer = (angle: number): [number, number] => {
    const a = (angle * Math.PI) / 180;
    return [bowl.cx + (bowl.rx + edge) * Math.cos(a), bowl.cy + (bowl.ry + edge) * Math.sin(a)];
  };
  const dotsMarker = cutout
    ? { n: 2, x: 61.4, y: right.cy + 9.5, from: [58.6, right.cy + 8.1], to: [right.cx + right.r * 0.8, right.cy + right.r * 0.8] }
    : { n: 2, x: 50, y: right.cy + 3.4, from: [46.8, right.cy + 2.6], to: [right.cx + right.r * 0.9, right.cy + right.r * 0.45] };
  const markers = [
    { n: 1, x: 3.6, y: bowl.cy + 10.5, from: [6.8, bowl.cy + 9.7], to: [11.4, bowl.cy + 7.9] },
    dotsMarker,
    { n: 3, x: 50.5, y: drop.cy - 11.1, from: [47.6, drop.cy - 9.7], to: [42.4, drop.cy - 6] },
    cutout
      ? { n: 4, x: 32, y: low + 10.1, from: [32, low + 6.8], to: [32, low + 3.7] }
      : { n: 4, x: 8.6, y: bowl.cy + 25.2, from: [10.6, bowl.cy + 22.6], to: outer(128) },
  ] as const;
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
      <circle cx={drop.cx} cy={drop.cy} r={drop.r} className="cg-guide cg-guide-gold" />
      {cutout && <DotsMask id="construction-dots" />}
      <path
        d={logo.bowl.d}
        fill="none"
        className="cg-bowl"
        strokeWidth={logo.bowl.strokeWidth}
        strokeLinecap="round"
        mask={cutout ? 'url(#construction-dots)' : undefined}
      />
      <line x1={left.cx - 6} y1={left.cy} x2={right.cx + 6} y2={right.cy} className="cg-axis" />
      {cutout ? (
        logo.dots.items.map((dot) => <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} className="cg-guide cg-guide-dot" />)
      ) : (
        <>
          {/* Clearance under the stroke: the dots hang just below the curve's lowest point. */}
          <line x1={bowl.cx - 7.5} y1={low + edge} x2={bowl.cx + 7.5} y2={low + edge} className="cg-axis" />
          {logo.dots.items.map((dot) => (
            <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={dot.r} className="cg-dot" />
          ))}
        </>
      )}
      <path d={logo.drop.d} transform={logo.drop.transform} className="cg-drop" />
      <g className="cg-points">
        <circle cx={bowl.cx - bowl.rx} cy={bowl.cy} r={1} />
        <circle cx={bowl.cx + bowl.rx} cy={bowl.cy} r={1} />
        <circle cx={bowl.cx} cy={low} r={1} />
        <circle cx={drop.cx} cy={drop.cy} r={1} />
        {logo.dots.items.map((dot) => (
          <circle key={dot.cx} cx={dot.cx} cy={dot.cy} r={0.55} />
        ))}
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

const WORDMARK_PARTS = ['stroke', 'corners', 'dots', 'damma'] as const;

/**
 * How «يُسر» is lettered, drawn from the same geometry as the logo (@yusr/theme wordmark.ts):
 * the lines word and mark share, and the four decisions that keep it soft.
 */
function WordmarkConstruction() {
  const { t, f } = useT();
  const { logo } = brand;
  const g = wordmark.guides;
  const half = wordmark.stroke.width / 2;
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
  const [dammaX = 0, dammaY = 0] = wordmark.damma.d.match(/-?[\d.]+/g)!.map(Number);
  const markers = [
    // 1 — ر: one upright dropping below the line.
    { n: 1, x: g.ra, y: row, to: [g.ra, g.descender + 0.7] },
    // 2 — the ي's broad turn into the baseline (pointed at from above, right of the ي).
    { n: 2, x: g.ya + 10, y: vy + 6.2, to: [g.ya + half * 0.7, g.baseline] },
    // 3 — the dots of ي.
    { n: 3, x: wordmark.dots[0].cx, y: row, to: [wordmark.dots[0].cx, wordmark.dots[0].cy + wordmark.dots[0].r + 0.7] },
    // 4 — the ḍamma.
    { n: 4, x: dammaX - 22, y: dammaY + 1.5, to: [dammaX - 14, dammaY + 1] },
  ] as const;
  const lines = [g.top, g.baseline, g.bottom];
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
      {lines.map((y) => (
        <line key={y} x1={box.x + 1} y1={y} x2={box.x + box.w - 1} y2={y} className="cg-axis cg-axis-strong" />
      ))}
      {/* The circle the ي turns around into the baseline. */}
      <circle cx={g.ya - g.turn} cy={g.baseline - g.turn} r={g.turn} className="cg-guide" />
      <g className="cg-shapes">
        <WordmarkShapes ink="var(--primary)" drop="var(--highlight)" />
        <g transform={`translate(${lockup.markX} 0)`}>
          <MarkShapes bowl="var(--primary)" drop="var(--highlight)" size={200} maskId="wordmark-construction-dots" />
        </g>
      </g>
      <g className="cg-points">
        <circle cx={g.ya} cy={g.top} r={0.9} />
        <circle cx={lockup.markX + logo.guides.bowl.cx - logo.guides.bowl.rx} cy={logo.guides.bowl.cy} r={0.9} />
        <circle cx={lockup.markX + logo.guides.bowl.cx + logo.guides.bowl.rx} cy={logo.guides.bowl.cy} r={0.9} />
        <circle cx={lockup.markX + logo.guides.bowl.cx} cy={g.baseline} r={0.9} />
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
      <g transform={centreMark(logo, 64, 0.625)}>
        <MarkShapes logo={logo} bowl="#FFFFFF" drop={highlight} size={size * 0.625} maskId={`aid${id}`} />
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
