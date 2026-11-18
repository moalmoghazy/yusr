import 'server-only';
import type { ApiError } from '@yusr/sdk';
import { textFor } from '@yusr/ui';
import type { Locale } from '@yusr/core';

const RULES = ['verification_task', 'plan_total', 'redacted_document', 'plan_locked', 'plan_exists'] as const;
type Rule = (typeof RULES)[number];

/**
 * A refused case move or plan in words that say what to do next. The API names the rule that refused it
 * (`details.rule`), so the hub does not show a bare «راجع البيانات المدخلة».
 */
export function explainCaseError(locale: Locale) {
  const { t } = textFor(locale);
  return (error: ApiError): string | undefined => {
    const rule = error.details?.['rule'];
    if (typeof rule !== 'string' || !(RULES as readonly string[]).includes(rule)) return undefined;
    return t(`admin.caseDetail.rules.${rule as Rule}`);
  };
}
