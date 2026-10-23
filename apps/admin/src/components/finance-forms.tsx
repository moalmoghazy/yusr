'use client';

import type { Currency, Locale } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState } from 'react';
import { approvePayout, confirmTransfer, markPayoutPaid } from '@/app/(hub)/finance/actions';
import type { ActionResult } from '@/lib/session';

const input = 'h-9 rounded-control border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40';

function Result({ result }: { result: ActionResult }) {
  if (!result) return null;
  return (
    <p role="status" className={cn('text-xs font-semibold', result.ok ? 'text-success' : 'text-destructive')}>
      {result.message}
    </p>
  );
}

export function ConfirmTransferForm({
  locale,
  donationId,
  currency,
  expectedMajor,
}: {
  locale: Locale;
  donationId: string;
  currency: Currency;
  expectedMajor: string;
}) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(confirmTransfer, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="donationId" value={donationId} />
      <input type="hidden" name="currency" value={currency} />
      <input
        name="bankReference"
        required
        minLength={4}
        maxLength={64}
        placeholder={t('admin.finance.bankReference')}
        aria-label={t('admin.finance.bankReference')}
        dir="ltr"
        className={cn(input, 'w-40 font-mono')}
      />
      <input
        name="received"
        required
        inputMode="decimal"
        defaultValue={expectedMajor}
        aria-label={t('admin.finance.columns.amount')}
        dir="ltr"
        className={cn(input, 'w-24 tabular-nums')}
      />
      <button type="submit" disabled={pending} className={buttonClasses({ size: 'sm' })}>
        <Icon name="check" size={15} />
        {t('admin.finance.confirmTransfer')}
      </button>
      <Result result={result} />
    </form>
  );
}

export function ApprovePayoutForm({ locale, payoutId, ownRequest }: { locale: Locale; payoutId: string; ownRequest: boolean }) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(approvePayout, null);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="payoutId" value={payoutId} />
      <button
        type="submit"
        disabled={pending || ownRequest}
        className={buttonClasses({ size: 'sm' })}
        title={ownRequest ? t('admin.finance.makerChecker') : undefined}
      >
        <Icon name="shield-check" size={15} />
        {t('admin.finance.approve')}
      </button>
      {ownRequest && <span className="text-xs text-muted-foreground">{t('admin.finance.makerChecker')}</span>}
      <Result result={result} />
    </form>
  );
}

export function MarkPaidForm({ locale, payoutId, ownRequest }: { locale: Locale; payoutId: string; ownRequest: boolean }) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(markPayoutPaid, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="payoutId" value={payoutId} />
      <input
        name="bankReference"
        required
        minLength={4}
        maxLength={64}
        placeholder={t('admin.finance.bankReference')}
        aria-label={t('admin.finance.bankReference')}
        dir="ltr"
        className={cn(input, 'w-40 font-mono')}
      />
      <button type="submit" disabled={pending || ownRequest} className={buttonClasses({ variant: 'soft', size: 'sm' })}>
        <Icon name="landmark" size={15} />
        {t('admin.finance.markPaid')}
      </button>
      {ownRequest && <span className="text-xs text-muted-foreground">{t('admin.finance.makerChecker')}</span>}
      <Result result={result} />
    </form>
  );
}
