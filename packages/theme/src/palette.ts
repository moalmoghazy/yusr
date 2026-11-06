/**
 * Raw color scales. Components never use these directly — they use the semantic
 * tokens in tokens.ts, so a rebrand only touches this file (or a preset).
 */

export type Scale = Readonly<Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>>;

/** Yusr turquoise (the «فيروز ورمل» brand, 2026-11): Pharaonic faience, calm and trusted. Kept under the name teal. */
export const teal: Scale = {
  50: '#EEF8F8',
  100: '#D3EEEF',
  200: '#A6DCDF',
  300: '#6CC3C8',
  400: '#34A6AE',
  500: '#0F8A93',
  600: '#00707A',
  700: '#055A62',
  800: '#0A4A50',
  900: '#0B3D42',
  950: '#042427',
};

/** Sand gold for the ḍamma mark, milestones and "funded" moments — used sparingly. */
export const gold: Scale = {
  50: '#FCF7EA',
  100: '#F8EBCB',
  200: '#F0D594',
  300: '#E6BD62',
  400: '#D9A441',
  500: '#C08A2A',
  600: '#A06D1E',
  700: '#80541B',
  800: '#69451B',
  900: '#573A1A',
  950: '#321E0A',
};

/** Soft slate blue for information and data. */
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

/** Neutrals biased toward papyrus sand so greys never look accidental. */
export const neutral: Scale = {
  50: '#F8F5EE',
  100: '#EFEBE2',
  200: '#E1DBCF',
  300: '#C7BFB1',
  400: '#9C958A',
  500: '#7A746A',
  600: '#5E5952',
  700: '#48443F',
  800: '#2F2D2A',
  900: '#1D1C1A',
  950: '#111110',
};

/** Burnt clay: the secondary voice beside the turquoise (outline actions, charts). */
export const clay: Scale = {
  50: '#FBF4EE',
  100: '#F5E4D6',
  200: '#EBC8AC',
  300: '#DDA67F',
  400: '#CC8455',
  500: '#B56C3D',
  600: '#9C5A2E',
  700: '#7E4826',
  800: '#673C22',
  900: '#55331F',
  950: '#2F1A0E',
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

export const palette = { teal, gold, clay, slate, neutral, rose, sky } as const;
