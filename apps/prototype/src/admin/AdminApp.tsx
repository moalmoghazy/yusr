import type { Permission } from '@yusr/core';
import { I18nProvider } from '@yusr/i18n/react';
import { useEffect } from 'react';
import { PERSONAS } from '../app/backend';
import { MESSAGES, useT } from '../app/i18n';
import { usePrototype, type AdminSection } from '../app/prefs';
import { useRead } from '../app/backend';
import { Lockup } from '../ui/brand';
import { Icon, type IconName } from '../ui/icons';
import { Avatar, Select, cx } from '../ui/primitives';
import { AuditSection } from './Audit';
import { CasesSection } from './Cases';
import { useAdmin } from './common';
import { FinanceSection } from './Finance';
import { OverviewSection } from './Overview';
import { CrmSection, TeamSection } from './People';
import { VerificationSection } from './Verification';

const SECTIONS: ReadonlyArray<{ key: AdminSection; icon: IconName; permission: Permission }> = [
  { key: 'overview', icon: 'grid', permission: 'cases:read' },
  { key: 'cases', icon: 'kanban', permission: 'cases:read' },
  { key: 'verification', icon: 'clipboard-check', permission: 'cases:read' },
  { key: 'finance', icon: 'banknote', permission: 'finance:read' },
  { key: 'crm', icon: 'users', permission: 'crm:read' },
  { key: 'team', icon: 'shield', permission: 'team:manage' },
  { key: 'audit', icon: 'history', permission: 'audit:read' },
];

/** The control hub uses Latin digits for dense data tables; the donor apps use Arabic-Indic. */
export function AdminApp() {
  const { locale } = usePrototype();
  return (
    <I18nProvider locale={locale} messages={MESSAGES[locale]} numberingSystem="latn">
      <AdminShell />
    </I18nProvider>
  );
}

function AdminShell() {
  const { t } = useT();
  const { admin, goAdmin, persona, setPersonaId, locale } = usePrototype();
  const { can } = useAdmin();
  const counts = useRead((read) => ({
    review: read.adminCases().filter((item) => item.status === 'under_review' || item.status === 'field_verified').length,
    transfers: read.donations({ status: 'awaiting_transfer' }).length,
    tasks: read.tasks().filter((task) => task.status !== 'completed').length,
  }));
  const visible = SECTIONS.filter((section) => can(section.permission));
  const allowed = visible.some((section) => section.key === admin.section);

  useEffect(() => {
    if (!allowed && visible[0]) goAdmin({ section: visible[0].key });
  }, [allowed, visible, goAdmin]);

  const badge: Partial<Record<AdminSection, number>> = { cases: counts.review, finance: counts.transfers, verification: counts.tasks };
  const personaName = locale === 'ar' ? persona.name : persona.nameEn;

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-brand">
          <Lockup lang={locale} size={27} />
          <span className="sr-only">{t('common.appName')}</span>
          <span className="admin-brand-hub">{t('admin.title')}</span>
        </div>
        <nav className="admin-nav" aria-label={t('admin.title')}>
          {visible.map((section) => (
            <button
              key={section.key}
              type="button"
              className={cx('admin-nav-item', admin.section === section.key && 'is-active')}
              aria-current={admin.section === section.key ? 'page' : undefined}
              onClick={() => goAdmin({ section: section.key })}
            >
              <Icon name={section.icon} size={18} />
              <span>{t(`admin.nav.${section.key}`)}</span>
              {badge[section.key] ? <span className="nav-badge">{badge[section.key]}</span> : null}
            </button>
          ))}
          {SECTIONS.filter((section) => !can(section.permission)).map((section) => (
            <span key={section.key} className="admin-nav-item is-locked" title={t('admin.noAccess')}>
              <Icon name="lock" size={16} />
              <span>{t(`admin.nav.${section.key}`)}</span>
            </span>
          ))}
        </nav>
        <div className="persona-card">
          <label htmlFor="persona" className="persona-label">
            {t('proto.admin.switchRole')}
          </label>
          <div className="persona-row">
            <Avatar name={personaName} size={36} />
            <Select id="persona" value={persona.id} onChange={(event) => setPersonaId(event.target.value)}>
              {PERSONAS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {(locale === 'ar' ? entry.name : entry.nameEn) + ' — ' + t(`roles.${entry.roles[0]!}`)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-top">
          <div>
            <p className="admin-crumb">{t('admin.title')}</p>
            <h1>{t(`admin.nav.${admin.section}`)}</h1>
          </div>
          <div className="admin-top-right">
            <span className="viewing-as">
              {t('admin.viewingAs')} <strong>{t(`roles.${persona.roles[0]!}`)}</strong>
            </span>
          </div>
        </header>
        <div className="admin-content" key={`${admin.section}:${persona.id}`}>
          {!allowed ? (
            <p className="notice notice-warning">
              <Icon name="lock" size={16} /> {t('admin.noAccess')}
            </p>
          ) : admin.section === 'overview' ? (
            <OverviewSection />
          ) : admin.section === 'cases' ? (
            <CasesSection initialCaseId={admin.caseId} />
          ) : admin.section === 'verification' ? (
            <VerificationSection />
          ) : admin.section === 'finance' ? (
            <FinanceSection initialTab={admin.financeTab} />
          ) : admin.section === 'crm' ? (
            <CrmSection />
          ) : admin.section === 'team' ? (
            <TeamSection />
          ) : (
            <AuditSection />
          )}
        </div>
      </div>
    </div>
  );
}
