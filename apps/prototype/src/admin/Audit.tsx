import { useRead } from '../app/backend';
import { useNow } from '../app/clock';
import { useT } from '../app/i18n';
import { Icon } from '../ui/icons';
import { Avatar, Badge } from '../ui/primitives';

function formatChange(
  value: Record<string, unknown> | null,
  label: (key: string) => string,
  translate: (status: string) => string,
  number: (value: number) => string,
): string {
  if (!value) return '—';
  return Object.entries(value)
    .map(([key, raw]) => {
      const shown =
        key === 'status' && typeof raw === 'string'
          ? translate(raw)
          : key === 'amountMinor' && typeof raw === 'number'
            ? number(raw / 100)
            : Array.isArray(raw)
              ? raw.join(', ')
              : String(raw);
      return `${label(key)}: ${shown}`;
    })
    .join(' · ');
}

export function AuditSection() {
  const { t, f } = useT();
  const now = useNow();
  const entries = useRead((read) => read.audit(120));
  const status = (value: string) => t(`status.${value}` as 'status.draft');
  const label = (key: string) => t(`proto.admin.fields.${key}` as 'proto.admin.fields.status');
  const number = (value: number) => f.number(value);
  return (
    <div className="admin-stack">
      <p className="notice notice-info">
        <Icon name="lock" size={16} /> {t('admin.audit.immutable')}
      </p>
      <section className="panel table-scroll">
        <table className="table audit-table">
          <thead>
            <tr>
              <th>{t('admin.audit.when')}</th>
              <th>{t('admin.audit.actor')}</th>
              <th>{t('admin.audit.action')}</th>
              <th>{t('admin.audit.entity')}</th>
              <th>{t('admin.audit.change')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="nowrap">
                  {f.relative(entry.at, now)}
                  <small className="mono muted">{entry.id}</small>
                </td>
                <td>
                  <span className="person">
                    <Avatar name={entry.actor.name === 'system' ? '⚙' : entry.actor.name} size={26} />
                    <span className="person-text">
                      <strong>{entry.actor.name === 'system' ? t('proto.admin.system') : entry.actor.name}</strong>
                      {entry.actor.role !== 'system' && <small className="muted">{t(`roles.${entry.actor.role}`)}</small>}
                    </span>
                  </span>
                </td>
                <td>{t(`proto.admin.auditActions.${entry.action.replace(/\./g, '_')}` as 'proto.admin.auditActions.case_published')}</td>
                <td>
                  <Badge tone="neutral">{t(`proto.admin.entities.${entry.entityType}`)}</Badge> <span className="mono">{entry.entityLabel}</span>
                </td>
                <td className="audit-change">
                  <span className="muted">{formatChange(entry.before, label, status, number)}</span>
                  <Icon name="arrow-forward" size={14} />
                  <span>{formatChange(entry.after, label, status, number)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
