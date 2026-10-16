'use client';

import { buttonClasses, Icon } from '@yusr/ui';
import { useEffect } from 'react';

/**
 * Something failed while rendering (usually the API being unreachable). Bilingual because an
 * error boundary can't rely on the data that failed; the digest ties the report to server logs.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="container-page flex min-h-[50dvh] flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-destructive-soft text-destructive-soft-foreground">
        <Icon name="alert" size={26} />
      </span>
      <h1 className="text-2xl font-bold">
        <span lang="ar">تعذّر تحميل الصفحة</span> · <span lang="en">Couldn’t load this page</span>
      </h1>
      <p className="max-w-md text-muted-foreground">
        <span lang="ar">لم يُخصم أي مبلغ. حاول مرة أخرى بعد لحظات.</span> <span lang="en">Nothing was charged. Please try again in a moment.</span>
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground" dir="ltr">
          ref: {error.digest}
        </p>
      )}
      <button type="button" onClick={reset} className={buttonClasses({})}>
        <Icon name="refresh" size={17} />
        <span lang="ar">إعادة المحاولة</span> · <span lang="en">Retry</span>
      </button>
    </section>
  );
}
