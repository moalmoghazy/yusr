import { computeProgress, type LedgerKind } from '@yusr/core';
import type { DonationRecord } from '@yusr/sdk/mock';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRead } from '../app/backend';
import { useNow } from '../app/clock';
import { useL, useT } from '../app/i18n';
import { Icon } from '../ui/icons';
import { Badge, Button, Chip, EmptyState, Input, Select, Tabs, Textarea, cx, type Tone } from '../ui/primitives';
import { AccountName } from '../web/DonateFlow';
import { PermissionHint, useAdmin } from './common';

type FinanceTab = 'ledger' | 'donations' | 'reconciliation' | 'payouts' | 'refunds';

export function FinanceSection({ initialTab }: { initialTab?: string }) {
  const { t, f } = useT();
  const [tab, setTab] = useState<FinanceTab>((initialTab as FinanceTab) ?? 'ledger');
  const awaiting = useRead((read) => read.donations({ status: 'awaiting_transfer' }).length);
  const openRefunds = useRead((read) => read.refunds().filter((refund) => refund.status === 'requested').length);
  const openPayouts = useRead((read) => read.payouts().filter((payout) => payout.status === 'requested' || payout.status === 'approved').length);
  return (
    <div className="admin-stack">
      <Tabs
        label={t('admin.nav.finance')}
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'ledger', label: t('admin.finance.ledger'), icon: 'book-open' },
          { value: 'donations', label: t('admin.finance.donations'), icon: 'heart' },
          { value: 'reconciliation', label: t('admin.finance.reconciliation'), icon: 'landmark', count: awaiting ? f.number(awaiting) : undefined },
          { value: 'payouts', label: t('admin.finance.payouts'), icon: 'send', count: openPayouts ? f.number(openPayouts) : undefined },
          { value: 'refunds', label: t('admin.finance.refunds'), icon: 'refresh', count: openRefunds ? f.number(openRefunds) : undefined },
        ]}
      />
      {tab === 'ledger' && <LedgerTab />}
      {tab === 'donations' && <DonationsTab />}
      {tab === 'reconciliation' && <ReconciliationTab />}
      {tab === 'payouts' && <PayoutsTab />}
      {tab === 'refunds' && <RefundsTab />}
    </div>
  );
}

const KIND_TONE: Record<LedgerKind, Tone> = { donation: 'primary', refund: 'urgent', payout: 'gold', settlement: 'info', platform_fee: 'info' };

function LedgerTab() {
  const { t, f } = useT();
  const now = useNow();
  const [kind, setKind] = useState<LedgerKind | 'all'>('all');
  const lines = useRead((read) => read.ledger({ limit: 60, kind: kind === 'all' ? undefined : kind }));
  const balance = useRead((read) => read.ledgerBalance());
  const accounts = useRead((read) => read.accountBalances());
  const seen = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => {
    const known = seen.current;
    return new Set(known ? lines.filter((line) => !known.has(line.id)).map((line) => line.id) : []);
  }, [lines]);
  useEffect(() => {
    seen.current = new Set(lines.map((line) => line.id));
  }, [lines]);

  const topAccounts = accounts
    .filter((entry) => !entry.account.startsWith('liability:case') && !entry.account.startsWith('equity'))
    .sort((a, b) => Math.abs(b.balanceMinor) - Math.abs(a.balanceMinor))
    .slice(0, 6);
  const caseFunds = accounts
    .filter((entry) => entry.account.startsWith('liability:case'))
    .reduce((sum, entry) => sum + (entry.currency === 'EGP' ? entry.balanceMinor : 0), 0);

  return (
    <div className="admin-stack">
      <div className="balance-strip">
        {balance.byCurrency.map((entry) => (
          <div key={entry.currency} className="balance-cell">
            <span className="balance-cur">{entry.currency}</span>
            <span>
              {t('admin.finance.columns.debit')} <strong>{f.money(entry.debitMinor, entry.currency, { compact: true, showCurrency: false })}</strong>
            </span>
            <span>
              {t('admin.finance.columns.credit')} <strong>{f.money(entry.creditMinor, entry.currency, { compact: true, showCurrency: false })}</strong>
            </span>
            <Badge tone={entry.debitMinor === entry.creditMinor ? 'success' : 'urgent'} icon="check">
              {t('proto.admin.debitsCredits')}
            </Badge>
          </div>
        ))}
      </div>
      <section className="panel">
        <h2 className="panel-title">{t('proto.admin.balances')}</h2>
        <div className="account-chips">
          <div className="account-chip account-chip-strong">
            <span>{t('admin.finance.accounts.case')} (EGP)</span>
            <strong>{f.money(caseFunds, 'EGP', { fractionDigits: 0 })}</strong>
          </div>
          {topAccounts.map((entry) => (
            <div key={`${entry.account}-${entry.currency}`} className="account-chip">
              <AccountName account={entry.account} />
              <strong>{f.money(entry.balanceMinor, entry.currency, { fractionDigits: 0 })}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2 className="panel-title">
            <span className="live-dot-small" /> {t('proto.admin.liveLedger')}
          </h2>
          <div className="chip-row">
            {(['all', 'donation', 'settlement', 'payout', 'refund'] as const).map((value) => (
              <Chip key={value} selected={kind === value} onClick={() => setKind(value)}>
                {value === 'all' ? t('proto.admin.filterAll') : t(`proto.admin.ledgerKinds.${value}`)}
              </Chip>
            ))}
          </div>
        </div>
        <div className="table-scroll">
          <table className="table ledger-table">
            <thead>
              <tr>
                <th>{t('admin.finance.columns.time')}</th>
                <th>{t('admin.finance.columns.txn')}</th>
                <th>{t('admin.finance.columns.account')}</th>
                <th className="num">{t('admin.finance.columns.debit')}</th>
                <th className="num">{t('admin.finance.columns.credit')}</th>
                <th>{t('admin.finance.columns.reference')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className={cx(fresh.has(line.id) && 'is-new')}>
                  <td className="nowrap">{f.relative(line.at, now)}</td>
                  <td>
                    <Badge tone={KIND_TONE[line.kind]}>{t(`proto.admin.ledgerKinds.${line.kind}`)}</Badge>
                  </td>
                  <td>
                    <AccountName account={line.account} />
                  </td>
                  <td className="num">{line.direction === 'debit' ? f.money(line.amountMinor, line.currency) : ''}</td>
                  <td className="num">{line.direction === 'credit' ? f.money(line.amountMinor, line.currency) : ''}</td>
                  <td className="mono muted">{line.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const STATUS_TONE: Partial<Record<DonationRecord['status'], Tone>> = {
  succeeded: 'success',
  awaiting_transfer: 'warning',
  requires_action: 'warning',
  failed: 'urgent',
  refunded: 'slate',
  partially_refunded: 'slate',
};

function DonationsTab() {
  const { t, f } = useT();
  const l = useL();
  const now = useNow();
  const { can, api, run } = useAdmin();
  const donations = useRead((read) => read.donations().slice(0, 40));
  const [refundFor, setRefundFor] = useState<DonationRecord | null>(null);
  const [reason, setReason] = useState('');
  return (
    <section className="panel">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>{t('admin.finance.columns.time')}</th>
              <th>{t('admin.finance.columns.reference')}</th>
              <th>{t('admin.finance.columns.donor')}</th>
              <th>{t('admin.finance.columns.case')}</th>
              <th>{t('admin.finance.columns.method')}</th>
              <th className="num">{t('admin.finance.columns.amount')}</th>
              <th className="num">{t('admin.finance.columns.fee')}</th>
              <th className="num">{t('admin.finance.columns.net')}</th>
              <th>{t('admin.finance.columns.status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {donations.map((donation) => (
              <tr key={donation.id}>
                <td className="nowrap">{f.relative(donation.createdAt, now)}</td>
                <td className="mono">{donation.receiptNumber}</td>
                <td>
                  {donation.donorName ?? '—'}
                  {donation.anonymous && <small className="muted">{t('case.anonymous')}</small>}
                </td>
                <td className="cell-clip">{l(donation.caseTitle)}</td>
                <td className="nowrap">
                  {t(`payment.methods.${donation.method}`)}
                  <small className="muted">
                    {t(`payment.providers.${donation.provider}`)} · {donation.channel}
                  </small>
                </td>
                <td className="num">{f.money(donation.chargedMinor, donation.currency)}</td>
                <td className="num muted">{f.money(donation.feeMinor, donation.currency)}</td>
                <td className="num">{f.money(donation.netToCaseMinor, donation.caseCurrency)}</td>
                <td>
                  <Badge tone={STATUS_TONE[donation.status] ?? 'neutral'}>{t(`donationStatus.${donation.status}`)}</Badge>
                </td>
                <td>
                  {donation.status === 'succeeded' && can('finance:refunds') && (
                    <Button size="sm" variant="ghost" icon="refresh" onClick={() => setRefundFor(donation)}>
                      {t('admin.finance.requestRefund')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {refundFor && (
        <div className="inline-form">
          <strong>
            {t('admin.finance.requestRefund')} · <span className="mono">{refundFor.receiptNumber}</span> · {f.money(refundFor.chargedMinor, refundFor.currency)}
          </strong>
          <Textarea
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('proto.admin.refundReasonPlaceholder')}
            aria-label={t('proto.admin.refundReason')}
          />
          <div className="action-row">
            <Button
              size="sm"
              disabled={reason.trim().length < 5}
              onClick={async () => {
                const done = await run(() => api.requestRefund(refundFor.id, reason), t('admin.finance.requestRefund'));
                if (done) {
                  setRefundFor(null);
                  setReason('');
                }
              }}
            >
              {t('common.confirm')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRefundFor(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ReconciliationTab() {
  const { t, f } = useT();
  const l = useL();
  const now = useNow();
  const { can, api, run } = useAdmin();
  const pending = useRead((read) => [
    ...read.donations({ status: 'awaiting_transfer' }),
    ...read.donations({ status: 'requires_action' }).filter((donation) => donation.method === 'fawry'),
  ]);
  const [refs, setRefs] = useState<Record<string, string>>({});
  return (
    <section className="panel">
      <p className="muted panel-intro">
        <Icon name="info" size={15} /> {t('proto.admin.reconcileHint')}
      </p>
      {pending.length === 0 ? (
        <EmptyState icon="check" title={t('proto.admin.noTasks')} />
      ) : (
        <ul className="recon-list">
          {pending.map((donation) => (
            <li key={donation.id} className="recon-row">
              <span className="recon-icon">
                <Icon name={donation.method === 'fawry' ? 'store' : 'landmark'} size={18} />
              </span>
              <div className="recon-body">
                <strong>
                  {f.money(donation.chargedMinor, donation.currency)} · {donation.donorName ?? t('case.anonymous')}
                </strong>
                <small>
                  <span className="mono">{donation.receiptNumber}</span> · {t(`payment.methods.${donation.method}`)} · {l(donation.caseTitle)} ·{' '}
                  {f.relative(donation.createdAt, now)}
                </small>
              </div>
              {donation.method === 'instapay' ? (
                can('finance:reconcile') ? (
                  <div className="recon-actions">
                    <Input
                      value={refs[donation.id] ?? ''}
                      placeholder={t('admin.finance.bankReference')}
                      onChange={(event) => setRefs({ ...refs, [donation.id]: event.target.value })}
                      aria-label={t('admin.finance.bankReference')}
                      dir="ltr"
                    />
                    <Button
                      size="sm"
                      icon="check"
                      disabled={(refs[donation.id] ?? '').trim().length < 4}
                      onClick={() =>
                        run(() => api.confirmTransfer(donation.id, refs[donation.id] ?? '', donation.chargedMinor), t('admin.finance.confirmTransfer'))
                      }
                    >
                      {t('admin.finance.confirmTransfer')}
                    </Button>
                    <button type="button" className="link-btn" onClick={() => setRefs({ ...refs, [donation.id]: `CIB-${donation.receiptNumber.slice(-6)}` })}>
                      {t('common.apply')} CIB-{donation.receiptNumber.slice(-6)}
                    </button>
                  </div>
                ) : (
                  <PermissionHint permission="finance:reconcile" />
                )
              ) : (
                <Badge tone="warning">{t('donationStatus.requires_action')}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PayoutsTab() {
  const { t, f, locale } = useT();
  const l = useL();
  const { persona, can, api, run } = useAdmin();
  const payouts = useRead((read) => read.payouts());
  const cases = useRead((read) => read.adminCases());
  const accounts = useRead((read) => read.accountBalances());
  const candidates = cases.filter(
    (item) => (item.status === 'funded' || item.status === 'published') && item.disbursements.some((line) => line.status === 'planned'),
  );
  const [caseId, setCaseId] = useState<string>(candidates.find((item) => item.status === 'funded')?.id ?? candidates[0]?.id ?? '');
  const [paidRefs, setPaidRefs] = useState<Record<string, string>>({});
  const target = cases.find((item) => item.id === caseId);
  const fund = accounts.find((entry) => entry.account === `liability:case:${caseId}` && entry.currency === target?.currency)?.balanceMinor ?? 0;

  return (
    <div className="admin-stack">
      <p className="notice notice-info">
        <Icon name="users" size={16} /> {t('proto.admin.makerCheckerHint')}
      </p>
      <section className="panel">
        <h2 className="panel-title">{t('proto.admin.requestFromPlan')}</h2>
        {candidates.length === 0 ? (
          <p className="muted">{t('proto.admin.noPlanned')}</p>
        ) : (
          <div className="payout-request">
            <Select value={caseId} onChange={(event) => setCaseId(event.target.value)} aria-label={t('admin.finance.columns.case')}>
              {candidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.reference} — {item.title[locale]} ({t(`status.${item.status}`)})
                </option>
              ))}
            </Select>
            {target && (
              <>
                <p className="muted">
                  {t('proto.admin.caseFund')}: <strong>{f.money(fund, target.currency)}</strong> · {t('case.raised')}{' '}
                  {f.percent(computeProgress(target.raisedMinor, target.goalMinor).percent)}
                </p>
                <ul className="plan-lines">
                  {target.disbursements.map((line) => (
                    <li key={line.id}>
                      <span>
                        <strong>{l(line.payee)}</strong>
                        <small>{l(line.purpose)}</small>
                      </span>
                      <b>{f.money(line.amountMinor, target.currency)}</b>
                      {line.status === 'planned' ? (
                        can('finance:payouts') ? (
                          <Button
                            size="sm"
                            variant="outline"
                            icon="send"
                            onClick={() => run(() => api.requestPayout(target.id, line.id), t('admin.finance.payouts'))}
                          >
                            {t('proto.admin.requestFromPlan')}
                          </Button>
                        ) : (
                          <PermissionHint permission="finance:payouts" />
                        )
                      ) : (
                        <Badge tone={line.status === 'paid' ? 'success' : 'info'}>{t(`case.disbursement.${line.status}`)}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <h2 className="panel-title">{t('admin.finance.payouts')}</h2>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('admin.finance.columns.reference')}</th>
                <th>{t('admin.finance.columns.payee')}</th>
                <th className="num">{t('admin.finance.columns.amount')}</th>
                <th>{t('admin.finance.columns.createdBy')}</th>
                <th>{t('admin.finance.columns.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id}>
                  <td className="mono">{payout.reference}</td>
                  <td>
                    <strong>{l(payout.payee)}</strong>
                    <small className="muted">
                      {payout.caseReference} · {l(payout.purpose)}
                    </small>
                  </td>
                  <td className="num">{f.money(payout.amountMinor, payout.currency)}</td>
                  <td>
                    {payout.requestedBy.name}
                    {payout.approvedBy && <small className="muted">✓ {payout.approvedBy.name}</small>}
                  </td>
                  <td>
                    <Badge tone={payout.status === 'paid' ? 'success' : payout.status === 'approved' ? 'info' : 'warning'}>
                      {t(payoutStatusKey(payout.status))}
                    </Badge>
                  </td>
                  <td className="nowrap">
                    {payout.status === 'requested' &&
                      (can('finance:approve') ? (
                        <Button
                          size="sm"
                          icon="check"
                          disabled={payout.requestedBy.id === persona.id}
                          title={payout.requestedBy.id === persona.id ? t('errors.SELF_APPROVAL_FORBIDDEN') : undefined}
                          onClick={() => run(() => api.approvePayout(payout.id), t('admin.finance.approve'))}
                        >
                          {t('admin.finance.approve')}
                        </Button>
                      ) : (
                        <PermissionHint permission="finance:approve" />
                      ))}
                    {payout.status === 'approved' && can('finance:payouts') && (
                      <span className="pay-actions">
                        <Input
                          value={paidRefs[payout.id] ?? ''}
                          placeholder={t('admin.finance.bankReference')}
                          aria-label={t('admin.finance.bankReference')}
                          dir="ltr"
                          onChange={(event) => setPaidRefs({ ...paidRefs, [payout.id]: event.target.value })}
                        />
                        <Button
                          size="sm"
                          variant="gold"
                          icon="landmark"
                          disabled={(paidRefs[payout.id] ?? '').trim().length < 4}
                          onClick={() => run(() => api.markPayoutPaid(payout.id, paidRefs[payout.id] ?? ''), t('admin.finance.markPaid'))}
                        >
                          {t('admin.finance.markPaid')}
                        </Button>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setPaidRefs({ ...paidRefs, [payout.id]: `TRX-${payout.reference.replace(/\D/g, '').slice(-6)}` })}
                        >
                          {t('common.apply')} TRX-{payout.reference.replace(/\D/g, '').slice(-6)}
                        </button>
                      </span>
                    )}
                    {payout.status === 'requested' && payout.requestedBy.id === persona.id && (
                      <small className="muted">{t('errors.SELF_APPROVAL_FORBIDDEN')}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function payoutStatusKey(status: 'requested' | 'approved' | 'paid' | 'rejected') {
  return status === 'paid'
    ? 'case.disbursement.paid'
    : status === 'approved'
      ? 'case.disbursement.approved'
      : status === 'rejected'
        ? 'status.rejected'
        : 'proto.admin.awaitingApproval';
}

function RefundsTab() {
  const { t, f } = useT();
  const now = useNow();
  const { persona, can, api, run } = useAdmin();
  const refunds = useRead((read) => read.refunds());
  return (
    <div className="admin-stack">
      <p className="notice notice-info">
        <Icon name="users" size={16} /> {t('admin.finance.makerChecker')}
      </p>
      <section className="panel">
        {refunds.length === 0 ? (
          <EmptyState icon="check" title={t('proto.admin.noTasks')} />
        ) : (
          <ul className="recon-list">
            {refunds.map((refund) => (
              <li key={refund.id} className="recon-row">
                <span className="recon-icon">
                  <Icon name="refresh" size={18} />
                </span>
                <div className="recon-body">
                  <strong>
                    {f.money(refund.amountMinor, refund.currency)} · <span className="mono">{refund.receiptNumber}</span>
                  </strong>
                  <small>
                    {refund.reason} · {refund.requestedBy.name} · {f.relative(refund.createdAt, now)}
                  </small>
                </div>
                {refund.status === 'requested' ? (
                  can('finance:approve') ? (
                    <div className="recon-actions">
                      <Button
                        size="sm"
                        icon="check"
                        disabled={refund.requestedBy.id === persona.id}
                        onClick={() => run(() => api.approveRefund(refund.id), t('admin.finance.approve'))}
                      >
                        {t('admin.finance.approve')}
                      </Button>
                      {refund.requestedBy.id === persona.id && <small className="muted">{t('errors.SELF_APPROVAL_FORBIDDEN')}</small>}
                    </div>
                  ) : (
                    <PermissionHint permission="finance:approve" />
                  )
                ) : (
                  <Badge tone="success" icon="check">
                    {t('donationStatus.refunded')}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
