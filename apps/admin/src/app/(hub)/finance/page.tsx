import { CURRENCY_META, type Currency, type LedgerLine } from '@yusr/core';
import { Badge, Icon, textFor, type BadgeTone } from '@yusr/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ApprovePayoutForm, ConfirmTransferForm, MarkPaidForm } from '@/components/finance-forms';
import { NoAccess } from '@/components/no-access';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.nav.finance') };
}

const PAYOUT_TONE: Record<string, BadgeTone> = { requested: 'warning', approved: 'info', paid: 'success', rejected: 'urgent' };
const ACCOUNT_KEYS = ['clearing', 'bank', 'case', 'gateway_fees', 'fee_recovery', 'fx'] as const;

export default async function FinancePage() {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t, f, l } = textFor(locale);
  if (!staff.permissions.has('finance:read')) return <NoAccess message={t('admin.noAccess')} />;

  const api = await adminApi();
  const [awaiting, payouts, ledger] = await Promise.all([api.donations({ status: 'awaiting_transfer' }), api.payouts(), api.ledger({ limit: 40 })]);
  const canReconcile = staff.permissions.has('finance:reconcile');
  const canApprove = staff.permissions.has('finance:approve');
  const canPay = staff.permissions.has('finance:payouts');
  const balance = balanceOf(ledger);
  const openPayouts = payouts.filter((payout) => payout.status === 'requested' || payout.status === 'approved').length;

  const accountLabel = (account: string) => {
    const [, key = '', ...rest] = account.split(':');
    const known = (ACCOUNT_KEYS as readonly string[]).includes(key) ? t(`admin.finance.accounts.${key as (typeof ACCOUNT_KEYS)[number]}`) : key;
    return rest.length ? `${known} · ${rest.join(':')}` : known;
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('admin.nav.finance')}</h1>

      <Panel title={t('admin.finance.reconciliation')} icon="landmark" count={awaiting.length} countLabel={f.number(awaiting.length)}>
        {awaiting.length === 0 ? (
          <Empty>{t('admin.cases.empty')}</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {awaiting.map((donation) => (
              <li key={donation.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-semibold">
                    {f.money(donation.chargedMinor, donation.currency)} · {t(`payment.methods.${donation.method}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono" dir="ltr">
                      {donation.receiptNumber}
                    </span>{' '}
                    · {donation.donorName ?? t('case.anonymous')} · {donation.caseReference} · {f.relative(donation.createdAt)}
                  </p>
                </div>
                {canReconcile ? (
                  <ConfirmTransferForm
                    locale={locale}
                    donationId={donation.id}
                    currency={donation.currency}
                    expectedMajor={major(donation.chargedMinor, donation.currency)}
                  />
                ) : (
                  <Badge tone="warning">{t('donationStatus.awaiting_transfer')}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t('admin.finance.payouts')} icon="send" count={openPayouts} countLabel={f.number(openPayouts)} note={t('admin.finance.makerChecker')}>
        <ul className="divide-y divide-border">
          {payouts.map((payout) => (
            <li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="font-semibold">
                  {l(payout.payee)} <span className="font-normal text-muted-foreground">· {t(`case.payees.${payout.payeeType}`)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {l(payout.purpose)} · {payout.caseReference} · {t('admin.finance.columns.createdBy')}: {payout.requestedBy.name}
                  {payout.approvedBy && ` · ${t('admin.finance.approve')}: ${payout.approvedBy.name}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-bold tabular-nums">{f.money(payout.amountMinor, payout.currency, { fractionDigits: 0 })}</span>
                <Badge tone={PAYOUT_TONE[payout.status] ?? 'neutral'}>{t(`admin.finance.payoutStatus.${payout.status}`)}</Badge>
                {payout.status === 'requested' && canApprove && (
                  <ApprovePayoutForm locale={locale} payoutId={payout.id} ownRequest={payout.requestedBy.id === staff.claims.sub} />
                )}
                {payout.status === 'approved' && canPay && (
                  <MarkPaidForm locale={locale} payoutId={payout.id} ownRequest={payout.requestedBy.id === staff.claims.sub} />
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title={t('admin.finance.ledger')}
        icon="coins"
        aside={
          <Badge tone={balance.balanced ? 'success' : 'urgent'} icon={balance.balanced ? 'check' : 'alert'}>
            {balance.balanced ? t('admin.finance.balanced') : t('admin.finance.unbalanced')}
          </Badge>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                {(['time', 'txn', 'account', 'debit', 'credit', 'memo'] as const).map((column) => (
                  <th key={column} scope="col" className="p-3 text-start font-semibold">
                    {t(`admin.finance.columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledger.map((line) => (
                <tr key={line.id}>
                  <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{f.dateTime(line.at)}</td>
                  <td className="p-3 font-mono text-xs" dir="ltr">
                    {line.transactionId.slice(0, 10)}
                  </td>
                  <td className="p-3">{accountLabel(line.account)}</td>
                  <td className="p-3 tabular-nums">{line.direction === 'debit' ? f.money(line.amountMinor, line.currency) : ''}</td>
                  <td className="p-3 tabular-nums">{line.direction === 'credit' ? f.money(line.amountMinor, line.currency) : ''}</td>
                  <td className="p-3 text-xs text-muted-foreground" dir="auto">
                    {line.memo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function major(minor: number, currency: Currency): string {
  return String(minor / 10 ** CURRENCY_META[currency].exponent);
}

/**
 * Every transaction posts equal debits and credits in each currency. A page of lines can cut the
 * transactions at its two ends, so those are left out; everything in between must net to zero.
 */
function balanceOf(lines: LedgerLine[]): { balanced: boolean } {
  const edges = new Set([lines[0]?.transactionId, lines.at(-1)?.transactionId]);
  const sums = new Map<string, number>();
  for (const line of lines) {
    if (edges.has(line.transactionId)) continue;
    const key = `${line.transactionId}:${line.currency}`;
    sums.set(key, (sums.get(key) ?? 0) + (line.direction === 'debit' ? line.amountMinor : -line.amountMinor));
  }
  return { balanced: [...sums.values()].every((sum) => sum === 0) };
}

function Panel({
  title,
  icon,
  count,
  countLabel,
  note,
  aside,
  children,
}: {
  title: string;
  icon: 'landmark' | 'send' | 'coins';
  count?: number;
  countLabel?: string;
  note?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-card" aria-label={title}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h2 className="inline-flex items-center gap-2 font-bold">
          <Icon name={icon} size={18} className="text-primary" />
          {title}
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-warning-soft px-2 text-xs text-warning-soft-foreground tabular-nums">{countLabel ?? count}</span>
          )}
        </h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {aside}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="p-6 text-center text-sm text-muted-foreground">{children}</p>;
}
