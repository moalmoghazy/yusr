'use client';

import { PAYEE_TYPES, parseAmountInput, toMinor, type Currency, type Locale, type PayeeType } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState, useId, useState } from 'react';
import { savePlan } from '@/app/(hub)/cases/[id]/actions';
import type { ActionResult } from '@/lib/session';

const MAX_LINES = 12;

const control =
  'w-full rounded-control border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-70';

interface Line {
  key: number;
  payeeType: PayeeType;
  payeeAr: string;
  payeeEn: string;
  purposeAr: string;
  purposeEn: string;
  amount: string;
  account: string;
}

const blank = (key: number, payeeType: PayeeType = 'hospital'): Line => ({
  key,
  payeeType,
  payeeAr: '',
  payeeEn: '',
  purposeAr: '',
  purposeEn: '',
  amount: '',
  account: '',
});

/**
 * «خطة الصرف»: who is paid, for what and how much. The lines must add up to the case's need (its goal
 * less Yusr's fee) before the case can be published, and the plan is fixed once saved. English is
 * optional here: an empty English field takes the Arabic text.
 */
export function PlanEditor({ locale, caseId, currency, needMinor }: { locale: Locale; caseId: string; currency: Currency; needMinor: number }) {
  const { t, f } = textFor(locale);
  const ids = useId();
  const [state, save, saving] = useActionState<ActionResult, FormData>(savePlan, null);
  const [lines, setLines] = useState<Line[]>([blank(1)]);
  const [confirming, setConfirming] = useState(false);

  const minorOf = (line: Line): number | null => {
    const major = parseAmountInput(line.amount);
    return major === null || major <= 0 ? null : toMinor(major, currency);
  };
  const total = lines.reduce((sum, line) => sum + (minorOf(line) ?? 0), 0);
  const left = needMinor - total;
  const complete = lines.every((line) => line.payeeAr.trim().length > 0 && line.purposeAr.trim().length > 0 && minorOf(line) !== null);
  const accountOk = (line: Line) => line.account.trim() === '' || line.account.trim().length >= 6;
  const ready = complete && left === 0 && lines.every(accountOk);

  const update = (key: number, patch: Partial<Line>) => {
    setConfirming(false);
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };
  const both = (ar: string, en: string) => ({ ar: ar.trim(), en: en.trim() || ar.trim() });
  const payload = JSON.stringify(
    lines.map((line) => ({
      payeeType: line.payeeType,
      payee: both(line.payeeAr, line.payeeEn),
      purpose: both(line.purposeAr, line.purposeEn),
      amountMinor: minorOf(line) ?? 0,
      payeeAccount: line.account.trim() || null,
    })),
  );

  return (
    <form action={save} className="flex flex-col gap-4">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="lines" value={payload} />
      <p className="text-sm text-muted-foreground">{t('admin.caseDetail.plan.hint', { need: f.money(needMinor, currency) })}</p>

      <ol className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const id = `${ids}-${line.key}`;
          return (
            <li key={line.key} className="rounded-control border border-border bg-muted/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{t('admin.caseDetail.plan.line', { number: f.number(index + 1) })}</p>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false);
                      setLines((current) => current.filter((entry) => entry.key !== line.key));
                    }}
                    className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                  >
                    <Icon name="x" size={15} />
                    {t('admin.caseDetail.plan.remove')}
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-type`}>
                  <span className="font-semibold">{t('admin.caseDetail.plan.payeeType')}</span>
                  <select
                    id={`${id}-type`}
                    value={line.payeeType}
                    onChange={(event) => update(line.key, { payeeType: event.target.value as PayeeType })}
                    className={control}
                  >
                    {PAYEE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`case.payees.${type}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-amount`}>
                  <span className="font-semibold">{t('admin.caseDetail.plan.amount', { currency: t(`currency.${currency}`) })}</span>
                  <input
                    id={`${id}-amount`}
                    inputMode="decimal"
                    dir="ltr"
                    value={line.amount}
                    onChange={(event) => update(line.key, { amount: event.target.value })}
                    className={cn(control, 'text-end tabular-nums')}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-payee-ar`}>
                  <span className="font-semibold">{t('admin.caseDetail.plan.payeeAr')}</span>
                  <input
                    id={`${id}-payee-ar`}
                    dir="rtl"
                    maxLength={120}
                    value={line.payeeAr}
                    placeholder={t('admin.caseDetail.plan.payeePlaceholder')}
                    onChange={(event) => update(line.key, { payeeAr: event.target.value })}
                    className={control}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-payee-en`}>
                  <span className="font-semibold">{t('admin.caseDetail.plan.payeeEn')}</span>
                  <input
                    id={`${id}-payee-en`}
                    dir="ltr"
                    maxLength={120}
                    value={line.payeeEn}
                    onChange={(event) => update(line.key, { payeeEn: event.target.value })}
                    className={control}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-purpose-ar`}>
                  <span className="font-semibold">{t('admin.caseDetail.plan.purposeAr')}</span>
                  <input
                    id={`${id}-purpose-ar`}
                    dir="rtl"
                    maxLength={300}
                    value={line.purposeAr}
                    placeholder={t('admin.caseDetail.plan.purposePlaceholder')}
                    onChange={(event) => update(line.key, { purposeAr: event.target.value })}
                    className={control}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-purpose-en`}>
                  <span className="font-semibold">{t('admin.caseDetail.plan.purposeEn')}</span>
                  <input
                    id={`${id}-purpose-en`}
                    dir="ltr"
                    maxLength={300}
                    value={line.purposeEn}
                    onChange={(event) => update(line.key, { purposeEn: event.target.value })}
                    className={control}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm sm:col-span-2" htmlFor={`${id}-account`}>
                  <span className="font-semibold">{t('admin.caseDetail.plan.account')}</span>
                  <input
                    id={`${id}-account`}
                    dir="ltr"
                    maxLength={64}
                    value={line.account}
                    onChange={(event) => update(line.key, { account: event.target.value })}
                    aria-invalid={!accountOk(line) || undefined}
                    className={control}
                  />
                  <span className="text-xs text-muted-foreground">{t('admin.caseDetail.plan.accountHint')}</span>
                </label>
              </div>
            </li>
          );
        })}
      </ol>

      {lines.length < MAX_LINES && (
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setLines((current) => [...current, blank(Math.max(...current.map((line) => line.key)) + 1, current.at(-1)?.payeeType)]);
          }}
          className={buttonClasses({ variant: 'outline', size: 'sm', className: 'self-start' })}
        >
          <Icon name="plus" size={15} />
          {t('admin.caseDetail.plan.add')}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-control border border-border bg-card p-3 text-sm" aria-live="polite">
        <span>
          {t('admin.caseDetail.plan.total')}: <strong className="tabular-nums">{f.money(total, currency)}</strong>
        </span>
        <span>
          {t('admin.caseDetail.need')}: <strong className="tabular-nums">{f.money(needMinor, currency)}</strong>
        </span>
        <span className={cn('font-semibold', left === 0 ? 'text-success' : 'text-destructive')}>
          {left === 0
            ? t('admin.caseDetail.plan.balanced')
            : left > 0
              ? t('admin.caseDetail.plan.short', { amount: f.money(left, currency) })
              : t('admin.caseDetail.plan.over', { amount: f.money(-left, currency) })}
        </span>
      </div>

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-control border border-warning bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          <p className="font-semibold">{t('admin.caseDetail.plan.confirm')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving || !ready} className={buttonClasses({ variant: 'primary', size: 'sm' })}>
              {t('admin.caseDetail.plan.save')}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={buttonClasses({ variant: 'ghost', size: 'sm' })}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!ready}
          onClick={() => setConfirming(true)}
          className={buttonClasses({ variant: 'primary', size: 'sm', className: 'self-start' })}
        >
          {t('admin.caseDetail.plan.save')}
        </button>
      )}
      {!complete && <p className="text-xs text-muted-foreground">{t('admin.caseDetail.plan.incomplete')}</p>}

      {state && (
        <p role="status" className={cn('text-sm font-semibold', state.ok ? 'text-success' : 'text-destructive')}>
          {state.message}
        </p>
      )}
    </form>
  );
}
