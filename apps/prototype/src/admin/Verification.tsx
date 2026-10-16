import { parseAmountInput, toMinor, type ChecklistItem, type VerificationTask } from '@yusr/core';
import { useState } from 'react';
import { useRead } from '../app/backend';
import { useL, useT } from '../app/i18n';
import { RegionLabel, StatusBadge } from '../ui/case-ui';
import { Icon } from '../ui/icons';
import { Avatar, Badge, Button, Checkbox, EmptyState, Field, Input, cx } from '../ui/primitives';
import { PermissionHint, useAdmin } from './common';

const CHECKLIST: readonly ChecklistItem[] = ['identity', 'residence', 'documents', 'cost', 'alternatives'];

export function VerificationSection() {
  const { t } = useT();
  const tasks = useRead((read) => read.tasks());
  const cases = useRead((read) => read.adminCases());
  const open = tasks.filter((task) => task.status !== 'completed');
  const done = tasks
    .filter((task) => task.status === 'completed')
    .slice(-6)
    .reverse();
  const [selected, setSelected] = useState<string | null>(open[0]?.id ?? null);
  const task = tasks.find((entry) => entry.id === selected);

  return (
    <div className="verify-layout">
      <section className="panel">
        <h2 className="panel-title">
          <Icon name="clipboard-check" size={18} /> {t('admin.verification.title')}
        </h2>
        {open.length === 0 && <EmptyState icon="check" title={t('proto.admin.noTasks')} />}
        <ul className="task-list">
          {[...open, ...done].map((entry) => {
            const item = cases.find((c) => c.id === entry.caseId);
            if (!item) return null;
            return (
              <li key={entry.id}>
                <button type="button" className={cx('task-row', selected === entry.id && 'is-selected')} onClick={() => setSelected(entry.id)}>
                  <span className="task-top">
                    <span className="mono">{item.reference}</span>
                    <Badge tone={entry.status === 'completed' ? 'success' : entry.status === 'scheduled' ? 'info' : 'warning'}>
                      {t(`admin.verification.${entry.status}`)}
                    </Badge>
                  </span>
                  <TaskTitle title={item.title} />
                  <span className="task-meta">
                    <RegionLabel code={item.region} />
                    <span className="task-auditor">
                      <Avatar name={entry.auditorName} size={20} /> {entry.auditorName}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {task ? <TaskDetail task={task} /> : <section className="panel" />}
    </div>
  );
}

function TaskTitle({ title }: { title: { ar: string; en: string } }) {
  const l = useL();
  return <strong className="task-title">{l(title)}</strong>;
}

function TaskDetail({ task }: { task: VerificationTask }) {
  const { t, f } = useT();
  const l = useL();
  const { can, api, run } = useAdmin();
  const item = useRead((read) => read.adminCase(task.caseId));
  const [amount, setAmount] = useState(() => (item ? String(item.goalMinor / 100) : ''));
  const [notes, setNotes] = useState(task.notes ?? '');
  if (!item) return null;
  const complete = Object.values(task.checklist).every(Boolean);
  const editable = task.status !== 'completed' && can('verifications:perform');
  const amountMajor = parseAmountInput(amount);

  return (
    <section className="panel task-detail">
      <div className="task-detail-head">
        <div>
          <span className="mono muted">{item.reference}</span>
          <h2>{l(item.title)}</h2>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <p className="muted">{l(item.summary)}</p>
      <div className="task-facts">
        <span>
          <Icon name="map-pin" size={15} /> <RegionLabel code={item.region} withIcon={false} />
        </span>
        <span>
          <Icon name="calendar" size={15} /> {t('admin.verification.visitDate')}: {task.visitAt ? f.dateTime(task.visitAt) : '—'}
        </span>
        <span>
          <Icon name="banknote" size={15} /> {t('admin.cases.goal')}: {f.money(item.goalMinor, item.currency)}
        </span>
      </div>
      <h3 className="drawer-h3">{t('case.documents')}</h3>
      <ul className="doc-rows">
        {item.documents.map((document) => (
          <li key={document.id}>
            <Icon name="file-text" size={16} />
            <span>{t(`case.documentKinds.${document.kind}`)}</span>
            {can('documents:read_private') ? (
              <Badge tone="primary" icon="eye">
                {t('proto.admin.readOnly')}
              </Badge>
            ) : (
              <Badge tone="neutral" icon="lock">
                {t('case.redacted')}
              </Badge>
            )}
          </li>
        ))}
      </ul>
      <h3 className="drawer-h3">{t('proto.admin.checklist')}</h3>
      <div className="checklist">
        {CHECKLIST.map((key) => (
          <Checkbox
            key={key}
            checked={task.checklist[key]}
            onChange={(checked) => {
              if (editable) void run(() => api.updateChecklist(task.id, key, checked));
            }}
            label={t(`admin.verification.checklist.${key}`)}
          />
        ))}
      </div>
      {!editable && task.status !== 'completed' && <PermissionHint permission="verifications:perform" />}
      {task.status !== 'completed' && (
        <div className="task-complete">
          <div className="form-row-2">
            <Field label={t('proto.admin.recommended')} htmlFor="recommended">
              <span className="amount-input">
                <Input id="recommended" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                <span className="amount-suffix">{f.currencyLabel(item.currency)}</span>
              </span>
            </Field>
            <Field label={t('admin.verification.recommend')} htmlFor="notes">
              <Input id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </div>
          <Button
            icon="shield-check"
            disabled={!complete || !can('cases:verify') || !amountMajor}
            onClick={() =>
              run(
                () => api.completeVerification(task.id, toMinor(amountMajor ?? 0, item.currency), notes),
                t('admin.cases.transitioned', { status: t('status.field_verified') }),
              )
            }
          >
            {t('admin.verification.approve')}
          </Button>
          {!complete && <p className="muted">{t('proto.admin.fillChecklist')}</p>}
          {!can('cases:verify') && <PermissionHint permission="cases:verify" />}
        </div>
      )}
      {task.status === 'completed' && (
        <p className="notice notice-info">
          <Icon name="check" size={16} /> {t('proto.admin.checklistDone')} ·{' '}
          {task.recommendedMinor !== null ? f.money(task.recommendedMinor, item.currency) : ''}
        </p>
      )}
    </section>
  );
}
