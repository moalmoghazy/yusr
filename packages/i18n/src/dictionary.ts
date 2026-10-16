import { ar } from './messages/ar';
import type { MessageKey, Widen } from './types';

/** Shape every locale must implement — derived from the Arabic source. */
export type Messages = Widen<typeof ar>;

/** Every valid translation key, e.g. "case.verified" | "units.donors" | … */
export type TranslationKey = MessageKey<Messages>;
