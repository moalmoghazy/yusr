'use client';

import { buttonClasses, Icon } from '@yusr/ui';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Donors often come back from the gateway a moment before its webhook confirms the payment.
 * While the receipt is still pending, re-render it from the server every few seconds (for two
 * minutes at most — bank transfers and Fawry can take hours and have their own notifications).
 */
export function ReceiptRefresh({ everyMs = 3_000, forMs = 120_000 }: { everyMs?: number; forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > forMs) clearInterval(timer);
      else router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs, forMs]);
  return null;
}

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClasses({ variant: 'outline' })}>
      <Icon name="file-text" size={17} />
      {label}
    </button>
  );
}
