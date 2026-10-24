import { CASE_CATEGORIES, CATEGORY_META, type CaseCategory, type CaseSummary } from '@yusr/core';
import { useMemo, useRef } from 'react';
import mossLogo from '../assets/moss-egypt.webp';
import { useRead } from '../app/backend';
import { useNow } from '../app/clock';
import { useL, useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { LogoMark } from '../ui/brand';
import { categoryIcon, CountdownChip, DonationProgress } from '../ui/case-ui';
import { Icon } from '../ui/icons';
import { Avatar, Button, cx, useAnimatedNumber } from '../ui/primitives';
import { CaseCard } from './CaseCard';
import { LedgerSnippet } from './DonateFlow';
import { PaymentPills, useDonate } from './WebApp';

export function LandingPage() {
  const { t } = useT();
  const { goWeb } = usePrototype();
  const donate = useDonate();
  const howRef = useRef<HTMLElement>(null);
  const urgent = useRead((read) => read.cases({ urgentOnly: true, sort: 'urgent', limit: 6 }).items);
  const closest = useRead((read) => read.cases({ sort: 'closest', limit: 6 }).items);
  const rail = useMemo(() => {
    const seen = new Set<string>();
    return [...urgent, ...closest].filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true))).slice(0, 6);
  }, [urgent, closest]);
  const open = (slug: string) => goWeb({ page: 'case', slug });

  return (
    <>
      <Hero onBrowse={() => goWeb({ page: 'cases' })} onHow={() => howRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      <StatsStrip />

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <h2>{t('landing.urgentTitle')}</h2>
              <p>{t('landing.urgentBody')}</p>
            </div>
            <Button variant="ghost" iconEnd="arrow-forward" onClick={() => goWeb({ page: 'cases' })}>
              {t('common.seeAll')}
            </Button>
          </div>
          <div className="case-rail" role="list">
            {rail.map((item) => (
              <div role="listitem" key={item.id} className="case-rail-item">
                <CaseCard item={item} onOpen={open} onDonate={donate} variant="rail" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <CategoriesSection />

      <section className="section section-tint" ref={howRef} id="how">
        <div className="container">
          <div className="section-head">
            <div>
              <h2>{t('landing.howTitle')}</h2>
              <p>{t('landing.howBody')}</p>
            </div>
          </div>
          <HowItWorks />
        </div>
      </section>

      <TransparencySection />

      <section className="section">
        <div className="container cta-band">
          <div>
            <h2>{t('landing.ctaTitle')}</h2>
            <p>{t('landing.ctaBody')}</p>
          </div>
          <Button size="lg" icon="plus" onClick={() => goWeb({ page: 'submit' })}>
            {t('landing.ctaButton')}
          </Button>
        </div>
      </section>
    </>
  );
}

function Hero({ onBrowse, onHow }: { onBrowse: () => void; onHow: () => void }) {
  const { t } = useT();
  return (
    <section className="hero">
      {/* «روضة العطاء»: the brand pattern from @yusr/theme (var(--y-pattern)), coloured by the active theme. */}
      <div className="hero-lattice" aria-hidden />
      <div className="container hero-grid">
        <div className="hero-copy">
          <SupervisionBadge />
          <p className="eyebrow">
            <LogoMark size={20} /> {t('landing.eyebrow')}
          </p>
          <h1 className="hero-title">{t('landing.heroTitle')}</h1>
          <p className="hero-body">{t('landing.heroBody')}</p>
          <div className="hero-ctas">
            <Button size="lg" icon="heart" onClick={onBrowse}>
              {t('landing.heroPrimary')}
            </Button>
            <Button size="lg" variant="outline" icon="shield-check" onClick={onHow}>
              {t('landing.heroSecondary')}
            </Button>
          </div>
          <ul className="trust-row">
            <li>
              <Icon name="clipboard-check" size={18} /> {t('proto.web.trust.visit')}
            </li>
            <li>
              <Icon name="landmark" size={18} /> {t('proto.web.trust.direct')}
            </li>
            <li>
              <Icon name="receipt" size={18} /> {t('proto.web.trust.receipt')}
            </li>
          </ul>
        </div>
        <LiveBoard />
      </div>
    </section>
  );
}

/**
 * The regulator line above the eyebrow: the Ministry of Social Solidarity's logo on a white,
 * rounded tile (the artwork is drawn for a white ground, so the tile keeps it legible in dark
 * mode too), and beside it the supervision statement set in the eyebrow's type — the ministry's
 * name on its own line so it never breaks apart.
 * The logo is decorative here — the sentence next to it names the ministry.
 */
function SupervisionBadge() {
  const { t } = useT();
  return (
    <p className="supervision">
      <span className="supervision-logo">
        <img src={mossLogo} alt="" width={54} height={54} decoding="async" />
      </span>
      <span className="supervision-text">
        {t('landing.supervision.lead')} <span className="supervision-authority">{t('landing.supervision.authority')}</span>
      </span>
    </p>
  );
}

function LiveBoard() {
  const { t, f } = useT();
  const l = useL();
  const { goWeb } = usePrototype();
  const donate = useDonate();
  const now = useNow();
  const feed = useRead((read) => read.live(5));
  const featured = useRead((read) => read.cases({ urgentOnly: true, sort: 'urgent', limit: 1 }).items[0]);
  return (
    <aside className="live-board" aria-label={t('landing.liveTitle')}>
      <header className="live-head">
        <span className="live-title">
          <span className="live-dot" aria-hidden /> {t('landing.liveTitle')}
        </span>
        <span className="live-sub">{t('common.live')}</span>
      </header>
      <ol className="live-list" aria-live="polite">
        {feed.length === 0 && <li className="live-empty">{t('proto.web.liveEmpty')}</li>}
        {feed.map((entry) => {
          const name = l(entry.displayName) ?? t('case.anonymous');
          return (
            <li key={entry.id} className="live-item">
              <Avatar name={entry.displayName ? name : '♥'} size={34} />
              <div className="live-text">
                <span className="live-line">{t('landing.liveDonation', { name, amount: f.money(entry.amountMinor, entry.currency) })}</span>
                <button type="button" className="live-case" onClick={() => goWeb({ page: 'case', slug: entry.caseSlug })}>
                  {t('landing.liveTo', { title: l(entry.caseTitle) ?? '' })}
                </button>
              </div>
              <time className="live-time" dateTime={entry.at}>
                {f.relative(entry.at, now)}
              </time>
            </li>
          );
        })}
      </ol>
      {featured && (
        <div className="featured-case">
          <div className="featured-head">
            <span className="featured-label">{t('proto.web.featured')}</span>
            <CountdownChip deadline={featured.deadline} />
          </div>
          <button type="button" className="featured-title" onClick={() => goWeb({ page: 'case', slug: featured.slug })}>
            {l(featured.title)}
          </button>
          <DonationProgress raisedMinor={featured.raisedMinor} goalMinor={featured.goalMinor} currency={featured.currency} size="sm" />
          <Button block icon="heart" onClick={() => donate(featured)}>
            {t('case.donateCta')}
          </Button>
        </div>
      )}
    </aside>
  );
}

function StatsStrip() {
  const { t, f } = useT();
  const stats = useRead((read) => read.stats());
  const raised = useAnimatedNumber(stats.raisedMinor, 900);
  const items = [
    { value: f.money(Math.round(raised), 'EGP', { compact: true }), label: t('landing.stats.raised') },
    { value: f.number(stats.casesFunded), label: t('landing.stats.funded') },
    { value: f.number(stats.donors), label: t('landing.stats.donors') },
    { value: f.number(stats.regionsCovered), label: t('landing.stats.regions') },
  ];
  return (
    <section className="stats-strip" aria-label={t('landing.stats.raised')}>
      <div className="container stats-grid">
        {items.map((item) => (
          <div className="stat" key={item.label}>
            <strong className="stat-value">{item.value}</strong>
            <span className="stat-label">{item.label}</span>
          </div>
        ))}
        <p className="stats-note">
          <Icon name="info" size={13} /> {t('common.demoData')}
        </p>
      </div>
    </section>
  );
}

function CategoriesSection() {
  const { t } = useT();
  const { goWeb } = usePrototype();
  const counts = useRead((read) => {
    const all = read.cases({ limit: 50 }).items;
    return CASE_CATEGORIES.reduce<Record<CaseCategory, number>>(
      (acc, category) => ({ ...acc, [category]: all.filter((item: CaseSummary) => item.category === category).length }),
      {} as Record<CaseCategory, number>,
    );
  });
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div>
            <h2>{t('landing.categoriesTitle')}</h2>
          </div>
        </div>
        <div className="category-grid">
          {CASE_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={cx('category-tile', `tone-${CATEGORY_META[category].tone}`)}
              onClick={() => goWeb({ page: 'cases', category })}
            >
              <span className="category-icon">
                <Icon name={categoryIcon(category)} size={24} />
              </span>
              <strong>{t(`categories.${category}`)}</strong>
              <span className="category-desc">{t(`categoryDescriptions.${category}`)}</span>
              <span className="category-count">{t('proto.web.openCases', { count: counts[category] })}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t, f } = useT();
  const steps = [
    { key: 'submit', icon: 'file-text' as const },
    { key: 'verify', icon: 'clipboard-check' as const },
    { key: 'publish', icon: 'shield-check' as const },
    { key: 'disburse', icon: 'landmark' as const },
    { key: 'follow', icon: 'eye' as const },
  ];
  return (
    <ol className="how-steps">
      {steps.map((step, index) => (
        <li key={step.key} className="how-step">
          <span className="how-num" aria-hidden>
            {f.number(index + 1)}
          </span>
          <span className="how-icon">
            <Icon name={step.icon} size={22} />
          </span>
          <h3>{t(`landing.howSteps.${step.key}.title` as 'landing.howSteps.submit.title')}</h3>
          <p>{t(`landing.howSteps.${step.key}.body` as 'landing.howSteps.submit.body')}</p>
        </li>
      ))}
    </ol>
  );
}

function TransparencySection() {
  const { t } = useT();
  const { goWeb } = usePrototype();
  const latest = useRead((read) => read.live(1)[0]);
  const receipt = useRead((read) => (latest ? read.donation(latest.id)?.receiptNumber : undefined));
  const nodes = [
    { icon: 'heart' as const, label: t('landing.flow.donor') },
    { icon: 'lock' as const, label: t('landing.flow.fund') },
    { icon: 'landmark' as const, label: t('landing.flow.payee') },
    { icon: 'receipt' as const, label: t('landing.flow.receipt') },
  ];
  return (
    <section className="section">
      <div className="container transparency">
        <div className="transparency-copy">
          <h2>{t('landing.transparencyTitle')}</h2>
          <p>{t('landing.transparencyBody')}</p>
          <ol className="money-flow" aria-label={t('landing.transparencyTitle')}>
            {nodes.map((node, index) => (
              <li key={node.label} className={cx('flow-node', index === 1 && 'flow-node-core')}>
                <span className="flow-node-icon">
                  <Icon name={node.icon} size={20} />
                </span>
                <span>{node.label}</span>
              </li>
            ))}
          </ol>
          <Button variant="outline" iconEnd="arrow-forward" onClick={() => goWeb({ page: 'case', slug: 'insulin-pump-ismailia', tab: 'transparency' })}>
            {t('proto.web.seeClosedCase')}
          </Button>
        </div>
        <div className="transparency-ledger">
          {receipt && <LedgerSnippet reference={receipt} />}
          <div className="pay-block">
            <h3>{t('landing.paymentsTitle')}</h3>
            <p>{t('landing.paymentsBody')}</p>
            <PaymentPills />
          </div>
        </div>
      </div>
    </section>
  );
}
