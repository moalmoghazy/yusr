import type { SVGProps } from 'react';

/**
 * A small, consistent icon set (24px grid, 1.8 stroke, round caps).
 * Directional icons ("forward", "back"…) mirror automatically in RTL.
 */
const P = (d: string) => <path d={d} />;

const ICONS = {
  'heart-pulse': (
    <>
      {P('M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z')}
      {P('M3.4 12H8l1.5-3 3 6 1.5-3h6.2')}
    </>
  ),
  unlock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      {P('M8 11V7a4 4 0 0 1 7.7-1.5')}
    </>
  ),
  'graduation-cap': (
    <>
      {P('M22 10 12 5 2 10l10 5 10-5Z')}
      {P('M6 12v5c3 2 9 2 12 0v-5')}
      {P('M22 10v6')}
    </>
  ),
  'hand-heart': (
    <>
      {P('M3 10.5 12 3l9 7.5')}
      {P('M5 9v12h14V9')}
      {P('M12 18s-3-1.9-3-4a1.7 1.7 0 0 1 3-1 1.7 1.7 0 0 1 3 1c0 2.1-3 4-3 4Z')}
    </>
  ),
  'life-buoy': (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      {P('m5.6 5.6 3.6 3.6M14.8 14.8l3.6 3.6M14.8 9.2l3.6-3.6M5.6 18.4l3.6-3.6')}
    </>
  ),
  'shield-check': (
    <>
      {P('M12 3 5 6v5c0 4.6 2.9 8.3 7 10 4.1-1.7 7-5.4 7-10V6l-7-3Z')}
      {P('m9 12 2 2 4-4')}
    </>
  ),
  shield: P('M12 3 5 6v5c0 4.6 2.9 8.3 7 10 4.1-1.7 7-5.4 7-10V6l-7-3Z'),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M12 7v5l3 2')}
    </>
  ),
  'map-pin': (
    <>
      {P('M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z')}
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      {P('m20 20-3.5-3.5')}
    </>
  ),
  sliders: (
    <>
      {P('M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1')}
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  x: P('M18 6 6 18M6 6l12 12'),
  check: P('m5 12.5 4.5 4.5L19 7.5'),
  forward: P('m9 6 6 6-6 6'),
  back: P('m15 6-6 6 6 6'),
  'chevron-down': P('m6 9 6 6 6-6'),
  'chevron-up': P('m6 15 6-6 6 6'),
  'arrow-forward': P('M5 12h14M13 6l6 6-6 6'),
  'arrow-back': P('M19 12H5M11 6l-6 6 6 6'),
  'arrow-out': P('M7 17 17 7M8 7h9v9'),
  menu: P('M4 7h16M4 12h16M4 17h16'),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      {P('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')}
    </>
  ),
  moon: P('M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z'),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      {P('M8 20h8M12 16v4')}
    </>
  ),
  languages: (
    <>
      {P('M4 5h9M8.5 3v2c0 4-2 7.5-5 9M6 9c1 2.5 3 4.5 6 5.5')}
      {P('m13 21 4-9 4 9M14.5 18h5')}
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      {P('M4 21a8 8 0 0 1 16 0')}
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      {P('M2.5 20a6.5 6.5 0 0 1 13 0')}
      {P('M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6')}
    </>
  ),
  'file-text': (
    <>
      {P('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z')}
      {P('M14 3v5h5M9 13h6M9 17h6M9 9h1')}
    </>
  ),
  eye: (
    <>
      {P('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z')}
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': P(
    'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.6 6.6C4.4 8 2.9 10.2 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.6 4.8-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2',
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      {P('m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4')}
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      {P('M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2')}
    </>
  ),
  'credit-card': (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      {P('M3 10h18M7 15h3')}
    </>
  ),
  smartphone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      {P('M11 18.5h2')}
    </>
  ),
  wallet: (
    <>
      {P('M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3')}
      {P('M21 8h-5a3 3 0 0 0 0 6h5V8Z')}
    </>
  ),
  landmark: P('M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18'),
  receipt: (
    <>
      {P('M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3Z')}
      {P('M9 8h6M9 12h6M9 16h3')}
    </>
  ),
  store: P('M3 9l1.5-5h15L21 9M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M5 12v9h14v-9M10 21v-5h4v5'),
  zap: P('M13 2 4 14h7l-1 8 9-12h-7l1-8Z'),
  bell: (
    <>
      {P('M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8')}
      {P('M10.3 20a1.9 1.9 0 0 0 3.4 0')}
    </>
  ),
  home: P('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z'),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('m15.5 8.5-2 5-5 2 2-5 5-2Z')}
    </>
  ),
  heart: P('M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z'),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  kanban: (
    <>
      <rect x="3" y="4" width="4.5" height="14" rx="1.2" />
      <rect x="9.75" y="4" width="4.5" height="9" rx="1.2" />
      <rect x="16.5" y="4" width="4.5" height="16" rx="1.2" />
    </>
  ),
  'clipboard-check': (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      {P('M9 4V3h6v1M9 13l2 2 4-4')}
    </>
  ),
  banknote: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      {P('M6 9.5v.01M18 14.5v.01')}
    </>
  ),
  history: (
    <>
      {P('M3 12a9 9 0 1 0 3-6.7L3 8')}
      {P('M3 3v5h5M12 7v5l3 2')}
    </>
  ),
  activity: P('M3 12h4l3-8 4 16 3-8h4'),
  plus: P('M12 5v14M5 12h14'),
  minus: P('M5 12h14'),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M12 11v5M12 8h.01')}
    </>
  ),
  alert: (
    <>
      {P('M12 3 2 20h20L12 3Z')}
      {P('M12 10v4M12 17h.01')}
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
      {P('M8 10.5V7a4 4 0 0 1 8 0v3.5')}
    </>
  ),
  'log-out': P('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      {P('M5 12v9h14v-9M12 8v13M12 8S10.5 3 8 3.5 6.5 8 12 8ZM12 8s1.5-5 4-4.5S17.5 8 12 8Z')}
    </>
  ),
  'book-open': P('M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2V4ZM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7V4Z'),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      {P('M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3')}
    </>
  ),
  server: (
    <>
      <rect x="3" y="3" width="18" height="7" rx="1.5" />
      <rect x="3" y="14" width="18" height="7" rx="1.5" />
      {P('M7 6.5h.01M7 17.5h.01')}
    </>
  ),
  code: P('m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16'),
  package: (
    <>
      {P('m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z')}
      {P('m4 7.5 8 4.5 8-4.5M12 12v9')}
    </>
  ),
  layers: (
    <>
      {P('m12 3 9 5-9 5-9-5 9-5Z')}
      {P('m3 13 9 5 9-5')}
    </>
  ),
  send: P('M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z'),
  message: P('M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12Z'),
  phone: P('M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z'),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      {P('m3 7 9 6 9-6')}
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      {P('M3 10h18M8 3v4M16 3v4')}
    </>
  ),
  list: P('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'),
  pin: P('M12 17v5M9 3h6l-1 6 4 4H6l4-4-1-6Z'),
  play: P('M7 4.5v15l12-7.5-12-7.5Z'),
  pause: P('M8 5v14M16 5v14'),
  refresh: P('M20 11a8 8 0 0 0-14.3-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16M20 20v-4h-4'),
  external: P('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'),
  upload: P('M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'),
  'scan-face': P(
    'M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9 15.5c1.8 1.5 4.2 1.5 6 0',
  ),
  'git-branch': (
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="7" r="2" />
      {P('M6 7v10M18 9c0 5-6 4-11 8')}
    </>
  ),
  cloud: P('M7 18h10a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 1.5A3.8 3.8 0 0 0 7 18Z'),
  workflow: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      {P('M10 6.5h4a3 3 0 0 1 3 3V14')}
    </>
  ),
  'trend-up': P('m3 17 6-6 4 4 8-8M15 7h6v6'),
  coins: (
    <>
      <circle cx="9" cy="9" r="6" />
      {P('M15.5 9.5a6 6 0 1 1-6 6')}
    </>
  ),
  ellipsis: P('M5 12h.01M12 12h.01M19 12h.01'),
  filter: P('M3 5h18l-7 8.5V19l-4 2v-7.5L3 5Z'),
  sparkline: P('M3 17l4-5 4 3 4-7 6 4'),
} as const;

export type IconName = keyof typeof ICONS;

/** Icons that point along the reading direction and must mirror in RTL. */
const DIRECTIONAL: ReadonlySet<IconName> = new Set<IconName>([
  'forward',
  'back',
  'arrow-forward',
  'arrow-back',
  'arrow-out',
  'log-out',
  'send',
  'trend-up',
  'sparkline',
]);

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Visible label for standalone meaningful icons; omit for decorative ones. */
  label?: string;
}

export function Icon({ name, size = 18, strokeWidth = 1.8, label, className, ...rest }: IconProps) {
  const classes = ['icon', DIRECTIONAL.has(name) ? 'icon-dir' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'ellipsis' ? 3 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={classes}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}
