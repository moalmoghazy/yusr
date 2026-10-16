import { Fragment } from 'react';
import { useT } from '../app/i18n';
import { Icon, type IconName } from '../ui/icons';

const STACK: ReadonlyArray<{ key: 'web' | 'mobile' | 'api' | 'data' | 'auth' | 'payments' | 'quality'; icon: IconName }> = [
  { key: 'web', icon: 'monitor' },
  { key: 'mobile', icon: 'smartphone' },
  { key: 'api', icon: 'server' },
  { key: 'data', icon: 'database' },
  { key: 'auth', icon: 'lock' },
  { key: 'payments', icon: 'credit-card' },
  { key: 'quality', icon: 'shield-check' },
];

const SECURITY: ReadonlyArray<{ key: 'pci' | 'webhooks' | 'rbac' | 'pii' | 'audit' | 'rate'; icon: IconName }> = [
  { key: 'pci', icon: 'credit-card' },
  { key: 'webhooks', icon: 'shield-check' },
  { key: 'rbac', icon: 'users' },
  { key: 'pii', icon: 'eye-off' },
  { key: 'audit', icon: 'history' },
  { key: 'rate', icon: 'clock' },
];

const TOOLS: ReadonlyArray<{ key: 'linear' | 'slack' | 'baserow' | 'chatwoot' | 'posthog' | 'sentry'; name: string; icon: IconName }> = [
  { key: 'linear', name: 'Linear', icon: 'kanban' },
  { key: 'slack', name: 'Slack', icon: 'message' },
  { key: 'baserow', name: 'Baserow', icon: 'grid' },
  { key: 'chatwoot', name: 'Chatwoot', icon: 'phone' },
  { key: 'posthog', name: 'PostHog', icon: 'activity' },
  { key: 'sentry', name: 'Sentry', icon: 'alert' },
];

const FLOW: ReadonlyArray<{ key: 'submitted' | 'slack' | 'baserow' | 'visit' | 'verified' | 'published'; icon: IconName }> = [
  { key: 'submitted', icon: 'send' },
  { key: 'slack', icon: 'message' },
  { key: 'baserow', icon: 'grid' },
  { key: 'visit', icon: 'map-pin' },
  { key: 'verified', icon: 'clipboard-check' },
  { key: 'published', icon: 'heart' },
];

export function Stack() {
  const { t } = useT();
  return (
    <>
      <div className="stack-grid">
        {STACK.map((item) => (
          <article key={item.key} className="stack-card">
            <span className="stack-icon">
              <Icon name={item.icon} size={20} />
            </span>
            <h3>{t(`proto.tech.stack.${item.key}.title`)}</h3>
            <p>{t(`proto.tech.stack.${item.key}.body`)}</p>
          </article>
        ))}
      </div>
      <h3 className="doc-h3">
        <Icon name="lock" size={18} /> {t('proto.tech.security')}
      </h3>
      <ul className="security-grid">
        {SECURITY.map((item) => (
          <li key={item.key}>
            <span className="invariant-icon">
              <Icon name={item.icon} size={18} />
            </span>
            {t(`proto.tech.securityItems.${item.key}`)}
          </li>
        ))}
      </ul>
    </>
  );
}

export function Operations() {
  const { t } = useT();
  return (
    <>
      <ol className="ops-flow">
        {FLOW.map((item, index) => (
          <Fragment key={item.key}>
            <li>
              <span className="ops-step-icon">
                <Icon name={item.icon} size={18} />
              </span>
              <span>{t(`proto.tech.opsFlow.${item.key}`)}</span>
            </li>
            {index < FLOW.length - 1 && (
              <li className="ops-arrow" aria-hidden>
                <Icon name="arrow-forward" size={16} />
              </li>
            )}
          </Fragment>
        ))}
      </ol>
      <div className="tools-grid">
        {TOOLS.map((tool) => (
          <article key={tool.key} className="tool-card">
            <span className="stack-icon">
              <Icon name={tool.icon} size={18} />
            </span>
            <div>
              <h3>{tool.name}</h3>
              <p>{t(`proto.tech.tools.${tool.key}`)}</p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export function Roadmap() {
  const { t, f } = useT();
  return (
    <ol className="roadmap">
      {(['p1', 'p2', 'p3', 'p4'] as const).map((phase, index) => (
        <li key={phase} className="roadmap-phase">
          <span className="roadmap-dot">{f.number(index + 1)}</span>
          <span className="roadmap-weeks">{t(`proto.tech.phases.${phase}.weeks`)}</span>
          <h3>{t(`proto.tech.phases.${phase}.title`)}</h3>
          <p>{t(`proto.tech.phases.${phase}.body`)}</p>
        </li>
      ))}
    </ol>
  );
}
