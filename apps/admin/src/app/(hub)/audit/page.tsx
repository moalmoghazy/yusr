import { textFor } from '@yusr/ui';
import type { Metadata } from 'next';
import { NoAccess } from '@/components/no-access';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.nav.audit') };
}

/** The append-only audit trail: who did what to which record, with the values before and after. */
export default async function AuditPage() {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t, f } = textFor(locale);
  if (!staff.permissions.has('audit:read')) return <NoAccess message={t('admin.noAccess')} />;
  const entries = await (await adminApi()).audit(100);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t('admin.audit.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('admin.audit.immutable')}</p>
      </div>
      <div className="overflow-x-auto rounded-card border border-border bg-card">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {(['when', 'actor', 'action', 'entity', 'change'] as const).map((column) => (
                <th key={column} scope="col" className="p-3 text-start font-semibold">
                  {t(`admin.audit.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => (
              <tr key={entry.id} className="align-top">
                <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{f.dateTime(entry.at)}</td>
                <td className="p-3">
                  <p className="font-semibold">{entry.actor.name}</p>
                  <p className="text-xs text-muted-foreground">{entry.actor.role === 'system' ? 'system' : t(`roles.${entry.actor.role}`)}</p>
                </td>
                <td className="p-3 font-mono text-xs" dir="ltr">
                  {entry.action}
                </td>
                <td className="p-3">
                  <p>{entry.entityLabel}</p>
                  <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {entry.entityType}
                  </p>
                </td>
                <td className="max-w-[24rem] p-3">
                  <Change before={entry.before} after={entry.after} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Change({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return <span className="text-muted-foreground">—</span>;
  const show = (value: unknown) => (value === undefined || value === null ? '∅' : typeof value === 'object' ? JSON.stringify(value) : String(value));
  return (
    <dl className="flex flex-col gap-1 font-mono text-xs" dir="ltr">
      {keys.map((key) => (
        <div key={key} className="flex flex-wrap gap-1">
          <dt className="text-muted-foreground">{key}:</dt>
          <dd>
            {before && key in before && <del className="text-destructive">{show(before[key])}</del>}{' '}
            {after && key in after && <ins className="text-success no-underline">{show(after[key])}</ins>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
