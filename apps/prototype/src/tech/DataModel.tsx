import { useMemo, useState } from 'react';
import { useT } from '../app/i18n';
import { Icon, type IconName } from '../ui/icons';
import { cx } from '../ui/primitives';
import { manifest, type Domain } from './manifest';

const DOMAINS: ReadonlyArray<{ id: Domain; icon: IconName }> = [
  { id: 'identity', icon: 'users' },
  { id: 'cases', icon: 'clipboard-check' },
  { id: 'money', icon: 'coins' },
  { id: 'operations', icon: 'history' },
];

const INVARIANTS: ReadonlyArray<{ key: 'balanced' | 'appendOnly' | 'fundFloor' | 'fourEyes' | 'statusGuard' | 'once'; icon: IconName }> = [
  { key: 'balanced', icon: 'coins' },
  { key: 'appendOnly', icon: 'lock' },
  { key: 'fundFloor', icon: 'shield-check' },
  { key: 'fourEyes', icon: 'users' },
  { key: 'statusGuard', icon: 'workflow' },
  { key: 'once', icon: 'check' },
];

/**
 * The PostgreSQL schema, parsed from the migration at build time. Selecting a table shows
 * its columns and traces what it references and what references it.
 */
export function DataModel() {
  const { t, f } = useT();
  const { tables, views, enums, indexes, triggers, lines } = manifest.schema;
  const [selected, setSelected] = useState('donations');
  const table = tables.find((item) => item.name === selected) ?? tables[0]!;
  const references = useMemo(
    () => [...new Set(table.columns.map((column) => column.fk).filter((name): name is string => Boolean(name) && name !== table.name))],
    [table],
  );
  const referencedBy = useMemo(
    () => tables.filter((item) => item.name !== table.name && item.columns.some((column) => column.fk === table.name)).map((item) => item.name),
    [table, tables],
  );
  const related = new Set([...references, ...referencedBy]);

  return (
    <div className="erd">
      <div className="erd-layout">
        <div className="erd-domains">
          {DOMAINS.map((domain) => (
            <div key={domain.id} className={cx('erd-domain', `is-${domain.id}`)}>
              <h3>
                <Icon name={domain.icon} size={16} /> {t(`proto.tech.domains.${domain.id}`)}
              </h3>
              <div className="erd-tables">
                {tables
                  .filter((item) => item.domain === domain.id)
                  .map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className={cx('erd-table', item.name === table.name && 'is-selected', related.has(item.name) && 'is-related')}
                      aria-pressed={item.name === table.name}
                      onClick={() => setSelected(item.name)}
                    >
                      <code>{item.name}</code>
                      <small>{f.number(item.columns.length)}</small>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          <div className="erd-domain is-views">
            <h3>
              <Icon name="eye" size={16} /> {t('proto.tech.views')}
            </h3>
            <ul className="erd-views">
              {views.map((view) => (
                <li key={view.name}>
                  <code>{view.name}</code>
                  {view.note && (
                    <small lang="en" dir="ltr">
                      {view.note}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <article className="erd-detail" aria-live="polite">
          <header>
            <code className="erd-detail-name">{table.name}</code>
            <span className="muted">
              {t(`proto.tech.domains.${table.domain}`)} · {t('proto.tech.columns', { count: table.columns.length })}
            </span>
          </header>
          <ul className="erd-columns">
            {table.columns.map((column) => (
              <li key={column.name} className={cx(column.pk && 'is-pk')}>
                <span className="erd-col-key" aria-hidden>
                  {column.pk ? <Icon name="lock" size={12} /> : column.fk ? <Icon name="arrow-out" size={12} /> : null}
                </span>
                <code className="erd-col-name">{column.name}</code>
                <code className="erd-col-type" title={column.notNull ? 'NOT NULL' : 'NULL allowed'}>
                  {column.type}
                  {column.notNull ? '' : '?'}
                </code>
                {column.fk && (
                  <button type="button" className="erd-fk" onClick={() => setSelected(column.fk!)}>
                    → {column.fk}
                  </button>
                )}
                {column.note && (
                  <small className="erd-col-note" lang="en" dir="ltr">
                    {column.note}
                  </small>
                )}
              </li>
            ))}
          </ul>
          {(references.length > 0 || referencedBy.length > 0) && (
            <footer className="erd-relations">
              {references.length > 0 && (
                <div>
                  <span>{t('proto.tech.references')}</span>
                  {references.map((name) => (
                    <button key={name} type="button" className="erd-link" onClick={() => setSelected(name)}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
              {referencedBy.length > 0 && (
                <div>
                  <span>{t('proto.tech.referencedBy')}</span>
                  {referencedBy.map((name) => (
                    <button key={name} type="button" className="erd-link" onClick={() => setSelected(name)}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </footer>
          )}
        </article>
      </div>

      <p className="muted erd-counts">
        {t('proto.tech.tableHint')} ·{' '}
        {t('proto.tech.schemaCounts', { enums: f.number(enums), indexes: f.number(indexes), triggers: f.number(triggers), lines: f.number(lines) })}
      </p>

      <h3 className="doc-h3">
        <Icon name="shield-check" size={18} /> {t('proto.tech.invariantsTitle')}
      </h3>
      <ul className="invariants">
        {INVARIANTS.map((item) => (
          <li key={item.key}>
            <span className="invariant-icon">
              <Icon name={item.icon} size={18} />
            </span>
            {t(`proto.tech.invariants.${item.key}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
