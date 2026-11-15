import { brand, SCRIPT_LOGO_COLORS } from '@yusr/theme';
import { useMemo, useState } from 'react';
import { useT } from '../app/i18n';
import { SURFACES, usePrototype } from '../app/prefs';
import { ScriptMark } from '../ui/brand';
import { Icon, type IconName } from '../ui/icons';
import { DocSectionHead, PageNav } from '../ui/page-nav';
import { Button } from '../ui/primitives';
import { ColorSection } from './ColorSection';
import { LogoSection } from './LogoSection';
import { PatternSection } from './PatternSection';
import { Playground } from './Playground';
import { ComponentsSection, TypeSection } from './Specimens';

const SECTIONS = ['logo', 'pattern', 'color', 'type', 'components', 'playground', 'principles'] as const;

/**
 * The brand book: the story behind the logo, the palette with live contrast,
 * type, components and a playground that re-themes the entire prototype.
 */
export function BrandPage() {
  const { t, f } = useT();
  const items = useMemo(() => SECTIONS.map((id) => ({ id, label: t(`proto.brand.nav.${id}`) })), [t]);
  const index = (id: (typeof SECTIONS)[number]) => f.number(SECTIONS.indexOf(id) + 1, { minimumIntegerDigits: 2 });
  return (
    <div className="doc-page brand-page">
      <BrandHero />
      <PageNav prefix="brand" items={items} label={t('proto.surfaces.brand')} />
      <LogoSection index={index('logo')} />
      <PatternSection index={index('pattern')} />
      <ColorSection index={index('color')} />
      <TypeSection index={index('type')} />
      <ComponentsSection index={index('components')} />
      <Playground index={index('playground')} />
      <Principles index={index('principles')} />
      <NextStop />
    </div>
  );
}

function BrandHero() {
  const { t, locale } = useT();
  const { reducedMotion } = usePrototype();
  const [run, setRun] = useState(0);
  return (
    <header className="brand-hero">
      <div className="container brand-hero-inner">
        <div className="brand-hero-copy">
          <span className="eyebrow">
            <Icon name="layers" size={16} /> {t('proto.brand.eyebrow')}
          </span>
          <h1>{t('proto.brand.title')}</h1>
          <p className="brand-hero-story">{t('proto.brand.story')}</p>
          <p className="brand-hero-tagline" lang={locale}>
            {brand.tagline[locale]}
          </p>
        </div>
        <figure className="brand-hero-figure">
          <ScriptMark
            key={run}
            height={150}
            ink={SCRIPT_LOGO_COLORS.ink.dark}
            accent={SCRIPT_LOGO_COLORS.accent.dark}
            writing={!reducedMotion}
            delayMs={300}
            title={`${brand.name[locale]} — ${t('proto.brand.title')}`}
          />
          {!reducedMotion && (
            <button type="button" className="hero-replay" onClick={() => setRun((value) => value + 1)}>
              <Icon name="refresh" size={14} /> {t('proto.brand.replay')}
            </button>
          )}
        </figure>
      </div>
    </header>
  );
}

const PRINCIPLES: ReadonlyArray<{ key: 'dignity' | 'rtl' | 'proof' | 'access'; icon: IconName }> = [
  { key: 'dignity', icon: 'hand-heart' },
  { key: 'rtl', icon: 'languages' },
  { key: 'proof', icon: 'receipt' },
  { key: 'access', icon: 'eye' },
];

function Principles({ index }: { index: string }) {
  const { t } = useT();
  return (
    <section id="brand-principles" className="doc-section">
      <div className="container">
        <DocSectionHead index={index} title={t('proto.brand.principles')} />
        <div className="principles-grid">
          {PRINCIPLES.map(({ key, icon }) => (
            <article key={key} className="principle-card">
              <span className="principle-icon">
                <Icon name={icon} size={22} />
              </span>
              <h3>{t(`proto.brand.principleItems.${key}.title`)}</h3>
              <p>{t(`proto.brand.principleItems.${key}.body`)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function NextStop() {
  const { t } = useT();
  const { setSurface } = usePrototype();
  return (
    <div className="container doc-next">
      <Button variant="outline" icon="monitor" onClick={() => setSurface('web')}>
        {t('proto.surfaces.web')}
      </Button>
      {SURFACES.includes('tech') && (
        <Button variant="soft" icon="git-branch" iconEnd="arrow-forward" onClick={() => setSurface('tech')}>
          {t('proto.surfaces.tech')}
        </Button>
      )}
    </div>
  );
}
