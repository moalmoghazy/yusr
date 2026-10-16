import { CASE_CATEGORIES, CURRENCY_META, computeProgress, groupDigits, type CaseCategory, type CaseSummary, type CreateDonationResponse } from '@yusr/core';
import { useMemo, useState } from 'react';
import { backend, useRead } from '../app/backend';
import { useNow } from '../app/clock';
import { useL, useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { LogoMark } from '../ui/brand';
import { categoryIcon, CaseCover, CountdownChip, DonationProgress, RegionLabel } from '../ui/case-ui';
import { Icon, type IconName } from '../ui/icons';
import { Avatar, Badge, Button, Segmented, Switch, cx } from '../ui/primitives';
import { METHOD_ICON, useDonationDraft } from '../web/donation';

export function MobileSurface() {
  const { t } = useT();
  const { goAdmin } = usePrototype();
  const features: Array<{ icon: IconName; text: string }> = [
    { icon: 'languages', text: t('proto.mobile.features.rtl') },
    { icon: 'credit-card', text: t('proto.mobile.features.pay') },
    { icon: 'bell', text: t('proto.mobile.features.push') },
    { icon: 'cloud', text: t('proto.mobile.features.offline') },
  ];
  return (
    <div className="mobile-surface">
      <div className="container mobile-layout">
        <section className="mobile-copy">
          <p className="eyebrow">
            <Icon name="smartphone" size={16} /> React Native · Expo
          </p>
          <h1>{t('proto.mobile.title')}</h1>
          <p className="mobile-lead">{t('proto.mobile.body')}</p>
          <ul className="feature-list">
            {features.map((feature) => (
              <li key={feature.icon}>
                <span className="feature-icon">
                  <Icon name={feature.icon} size={18} />
                </span>
                {feature.text}
              </li>
            ))}
          </ul>
          <div className="shared-packages">
            {['@yusr/core', '@yusr/i18n', '@yusr/theme', '@yusr/sdk'].map((name) => (
              <span key={name} className="mono pkg-chip">
                {name}
              </span>
            ))}
          </div>
          <Button variant="outline" icon="kanban" onClick={() => goAdmin({ section: 'finance', financeTab: 'ledger' }, 'u_heba')}>
            {t('proto.surfaces.admin')}
          </Button>
        </section>
        <div className="phone-stage">
          <div className="phone" aria-label={t('proto.mobile.title')}>
            <span className="phone-island" aria-hidden />
            <MobileApp />
          </div>
        </div>
      </div>
    </div>
  );
}

type Tab = 'home' | 'explore' | 'donations' | 'profile';
type Screen =
  { kind: 'case'; slug: string } | { kind: 'success'; response: CreateDonationResponse; slug: string } | { kind: 'pending'; response: CreateDonationResponse };

function MobileApp() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('home');
  const [stack, setStack] = useState<Screen[]>([]);
  const top = stack[stack.length - 1];
  const push = (screen: Screen) => setStack((current) => [...current, screen]);
  const pop = () => setStack((current) => current.slice(0, -1));
  const openCase = (slug: string) => push({ kind: 'case', slug });

  const tabs: Array<{ key: Tab; icon: IconName; label: string }> = [
    { key: 'home', icon: 'home', label: t('mobile.tabs.home') },
    { key: 'explore', icon: 'compass', label: t('mobile.tabs.explore') },
    { key: 'donations', icon: 'heart', label: t('mobile.tabs.donations') },
    { key: 'profile', icon: 'user', label: t('mobile.tabs.profile') },
  ];

  return (
    <div className="m-app">
      <StatusBar />
      <div className="m-body">
        {top?.kind === 'case' && (
          <CaseScreen
            slug={top.slug}
            onBack={pop}
            onDone={(response, pending) =>
              setStack((current) => [...current.slice(0, -1), pending ? { kind: 'pending', response } : { kind: 'success', response, slug: top.slug }])
            }
          />
        )}
        {top?.kind === 'success' && <SuccessScreen response={top.response} onDone={() => setStack([])} />}
        {top?.kind === 'pending' && <PendingScreen response={top.response} onDone={() => setStack([])} />}
        {!top && tab === 'home' && <HomeScreen onOpen={openCase} onExplore={() => setTab('explore')} />}
        {!top && tab === 'explore' && <ExploreScreen onOpen={openCase} />}
        {!top && tab === 'donations' && <DonationsScreen onOpen={openCase} />}
        {!top && tab === 'profile' && <ProfileScreen />}
      </div>
      {!top && (
        <nav className="m-tabbar" aria-label={t('nav.menu')}>
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cx('m-tab', tab === item.key && 'is-active')}
              aria-current={tab === item.key ? 'page' : undefined}
              onClick={() => setTab(item.key)}
            >
              <Icon name={item.icon} size={22} strokeWidth={tab === item.key ? 2.2 : 1.7} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function StatusBar() {
  const { f } = useT();
  const now = useNow();
  const date = new Date(now);
  return (
    <div className="m-status" dir="ltr" aria-hidden>
      <span className="m-time">
        {f.number(date.getHours(), { useGrouping: false })}:{f.number(date.getMinutes(), { minimumIntegerDigits: 2 })}
      </span>
      <span className="m-status-icons">
        <svg width="18" height="11" viewBox="0 0 18 11">
          <rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor" />
          <rect x="5" y="5" width="3" height="6" rx="1" fill="currentColor" />
          <rect x="10" y="2.5" width="3" height="8.5" rx="1" fill="currentColor" />
          <rect x="15" y="0" width="3" height="11" rx="1" fill="currentColor" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity="0.5" />
          <rect x="2" y="2" width="15" height="8" rx="2" fill="currentColor" />
          <rect x="23" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.5" />
        </svg>
      </span>
    </div>
  );
}

function HomeScreen({ onOpen, onExplore }: { onOpen: (slug: string) => void; onExplore: () => void }) {
  const { t, f } = useT();
  const l = useL();
  const now = useNow();
  const urgent = useRead((read) => read.cases({ urgentOnly: true, sort: 'urgent', limit: 5 }).items);
  const close = useRead((read) => read.cases({ sort: 'closest', limit: 4 }).items);
  const notifications = useRead((read) => read.myNotifications().filter((n) => !n.read).length);
  const hour = new Date(now).getHours();
  return (
    <div className="m-screen">
      <header className="m-home-head">
        <div>
          <span className="m-greeting">{hour < 12 ? t('mobile.greetingMorning') : t('mobile.greetingEvening')}</span>
          <strong className="m-name">{l(backend.currentDonor.name)}</strong>
        </div>
        <button type="button" className="m-icon-btn" aria-label={t('portal.notifications')}>
          <Icon name="bell" size={21} />
          {notifications > 0 && <span className="m-dot" />}
        </button>
      </header>
      <button type="button" className="m-search" onClick={onExplore}>
        <Icon name="search" size={18} />
        <span>{t('proto.mobile.search')}</span>
      </button>

      <section className="m-section">
        <div className="m-section-head">
          <h2>{t('mobile.urgentNow')}</h2>
          <button type="button" onClick={onExplore}>
            {t('proto.mobile.viewAll')}
          </button>
        </div>
        <div className="m-carousel">
          {urgent.map((item) => (
            <button key={item.id} type="button" className="m-urgent-card" onClick={() => onOpen(item.slug)}>
              <span className="m-urgent-cover">
                <CaseCover category={item.category} seed={item.coverSeed} />
                <span className="m-urgent-chip">
                  <CountdownChip deadline={item.deadline} />
                </span>
              </span>
              <span className="m-urgent-body">
                <strong>{l(item.title)}</strong>
                <DonationProgress raisedMinor={item.raisedMinor} goalMinor={item.goalMinor} currency={item.currency} size="sm" showAmounts={false} />
                <span className="m-urgent-meta">
                  <RegionLabel code={item.region} />
                  <b>{t('case.percentFunded', { percent: f.percent(computeProgress(item.raisedMinor, item.goalMinor).percent) })}</b>
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="m-chips">
        {CASE_CATEGORIES.map((category) => (
          <span key={category} className="m-chip">
            <Icon name={categoryIcon(category)} size={15} /> {t(`categories.${category}`)}
          </span>
        ))}
      </div>

      <section className="m-section">
        <div className="m-section-head">
          <h2>{t('mobile.forYou')}</h2>
        </div>
        <div className="m-list">
          {close.map((item) => (
            <CaseRow key={item.id} item={item} onOpen={onOpen} />
          ))}
        </div>
      </section>

      <ImpactBanner />
    </div>
  );
}

function ImpactBanner() {
  const { t } = useT();
  const count = useRead(
    (read) =>
      new Set(
        read
          .myDonations()
          .filter((d) => d.status === 'succeeded')
          .map((d) => d.caseId),
      ).size,
  );
  return (
    <div className="m-impact">
      <LogoMark size={34} bowl="currentColor" />
      <div>
        <strong>{t('proto.mobile.impactTitle')}</strong>
        <span>{t('proto.mobile.impactBody', { count: t('units.cases', { count }) })}</span>
      </div>
    </div>
  );
}

function CaseRow({ item, onOpen }: { item: CaseSummary; onOpen: (slug: string) => void }) {
  const { t, f } = useT();
  const l = useL();
  const progress = computeProgress(item.raisedMinor, item.goalMinor);
  return (
    <button type="button" className="m-row" onClick={() => onOpen(item.slug)}>
      <span className="m-row-thumb">
        <CaseCover category={item.category} seed={item.coverSeed} />
      </span>
      <span className="m-row-body">
        <strong>{l(item.title)}</strong>
        <DonationProgress raisedMinor={item.raisedMinor} goalMinor={item.goalMinor} currency={item.currency} size="sm" showAmounts={false} />
        <span className="m-row-meta">
          <span>
            {t('case.remaining')} {f.money(progress.remainingMinor, item.currency, { fractionDigits: 0 })}
          </span>
          <b>{f.percent(progress.percent)}</b>
        </span>
      </span>
    </button>
  );
}

function ExploreScreen({ onOpen }: { onOpen: (slug: string) => void }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<CaseCategory | null>(null);
  const page = useRead((read) => read.cases({ q, categories: category ? [category] : [], limit: 30 }));
  return (
    <div className="m-screen">
      <h1 className="m-title">{t('mobile.tabs.explore')}</h1>
      <label className="m-search m-search-input">
        <Icon name="search" size={18} />
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('proto.mobile.search')} aria-label={t('common.search')} />
      </label>
      <div className="m-chips">
        <button type="button" className={cx('m-chip', !category && 'is-active')} onClick={() => setCategory(null)}>
          {t('common.all')}
        </button>
        {CASE_CATEGORIES.map((value) => (
          <button key={value} type="button" className={cx('m-chip', category === value && 'is-active')} onClick={() => setCategory(value)}>
            <Icon name={categoryIcon(value)} size={15} /> {t(`categories.${value}`)}
          </button>
        ))}
      </div>
      <p className="m-count">{t('units.results', { count: page.total })}</p>
      <div className="m-list">
        {page.items.map((item) => (
          <CaseRow key={item.id} item={item} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function CaseScreen({ slug, onBack, onDone }: { slug: string; onBack: () => void; onDone: (response: CreateDonationResponse, pending: boolean) => void }) {
  const { t, f } = useT();
  const l = useL();
  const item = useRead((read) => read.caseBySlug(slug));
  const [sheet, setSheet] = useState(false);
  if (!item) return null;
  const story = (l(item.story) ?? '').split('\n\n');
  return (
    <div className="m-screen m-case">
      <div className="m-case-cover">
        <CaseCover category={item.category} seed={item.coverSeed} />
        <button type="button" className="m-back" onClick={onBack} aria-label={t('common.back')}>
          <Icon name="back" size={20} />
        </button>
      </div>
      <div className="m-case-body">
        <div className="m-badges">
          <Badge tone="primary" icon="shield-check">
            {t('case.verified')}
          </Badge>
          {item.zakatEligible && (
            <Badge tone="gold" icon="coins">
              {t('case.zakatEligible')}
            </Badge>
          )}
        </div>
        <h1>{l(item.title)}</h1>
        <p className="m-case-meta">
          <RegionLabel code={item.region} /> · <span className="mono">{item.reference}</span>
        </p>
        <DonationProgress raisedMinor={item.raisedMinor} goalMinor={item.goalMinor} currency={item.currency} donors={item.donorsCount} />
        {item.isUrgent && item.status === 'published' && (
          <div className="m-urgent-line">
            <CountdownChip deadline={item.deadline} />
            <span>{t('case.endsIn')}</span>
          </div>
        )}
        <h2>{t('case.story')}</h2>
        <p className="m-story">{story[0]}</p>
        <h2>{t('case.verification')}</h2>
        <ol className="m-steps">
          {item.timeline.slice(-4).map((event, index) => (
            <li key={index}>
              <span className="m-step-dot" />
              <span>
                <strong>{t(`case.timeline.${event.kind}`)}</strong>
                <small>{f.date(event.at, 'short')}</small>
              </span>
            </li>
          ))}
        </ol>
        <h2>{t('case.disbursementPlan')}</h2>
        <ul className="m-plan">
          {item.disbursements.map((line) => (
            <li key={line.id}>
              <span>{l(line.payee)}</span>
              <strong>{f.money(line.amountMinor, item.currency)}</strong>
            </li>
          ))}
        </ul>
      </div>
      {item.status === 'published' && (
        <div className="m-cta">
          <Button block size="lg" icon="heart" onClick={() => setSheet(true)}>
            {t('case.donateCta')}
          </Button>
        </div>
      )}
      {sheet && (
        <DonateSheet
          item={item}
          onClose={() => setSheet(false)}
          onDone={(response, pending) => {
            setSheet(false);
            onDone(response, pending);
          }}
        />
      )}
    </div>
  );
}

function DonateSheet({
  item,
  onClose,
  onDone,
}: {
  item: CaseSummary;
  onClose: () => void;
  onDone: (response: CreateDonationResponse, pending: boolean) => void;
}) {
  const { t, f, locale } = useT();
  const draft = useDonationDraft(item, { channel: 'mobile', locale });
  const [processing, setProcessing] = useState(false);
  const quick = CURRENCY_META[item.currency].quickAmounts;
  const methods = useMemo(() => {
    const ordered = [...draft.methods];
    const apple = ordered.indexOf('apple_pay');
    if (apple > 0) ordered.unshift(...ordered.splice(apple, 1));
    return ordered;
  }, [draft.methods]);

  const pay = () => {
    const response = draft.submit();
    if (response.action.type === 'fawry_reference' || response.action.type === 'bank_transfer') {
      onDone(response, true);
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      backend.completePayment(response.donationId, 'success');
      onDone(response, false);
    }, 1_400);
  };

  return (
    <div className="m-sheet-root">
      <div className="m-sheet-overlay" onClick={onClose} aria-hidden />
      <div className="m-sheet" role="dialog" aria-modal="true" aria-label={t('proto.mobile.donateSheetTitle')}>
        <span className="m-grabber" aria-hidden />
        {processing ? (
          <div className="processing">
            <span className="processing-ring" />
            <p>{t('proto.web.processingGateway')}</p>
          </div>
        ) : (
          <>
            <div className="m-sheet-head">
              <h2>{t('proto.mobile.donateSheetTitle')}</h2>
              <button type="button" className="m-icon-btn" onClick={onClose} aria-label={t('common.close')}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="m-amounts">
              {quick.map((amount) => {
                const selected = draft.amountMinor === amount * 100;
                return (
                  <button
                    key={amount}
                    type="button"
                    className={cx('m-amount', selected && 'is-selected')}
                    onClick={() => draft.setAmountInput(f.number(amount, { useGrouping: false }))}
                  >
                    {f.number(amount)}
                  </button>
                );
              })}
            </div>
            <Switch
              checked={draft.coverFees}
              onChange={draft.setCoverFees}
              label={t('donate.coverFees', { fee: f.money(draft.coverPreview, draft.currency) })}
            />
            <span className="m-label">{t('proto.mobile.payWith')}</span>
            <div className="m-methods" role="radiogroup">
              {methods.map((method) => (
                <button
                  key={method}
                  type="button"
                  role="radio"
                  aria-checked={draft.method === method}
                  className={cx('m-method', draft.method === method && 'is-selected', method === 'apple_pay' && 'm-method-apple')}
                  onClick={() => draft.setMethod(method)}
                >
                  <Icon name={METHOD_ICON[method]} size={18} />
                  <span>{t(`payment.methods.${method}`)}</span>
                  {draft.method === method && <Icon name="check" size={16} strokeWidth={2.4} className="m-method-check" />}
                </button>
              ))}
            </div>
            <Button
              block
              size="lg"
              icon={draft.method === 'apple_pay' ? 'scan-face' : 'lock'}
              disabled={!draft.canContinue}
              onClick={pay}
              className={draft.method === 'apple_pay' ? 'm-pay-apple' : undefined}
            >
              {t('donate.pay', { amount: draft.breakdown ? f.money(draft.breakdown.chargedMinor, draft.currency) : '' })}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessScreen({ response, onDone }: { response: CreateDonationResponse; onDone: () => void }) {
  const { t, f } = useT();
  return (
    <div className="m-screen m-result">
      <span className="result-icon">
        <Icon name="check" size={34} strokeWidth={2.4} />
      </span>
      <h1>{t('donate.successTitle')}</h1>
      <p>{t('donate.successBody', { amount: f.money(response.breakdown.netToCaseMinor, response.breakdown.caseCurrency) })}</p>
      <div className="m-receipt">
        <span>{t('donate.receiptNumber')}</span>
        <strong className="mono">{response.receiptNumber}</strong>
      </div>
      <Button block size="lg" onClick={onDone}>
        {t('proto.mobile.done')}
      </Button>
    </div>
  );
}

function PendingScreen({ response, onDone }: { response: CreateDonationResponse; onDone: () => void }) {
  const { t, f } = useT();
  const action = response.action;
  return (
    <div className="m-screen m-result">
      <span className="result-icon result-pending">
        <Icon name={action.type === 'fawry_reference' ? 'store' : 'landmark'} size={30} />
      </span>
      <h1>{action.type === 'fawry_reference' ? t('donate.fawryTitle') : t('donate.instapayTitle')}</h1>
      <div className="m-receipt">
        <span>{action.type === 'fawry_reference' ? t('donate.fawryReference') : t('donate.instapayAddress')}</span>
        <strong className="mono">
          {action.type === 'fawry_reference' ? groupDigits(action.referenceNumber) : action.type === 'bank_transfer' ? action.ipa : ''}
        </strong>
        <span>{f.money(response.breakdown.chargedMinor, response.breakdown.currency)}</span>
      </div>
      <p>{action.type === 'fawry_reference' ? t('donate.fawryBody') : t('donate.instapayBody')}</p>
      <Button block size="lg" onClick={onDone}>
        {t('proto.mobile.done')}
      </Button>
    </div>
  );
}

function DonationsScreen({ onOpen }: { onOpen: (slug: string) => void }) {
  const { t, f } = useT();
  const l = useL();
  const now = useNow();
  const mine = useRead((read) => read.myDonations());
  const notifications = useRead((read) => read.myNotifications().slice(0, 3));
  return (
    <div className="m-screen">
      <h1 className="m-title">{t('mobile.tabs.donations')}</h1>
      {notifications.length > 0 && (
        <div className="m-notes">
          {notifications.map((notification) => (
            <button key={notification.id} type="button" className={cx('m-note', `m-note-${notification.kind}`)} onClick={() => onOpen(notification.caseSlug)}>
              <Icon name={notification.kind === 'receipt' ? 'receipt' : notification.kind === 'funded' ? 'gift' : 'landmark'} size={17} />
              <span>
                {notification.kind === 'funded'
                  ? t('portal.notificationFunded', { title: l(notification.caseTitle) ?? '' })
                  : notification.kind === 'disbursed'
                    ? t('portal.notificationDisbursed', {
                        amount: notification.amountMinor && notification.currency ? f.money(notification.amountMinor, notification.currency) : '',
                        payee: l(notification.payee) ?? '',
                        title: l(notification.caseTitle) ?? '',
                      })
                    : t('portal.notificationReceipt', { number: notification.receiptNumber ?? '' })}
                <small>{f.relative(notification.at, now)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="m-list">
        {mine.map((donation) => (
          <button key={donation.id} type="button" className="m-gift" onClick={() => onOpen(donation.caseSlug)}>
            <span className="m-gift-icon">
              <Icon name={METHOD_ICON[donation.method]} size={18} />
            </span>
            <span className="m-gift-body">
              <strong>{l(donation.caseTitle)}</strong>
              <small>
                {f.date(donation.createdAt, 'short')} · {t(`donationStatus.${donation.status}`)}
              </small>
            </span>
            <b>{f.money(donation.amountMinor, donation.currency)}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProfileScreen() {
  const { t } = useT();
  const l = useL();
  const { locale, setLocale, colorMode, setColorMode } = usePrototype();
  const [push, setPush] = useState(true);
  const dark = colorMode === 'dark' || (colorMode === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return (
    <div className="m-screen">
      <div className="m-profile">
        <Avatar name={l(backend.currentDonor.name) ?? ''} size={64} tone={2} />
        <strong>{l(backend.currentDonor.name)}</strong>
        <span className="mono">{backend.currentDonor.email}</span>
      </div>
      <div className="m-settings">
        <span className="m-label">{t('mobile.settings')}</span>
        <div className="m-setting">
          <span>
            <Icon name="languages" size={18} /> {t('nav.language')}
          </span>
          <Segmented
            size="sm"
            label={t('nav.language')}
            value={locale}
            onChange={setLocale}
            options={[
              { value: 'ar', label: 'العربية' },
              { value: 'en', label: 'English' },
            ]}
          />
        </div>
        <p className="m-hint">{t('proto.mobile.restartNote')}</p>
        <div className="m-setting">
          <Switch checked={Boolean(dark)} onChange={(on) => setColorMode(on ? 'dark' : 'light')} label={t('mobile.darkMode')} />
        </div>
        <div className="m-setting">
          <Switch checked={push} onChange={setPush} label={t('mobile.notifications')} />
        </div>
        <button type="button" className="m-setting m-link">
          <span>
            <Icon name="message" size={18} /> {t('mobile.support')}
          </span>
          <Icon name="forward" size={16} />
        </button>
        <div className="m-setting">
          <span>
            <Icon name="info" size={18} /> {t('proto.mobile.version')}
          </span>
          <span className="mono muted">1.0.0 · Expo SDK 54</span>
        </div>
      </div>
    </div>
  );
}
