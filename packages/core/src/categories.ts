import type { CaseCategory } from './types';

export type CategoryTone = 'rose' | 'slate' | 'sky' | 'gold' | 'teal';

export interface CategoryMeta {
  key: CaseCategory;
  /** Icon name shared by the web (lucide) and mobile icon sets. */
  icon: 'heart-pulse' | 'unlock' | 'graduation-cap' | 'hand-heart' | 'life-buoy';
  tone: CategoryTone;
  /** Whether new cases in this category default to zakat-eligible (moderators confirm per case). */
  zakatByDefault: boolean;
}

export const CATEGORY_META: Readonly<Record<CaseCategory, CategoryMeta>> = {
  medical: { key: 'medical', icon: 'heart-pulse', tone: 'rose', zakatByDefault: true },
  debt_relief: { key: 'debt_relief', icon: 'unlock', tone: 'slate', zakatByDefault: true },
  education: { key: 'education', icon: 'graduation-cap', tone: 'sky', zakatByDefault: false },
  orphans: { key: 'orphans', icon: 'hand-heart', tone: 'gold', zakatByDefault: true },
  relief: { key: 'relief', icon: 'life-buoy', tone: 'teal', zakatByDefault: true },
};
