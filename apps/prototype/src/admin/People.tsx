import { PERMISSIONS, ROLE_PERMISSIONS, STAFF_ROLES, type Role } from '@yusr/core';
import { useState } from 'react';
import { useRead } from '../app/backend';
import { useNow } from '../app/clock';
import { useL, useT } from '../app/i18n';
import { RegionLabel } from '../ui/case-ui';
import { Icon } from '../ui/icons';
import { Avatar, Badge, Input, Select, Tabs, cx, type Tone } from '../ui/primitives';
import { useAdmin } from './common';

const SEGMENT_TONE: Record<string, Tone> = { major: 'gold', recurring: 'primary', new: 'info', lapsed: 'neutral' };

export function CrmSection() {
  const { t, f } = useT();
  const l = useL();
  const now = useNow();
  const [tab, setTab] = useState<'donors' | 'volunteers'>('donors');
  const [q, setQ] = useState('');
  const donors = useRead((read) => read.donors());
  const volunteers = useRead((read) => read.volunteers());
  const match = (name: { ar: string; en: string }) => !q.trim() || `${name.ar} ${name.en}`.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <div className="admin-stack">
      <div className="admin-toolbar">
        <Tabs
          label={t('admin.nav.crm')}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'donors', label: t('admin.crm.donors'), icon: 'heart', count: f.number(donors.length) },
            { value: 'volunteers', label: t('admin.crm.volunteers'), icon: 'users', count: f.number(volunteers.length) },
          ]}
        />
        <Input
          icon="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder={t('common.search')}
          aria-label={t('common.search')}
          className="toolbar-search"
        />
      </div>
      <section className="panel table-scroll">
        {tab === 'donors' ? (
          <table className="table">
            <thead>
              <tr>
                <th>{t('admin.finance.columns.donor')}</th>
                <th>{t('admin.crm.segment')}</th>
                <th className="num">{t('admin.crm.totalGiven')}</th>
                <th className="num">{t('admin.crm.donationsCount')}</th>
                <th>{t('admin.crm.lastDonation')}</th>
                <th>{t('admin.crm.governorate')}</th>
                <th>{t('admin.crm.contact')}</th>
              </tr>
            </thead>
            <tbody>
              {donors
                .filter((donor) => match(donor.name))
                .slice(0, 40)
                .map((donor) => (
                  <tr key={donor.id}>
                    <td>
                      <span className="person">
                        <Avatar name={l(donor.name) ?? ''} size={28} />
                        {l(donor.name)}
                        {donor.id === 'me' && <Badge tone="primary">{t('proto.admin.you')}</Badge>}
                      </span>
                    </td>
                    <td>
                      <Badge tone={SEGMENT_TONE[donor.segment] ?? 'neutral'}>{t(`admin.crm.segments.${donor.segment}`)}</Badge>
                    </td>
                    <td className="num">{f.money(donor.totalMinor, 'EGP', { fractionDigits: 0 })}</td>
                    <td className="num">{f.number(donor.donationsCount)}</td>
                    <td className="nowrap">{f.relative(donor.lastDonationAt, now)}</td>
                    <td>
                      <RegionLabel code={donor.region} withIcon={false} />
                    </td>
                    <td className="mono muted">{donor.contactMasked}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('admin.crm.volunteers')}</th>
                <th>{t('receipt.status')}</th>
                <th className="num">{t('admin.crm.casesSubmitted')}</th>
                <th className="num">{t('admin.crm.visitsDone')}</th>
                <th>{t('admin.crm.governorate')}</th>
                <th>{t('admin.crm.contact')}</th>
              </tr>
            </thead>
            <tbody>
              {volunteers
                .filter((volunteer) => match(volunteer.name))
                .map((volunteer) => (
                  <tr key={volunteer.id}>
                    <td>
                      <span className="person">
                        <Avatar name={l(volunteer.name) ?? ''} size={28} />
                        {l(volunteer.name)}
                      </span>
                    </td>
                    <td>
                      <Badge tone={volunteer.status === 'active' ? 'success' : volunteer.status === 'onboarding' ? 'info' : 'neutral'}>
                        {t(`proto.admin.volunteerStatus.${volunteer.status}`)}
                      </Badge>
                    </td>
                    <td className="num">{f.number(volunteer.casesSubmitted)}</td>
                    <td className="num">{f.number(volunteer.visitsDone)}</td>
                    <td>
                      <RegionLabel code={volunteer.region} withIcon={false} />
                    </td>
                    <td className="mono muted">{volunteer.contactMasked}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export function TeamSection() {
  const { t, f } = useT();
  const l = useL();
  const now = useNow();
  const { persona, can, api, run } = useAdmin();
  const team = useRead((read) => read.team());
  return (
    <div className="admin-stack">
      <section className="panel table-scroll">
        <h2 className="panel-title">{t('admin.team.members')}</h2>
        <table className="table">
          <thead>
            <tr>
              <th>{t('admin.team.members')}</th>
              <th>{t('admin.team.role')}</th>
              <th>{t('admin.team.mfa')}</th>
              <th>{t('admin.team.lastActive')}</th>
            </tr>
          </thead>
          <tbody>
            {team.map((member) => (
              <tr key={member.id}>
                <td>
                  <span className="person">
                    <Avatar name={l(member.name) ?? ''} size={30} />
                    <span className="person-text">
                      <strong>{l(member.name)}</strong>
                      <small className="mono muted">{member.email}</small>
                    </span>
                    {member.id === persona.id && <Badge tone="primary">{t('proto.admin.you')}</Badge>}
                  </span>
                </td>
                <td>
                  {can('team:manage') ? (
                    <Select
                      value={member.roles[0]}
                      aria-label={t('admin.team.role')}
                      onChange={(event) =>
                        run(() => api.updateRoles(member.id, [event.target.value as Role]), t('proto.admin.auditActions.user_roles_updated'))
                      }
                    >
                      {STAFF_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {t(`roles.${role}`)}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone="info">{t(`roles.${member.roles[0]!}`)}</Badge>
                  )}
                </td>
                <td>
                  {member.mfa ? (
                    <Badge tone="success" icon="shield-check">
                      2FA
                    </Badge>
                  ) : (
                    <Badge tone="warning" icon="alert">
                      —
                    </Badge>
                  )}
                </td>
                <td className="nowrap">{f.relative(member.lastActiveAt, now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel table-scroll">
        <h2 className="panel-title">{t('admin.team.matrix')}</h2>
        <table className="table matrix">
          <thead>
            <tr>
              <th />
              {STAFF_ROLES.map((role) => (
                <th key={role} className={cx('matrix-role', persona.roles.includes(role) && 'is-current')}>
                  {t(`roles.${role}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.filter((permission) => permission !== 'cases:submit').map((permission) => (
              <tr key={permission}>
                <th scope="row" className="matrix-perm">
                  {t(`permissions.${permission}`)}
                  <small className="mono muted">{permission}</small>
                </th>
                {STAFF_ROLES.map((role) => (
                  <td key={role} className={cx('matrix-cell', persona.roles.includes(role) && 'is-current')}>
                    {ROLE_PERMISSIONS[role].includes(permission) ? (
                      <Icon name="check" size={16} strokeWidth={2.4} className="matrix-yes" label={t('common.confirm')} />
                    ) : (
                      <span className="matrix-no" aria-hidden>
                        ·
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
