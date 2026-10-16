import {
  DEFAULT_DISPLAY_FACE,
  DISPLAY_FACES,
  LOGO_FACE,
  auditContrast,
  cssVariables,
  defaultTheme,
  displayFaceOf,
  displayStack,
  gold,
  presets,
  teal,
  themeFromBrandColors,
  withDisplayFace,
  type DisplayFace,
  type PresetName,
  type Theme,
} from '@yusr/theme';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRead } from '../app/backend';
import { useL, useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { Lockup, LogoMark } from '../ui/brand';
import { DonationProgress } from '../ui/case-ui';
import { CodeBlock } from '../ui/code';
import { Icon } from '../ui/icons';
import { DocSectionHead } from '../ui/page-nav';
import { Badge, Button, cx } from '../ui/primitives';

/** The two colors each preset was derived from (emerald is the hand-tuned default). */
const PRESET_SOURCE: Readonly<Record<PresetName, { primary: string; highlight: string }>> = {
  emerald: { primary: teal[600], highlight: gold[400] },
  nile: { primary: '#1B5E8C', highlight: '#D9A441' },
  olive: { primary: '#56702B', highlight: '#C47A3A' },
  rosewood: { primary: '#8A2F52', highlight: '#D8A94B' },
};

const PRESET_NAMES = Object.keys(presets) as PresetName[];
const FACE_NAMES = Object.keys(DISPLAY_FACES) as DisplayFace[];
const HEX = /^#?([0-9a-f]{6})$/i;

/**
 * Loads the other heading faces from Google Fonts (the default one is in the page already),
 * so each option previews in its own face and a switch applies at once.
 */
function useHeadingFaces() {
  useEffect(() => {
    for (const face of FACE_NAMES) {
      const id = `yusr-face-${face}`;
      if (face === DEFAULT_DISPLAY_FACE || document.getElementById(id)) continue;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${DISPLAY_FACES[face].google}&display=swap`;
      document.head.appendChild(link);
    }
  }, []);
}

type Mode = PresetName | 'custom';

/** Survives leaving and re-opening the brand page (the theme itself lives in the prototype state). */
let remembered = { primary: '#1B5E8C', highlight: '#D9A441', radius: 1 };

function modeOf(theme: Theme): Mode {
  if (theme === defaultTheme) return 'emerald';
  return (PRESET_NAMES as string[]).includes(theme.name) ? (theme.name as PresetName) : 'custom';
}

function snippet(mode: Mode, primary: string, highlight: string, radius: number, face: DisplayFace): string {
  const colors =
    mode === 'custom'
      ? [
          'themeFromBrandColors({',
          "  name: 'custom',",
          `  primary: '${primary.toUpperCase()}',`,
          `  highlight: '${highlight.toUpperCase()}',`,
          `  radiusScale: ${radius},`,
          '})',
        ]
      : [`presets.${mode}`];
  const custom = face !== DEFAULT_DISPLAY_FACE;
  const build = custom
    ? [
        `// Heading face: ${DISPLAY_FACES[face].family} (CSS stack, web-font link and native font in one call).`,
        `export const theme = withDisplayFace(${colors.length > 1 ? colors.map((line, i) => (i === 0 ? line : `  ${line}`)).join('\n') : colors[0]}, '${face}');`,
      ]
    : [`export const theme = ${colors.join('\n')};`];
  const imports = ['cssText', mode === 'custom' ? 'themeFromBrandColors' : 'presets', 'toNativeTheme', ...(custom ? ['withDisplayFace'] : [])];
  return [
    `import { ${imports.join(', ')} } from '@yusr/theme';`,
    '',
    '// Every other role, both color schemes and the radii are derived and AA-checked.',
    ...build,
    '',
    '// Web + control hub: CSS variables for light, dark and "system".',
    'export const css = cssText(theme);',
    '',
    '// Mobile (Expo): the same tokens as a React Native theme.',
    "export const native = { light: toNativeTheme(theme, 'light'), dark: toNativeTheme(theme, 'dark') };",
    '',
  ].join('\n');
}

export function Playground({ index }: { index: string }) {
  const { t, f } = useT();
  const { theme, setTheme, setSurface } = usePrototype();
  const [mode, setMode] = useState<Mode>(() => modeOf(theme));
  const [primary, setPrimary] = useState(() => (mode === 'custom' ? remembered.primary : PRESET_SOURCE[mode].primary));
  const [highlight, setHighlight] = useState(() => (mode === 'custom' ? remembered.highlight : PRESET_SOURCE[mode].highlight));
  const [radius, setRadius] = useState(() => (mode === 'custom' ? remembered.radius : 1));
  const [primaryText, setPrimaryText] = useState(primary);
  const [highlightText, setHighlightText] = useState(highlight);
  const [face, setFace] = useState<DisplayFace>(() => displayFaceOf(theme) ?? DEFAULT_DISPLAY_FACE);
  useHeadingFaces();

  useEffect(() => setPrimaryText(primary.toUpperCase()), [primary]);
  useEffect(() => setHighlightText(highlight.toUpperCase()), [highlight]);

  const applyCustom = (next: { primary?: string; highlight?: string; radius?: number }) => {
    const value = { primary: next.primary ?? primary, highlight: next.highlight ?? highlight, radius: next.radius ?? radius };
    remembered = value;
    setMode('custom');
    setPrimary(value.primary);
    setHighlight(value.highlight);
    setRadius(value.radius);
    setTheme(withDisplayFace(themeFromBrandColors({ name: 'custom', primary: value.primary, highlight: value.highlight, radiusScale: value.radius }), face));
  };

  const choosePreset = (name: PresetName, nextFace: DisplayFace = face) => {
    setMode(name);
    setPrimary(PRESET_SOURCE[name].primary);
    setHighlight(PRESET_SOURCE[name].highlight);
    setRadius(1);
    setFace(nextFace);
    setTheme(withDisplayFace(presets[name], nextFace));
  };

  const chooseFace = (next: DisplayFace) => {
    setFace(next);
    setTheme(withDisplayFace(theme, next));
  };

  const audit = useMemo(() => auditContrast(theme), [theme]);
  const failures = audit.filter((result) => !result.pass).length;
  const adjusted = mode === 'custom' && theme.colors.light.primary.toUpperCase() !== primary.toUpperCase() ? theme.colors.light.primary : null;
  const code = snippet(mode, primary, highlight, radius, face);

  return (
    <section id="brand-playground" className="doc-section doc-section-tint">
      <div className="container">
        <DocSectionHead index={index} title={t('proto.brand.playground')} body={t('proto.brand.playgroundBody')} />
        <div className="playground">
          <div className="pg-controls panel">
            <h3 className="pg-label">{t('proto.brand.presets')}</h3>
            <div className="preset-grid" role="radiogroup" aria-label={t('proto.brand.presets')}>
              {PRESET_NAMES.map((name) => {
                const colors = presets[name].colors.light;
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={mode === name}
                    className={cx('preset', mode === name && 'is-selected')}
                    onClick={() => choosePreset(name)}
                  >
                    <span className="preset-mark" style={{ background: colors.primarySoft }}>
                      <LogoMark size={26} bowl={colors.primary} drop={colors.highlight} />
                    </span>
                    <span className="preset-name">{t(`proto.brand.presetNames.${name}`)}</span>
                    <span className="preset-dots" aria-hidden>
                      <i style={{ background: colors.primary }} />
                      <i style={{ background: colors.highlight }} />
                      <i style={{ background: colors.background }} />
                    </span>
                  </button>
                );
              })}
            </div>

            <h3 className="pg-label">
              {t('proto.brand.custom')} {mode === 'custom' && <Badge tone="primary">{t('proto.brand.presetNames.custom')}</Badge>}
            </h3>
            <div className="pg-colors">
              <ColorField
                id="pg-primary"
                label={t('proto.brand.primary')}
                value={primary}
                text={primaryText}
                onText={(value) => {
                  setPrimaryText(value);
                  const match = HEX.exec(value.trim());
                  if (match) applyCustom({ primary: `#${match[1]}` });
                }}
                onPick={(value) => applyCustom({ primary: value })}
              />
              <ColorField
                id="pg-highlight"
                label={t('proto.brand.highlight')}
                value={highlight}
                text={highlightText}
                onText={(value) => {
                  setHighlightText(value);
                  const match = HEX.exec(value.trim());
                  if (match) applyCustom({ highlight: `#${match[1]}` });
                }}
                onPick={(value) => applyCustom({ highlight: value })}
              />
            </div>
            {adjusted && (
              <p className="pg-adjusted">
                <span className="pg-adjusted-swatch" style={{ background: adjusted }} aria-hidden />
                {t('proto.brand.adjusted', { color: adjusted })}
              </p>
            )}

            <div className="pg-radius">
              <label htmlFor="pg-radius" className="pg-label">
                {t('proto.brand.radius')}
              </label>
              <input
                id="pg-radius"
                type="range"
                min={0}
                max={1.8}
                step={0.1}
                value={radius}
                onChange={(event) => applyCustom({ radius: Number(event.target.value) })}
                aria-valuetext={`${Math.round(defaultTheme.radius.card * radius)}px`}
              />
              <output htmlFor="pg-radius" className="mono">
                {f.number(Math.round(defaultTheme.radius.card * radius))}px
              </output>
            </div>

            <h3 className="pg-label" id="pg-face-label">
              {t('proto.brand.headingFace')}
            </h3>
            <div className="face-list" role="radiogroup" aria-labelledby="pg-face-label">
              {FACE_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={face === name}
                  className={cx('face-option', face === name && 'is-selected')}
                  onClick={() => chooseFace(name)}
                >
                  <span className="face-sample" style={{ fontFamily: displayStack(name) }}>
                    {t('proto.brand.specimenDisplay')}
                  </span>
                  <span className="face-meta">
                    <span className="face-name" dir="ltr" lang="en">
                      {DISPLAY_FACES[name].family}
                    </span>
                    {name === DEFAULT_DISPLAY_FACE && <Badge tone="primary">{t('proto.brand.faceDefault')}</Badge>}
                    {name === LOGO_FACE && <Badge tone="neutral">{t('proto.brand.faceLogo')}</Badge>}
                  </span>
                </button>
              ))}
            </div>
            <p className="pg-face-note muted">{t('proto.brand.headingFaceNote')}</p>

            <div className={cx('pg-audit', failures ? 'is-warn' : 'is-pass')} role="status">
              <Icon name={failures ? 'alert' : 'shield-check'} size={18} />
              <span>
                <strong>{t('proto.brand.audit')}</strong>
                <span>{failures ? t('proto.brand.auditFail', { count: failures }) : t('proto.brand.auditPass', { count: audit.length })}</span>
              </span>
            </div>

            <div className="pg-actions">
              <Button
                variant="outline"
                size="sm"
                icon="refresh"
                onClick={() => choosePreset('emerald', DEFAULT_DISPLAY_FACE)}
                disabled={mode === 'emerald' && face === DEFAULT_DISPLAY_FACE}
              >
                {t('proto.brand.reset')}
              </Button>
              <Button size="sm" icon="monitor" iconEnd="arrow-forward" onClick={() => setSurface('web')}>
                {t('proto.brand.seeWebsite')}
              </Button>
            </div>
          </div>

          <div className="pg-output">
            <div className="pg-previews">
              <PreviewPane theme={theme} scheme="light" />
              <PreviewPane theme={theme} scheme="dark" />
            </div>
            <p className="pg-applies muted">
              <Icon name="zap" size={14} /> {t('proto.brand.appliesEverywhere')}
            </p>
            <CodeBlock code={code} lang="ts" title="packages/theme/src/brand-theme.ts" copyLabel={t('common.copy')} copiedLabel={t('common.copied')} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ColorField({
  id,
  label,
  value,
  text,
  onText,
  onPick,
}: {
  id: string;
  label: string;
  value: string;
  text: string;
  onText: (value: string) => void;
  onPick: (value: string) => void;
}) {
  return (
    <div className="color-field">
      <label htmlFor={`${id}-hex`}>{label}</label>
      <span className="color-control">
        <input type="color" aria-label={label} value={value.toLowerCase()} onChange={(event) => onPick(event.target.value)} />
        <input
          id={`${id}-hex`}
          className="input mono"
          dir="ltr"
          spellCheck={false}
          maxLength={7}
          value={text}
          onChange={(event) => onText(event.target.value)}
        />
      </span>
    </div>
  );
}

/** A slice of the product rendered with explicit light or dark variables, whatever the page mode is. */
function PreviewPane({ theme, scheme }: { theme: Theme; scheme: 'light' | 'dark' }) {
  const { t, f, locale } = useT();
  const l = useL();
  const item = useRead((read) => read.cases({ sort: 'urgent' }).items.find((entry) => entry.status === 'published') ?? read.cases({}).items[0]);
  const vars = useMemo(() => cssVariables(theme, scheme) as CSSProperties, [theme, scheme]);
  return (
    <div className={cx('pv-pane', `pv-${scheme}`)} style={vars}>
      <div className="pv-bar">
        <span className="pv-brand">
          <Lockup lang={locale} size={24} />
        </span>
        <span className="pv-scheme">{t(`nav.${scheme}`)}</span>
      </div>
      {item && (
        <div className="pv-card">
          <div className="pv-card-top">
            <Badge tone="primary" icon="shield-check">
              {t('case.verified')}
            </Badge>
            <Badge tone="gold" icon="gift">
              {t('case.zakatEligible')}
            </Badge>
          </div>
          <strong className="pv-title">{l(item.title)}</strong>
          <DonationProgress raisedMinor={item.raisedMinor} goalMinor={item.goalMinor} currency={item.currency} donors={item.donorsCount} size="sm" />
          <div className="pv-actions">
            <Button size="sm" icon="heart">
              {t('common.donateNow')}
            </Button>
            <Button size="sm" variant="soft">
              {f.number(100)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
