import { canSeeSentMessages, type SentMessage } from '@yusr/core';
import { ApiError } from '@yusr/sdk';
import { Badge, buttonClasses, Icon, textFor, type BadgeTone, type IconName } from '@yusr/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/no-access';
import { onDemoData } from '@/lib/env';
import { hubLocale, hubText } from '@/lib/i18n';
import { adminApi, currentStaff } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await hubText();
  return { title: t('admin.messages.title') };
}

const CHANNEL_ICON: Record<SentMessage['channel'], IconName> = { email: 'mail', whatsapp: 'message', sms: 'phone', push: 'bell' };
const DELIVERY_TONE: Record<SentMessage['delivery'], BadgeTone> = { logged: 'neutral', sent: 'success', failed: 'warning' };

/**
 * «الرسائل المرسلة» — demo data only: what the platform sent, or would have sent, to donors (receipt,
 * case funded, payout, case closed), so the flows can be tried without any provider. Recipients come
 * masked from the API and receipt tokens hidden; super admins and content moderators only.
 */
export default async function MessagesPage() {
  const [staff, locale] = await Promise.all([currentStaff(), hubLocale()]);
  const { t, f } = textFor(locale);
  if (!onDemoData()) return <NoAccess message={t('admin.messages.demoOnly')} />;
  if (!canSeeSentMessages(staff.claims.roles)) return <NoAccess message={t('admin.noAccess')} />;

  const api = await adminApi();
  let messages: SentMessage[];
  try {
    messages = await api.sentMessages(150);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return <NoAccess message={t('admin.messages.demoOnly')} />;
    throw error;
  }
  const cases = staff.permissions.has('cases:read') ? await api.cases() : [];
  const references = new Map(cases.map((item) => [item.id, item.reference]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-3xl flex-col gap-1">
          <h1 className="text-2xl font-bold">{t('admin.messages.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('admin.messages.intro')}</p>
        </div>
        <Link href="/messages" className={buttonClasses({ variant: 'outline', size: 'sm' })}>
          <Icon name="refresh" size={16} />
          {t('admin.messages.refresh')}
        </Link>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong p-12 text-center text-muted-foreground">
          <Icon name="send" size={28} />
          <p>{t('admin.messages.empty')}</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {messages.map((message) => {
            const reference = message.caseId ? references.get(message.caseId) : undefined;
            return (
              <li key={message.id} className="flex min-w-0 flex-col gap-2.5 rounded-card border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge
                    tone={message.channel === 'whatsapp' ? 'success' : message.channel === 'email' ? 'info' : 'neutral'}
                    icon={CHANNEL_ICON[message.channel]}
                  >
                    {t(`admin.messages.channels.${message.channel}`)}
                  </Badge>
                  <span className="sr-only">{t('admin.messages.recipient')}:</span>
                  <span className="font-mono text-xs" dir="ltr">
                    {message.to}
                  </span>
                  <Badge tone={DELIVERY_TONE[message.delivery]}>
                    <span className="sr-only">{t('admin.messages.status')}: </span>
                    {t(`admin.messages.delivery.${message.delivery}`)}
                  </Badge>
                  <time dateTime={message.at} className="ms-auto text-xs text-muted-foreground">
                    {f.dateTime(message.at)}
                  </time>
                </div>
                {message.subject && <p className="font-semibold">{message.subject}</p>}
                <div className="flex flex-col gap-1 text-sm leading-7">
                  {message.text.split('\n').map((line, index) =>
                    /^https?:\/\//.test(line) ? (
                      // Links read left to right even in an Arabic message.
                      <span key={index} dir="ltr" className="break-all text-start font-mono text-xs leading-6 text-muted-foreground">
                        {line}
                      </span>
                    ) : (
                      <span key={index} dir="auto" className="break-words">
                        {line}
                      </span>
                    ),
                  )}
                </div>
                {message.error && (
                  <p className="font-mono text-xs text-destructive" dir="ltr">
                    {message.error}
                  </p>
                )}
                {(message.donationId || message.caseId) && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                    <span>{t('admin.messages.related')}:</span>
                    {reference && (
                      <Link href={`/cases?q=${encodeURIComponent(reference)}`} className="text-primary underline-offset-4 hover:underline">
                        {t('admin.messages.case')}{' '}
                        <bdi dir="ltr" className="font-mono">
                          {reference}
                        </bdi>
                      </Link>
                    )}
                    {message.donationId && (
                      <span>
                        {t('admin.messages.donation')}{' '}
                        <bdi dir="ltr" className="font-mono">
                          {message.donationId.slice(0, 8)}
                        </bdi>
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
