import { DEMO_FX, convertMinor, type DonorNotification } from '@yusr/core';
import type { DonationRecord } from '@yusr/sdk/mock';
import { useState } from 'react';
import { backend, useRead } from '../app/backend';
import { useNow } from '../app/clock';
import { useL, useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { Icon, type IconName } from '../ui/icons';
import { Avatar, Badge, Button, Dialog, EmptyState, type Tone } from '../ui/primitives';
import { LedgerSnippet } from './DonateFlow';

const STATUS_TONE: Partial<Record<DonationRecord['status'], Tone>> = {
  succeeded: 'success',
  awaiting_transfer: 'warning',
  requires_action: 'warning',
  failed: 'urgent',
  refunded: 'slate',
  partially_refunded: 'slate',
};

export function PortalPage() {
  const { t, f } = useT();
  const l = useL();
  const { goWeb } = usePrototype();
  const mine = useRead((read) => read.myDonations());
  const notifications = useRead((read) => read.myNotifications());
  const cases = useRead((read) => read.adminCases());
  const [receipt, setReceipt] = useState<DonationRecord | null>(null);
  const now = useNow();

  const succeeded = mine.filter((donation) => donation.status === 'succeeded');
  const total = succeeded.reduce((sum, donation) => sum + convertMinor(donation.chargedMinor, donation.currency, 'EGP', DEMO_FX), 0);
  const helped = new Set(succeeded.map((donation) => donation.caseId));
  const completed = [...helped].filter((id) => {
    const status = cases.find((item) => item.id === id)?.status;
    return status === 'funded' || status === 'closed';
  }).length;
  const name = l(backend.currentDonor.name) ?? '';

  return (
    <div className="container portal">
      <header className="portal-head">
        <Avatar name={name} size={56} tone={2} />
        <div>
          <p className="eyebrow">{t('portal.title')}</p>
          <h1>{t('portal.greeting', { name })}</h1>
        </div>
      </header>

      <section className="impact-tiles" aria-label={t('portal.impactTitle')}>
        <div className="impact-tile">
          <span>{t('portal.totalGiven')}</span>
          <strong>{f.money(total, 'EGP')}</strong>
        </div>
        <div className="impact-tile">
          <span>{t('portal.casesHelped')}</span>
          <strong>{f.number(helped.size)}</strong>
        </div>
        <div className="impact-tile impact-gold">
          <span>{t('portal.casesCompleted')}</span>
          <strong>{f.number(completed)}</strong>
        </div>
      </section>

      <div className="portal-grid">
        <section className="panel">
          <h2 className="panel-title">
            <Icon name="bell" size={18} /> {t('portal.notifications')}
          </h2>
          {notifications.length === 0 ? (
            <EmptyState icon="bell" title={t('portal.notifications')} />
          ) : (
            <ul className="notification-list">
              {notifications.slice(0, 8).map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  now={now}
                  onOpen={() => goWeb({ page: 'case', slug: notification.caseSlug, tab: notification.kind === 'receipt' ? 'story' : 'transparency' })}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2 className="panel-title">
            <Icon name="receipt" size={18} /> {t('portal.history')}
          </h2>
          {mine.length === 0 ? (
            <EmptyState icon="heart" title={t('portal.empty')} action={<Button onClick={() => goWeb({ page: 'cases' })}>{t('nav.cases')}</Button>} />
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('receipt.date')}</th>
                    <th>{t('receipt.case')}</th>
                    <th className="num">{t('receipt.amount')}</th>
                    <th>{t('receipt.status')}</th>
                    <th>
                      <span className="sr-only">{t('receipt.title')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((donation) => (
                    <tr key={donation.id}>
                      <td>{f.date(donation.createdAt, 'short')}</td>
                      <td>
                        <button type="button" className="title-link" onClick={() => goWeb({ page: 'case', slug: donation.caseSlug })}>
                          {l(donation.caseTitle)}
                        </button>
                        <small className="muted">
                          {t(`payment.methods.${donation.method}`)} · {t(`donationType.${donation.type}`)}
                        </small>
                      </td>
                      <td className="num">{f.money(donation.chargedMinor, donation.currency)}</td>
                      <td>
                        <Badge tone={STATUS_TONE[donation.status] ?? 'neutral'}>{t(`donationStatus.${donation.status}`)}</Badge>
                      </td>
                      <td>
                        <Button size="sm" variant="ghost" icon="receipt" onClick={() => setReceipt(donation)}>
                          {t('common.view')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {receipt && <ReceiptDialog donation={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

const NOTIFICATION_ICON: Record<DonorNotification['kind'], IconName> = {
  receipt: 'receipt',
  funded: 'gift',
  disbursed: 'landmark',
};

function NotificationRow({ notification, now, onOpen }: { notification: DonorNotification; now: number; onOpen: () => void }) {
  const { t, f } = useT();
  const l = useL();
  const title = l(notification.caseTitle) ?? '';
  const text =
    notification.kind === 'funded'
      ? t('portal.notificationFunded', { title })
      : notification.kind === 'disbursed'
        ? t('portal.notificationDisbursed', {
            amount: notification.amountMinor && notification.currency ? f.money(notification.amountMinor, notification.currency) : '',
            payee: l(notification.payee) ?? '',
            title,
          })
        : t('portal.notificationReceipt', { number: notification.receiptNumber ?? '' });
  return (
    <li className={`notification notification-${notification.kind}`}>
      <span className="notification-icon">
        <Icon name={NOTIFICATION_ICON[notification.kind]} size={17} />
      </span>
      <button type="button" className="notification-text" onClick={onOpen}>
        <span>{text}</span>
        <time dateTime={notification.at}>{f.relative(notification.at, now)}</time>
      </button>
    </li>
  );
}

export function ReceiptDialog({ donation, onClose }: { donation: DonationRecord; onClose: () => void }) {
  const { t, f } = useT();
  const l = useL();
  return (
    <Dialog open onClose={onClose} title={t('proto.web.receiptTitle', { number: donation.receiptNumber })} size="sm">
      <div className="receipt">
        <div className="receipt-brand">
          <Icon name="receipt" size={20} />
          <strong>{t('receipt.title')}</strong>
          <span className="mono">{donation.receiptNumber}</span>
        </div>
        <dl className="receipt-list">
          <div>
            <dt>{t('receipt.date')}</dt>
            <dd>{f.dateTime(donation.succeededAt ?? donation.createdAt)}</dd>
          </div>
          <div>
            <dt>{t('receipt.donor')}</dt>
            <dd>{donation.anonymous ? `${l(backend.currentDonor.name)} (${t('case.anonymous')})` : l(backend.currentDonor.name)}</dd>
          </div>
          <div>
            <dt>{t('receipt.case')}</dt>
            <dd>
              {l(donation.caseTitle)} <span className="mono muted">{donation.caseReference}</span>
            </dd>
          </div>
          <div>
            <dt>{t('receipt.method')}</dt>
            <dd>
              {t(`payment.methods.${donation.method}`)} · {t(`payment.providers.${donation.provider}`)}
            </dd>
          </div>
          <div>
            <dt>{t('receipt.amount')}</dt>
            <dd>{f.money(donation.chargedMinor, donation.currency)}</dd>
          </div>
          <div>
            <dt>{t('receipt.fee')}</dt>
            <dd>{f.money(donation.feeMinor, donation.currency)}</dd>
          </div>
          <div className="receipt-net">
            <dt>{t('receipt.net')}</dt>
            <dd>{f.money(donation.netToCaseMinor, donation.caseCurrency)}</dd>
          </div>
          <div>
            <dt>{t('receipt.status')}</dt>
            <dd>{t(`donationStatus.${donation.status}`)}</dd>
          </div>
        </dl>
        {donation.status === 'succeeded' && <LedgerSnippet reference={donation.receiptNumber} />}
        <p className="receipt-note">{t('receipt.note')}</p>
      </div>
    </Dialog>
  );
}
