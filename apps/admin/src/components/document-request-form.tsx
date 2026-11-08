'use client';

import type { Locale } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState } from 'react';
import { setDocumentRequestStatus } from '@/app/(hub)/document-requests/actions';
import type { ActionResult } from '@/lib/session';

/** «تم الإرسال» or «اعتذار» on a waiting request. */
export function DocumentRequestStatusForm({ locale, requestId }: { locale: Locale; requestId: string }) {
  const { t } = textFor(locale);
  const [result, action, pending] = useActionState<ActionResult, FormData>(setDocumentRequestStatus, null);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" name="status" value="sent" disabled={pending} className={buttonClasses({ size: 'sm' })}>
          <Icon name="check" size={15} />
          {t('admin.documentRequests.markSent')}
        </button>
        <button type="submit" name="status" value="declined" disabled={pending} className={buttonClasses({ variant: 'outline', size: 'sm' })}>
          {t('admin.documentRequests.decline')}
        </button>
      </div>
      {result && (
        <p role="status" className={cn('text-xs font-semibold', result.ok ? 'text-success' : 'text-destructive')}>
          {result.message}
        </p>
      )}
    </form>
  );
}
