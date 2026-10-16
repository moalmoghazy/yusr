import { CURRENCY_META, computeProgress, parseAmountInput, toMinor, type CaseDetail, type TimelineKind } from '@yusr/core';
import { useState } from 'react';
import { useRead } from '../app/backend';
import { useNow } from '../app/clock';
import { useL, useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { CaseCover, CategoryBadge, CountdownBlocks, DonationProgress, RegionLabel, VerifiedBadge, ZakatBadge } from '../ui/case-ui';
import { Icon, type IconName } from '../ui/icons';
import { Avatar, Badge, Button, CopyButton, EmptyState, Tabs, cx } from '../ui/primitives';
import { useDonate } from './WebApp';

type CaseTab = 'story' | 'verification' | 'documents' | 'transparency' | 'updates' | 'donors';

export function CaseDetailPage({ slug, initialTab }: { slug: string; initialTab?: string }) {
  const { t } = useT();
  const l = useL();
  const { goWeb } = usePrototype();
  const item = useRead((read) => read.caseBySlug(slug));
  const [tab, setTab] = useState<CaseTab>((initialTab as CaseTab) ?? 'story');
  const now = useNow();
  const { f } = useT();

  if (!item) {
    return (
      <div className="container">
        <EmptyState title={t('case.notFound')} action={<Button onClick={() => goWeb({ page: 'cases' })}>{t('nav.cases')}</Button>} />
      </div>
    );
  }

  const tabs: Array<{ value: CaseTab; label: string; count?: string }> = [
    { value: 'story', label: t('case.story') },
    { value: 'verification', label: t('case.verification') },
    { value: 'documents', label: t('case.documents'), count: f.number(item.documents.length) },
    { value: 'transparency', label: t('case.transparency') },
    { value: 'updates', label: t('case.updates'), count: item.updates.length ? f.number(item.updates.length) : undefined },
    { value: 'donors', label: t('case.donorsTab') },
  ];

  return (
    <article className="container case-page">
      <nav className="breadcrumb" aria-label="breadcrumb">
        <button type="button" onClick={() => goWeb({ page: 'cases' })}>
          {t('nav.cases')}
        </button>
        <Icon name="forward" size={14} />
        <span aria-current="page">{item.reference}</span>
      </nav>
      <header className="case-head">
        <div className="badge-row">
          <CategoryBadge category={item.category} />
          {item.verifiedAt && <VerifiedBadge />}
          {item.zakatEligible && <ZakatBadge />}
          {item.isUrgent && item.status === 'published' && (
            <Badge tone="urgent" icon="zap">
              {t('case.urgent')}
            </Badge>
          )}
        </div>
        <h1>{l(item.title)}</h1>
        <p className="case-meta">
          <RegionLabel code={item.region} />
          <span className="dot-sep" aria-hidden>
            ·
          </span>
          <span>
            {t('case.reference')} <span className="mono">{item.reference}</span>
          </span>
          {item.publishedAt && (
            <>
              <span className="dot-sep" aria-hidden>
                ·
              </span>
              <span>{f.relative(item.publishedAt, now)}</span>
            </>
          )}
        </p>
      </header>

      <div className="case-layout">
        <div className="case-main">
          <div className="case-cover-wrap">
            <CaseCover category={item.category} seed={item.coverSeed} label={t(`categories.${item.category}`)} />
          </div>
          <Tabs tabs={tabs} value={tab} onChange={setTab} label={l(item.title) ?? ''} className="case-tabs" />
          <div className="tab-panel" role="tabpanel">
            {tab === 'story' && <StoryPanel item={item} />}
            {tab === 'verification' && <VerificationPanel item={item} />}
            {tab === 'documents' && <DocumentsPanel item={item} />}
            {tab === 'transparency' && <TransparencyPanel item={item} />}
            {tab === 'updates' && <UpdatesPanel item={item} />}
            {tab === 'donors' && <DonorsPanel item={item} />}
          </div>
        </div>
        <aside className="case-aside">
          <DonatePanel item={item} onTransparency={() => setTab('transparency')} />
        </aside>
      </div>
    </article>
  );
}

function DonatePanel({ item, onTransparency }: { item: CaseDetail; onTransparency: () => void }) {
  const { t, f } = useT();
  const donate = useDonate();
  const [custom, setCustom] = useState('');
  const progress = computeProgress(item.raisedMinor, item.goalMinor);
  const quick = CURRENCY_META[item.currency].quickAmounts;
  const customMajor = parseAmountInput(custom);
  return (
    <div className="donate-panel">
      <DonationProgress raisedMinor={item.raisedMinor} goalMinor={item.goalMinor} currency={item.currency} donors={item.donorsCount} size="lg" />
      {item.isUrgent && item.status === 'published' && <CountdownBlocks deadline={item.deadline} />}
      {item.status === 'published' ? (
        <>
          <div className="panel-amounts" role="group" aria-label={t('case.quickDonate')}>
            {quick.map((amount) => (
              <button key={amount} type="button" className="amount-tile amount-tile-sm" onClick={() => donate(item, amount * 100)}>
                <strong>{f.number(amount)}</strong>
                <small>{f.currencyLabel(item.currency)}</small>
              </button>
            ))}
          </div>
          <div className="panel-custom">
            <input
              className="input"
              inputMode="decimal"
              placeholder={t('donate.customAmount')}
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              aria-label={t('donate.customAmount')}
            />
            <span className="amount-suffix">{f.currencyLabel(item.currency)}</span>
          </div>
          <Button size="lg" block icon="heart" onClick={() => donate(item, customMajor ? toMinor(customMajor, item.currency) : undefined)}>
            {t('case.donateCta')}
          </Button>
          <p className="panel-note">
            <Icon name="landmark" size={14} /> {t('case.paidDirectly')}
          </p>
        </>
      ) : item.status === 'paused' ? (
        <p className="notice notice-warning">
          <Icon name="pause" size={16} /> {t('case.pausedNotice')}
        </p>
      ) : (
        <>
          <p className="notice notice-gold">
            <Icon name="gift" size={16} /> {progress.isFunded ? t('case.fundedNotice') : t('proto.web.fundedAlready')}
          </p>
          <Button variant="outline" block icon="receipt" onClick={onTransparency}>
            {t('case.transparency')}
          </Button>
        </>
      )}
      <div className="panel-share">
        <span>{t('common.share')}</span>
        <CopyButton value={`yusr.example/c/${item.reference}`} label={t('common.copy')} copiedLabel={t('common.copied')} />
      </div>
    </div>
  );
}

function StoryPanel({ item }: { item: CaseDetail }) {
  const { t } = useT();
  const l = useL();
  return (
    <div className="story">
      <p className="beneficiary">
        <Icon name="user" size={16} /> <span>{t('case.beneficiary')}:</span> <strong>{l(item.beneficiary)}</strong>
      </p>
      {(l(item.story) ?? '').split('\n\n').map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      <div className="callout">
        <Icon name="shield-check" size={20} />
        <div>
          <strong>{t('case.verified')}</strong>
          <p>{t('statusHints.field_verified')}</p>
        </div>
      </div>
    </div>
  );
}

const TIMELINE_ICON: Record<TimelineKind, IconName> = {
  submitted: 'file-text',
  review_started: 'eye',
  visit_scheduled: 'calendar',
  visit_completed: 'map-pin',
  documents_verified: 'shield-check',
  published: 'send',
  funded: 'gift',
  disbursed: 'landmark',
  closed: 'check',
};

function VerificationPanel({ item }: { item: CaseDetail }) {
  const { t, f } = useT();
  const l = useL();
  return (
    <ol className="timeline">
      {item.timeline.map((event, index) => (
        <li key={`${event.kind}-${index}`} className={cx('timeline-item', `timeline-${event.kind}`)}>
          <span className="timeline-icon">
            <Icon name={TIMELINE_ICON[event.kind]} size={16} />
          </span>
          <div className="timeline-body">
            <strong>{t(`case.timeline.${event.kind}`)}</strong>
            <span className="timeline-meta">
              {l(event.actor)} · <time dateTime={event.at}>{f.dateTime(event.at)}</time>
            </span>
            {event.note && <p>{l(event.note)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function DocumentsPanel({ item }: { item: CaseDetail }) {
  const { t, f } = useT();
  const l = useL();
  return (
    <div>
      <p className="notice notice-info">
        <Icon name="eye-off" size={16} /> {t('case.redactedNotice')}
      </p>
      <div className="doc-grid">
        {item.documents.map((document, index) => (
          <figure key={document.id} className="doc-card">
            <RedactedDoc seed={index + item.coverSeed} />
            <figcaption>
              <strong>{t(`case.documentKinds.${document.kind}`)}</strong>
              <span>
                {t('units.pages', { count: document.pages })} · {f.date(document.issuedAt, 'short')}
              </span>
              <span className="doc-verified">
                <Icon name="shield-check" size={13} /> {t('case.verifiedBy')} {l(document.verifiedBy)}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/** A thumbnail of a redacted page: text lines, black redaction bars and a verification stamp. */
function RedactedDoc({ seed }: { seed: number }) {
  const { t } = useT();
  const lines = Array.from({ length: 11 }, (_, index) => 30 + ((seed * 13 + index * 29) % 55));
  return (
    <svg viewBox="0 0 120 150" className="redacted-doc" role="img" aria-label={t('case.redacted')}>
      <rect x="1" y="1" width="118" height="148" rx="6" className="doc-page" />
      <rect x="12" y="12" width="46" height="7" rx="2" className="doc-heading" />
      {lines.map((width, index) => (
        <rect key={index} x={120 - 12 - width} y={28 + index * 9.5} width={width} height="4" rx="2" className="doc-line" />
      ))}
      <rect x="40" y="36.5" width="52" height="7" rx="1.5" className="doc-redact" />
      <rect x="60" y="74.5" width="38" height="7" rx="1.5" className="doc-redact" />
      <circle cx="30" cy="124" r="13" className="doc-stamp" />
      <path d="m24 124 4.5 4.5 8-9" className="doc-stamp-check" />
    </svg>
  );
}

function TransparencyPanel({ item }: { item: CaseDetail }) {
  const { t, f } = useT();
  const l = useL();
  const total = item.disbursements.reduce((sum, line) => sum + line.amountMinor, 0) || item.goalMinor;
  const paid = item.disbursements.filter((line) => line.status === 'paid').reduce((sum, line) => sum + line.amountMinor, 0);
  return (
    <div className="transparency-panel">
      <div className="split-bar" role="img" aria-label={t('case.disbursementPlan')}>
        {item.disbursements.map((line, index) => (
          <span
            key={line.id}
            className={cx('split-seg', `split-${index % 3}`, line.status === 'paid' && 'is-paid')}
            style={{ flexGrow: line.amountMinor / total }}
            title={`${l(line.payee)} — ${f.money(line.amountMinor, item.currency)}`}
          />
        ))}
      </div>
      <div className="split-summary">
        <span>
          {t('case.disbursementPlan')}: <strong>{f.money(total, item.currency)}</strong>
        </span>
        <span>
          {t('case.disbursement.paid')}: <strong>{f.money(paid, item.currency)}</strong>
        </span>
      </div>
      <table className="table plan-table">
        <thead>
          <tr>
            <th>{t('admin.finance.columns.payee')}</th>
            <th>{t('admin.finance.columns.purpose')}</th>
            <th className="num">{t('admin.finance.columns.amount')}</th>
            <th>{t('admin.finance.columns.status')}</th>
          </tr>
        </thead>
        <tbody>
          {item.disbursements.map((line, index) => (
            <tr key={line.id}>
              <td>
                <span className="payee">
                  <span className={cx('legend-swatch', `split-${index % 3}`)} aria-hidden />
                  <span>
                    <strong>{l(line.payee)}</strong>
                    <small>{t(`case.payees.${line.payeeType}`)}</small>
                  </span>
                </span>
              </td>
              <td>{l(line.purpose)}</td>
              <td className="num">{f.money(line.amountMinor, item.currency)}</td>
              <td>
                <Badge
                  tone={line.status === 'paid' ? 'success' : line.status === 'approved' ? 'info' : 'neutral'}
                  icon={line.status === 'paid' ? 'check' : undefined}
                >
                  {t(`case.disbursement.${line.status}`)}
                </Badge>
                {line.paidAt && <small className="paid-at">{f.date(line.paidAt, 'short')}</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="panel-note">
        <Icon name="landmark" size={14} /> {t('case.paidDirectly')}
      </p>
    </div>
  );
}

function UpdatesPanel({ item }: { item: CaseDetail }) {
  const { t, f } = useT();
  const l = useL();
  if (item.updates.length === 0) return <EmptyState icon="bell" title={t('case.updates')} />;
  return (
    <ul className="updates">
      {item.updates.map((update) => (
        <li key={update.id}>
          <time dateTime={update.at}>{f.date(update.at)}</time>
          <p>{l(update.body)}</p>
        </li>
      ))}
    </ul>
  );
}

function DonorsPanel({ item }: { item: CaseDetail }) {
  const { t, f } = useT();
  const now = useNow();
  if (item.recentDonations.length === 0) return <EmptyState icon="heart" title={t('case.noDonationsYet')} />;
  return (
    <ul className="donor-list">
      {item.recentDonations.map((donation) => {
        const name = donation.displayName ?? t('case.anonymous');
        return (
          <li key={donation.id}>
            <Avatar name={donation.displayName ?? '♥'} size={34} />
            <span className="donor-name">{name}</span>
            <strong>{f.money(donation.amountMinor, item.currency)}</strong>
            <time dateTime={donation.createdAt}>{f.relative(donation.createdAt, now)}</time>
          </li>
        );
      })}
    </ul>
  );
}
