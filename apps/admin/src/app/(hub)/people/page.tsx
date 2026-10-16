import { regionByCode, type DonorSegment } from '@yusr/core';
import { Badge, cn, Icon, textFor, type BadgeTone } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { NoAccess } from '@/components/no-access';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.nav.crm') };
}

type Tab = 'donors' | 'volunteers' | 'team';

const SEGMENT_TONE: Record<DonorSegment, BadgeTone> = { major: 'gold', recurring: 'primary', new: 'info', lapsed: 'neutral' };
const VOLUNTEER_TONE = { active: 'success', onboarding: 'info', paused: 'neutral' } as const satisfies Record<string, BadgeTone>;

/**
 * Donors, volunteers and the team. Contact details arrive masked from the API (full numbers and
 * emails stay in the encrypted columns); this page is for relationships, not for exporting people.
 */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t, f, l } = textFor(locale);
  const crm = staff.permissions.has('crm:read');
  const tabs: Tab[] = crm ? ['donors', 'volunteers', 'team'] : ['team'];
  const requested = (await searchParams).tab as Tab | undefined;
  const tab: Tab = requested && tabs.includes(requested) ? requested : tabs[0]!;
  if (!staff.permissions.has('cases:read')) return <NoAccess message={t('admin.noAccess')} />;

  const api = await adminApi();
  const region = (code: string) => {
    const found = regionByCode(code);
    return found ? l(found.name) : code === 'INT' ? t('common.international') : code;
  };
  const labels: Record<Tab, string> = { donors: t('admin.crm.donors'), volunteers: t('admin.crm.volunteers'), team: t('admin.team.members') };

  let table: ReactNode;
  if (tab === 'donors') {
    const rows = await api.donors();
    table = (
      <Table
        head={[
          t('donate.name'),
          t('admin.crm.governorate'),
          t('admin.crm.totalGiven'),
          t('admin.crm.donationsCount'),
          t('admin.crm.lastDonation'),
          t('admin.crm.segment'),
          t('admin.crm.contact'),
        ]}
        empty={t('admin.crm.empty')}
        rows={rows.map((row) => [
          <span key="n" dir="auto" className="font-semibold">
            {l(row.name)}
          </span>,
          region(row.region),
          <span key="t" className="font-semibold tabular-nums">
            {f.money(row.totalMinor, 'EGP', { fractionDigits: 0 })}
          </span>,
          <span key="c" className="tabular-nums">
            {f.number(row.donationsCount)}
          </span>,
          <time key="d" dateTime={row.lastDonationAt}>
            {f.relative(row.lastDonationAt)}
          </time>,
          <Badge key="s" tone={SEGMENT_TONE[row.segment]}>
            {t(`admin.crm.segments.${row.segment}`)}
          </Badge>,
          <span key="m" dir="ltr" className="font-mono text-xs text-muted-foreground">
            {row.contactMasked}
          </span>,
        ])}
      />
    );
  } else if (tab === 'volunteers') {
    const rows = await api.volunteers();
    table = (
      <Table
        head={[
          t('donate.name'),
          t('admin.crm.governorate'),
          t('admin.crm.casesSubmitted'),
          t('admin.crm.visitsDone'),
          t('receipt.status'),
          t('admin.crm.joined'),
          t('admin.crm.contact'),
        ]}
        empty={t('admin.crm.empty')}
        rows={rows.map((row) => [
          <span key="n" dir="auto" className="font-semibold">
            {l(row.name)}
          </span>,
          region(row.region),
          <span key="c" className="tabular-nums">
            {f.number(row.casesSubmitted)}
          </span>,
          <span key="v" className="tabular-nums">
            {f.number(row.visitsDone)}
          </span>,
          <Badge key="s" tone={VOLUNTEER_TONE[row.status]}>
            {t(`admin.crm.statuses.${row.status}`)}
          </Badge>,
          <time key="j" dateTime={row.joinedAt}>
            {f.date(row.joinedAt, 'medium')}
          </time>,
          <span key="m" dir="ltr" className="font-mono text-xs text-muted-foreground">
            {row.contactMasked}
          </span>,
        ])}
      />
    );
  } else {
    const rows = await api.team();
    table = (
      <Table
        head={[t('donate.name'), t('donate.email'), t('admin.team.role'), t('admin.team.mfa'), t('admin.team.lastActive')]}
        empty={t('admin.crm.empty')}
        rows={rows.map((member) => [
          <span key="n" dir="auto" className="font-semibold">
            {l(member.name)}
          </span>,
          <span key="e" dir="ltr" className="text-xs">
            {member.email}
          </span>,
          <span key="r" className="flex flex-wrap gap-1">
            {member.roles
              .filter((role) => role !== 'donor')
              .map((role) => (
                <Badge key={role} tone="primary">
                  {t(`roles.${role}`)}
                </Badge>
              ))}
          </span>,
          <span key="m" className={cn('inline-flex items-center gap-1 text-xs font-semibold', member.mfa ? 'text-success' : 'text-destructive')}>
            <Icon name={member.mfa ? 'shield-check' : 'alert'} size={14} />
            {member.mfa ? t('admin.team.mfaOn') : t('admin.team.mfaOff')}
          </span>,
          <time key="a" dateTime={member.lastActiveAt}>
            {f.relative(member.lastActiveAt)}
          </time>,
        ])}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{t('admin.nav.crm')}</h1>
      <nav aria-label={t('admin.nav.crm')} className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((item) => (
          <Link
            key={item}
            href={`/people?tab=${item}`}
            aria-current={item === tab ? 'page' : undefined}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold',
              item === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {labels[item]}
          </Link>
        ))}
      </nav>
      {table}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="rounded-card border border-dashed border-border-strong p-8 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-card">
      <table className="w-full min-w-[44rem] text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            {head.map((label) => (
              <th key={label} scope="col" className="p-3 text-start font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index} className="border-t border-border">
              {cells.map((cell, column) => (
                <td key={column} className="whitespace-nowrap p-3">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
