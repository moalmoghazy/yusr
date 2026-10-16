import { useMemo, useState } from 'react';
import { useT } from '../app/i18n';
import { Icon } from '../ui/icons';
import { Chip, Input, cx } from '../ui/primitives';
import { manifest, type EndpointFact } from './manifest';

/** Area names for the route groups (the tags in the endpoint table and OpenAPI). */
const TAGS: Readonly<Record<string, { ar: string; en: string }>> = {
  System: { ar: 'النظام', en: 'System' },
  Catalog: { ar: 'الكتالوج', en: 'Catalog' },
  Donations: { ar: 'التبرعات', en: 'Donations' },
  Submissions: { ar: 'تقديم الحالات', en: 'Submissions' },
  Auth: { ar: 'الدخول', en: 'Sign-in' },
  Me: { ar: 'حسابي', en: 'My account' },
  Payments: { ar: 'المدفوعات', en: 'Payments' },
  'Operations · Cases': { ar: 'التشغيل · الحالات', en: 'Operations · Cases' },
  'Operations · Finance': { ar: 'التشغيل · المالية', en: 'Operations · Finance' },
  'Operations · People': { ar: 'التشغيل · الأشخاص', en: 'Operations · People' },
};

const ACCESS_ICON = { public: 'eye', user: 'user', staff: 'shield-check' } as const;

export function ApiReference() {
  const { t, locale } = useT();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => [...new Set(manifest.endpoints.map((route) => route.tag))], []);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return manifest.endpoints.filter(
      (route) =>
        (!tag || route.tag === tag) &&
        (!needle || `${route.method} ${route.path} ${route.summary} ${route.permission ?? ''} ${route.id}`.toLowerCase().includes(needle)),
    );
  }, [query, tag]);
  const groups = tags.map((name) => ({ name, routes: visible.filter((route) => route.tag === name) })).filter((group) => group.routes.length > 0);
  const tagLabel = (name: string) => TAGS[name]?.[locale] ?? name;

  return (
    <div className="api-ref">
      <div className="api-controls">
        <Input
          icon="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('proto.tech.apiSearch')}
          aria-label={t('proto.tech.apiSearch')}
          dir="auto"
        />
        <div className="chip-row api-tags">
          <Chip selected={tag === null} onClick={() => setTag(null)} count={manifest.endpoints.length}>
            {t('proto.tech.apiAll')}
          </Chip>
          {tags.map((name) => (
            <Chip
              key={name}
              selected={tag === name}
              onClick={() => setTag(tag === name ? null : name)}
              count={manifest.endpoints.filter((route) => route.tag === name).length}
            >
              {tagLabel(name)}
            </Chip>
          ))}
        </div>
      </div>
      {groups.length === 0 && <p className="muted api-empty">{t('proto.tech.apiEmpty')}</p>}
      {groups.map((group) => (
        <section key={group.name} className="api-group">
          <h3 className="api-group-title">
            {tagLabel(group.name)} <span className="muted">{t('proto.tech.apiRoutes', { count: group.routes.length })}</span>
          </h3>
          <ul className="api-list">
            {group.routes.map((route) => (
              <Route key={route.id} route={route} />
            ))}
          </ul>
        </section>
      ))}
      <p className="muted api-footnote">
        <Icon name="code" size={15} /> <code dir="ltr">GET /v1/openapi.json</code> · OpenAPI 3.1 ·{' '}
        {t('proto.tech.apiRoutes', { count: manifest.endpoints.length })}
      </p>
    </div>
  );
}

function Route({ route }: { route: EndpointFact }) {
  const { t, f } = useT();
  return (
    <li className="api-row">
      <span className={cx('api-method', `is-${route.method.toLowerCase()}`)}>{route.method}</span>
      <code className="api-path" dir="ltr">
        {route.path.split(/(:[a-zA-Z]+|\*[a-zA-Z]+)/).map((part, i) => (part.startsWith(':') || part.startsWith('*') ? <em key={i}>{part}</em> : part))}
      </code>
      <span className="api-summary" lang="en" dir="ltr">
        {route.summary}
      </span>
      <span className="api-meta">
        <span className={cx('api-access', `is-${route.access}`)}>
          <Icon name={ACCESS_ICON[route.access]} size={13} /> {t(`proto.tech.access.${route.access}`)}
        </span>
        {route.permission && (
          <span className="api-permission" title={t(`permissions.${route.permission}` as 'permissions.cases:read')}>
            {t(`permissions.${route.permission}` as 'permissions.cases:read')}
          </span>
        )}
        {route.rateLimit && (
          <span className="api-flag" title={t('proto.tech.rateLimited', { rule: route.rateLimit })}>
            <Icon name="clock" size={13} />
            <span className="sr-only">{t('proto.tech.rateLimited', { rule: route.rateLimit })}</span>
          </span>
        )}
        {route.cacheSeconds && (
          <span className="api-flag" title={t('proto.tech.cachedFor', { seconds: f.number(route.cacheSeconds) })}>
            <Icon name="zap" size={13} />
            <span className="sr-only">{t('proto.tech.cachedFor', { seconds: f.number(route.cacheSeconds) })}</span>
          </span>
        )}
      </span>
    </li>
  );
}
