import { allowedTransitions, caseNeedMinor, type AdminCase, type CaseStatus } from '@yusr/core';
import { Badge, buttonClasses, CategoryBadge, cn, Icon, RegionLabel, StatusBadge, textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CaseActions } from '@/components/case-actions';
import { CaseDocuments } from '@/components/case-documents';
import { NoAccess } from '@/components/no-access';
import { PlanEditor } from '@/components/plan-editor';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.caseDetail.title') };
}

/** Before these, a case cannot be published; the plan can be written only then. */
const PREPARING: ReadonlySet<CaseStatus> = new Set(['under_review', 'field_verified']);
/** Stages the field verification has already passed. */
const VERIFIED: ReadonlySet<CaseStatus> = new Set(['field_verified', 'published', 'paused', 'funded', 'closed']);

function Section({ title, id, children, aside }: { title: string; id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-bold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Step({ done, title, hint }: { done: boolean; title: string; hint: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border',
          done ? 'border-success bg-success text-success-foreground' : 'border-border-strong text-muted-foreground',
        )}
      >
        {done ? <Icon name="check" size={14} /> : <span className="size-1.5 rounded-full bg-current" />}
      </span>
      <div>
        <p className={cn('font-semibold', done && 'text-success')}>{title}</p>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
    </li>
  );
}

/**
 * One case for staff: what is still missing before it can be published (field verification, a
 * disbursement plan that adds up to the need, a redacted document), the plan, the documents and the
 * moves this person may make. The API re-checks every rule and permission.
 */
export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const [staff, locale, { id }] = await Promise.all([currentStaff(), hubLocale(), params]);
  const { t, f, l } = textFor(locale);
  if (!staff.permissions.has('cases:read')) return <NoAccess message={t('admin.noAccess')} />;

  const item: AdminCase | null = await (await adminApi()).getCase(id).catch(() => null);
  if (!item) notFound();

  const need = caseNeedMinor(item);
  const planned = item.disbursements.reduce((sum, line) => sum + line.amountMinor, 0);
  const verified = VERIFIED.has(item.status);
  const planReady = item.disbursements.length > 0 && planned === need;
  const redacted = item.documents.some((document) => document.redacted);
  const options = allowedTransitions(item.status, staff.permissions)
    // Verification is approved by completing the auditor's task, never by a button here.
    .filter((rule) => rule.permission !== 'system' && rule.to !== 'field_verified')
    .map((rule) => ({ to: rule.to, requiresReason: Boolean(rule.requiresReason) }));
  const canPlan = staff.permissions.has('cases:edit') && PREPARING.has(item.status) && item.disbursements.length === 0;

  const facts: Array<[string, ReactNode]> = [
    [t('admin.cases.goal'), f.money(item.goalMinor, item.currency)],
    [t('admin.caseDetail.need'), f.money(need, item.currency)],
    [t('admin.caseDetail.fee'), f.money(item.platformFeeMinor, item.currency)],
    [t('admin.cases.raised'), f.money(item.raisedMinor, item.currency)],
    [t('admin.caseDetail.region'), <RegionLabel key="region" code={item.region} locale={locale} />],
    [t('admin.cases.submittedBy'), item.submittedBy.name],
    [t('admin.cases.auditor'), item.auditor?.name ?? t('admin.caseDetail.noAuditor')],
    ...(item.deadline ? ([[t('admin.caseDetail.deadline'), f.date(item.deadline)]] as Array<[string, ReactNode]>) : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <Link href="/cases" className="inline-flex items-center gap-1 self-start text-sm font-semibold text-muted-foreground hover:text-foreground">
        <Icon name="arrow-back" size={16} />
        {t('admin.nav.cases')}
      </Link>

      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs text-muted-foreground" dir="ltr">
          {item.reference}
        </p>
        <h1 className="text-2xl font-bold">{l(item.title)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} locale={locale} />
          <CategoryBadge category={item.category} locale={locale} />
          {item.isUrgent && <Badge tone="urgent">{t('case.urgent')}</Badge>}
        </div>
      </header>

      {PREPARING.has(item.status) && (
        <Section id="ready" title={t('admin.caseDetail.ready.title')}>
          <ol className="flex flex-col gap-4">
            <Step
              done={verified}
              title={t('admin.caseDetail.ready.verification')}
              hint={
                verified ? (
                  t('admin.caseDetail.ready.verificationDone')
                ) : (
                  <>
                    {item.auditor
                      ? t('admin.caseDetail.ready.verificationWaiting', { auditor: item.auditor.name })
                      : t('admin.caseDetail.ready.verificationAssign')}{' '}
                    <Link href="/verification" className="font-semibold text-primary underline-offset-4 hover:underline">
                      {t('admin.nav.verification')}
                    </Link>
                  </>
                )
              }
            />
            <Step
              done={planReady}
              title={t('admin.caseDetail.ready.plan')}
              hint={
                planReady
                  ? t('admin.caseDetail.ready.planDone')
                  : item.disbursements.length > 0
                    ? t('admin.caseDetail.ready.planMismatch', { planned: f.money(planned, item.currency), need: f.money(need, item.currency) })
                    : t('admin.caseDetail.ready.planMissing', { need: f.money(need, item.currency) })
              }
            />
            <Step
              done={redacted}
              title={t('admin.caseDetail.ready.redacted')}
              hint={redacted ? t('admin.caseDetail.ready.redactedDone') : t('admin.caseDetail.ready.redactedMissing')}
            />
          </ol>
          {item.status === 'field_verified' && planReady && redacted && (
            <p className="mt-4 text-sm font-semibold text-success">{t('admin.caseDetail.ready.all')}</p>
          )}
        </Section>
      )}

      <Section id="actions" title={t('admin.cases.actions')}>
        <CaseActions
          locale={locale}
          caseId={item.id}
          options={options}
          pinned={item.priority > 0}
          canPin={staff.permissions.has('cases:prioritize')}
          featured={Boolean(item.featuredAt)}
          canFeature={staff.permissions.has('cases:prioritize') && (item.status === 'published' || Boolean(item.featuredAt))}
        />
      </Section>

      <Section id="facts" title={t('admin.caseDetail.facts')}>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        id="plan"
        title={t('admin.caseDetail.plan.title')}
        aside={
          item.disbursements.length > 0 ? (
            <Badge tone={planReady ? 'success' : 'warning'}>
              {f.money(planned, item.currency)} / {f.money(need, item.currency)}
            </Badge>
          ) : undefined
        }
      >
        {item.disbursements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="p-2 text-start font-semibold">
                    {t('admin.caseDetail.plan.payee')}
                  </th>
                  <th scope="col" className="p-2 text-start font-semibold">
                    {t('admin.caseDetail.plan.purpose')}
                  </th>
                  <th scope="col" className="p-2 text-start font-semibold">
                    {t('receipt.status')}
                  </th>
                  <th scope="col" className="p-2 text-end font-semibold">
                    {t('admin.caseDetail.plan.amountShort')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {item.disbursements.map((line) => (
                  <tr key={line.id}>
                    <td className="p-2">
                      <p className="font-semibold">{l(line.payee)}</p>
                      <p className="text-xs text-muted-foreground">{t(`case.payees.${line.payeeType}`)}</p>
                    </td>
                    <td className="p-2">{l(line.purpose)}</td>
                    <td className="p-2 text-xs">{t(`case.disbursement.${line.status}`)}</td>
                    <td className="p-2 text-end font-semibold tabular-nums">{f.money(line.amountMinor, item.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">{t('admin.caseDetail.plan.fixed')}</p>
          </div>
        ) : canPlan ? (
          <PlanEditor locale={locale} caseId={item.id} currency={item.currency} needMinor={need} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {staff.permissions.has('cases:edit') ? t('admin.caseDetail.plan.notNow') : t('admin.caseDetail.plan.noPermission')}
          </p>
        )}
      </Section>

      <Section id="documents" title={t('admin.caseDetail.documents.title')}>
        <p className="mb-4 text-sm text-muted-foreground">{t('admin.caseDetail.documents.hint')}</p>
        <CaseDocuments
          locale={locale}
          caseId={item.id}
          documents={item.documents}
          canOpen={staff.permissions.has('documents:read_private')}
          canRedact={staff.permissions.has('documents:redact')}
        />
      </Section>

      <Section id="story" title={t('admin.caseDetail.story')}>
        <p className="whitespace-pre-line text-sm leading-7">{l(item.story)}</p>
      </Section>

      <Section id="history" title={t('admin.cases.history')}>
        <ol className="flex flex-col gap-3 text-sm">
          {[...item.history].reverse().map((change) => (
            <li key={`${change.at}-${change.to}`} className="flex flex-wrap items-baseline gap-x-2">
              <StatusBadge status={change.to} locale={locale} />
              <span className="text-muted-foreground">
                {change.actorName === 'system' ? t('admin.caseDetail.system') : change.actorName} · <time dateTime={change.at}>{f.dateTime(change.at)}</time>
              </span>
              {change.reason && <p className="w-full text-muted-foreground">{change.reason}</p>}
            </li>
          ))}
        </ol>
      </Section>

      <Link href="/cases" className={buttonClasses({ variant: 'ghost', size: 'sm', className: 'self-start' })}>
        <Icon name="arrow-back" size={16} />
        {t('admin.nav.cases')}
      </Link>
    </div>
  );
}
