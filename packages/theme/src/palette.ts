/**
 * Raw color scales. Components never use these directly — they use the semantic
 * tokens in tokens.ts, so a rebrand only touches this file (or a preset).
 */

export type Scale = Readonly<Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>>;

/** Yusr teal–emerald: calm, clinical trust with warmth. */
export const teal: Scale = {
  50: '#EEF8F5',
  100: '#D3EFE6',
  200: '#A8DECE',
  300: '#72C6AF',
  400: '#3FA88F',
  500: '#1F8C74',
  600: '#13725F',
  700: '#0F5B4D',
  800: '#0E493F',
  900: '#0C3C34',
  950: '#06231F',
};

/** Gold for the ḍamma mark, milestones and "funded" moments — used sparingly. */
export const gold: Scale = {
  50: '#FDF8EB',
  100: '#F9ECC8',
  200: '#F2D68C',
  300: '#EABD55',
  400: '#E0A42F',
  500: '#C98A1B',
  600: '#A86C14',
  700: '#865214',
  800: '#6E4217',
  900: '#5C3717',
  950: '#351C08',
};

/** Soft slate blue for secondary actions, information and data. */
export const slate: Scale = {
  50: '#F3F5FA',
  100: '#E4E9F3',
  200: '#C9D2E6',
  300: '#A2B1D1',
  400: '#7489B6',
  500: '#556C9D',
  600: '#445783',
  700: '#39476B',
  800: '#323D5A',
  900: '#2D354C',
  950: '#1D2232',
};

/** Neutrals biased slightly toward the teal so greys never look accidental. */
export const neutral: Scale = {
  50: '#F4F7F6',
  100: '#E9EEEC',
  200: '#D8E0DD',
  300: '#BAC6C2',
  400: '#8E9C97',
  500: '#6B7A75',
  600: '#52605B',
  700: '#3F4A46',
  800: '#2A3330',
  900: '#19201E',
  950: '#0E1311',
};

export const rose: Scale = {
  50: '#FFF1F1',
  100: '#FFE0E0',
  200: '#FFC7C8',
  300: '#FF9EA1',
  400: '#F8676C',
  500: '#E5484D',
  600: '#C8323A',
  700: '#A51D22',
  800: '#881B20',
  900: '#711C20',
  950: '#3E090C',
};

export const sky: Scale = {
  50: '#EFF7FF',
  100: '#DCEEFD',
  200: '#B8DCFA',
  300: '#86C3F5',
  400: '#4EA4EC',
  500: '#2A86D6',
  600: '#1B6AB5',
  700: '#185593',
  800: '#194879',
  900: '#1A3D65',
  950: '#112743',
};

export const palette = { teal, gold, slate, neutral, rose, sky } as const;
