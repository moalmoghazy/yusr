import { SCRIPT_LOGO, SCRIPT_LOGO_COLORS } from '@yusr/theme';
import type { ReactNode } from 'react';
import { useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { ScriptMark } from '../ui/brand';
import { DocSectionHead } from '../ui/page-nav';

type PartId = (typeof SCRIPT_LOGO.parts)[number]['id'];

/** «كيف يُكتب»: the order the pen takes. */
const STEPS: ReadonlyArray<readonly ['ya' | 'seen' | 'ra' | 'damma', readonly PartId[]]> = [
  ['ya', ['ya', 'ya-dot-1', 'ya-dot-2']],
  ['seen', ['seen']],
  ['ra', ['ra']],
  ['damma', ['damma']],
];

/** «خطّ اليُسر»: the logo, its colours, the order it is written in, and how it sits on each background. */
export function LogoSection({ index }: { index: string }) {
  const { t } = useT();
  const { theme } = usePrototype();
  const deep = theme.colors.dark.background;
  return (
    <section id="brand-logo" className="doc-section">
      <div className="container">
        <DocSectionHead index={index} title={t('proto.brand.nav.logo')} />
        <div className="script-intro">
          <div className="script-intro-copy">
            <h3>{t('identity.logoName')}</h3>
            <p className="muted">{t('identity.logoStory')}</p>
            <h4 className="doc-h3">{t('identity.colors')}</h4>
            <ul className="script-colors">
              {(['ink', 'accent'] as const).map((key) => (
                <li key={key}>
                  <span aria-hidden className="script-swatch" style={{ background: SCRIPT_LOGO_COLORS[key].css }} />
                  <span>
                    <strong>{t(`identity.${key}`)}</strong>
                    <small className="muted">{t(`identity.${key}Note`)}</small>
                    <small className="mono muted" dir="ltr">
                      {SCRIPT_LOGO_COLORS[key].light} · {SCRIPT_LOGO_COLORS[key].dark}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="script-steps-wrap">
            <h4 className="doc-h3">{t('identity.writing')}</h4>
            <ol className="script-steps">
              {STEPS.map(([key, parts], step) => (
                <li key={key}>
                  <ScriptMark height={44} highlight={parts} />
                  <span>
                    <b>{step + 1}</b> {t(`identity.steps.${key}`)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <h3 className="doc-h3">{t('proto.brand.variants')}</h3>
        <div className="script-uses">
          <Use label={t('proto.brand.onLight')} background="#FFFFFF">
            <ScriptMark height={64} ink={theme.colors.light.primary} accent={theme.colors.light.highlight} />
          </Use>
          <Use label={t('proto.brand.onDark')} background={deep}>
            <ScriptMark height={64} ink={theme.colors.dark.primary} accent={theme.colors.dark.highlight} />
          </Use>
          <Use label={t('proto.brand.appIcon')} background="var(--muted)">
            <span
              className="script-app-icon"
              style={{ background: `linear-gradient(160deg, ${theme.colors.light.primary}, ${theme.colors.light.primaryHover})` }}
            >
              <ScriptMark height={34} ink="#FFFFFF" accent={theme.colors.light.highlight} />
            </span>
          </Use>
          <Use label={t('proto.brand.mono')} background="var(--muted)">
            <ScriptMark height={48} ink="#132326" accent="#132326" />
          </Use>
        </div>
      </div>
    </section>
  );
}

function Use({ label, background, children }: { label: string; background: string; children: ReactNode }) {
  return (
    <figure className="script-use">
      <div className="script-use-stage" style={{ background }}>
        {children}
      </div>
      <figcaption className="muted">{label}</figcaption>
    </figure>
  );
}
