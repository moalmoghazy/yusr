import {
  auditContrast,
  colorVar,
  contrastLevel,
  contrastRatio,
  gold,
  neutral,
  relativeLuminance,
  rose,
  sky,
  slate,
  teal,
  type Scale,
  type SemanticColors,
} from '@yusr/theme';
import { useMemo } from 'react';
import { useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { Icon } from '../ui/icons';
import { DocSectionHead } from '../ui/page-nav';
import { Badge, cx, useCopy, useToast } from '../ui/primitives';

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Raw scales and the step each semantic role takes from them (light scheme). */
const SCALES: ReadonlyArray<{ name: string; scale: Scale; token: string; used: (typeof STEPS)[number] }> = [
  { name: 'teal', scale: teal, token: '--primary', used: 600 },
  { name: 'gold', scale: gold, token: '--highlight', used: 400 },
  { name: 'slate', scale: slate, token: '--secondary', used: 600 },
  { name: 'neutral', scale: neutral, token: '--background', used: 50 },
  { name: 'rose', scale: rose, token: '--destructive', used: 600 },
  { name: 'sky', scale: sky, token: '--chart-5', used: 500 },
];

type RoleKey = 'page' | 'muted' | 'primary' | 'primarySoft' | 'highlight' | 'highlightSoft' | 'secondary' | 'destructive' | 'success' | 'warning';

const ROLE_PAIRS: ReadonlyArray<{ key: RoleKey; fg: keyof SemanticColors; bg: keyof SemanticColors }> = [
  { key: 'page', fg: 'foreground', bg: 'background' },
  { key: 'muted', fg: 'mutedForeground', bg: 'card' },
  { key: 'primary', fg: 'primaryForeground', bg: 'primary' },
  { key: 'primarySoft', fg: 'primarySoftForeground', bg: 'primarySoft' },
  { key: 'highlight', fg: 'highlightForeground', bg: 'highlight' },
  { key: 'highlightSoft', fg: 'highlightSoftForeground', bg: 'highlightSoft' },
  { key: 'secondary', fg: 'secondaryForeground', bg: 'secondary' },
  { key: 'destructive', fg: 'destructiveForeground', bg: 'destructive' },
  { key: 'success', fg: 'successForeground', bg: 'success' },
  { key: 'warning', fg: 'warningSoftForeground', bg: 'warningSoft' },
];

export function ColorSection({ index }: { index: string }) {
  const { t, f } = useT();
  const { theme } = usePrototype();
  const audit = useMemo(() => auditContrast(theme), [theme]);
  const passed = audit.filter((result) => result.pass).length;
  const allPass = passed === audit.length;

  return (
    <section id="brand-color" className="doc-section">
      <div className="container">
        <DocSectionHead index={index} title={t('proto.brand.palette')} body={t('proto.brand.paletteBody')} />

        <h3 className="doc-h3">{t('proto.brand.scales')}</h3>
        <div className="scales" dir="ltr">
          {SCALES.map((entry) => (
            <ScaleRow key={entry.name} {...entry} />
          ))}
        </div>

        <div className="roles-head">
          <h3 className="doc-h3">{t('proto.brand.semantic')}</h3>
          <Badge tone={allPass ? 'success' : 'warning'} icon={allPass ? 'shield-check' : 'alert'}>
            {t('proto.brand.auditSummary', { pass: passed, total: audit.length })}
          </Badge>
        </div>
        <div className="roles-grid">
          {ROLE_PAIRS.map((pair) => (
            <article key={pair.key} className="role-card">
              <header className="role-card-head">
                <strong>{t(`proto.brand.roles.${pair.key}`)}</strong>
                <code className="mono">{colorVar(pair.bg)}</code>
              </header>
              <div className="role-split">
                {(['light', 'dark'] as const).map((scheme) => {
                  const colors = theme.colors[scheme];
                  const fg = colors[pair.fg];
                  const bg = colors[pair.bg];
                  const ratio = contrastRatio(fg, bg);
                  const level = contrastLevel(fg, bg);
                  return (
                    <div key={scheme} className="role-half" style={{ background: bg, color: fg }}>
                      <span className="role-sample">
                        <span lang="en">Aa</span> {t('proto.brand.sample')}
                      </span>
                      <span className="role-meta">
                        <span>{t(`nav.${scheme}`)}</span>
                        <span className="role-ratio">
                          <bdi dir="ltr">
                            {f.number(ratio, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}:{f.number(1)}
                          </bdi>{' '}
                          <span className={cx('role-level', level === 'fail' && 'is-fail')}>{level === 'AA-large' ? 'AA+' : level}</span>
                        </span>
                      </span>
                      <span className="role-hex mono">{bg}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
        {!allPass && (
          <ul className="audit-failures">
            {audit
              .filter((result) => !result.pass)
              .map((result) => (
                <li key={`${result.scheme}-${result.foreground}-${result.background}`} className="mono">
                  <Icon name="alert" size={14} /> {result.scheme}: {result.foreground} / {result.background} = {result.ratio.toFixed(2)}
                </li>
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ScaleRow({ name, scale, token, used }: { name: string; scale: Scale; token: string; used: number }) {
  const { t } = useT();
  const toast = useToast();
  const [, copy] = useCopy();
  return (
    <div className="scale-row">
      <div className="scale-label">
        <strong className="mono">{name}</strong>
        <span className="mono muted">{token}</span>
      </div>
      <div className="scale-swatches">
        {STEPS.map((step) => {
          const hex = scale[step];
          const dark = relativeLuminance(hex) < 0.36;
          return (
            <button
              key={step}
              type="button"
              className={cx('swatch', dark && 'is-dark', step === used && 'is-used')}
              style={{ background: hex }}
              title={`${name}-${step} ${hex}`}
              aria-label={`${name} ${step} ${hex}`}
              onClick={() => {
                copy(hex);
                toast({ title: `${t('common.copied')} ${hex}`, icon: 'copy', duration: 1_800 });
              }}
            >
              <span className="swatch-step">{step}</span>
              <span className="swatch-hex">{hex.slice(1)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
