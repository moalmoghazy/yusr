import type { CaseCategory, Locale, Localized } from '@yusr/core';
import type { TFunction } from './translator';

/** What a case needs to be shared: its title and category, and the team's own share line if written. */
export interface ShareableCase {
  title: Localized;
  category: CaseCategory;
  shareText: Localized | null;
}

/**
 * The line that goes out when a case is shared, and that the link preview shows under its title:
 * the case's own share line («نص المشاركة», written by the team) — or, until one is written, a line
 * composed from its title and category — followed by Yusr's promise:
 *
 *   «تبرعك يقرّبنا من إنقاذ قلب ملك…، وتستطيع أن تساهم في اكتمال تكاليف عمليتها مع يُسر: تبرع آمن، موثوق، ويصل للمستحق.»
 */
export function caseShareMessage(t: TFunction, locale: Locale, item: ShareableCase): string {
  const own = item.shareText?.[locale]?.trim().replace(/[.،,؛;:!؟?\s]+$/u, '');
  let specific = own;
  if (!specific) {
    const title = item.title[locale].trim();
    specific = t('share.composed', {
      // An English title starts mid-sentence here ("…closer to open-heart surgery…").
      title: locale === 'en' ? title.charAt(0).toLowerCase() + title.slice(1) : title,
      need: t(`share.needs.${item.category}`),
    });
  }
  return `${specific} ${t('share.promise')}`;
}
