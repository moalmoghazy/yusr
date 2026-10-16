export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** A counted message. Arabic uses all six CLDR categories; English usually one/other. */
export type PluralMessage = Partial<Record<PluralCategory, string>> & { other: string };

export type MessageValue = string | PluralMessage;

export interface MessageTree {
  [key: string]: MessageValue | MessageTree;
}

/** Widens the Arabic source dictionary into the shape every other locale must match. */
export type Widen<T> = T extends string ? string : T extends { other: string } ? PluralMessage : { [K in keyof T]: Widen<T[K]> };

/** Dotted keys of a dictionary, e.g. "case.verified" or "units.donors". */
export type MessageKey<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : T[K] extends { other: string } ? `${Prefix}${K}` : MessageKey<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageParams = Record<string, string | number | null | undefined>;
