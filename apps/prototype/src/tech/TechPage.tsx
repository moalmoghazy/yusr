import { useMemo } from 'react';
import { useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { Icon } from '../ui/icons';
import { DocSectionHead, PageNav } from '../ui/page-nav';
import { Button } from '../ui/primitives';
import { ApiReference } from './ApiReference';
import { Architecture } from './Architecture';
import { CodeViewer } from './CodeViewer';
import { DataModel } from './DataModel';
import { Operations, Roadmap, Stack } from './Delivery';
import { Lifecycle } from './Lifecycle';
import { manifest } from './manifest';
import { Monorepo } from './Monorepo';
import { PaymentSequence } from './PaymentSequence';

const SECTIONS = ['architecture', 'api', 'data', 'lifecycle', 'payments', 'monorepo', 'stack', 'ops', 'roadmap', 'code'] as const;
type SectionId = (typeof SECTIONS)[number];

/**
 * How Yusr works inside. The facts on this page (routes, tables, packages, test results)
 * come from the repository at build time — see scripts/tech-manifest.ts.
 */
export function TechPage() {
  const { t, f } = useT();
  const items = useMemo(() => SECTIONS.map((id) => ({ id, label: t(`proto.tech.sections.${id}`) })), [t]);
  const index = (id: SectionId) => f.number(SECTIONS.indexOf(id) + 1, { minimumIntegerDigits: 2 });
  return (
    <div className="doc-page tech-page">
      <TechHero />
      <PageNav prefix="tech" items={items} label={t('proto.surfaces.tech')} />
      <Section id="architecture" index={index('architecture')} caption={t('proto.tech.architectureCaption')}>
        <Architecture />
      </Section>
      <Section id="api" index={index('api')} caption={t('proto.tech.apiCaption')} tint>
        <ApiReference />
      </Section>
      <Section id="data" index={index('data')} caption={t('proto.tech.dataCaption')}>
        <DataModel />
      </Section>
      <Section id="lifecycle" index={index('lifecycle')} caption={t('proto.tech.lifecycleCaption')} tint>
        <Lifecycle />
      </Section>
      <Section id="payments" index={index('payments')} caption={t('proto.tech.paymentsCaption')}>
        <PaymentSequence />
      </Section>
      <Section id="monorepo" index={index('monorepo')} caption={t('proto.tech.monorepoCaption')} tint>
        <Monorepo />
      </Section>
      <Section id="stack" index={index('stack')}>
        <Stack />
      </Section>
      <Section id="ops" index={index('ops')} caption={t('proto.tech.opsCaption')} tint>
        <Operations />
      </Section>
      <Section id="roadmap" index={index('roadmap')}>
        <Roadmap />
      </Section>
      <Section id="code" index={index('code')} caption={t('proto.tech.codeCaption')} tint>
        <CodeViewer />
      </Section>
      <NextStop />
    </div>
  );
}

function Section({ id, index, caption, tint, children }: { id: SectionId; index: string; caption?: string; tint?: boolean; children: React.ReactNode }) {
  const { t } = useT();
  return (
    <section id={`tech-${id}`} className={tint ? 'doc-section doc-section-tint' : 'doc-section'}>
      <div className="container">
        <DocSectionHead index={index} title={t(`proto.tech.sections.${id}`)} body={caption} />
        {children}
      </div>
    </section>
  );
}

function TechHero() {
  const { t, f } = useT();
  const { verified, endpoints, schema, packages } = manifest;
  const stats = [
    { key: 'tests' as const, value: verified?.total ?? 0, icon: 'shield-check' as const },
    { key: 'endpoints' as const, value: endpoints.length, icon: 'workflow' as const },
    { key: 'tables' as const, value: schema.tables.length, icon: 'database' as const },
    { key: 'packages' as const, value: packages.length, icon: 'package' as const },
  ].filter((stat) => stat.value > 0);
  return (
    <header className="tech-hero">
      <div className="container tech-hero-inner">
        <span className="eyebrow">
          <Icon name="git-branch" size={16} /> {t('proto.tech.eyebrow')}
        </span>
        <h1>{t('proto.tech.title')}</h1>
        <p className="tech-hero-body">{t('proto.tech.body')}</p>
        <dl className="tech-stats">
          {stats.map((stat) => (
            <div key={stat.key} className="tech-stat">
              <dt>
                <Icon name={stat.icon} size={18} />
                <span>{t(`proto.tech.stats.${stat.key}`, { count: stat.value })}</span>
              </dt>
              <dd>{f.number(stat.value)}</dd>
            </div>
          ))}
        </dl>
        {verified && (
          <div className="tech-verified">
            <span className="tech-verified-badge">
              <Icon name="check" size={14} strokeWidth={2.6} /> {t('proto.tech.verified')}
            </span>
            <span className="tech-verified-date">{t('proto.tech.verifiedAt', { date: f.date(verified.at, 'long') })}</span>
            <ul className="tech-suites" aria-label={t('proto.tech.verifiedBody')}>
              {verified.suites.map((suite) => (
                <li key={suite.package}>
                  <code>@yusr/{suite.package}</code>
                  <span>
                    {f.number(suite.pass)}/{f.number(suite.tests)}
                  </span>
                </li>
              ))}
              {verified.postgres && (
                <li>
                  <code>{verified.postgres.replace(/^psql \(PostgreSQL\) /, 'PostgreSQL ')}</code>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </header>
  );
}

function NextStop() {
  const { t } = useT();
  const { setSurface } = usePrototype();
  return (
    <div className="container doc-next">
      <Button variant="outline" icon="layers" onClick={() => setSurface('brand')}>
        {t('proto.surfaces.brand')}
      </Button>
      <Button variant="soft" icon="monitor" iconEnd="arrow-forward" onClick={() => setSurface('web')}>
        {t('proto.surfaces.web')}
      </Button>
    </div>
  );
}
