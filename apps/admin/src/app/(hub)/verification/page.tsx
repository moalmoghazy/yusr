import { CHECKLIST_ITEMS, CURRENCY_META, regionByCode, type AdminCase, type Locale } from '@yusr/core';
import { Badge, cn, Icon, textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/no-access';
import { AssignForm, ChecklistToggle, CompleteForm } from '@/components/verification-forms';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.nav.verification') };
}

/**
 * Field verification: moderators send an auditor to each case under review; the auditor works
 * through the five-point checklist on the visit and signs off with the verified goal, which moves
 * the case to "field verified". The API enforces who may do each step; this page only reflects it.
 */
export default async function VerificationPage() {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t, f, l } = textFor(locale);
  const canAssign = staff.permissions.has('verifications:assign');
  const canPerform = staff.permissions.has('verifications:perform');
  if (!staff.permissions.has('cases:read') || (!canAssign && !canPerform)) return <NoAccess message={t('admin.noAccess')} />;

  const api = await adminApi();
  const [tasks, cases, team] = await Promise.all([api.verificationTasks(), api.cases(), canAssign ? api.team() : Promise.resolve([])]);
  const byId = new Map(cases.map((item) => [item.id, item]));
  const open = tasks
    .filter((task) => task.status === 'assigned' || task.status === 'scheduled')
    // My own visits first.
    .sort((a, b) => Number(b.auditorId === staff.claims.sub) - Number(a.auditorId === staff.claims.sub));
  const covered = new Set(open.map((task) => task.caseId));
  const waiting = cases.filter((item) => item.status === 'under_review' && !covered.has(item.id));
  const auditors = team.filter((member) => member.roles.includes('field_auditor')).map((member) => ({ id: member.id, name: l(member.name) }));
  const superAdmin = staff.claims.roles.includes('super_admin');

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">{t('admin.verification.title')}</h1>

      {canAssign && (
        <section aria-labelledby="waiting-title" className="flex flex-col gap-3">
          <h2 id="waiting-title" className="flex items-center gap-2 text-lg font-bold">
            <Icon name="clipboard-check" size={19} className="text-primary" />
            {t('admin.verification.unassigned')} <span className="text-sm font-semibold text-muted-foreground tabular-nums">{f.number(waiting.length)}</span>
          </h2>
          {waiting.length === 0 ? (
            <p className="rounded-card border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
              {t('admin.verification.allAssigned')}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {waiting.map((item) => (
                <li key={item.id} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
                  <CaseLine item={item} locale={locale} />
                  <AssignForm locale={locale} caseId={item.id} auditors={auditors} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="open-title" className="flex flex-col gap-3">
        <h2 id="open-title" className="flex items-center gap-2 text-lg font-bold">
          <Icon name="map-pin" size={19} className="text-primary" />
          {t('admin.verification.open')} <span className="text-sm font-semibold text-muted-foreground tabular-nums">{f.number(open.length)}</span>
        </h2>
        {open.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong p-6 text-center text-sm text-muted-foreground">
            {t('admin.verification.empty')}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {open.map((task) => {
              const item = byId.get(task.caseId);
              const mine = task.auditorId === staff.claims.sub;
              const editable = canPerform && (mine || superAdmin);
              const done = CHECKLIST_ITEMS.filter((key) => task.checklist[key]).length;
              return (
                <li key={task.id} className={cn('flex flex-col gap-3 rounded-card border bg-card p-4', mine ? 'border-primary/40' : 'border-border')}>
                  {item && <CaseLine item={item} locale={locale} />}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge tone={task.status === 'scheduled' ? 'info' : 'neutral'}>
                      {task.status === 'scheduled' ? t('admin.verification.scheduled') : t('admin.verification.assigned')}
                    </Badge>
                    <span>{t('admin.verification.assignedTo', { name: task.auditorName })}</span>
                    {task.visitAt && (
                      <span>
                        · {t('admin.verification.visitDate')}: <time dateTime={task.visitAt}>{f.dateTime(task.visitAt)}</time>
                      </span>
                    )}
                    {!editable && canPerform && <span className="font-semibold">· {t('admin.verification.notYours')}</span>}
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground">
                      <span>{t('admin.verification.checklistTitle')}</span>
                      <span className="tabular-nums">
                        {t('admin.verification.progress', { done: f.number(done), total: f.number(CHECKLIST_ITEMS.length) })}
                      </span>
                    </div>
                    {CHECKLIST_ITEMS.map((key) => (
                      <ChecklistToggle key={key} locale={locale} taskId={task.id} item={key} checked={task.checklist[key]} editable={editable} />
                    ))}
                  </div>
                  {editable && item && (
                    <CompleteForm
                      locale={locale}
                      taskId={task.id}
                      currency={item.currency}
                      suggestedMajor={String((task.recommendedMinor ?? item.goalMinor) / 10 ** CURRENCY_META[item.currency].exponent)}
                      ready={done === CHECKLIST_ITEMS.length}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function CaseLine({ item, locale }: { item: AdminCase; locale: Locale }) {
  const { t, f, l } = textFor(locale);
  const region = regionByCode(item.region);
  return (
    <div className="flex flex-col gap-1">
      <Link href={`/cases?q=${encodeURIComponent(item.reference)}`} className="font-semibold hover:text-primary">
        {l(item.title)}
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span dir="ltr" className="font-mono">
          {item.reference}
        </span>
        <span>{region ? l(region.name) : item.region}</span>
        <span>
          {t('admin.cases.goal')}: <span className="tabular-nums">{f.money(item.goalMinor, item.currency, { fractionDigits: 0 })}</span>
        </span>
        <span>
          {t('admin.cases.submittedBy')}: {item.submittedBy.name}
        </span>
      </div>
    </div>
  );
}
