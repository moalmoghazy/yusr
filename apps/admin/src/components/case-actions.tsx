'use client';

import type { CaseStatus, Locale } from '@yusr/core';
import { buttonClasses, cn, Icon, textFor } from '@yusr/ui';
import { useActionState, useState } from 'react';
import { toggleFeatured, togglePriority, transitionCase } from '@/app/(hub)/cases/actions';
import type { ActionResult } from '@/lib/session';

export interface TransitionOption {
  to: CaseStatus;
  requiresReason: boolean;
}

const DESTRUCTIVE: ReadonlySet<CaseStatus> = new Set(['rejected', 'paused', 'closed', 'draft']);

/**
 * The moves this staff member may make on one case (computed on the server from the shared
 * transition table and their role). Moves that need a reason open a short form first; the
 * reason lands in the audit log.
 */
export function CaseActions({
  locale,
  caseId,
  options,
  pinned,
  canPin,
  featured,
  canFeature,
}: {
  locale: Locale;
  caseId: string;
  options: TransitionOption[];
  pinned: boolean;
  canPin: boolean;
  /** Shown in the website's «يحدث الآن» card; `canFeature`: the role may choose, and the case is published (or already shown). */
  featured: boolean;
  canFeature: boolean;
}) {
  const { t } = textFor(locale);
  const [state, move, moving] = useActionState<ActionResult, FormData>(transitionCase, null);
  const [pinState, pin, pinning] = useActionState<ActionResult, FormData>(togglePriority, null);
  const [asking, setAsking] = useState<CaseStatus | null>(null);
  const [featureState, feature, featuring] = useActionState<ActionResult, FormData>(toggleFeatured, null);
  const result = state ?? pinState ?? featureState;

  if (options.length === 0 && !canPin) return <span className="text-xs text-muted-foreground">{t('admin.cases.noActions')}</span>;

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) =>
          option.requiresReason ? (
            <button
              key={option.to}
              type="button"
              aria-expanded={asking === option.to}
              onClick={() => setAsking(asking === option.to ? null : option.to)}
              className={buttonClasses({ variant: DESTRUCTIVE.has(option.to) ? 'outline' : 'soft', size: 'sm' })}
            >
              {t(`admin.cases.transitions.${option.to}`)}
            </button>
          ) : (
            <form key={option.to} action={move}>
              <input type="hidden" name="caseId" value={caseId} />
              <input type="hidden" name="to" value={option.to} />
              <button type="submit" disabled={moving} className={buttonClasses({ variant: DESTRUCTIVE.has(option.to) ? 'outline' : 'primary', size: 'sm' })}>
                {t(`admin.cases.transitions.${option.to}`)}
              </button>
            </form>
          ),
        )}
        {canPin && (
          <form action={pin}>
            <input type="hidden" name="caseId" value={caseId} />
            <input type="hidden" name="pinned" value={String(pinned)} />
            <button type="submit" disabled={pinning} className={buttonClasses({ variant: 'ghost', size: 'sm' })} aria-pressed={pinned}>
              <Icon name="pin" size={15} className={cn(pinned && 'text-highlight')} />
              {pinned ? t('admin.cases.unprioritize') : t('admin.cases.prioritize')}
            </button>
          </form>
        )}
        {canFeature && (
          <form action={feature}>
            <input type="hidden" name="caseId" value={caseId} />
            <input type="hidden" name="featured" value={String(featured)} />
            <button type="submit" disabled={featuring} className={buttonClasses({ variant: 'ghost', size: 'sm' })} aria-pressed={featured}>
              <Icon name="zap" size={15} className={cn(featured && 'text-highlight')} />
              {featured ? t('admin.cases.unfeature') : t('admin.cases.feature')}
            </button>
          </form>
        )}
      </div>
      {asking && (
        <form
          action={move}
          className="flex w-full max-w-md flex-col gap-2 rounded-control border border-border bg-muted/50 p-3"
          onSubmit={() => setAsking(null)}
        >
          <input type="hidden" name="caseId" value={caseId} />
          <input type="hidden" name="to" value={asking} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t('admin.cases.reasonLabel')}</span>
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={500}
              rows={2}
              placeholder={t('admin.cases.reasonPlaceholder')}
              className="rounded-control border border-input bg-card p-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            />
          </label>
          <button
            type="submit"
            disabled={moving}
            className={buttonClasses({ variant: DESTRUCTIVE.has(asking) ? 'destructive' : 'primary', size: 'sm', className: 'self-start' })}
          >
            {t(`admin.cases.transitions.${asking}`)}
          </button>
        </form>
      )}
      {result && (
        <p role="status" className={cn('text-xs font-semibold', result.ok ? 'text-success' : 'text-destructive')}>
          {result.message}
        </p>
      )}
    </div>
  );
}
