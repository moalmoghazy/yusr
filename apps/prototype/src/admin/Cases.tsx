import { CASE_PIPELINE, CASE_TRANSITIONS, allowedTransitions, computeProgress, type AdminCase, type CaseStatus, type TransitionRule } from '@yusr/core';
import { useMemo, useState } from 'react';
import { useRead } from '../app/backend';
import { useNow } from '../app/clock';
import { useL, useT } from '../app/i18n';
import { usePrototype } from '../app/prefs';
import { CategoryBadge, DonationProgress, RegionLabel, StatusBadge } from '../ui/case-ui';
import { Icon } from '../ui/icons';
import { Avatar, Badge, Button, Dialog, Input, Segmented, Select, Textarea, cx } from '../ui/primitives';
import { PermissionHint, useAdmin } from './common';

const SIDE_LANES: readonly CaseStatus[] = ['paused', 'rejected'];

export function CasesSection({ initialCaseId }: { initialCaseId?: string }) {
  const { t } = useT();
  const [view, setView] = useState<'board' | 'table'>('board');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(initialCaseId ?? null);
  const all = useRead((read) => read.adminCases());
  const l = useL();
  const cases = useMemo(
    () => all.filter((item) => !q.trim() || `${item.reference} ${item.title.ar} ${item.title.en}`.toLowerCase().includes(q.trim().toLowerCase())),
    [all, q],
  );
  const open = openId ? all.find((item) => item.id === openId) : undefined;

  return (
    <div className="admin-stack">
      <div className="admin-toolbar">
        <Input
          icon="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('admin.cases.searchPlaceholder')}
          aria-label={t('common.search')}
          className="toolbar-search"
        />
        <Segmented
          label={t('admin.nav.cases')}
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: t('admin.cases.board'), icon: 'kanban' },
            { value: 'table', label: t('admin.cases.table'), icon: 'list' },
          ]}
        />
      </div>
      {view === 'board' ? (
        <div className="board" role="list">
          {[...CASE_PIPELINE, ...SIDE_LANES].map((status) => {
            const column = cases.filter((item) => item.status === status);
            return (
              <section
                key={status}
                className={cx('board-col', SIDE_LANES.includes(status) && 'board-col-side')}
                role="listitem"
                aria-label={t(`status.${status}`)}
              >
                <header className="board-col-head">
                  <StatusBadge status={status} />
                  <span className="board-count">{column.length}</span>
                </header>
                <p className="board-hint">{t(`statusHints.${status}`)}</p>
                <div className="board-cards">
                  {column.length === 0 && <p className="board-empty">{t('admin.cases.empty')}</p>}
                  {column.map((item) => (
                    <BoardCard key={item.id} item={item} onOpen={() => setOpenId(item.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="panel table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>{t('case.reference')}</th>
                <th>{t('submit.fields.title')}</th>
                <th>{t('receipt.status')}</th>
                <th>{t('case.location')}</th>
                <th className="num">{t('admin.cases.raised')}</th>
                <th className="num">{t('admin.cases.goal')}</th>
                <th>{t('admin.cases.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((item) => (
                <tr key={item.id} className="clickable" onClick={() => setOpenId(item.id)}>
                  <td className="mono">{item.reference}</td>
                  <td>
                    <button type="button" className="title-link" onClick={() => setOpenId(item.id)}>
                      {l(item.title)}
                    </button>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>
                    <RegionLabel code={item.region} withIcon={false} />
                  </td>
                  <td className="num">
                    <MoneyCell minor={item.raisedMinor} item={item} />
                  </td>
                  <td className="num">
                    <MoneyCell minor={item.goalMinor} item={item} />
                  </td>
                  <td>
                    <RelativeTime at={item.updatedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <CaseDrawer item={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function MoneyCell({ minor, item }: { minor: number; item: AdminCase }) {
  const { f } = useT();
  return <>{f.money(minor, item.currency, { fractionDigits: 0 })}</>;
}

function RelativeTime({ at }: { at: string }) {
  const { f } = useT();
  const now = useNow();
  return <time dateTime={at}>{f.relative(at, now)}</time>;
}

function BoardCard({ item, onOpen }: { item: AdminCase; onOpen: () => void }) {
  const { t, f } = useT();
  const l = useL();
  const progress = computeProgress(item.raisedMinor, item.goalMinor);
  const showProgress = ['published', 'funded', 'closed', 'paused'].includes(item.status);
  return (
    <button type="button" className={cx('board-card', item.priority > 0 && 'is-pinned')} onClick={onOpen}>
      <span className="board-card-top">
        <span className="mono">{item.reference}</span>
        {item.priority > 0 && (
          <span className="pin" title={t('admin.cases.pinned')}>
            <Icon name="pin" size={13} />
          </span>
        )}
        {item.isUrgent && (
          <Badge tone="urgent" icon="zap">
            {t('case.urgent')}
          </Badge>
        )}
      </span>
      <strong className="board-card-title">{l(item.title)}</strong>
      <CategoryBadge category={item.category} />
      {showProgress && (
        <span className="board-progress">
          <span className="board-bar">
            <span style={{ width: `${progress.ratio * 100}%` }} className={cx(progress.isFunded && 'is-funded')} />
          </span>
          <small>{f.percent(progress.percent)}</small>
        </span>
      )}
      <span className="board-card-foot">
        <span className="board-meta">
          <RegionLabel code={item.region} />
        </span>
        {item.auditor && (
          <span className="board-auditor" title={`${t('admin.cases.auditor')}: ${item.auditor.name}`}>
            <Avatar name={item.auditor.name} size={22} />
          </span>
        )}
      </span>
    </button>
  );
}

function CaseDrawer({ item, onClose }: { item: AdminCase; onClose: () => void }) {
  const { t, f } = useT();
  const l = useL();
  const now = useNow();
  const { goWeb } = usePrototype();
  const { grants, can, api, run } = useAdmin();
  const [pending, setPending] = useState<TransitionRule | null>(null);
  const [reason, setReason] = useState('');
  const [auditorId, setAuditorId] = useState('u_mahmoud');
  const audit = useRead((read) => read.audit(400).filter((entry) => entry.entityId === item.id));
  const allowed = allowedTransitions(item.status, grants);
  const locked = CASE_TRANSITIONS.filter((rule) => rule.from === item.status && rule.permission !== 'system' && !allowed.includes(rule));
  const staff = useRead((read) => read.team().filter((member) => member.roles.includes('field_auditor')));
  const isPublic = ['published', 'funded', 'closed'].includes(item.status);

  const perform = async (rule: TransitionRule) => {
    if (rule.requiresReason && !pending) {
      setPending(rule);
      return;
    }
    const done = await run(() => api.transitionCase(item.id, rule.to, reason || undefined), t('admin.cases.transitioned', { status: t(`status.${rule.to}`) }));
    if (done) {
      setPending(null);
      setReason('');
    }
  };

  return (
    <Dialog open onClose={onClose} variant="side" size="lg" title={l(item.title)} description={`${item.reference} · ${t(`categories.${item.category}`)}`}>
      <div className="drawer">
        <div className="drawer-status">
          <StatusBadge status={item.status} />
          <span className="muted">{t(`statusHints.${item.status}`)}</span>
        </div>

        {['published', 'funded', 'closed', 'paused'].includes(item.status) && (
          <DonationProgress raisedMinor={item.raisedMinor} goalMinor={item.goalMinor} currency={item.currency} donors={item.donorsCount} size="sm" />
        )}

        <dl className="drawer-facts">
          <div>
            <dt>{t('admin.cases.goal')}</dt>
            <dd>{f.money(item.goalMinor, item.currency)}</dd>
          </div>
          <div>
            <dt>{t('case.location')}</dt>
            <dd>
              <RegionLabel code={item.region} withIcon={false} />
            </dd>
          </div>
          <div>
            <dt>{t('admin.cases.submittedBy')}</dt>
            <dd>
              {item.submittedBy.name} · {t(`submit.relation.${item.submittedBy.relation}`)}
            </dd>
          </div>
          <div>
            <dt>{t('admin.cases.auditor')}</dt>
            <dd>{item.auditor?.name ?? '—'}</dd>
          </div>
        </dl>

        <section className="drawer-section">
          <h3>{t('proto.admin.allowedActions')}</h3>
          {allowed.length === 0 && <p className="muted">{t('admin.cases.noActions')}</p>}
          <div className="action-row">
            {allowed.map((rule) => (
              <Button
                key={rule.to}
                size="sm"
                variant={rule.to === 'rejected' ? 'danger' : rule.to === 'paused' || rule.to === 'draft' ? 'outline' : 'primary'}
                icon={
                  rule.to === 'published' ? 'send' : rule.to === 'rejected' ? 'x' : rule.to === 'paused' ? 'pause' : rule.to === 'closed' ? 'lock' : 'check'
                }
                onClick={() => perform(rule)}
              >
                {t(`admin.cases.transitions.${rule.to}`)}
              </Button>
            ))}
            {can('cases:prioritize') && (
              <Button size="sm" variant="ghost" icon="pin" onClick={() => run(() => api.setPriority(item.id, item.priority > 0 ? 0 : 10))}>
                {item.priority > 0 ? t('admin.cases.unprioritize') : t('admin.cases.prioritize')}
              </Button>
            )}
            {isPublic && (
              <Button size="sm" variant="ghost" icon="external" onClick={() => goWeb({ page: 'case', slug: item.slug })}>
                {t('proto.admin.openCase')}
              </Button>
            )}
          </div>
          {pending && (
            <div className="reason-box">
              <label htmlFor="transition-reason">{t('admin.cases.reasonLabel')}</label>
              <Textarea
                id="transition-reason"
                rows={2}
                value={reason}
                placeholder={t('admin.cases.reasonPlaceholder')}
                onChange={(event) => setReason(event.target.value)}
                data-autofocus
              />
              <div className="action-row">
                <Button size="sm" onClick={() => perform(pending)} disabled={!reason.trim()}>
                  {t('common.confirm')} · {t(`admin.cases.transitions.${pending.to}`)}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
          {locked.length > 0 && (
            <ul className="locked-actions">
              {locked.map((rule) => (
                <li key={rule.to}>
                  <Icon name="lock" size={14} />
                  <span>{t(`admin.cases.transitions.${rule.to}`)}</span>
                  {rule.permission !== 'system' && <PermissionHint permission={rule.permission} />}
                </li>
              ))}
            </ul>
          )}
          {can('verifications:assign') && item.status === 'under_review' && (
            <div className="assign-row">
              <Select value={auditorId} onChange={(event) => setAuditorId(event.target.value)} aria-label={t('admin.cases.auditor')}>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {l(member.name)}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="outline" icon="users" onClick={() => run(() => api.assignAuditor(item.id, auditorId))}>
                {t('admin.verification.assigned')}
              </Button>
            </div>
          )}
        </section>

        <section className="drawer-section">
          <h3>{t('admin.cases.history')}</h3>
          <ol className="history">
            {[...item.history].reverse().map((change, index) => (
              <li key={index}>
                <span className="history-dot" />
                <div>
                  <strong>
                    {change.from ? `${t(`status.${change.from}`)} ← ` : ''}
                    {t(`status.${change.to}`)}
                  </strong>
                  <small>
                    {change.actorName === 'system' ? t('proto.admin.system') : change.actorName} · {f.relative(change.at, now)}
                  </small>
                  {change.reason && <p className="history-reason">{change.reason}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {audit.length > 0 && (
          <section className="drawer-section">
            <h3>{t('admin.audit.title')}</h3>
            <ul className="mini-audit">
              {audit.slice(0, 6).map((entry) => (
                <li key={entry.id}>
                  <span className="mono">{entry.id}</span>
                  <span>
                    {entry.actor.name === 'system' ? t('proto.admin.system') : entry.actor.name} —{' '}
                    {t(`proto.admin.auditActions.${entry.action.replace(/\./g, '_')}` as 'proto.admin.auditActions.case_published')}
                  </span>
                  <time dateTime={entry.at}>{f.relative(entry.at, now)}</time>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
