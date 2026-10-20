import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * The stores the app is offered in, each with its logo as a single-colour glyph on a 24-unit grid
 * (from Simple Icons, CC0) and the colours its official badge uses.
 */
export const STORE_GLYPHS = {
  appStore: {
    d: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701',
    fill: '#FFFFFF',
  },
  googlePlay: {
    d: 'M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594zM1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924zm12.207 10.065l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973zm0 2.067l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z',
    fill: 'url(#yusr-google-play)',
  },
  appGallery: {
    d: 'M6.734 0C1.804 0 0 1.803 0 6.733v10.535C0 22.198 1.803 24 6.734 24h10.529C22.193 24 24 22.197 24 17.268V6.733C24 1.803 22.197 0 17.266 0zM8 4h.565A3.439 3.439 0 0 0 12 7.435 3.439 3.439 0 0 0 15.435 4H16c0 2.206-1.794 4-4 4S8 6.206 8 4zm6.468 8h.52l.713 2.16.696-2.158h.66l-1.092 3.14h-.532l-.714-2.063-.714 2.063h-.528l-1.095-3.14h.678l.694 2.158zm6.236 0h.629v3.138h-.629zM2.666 12h.638v1.267h1.439V12h.637v3.142h-.637v-1.276h-1.44v1.276h-.637zm5.668 0h.637v1.772c0 .9-.496 1.417-1.36 1.417-.856 0-1.347-.507-1.347-1.39v-1.797H6.9v1.775c0 .524.255.805.719.805.46 0 .714-.273.714-.784zm2.344 0h.563l1.378 3.14h-.668l-.282-.654H10.23l-.286.654h-.651zm6.893.002h2.312v.572H18.2v.643h1.16v.573H18.2v.777h1.744v.573H17.57zm-6.623.793-.48 1.124h.964z',
    fill: '#CF0A2C',
  },
} as const satisfies Record<string, { d: string; fill: string }>;

export type StoreName = keyof typeof STORE_GLYPHS;

export interface StoreBadgeProps {
  store: StoreName;
  /** The store's name, as it is written on its badge (App Store, Google Play, AppGallery). */
  name: string;
  /** The small line above it: «حمّله من» / «قريبًا على». */
  caption: string;
  /** The app's page in that store; without one the badge is shown but not a link. */
  href?: string | null;
  /** Accessible name for the link (caption and name read together, by default). */
  label?: string;
  className?: string;
}

/**
 * A store badge in Yusr's colours: an outlined pill with the store's logo in an emerald chip. On hover
 * or focus it becomes the store's own badge: black, white lettering, the logo in its real colours.
 */
export function StoreBadge({ store, name, caption, href, label, className }: StoreBadgeProps) {
  const glyph = STORE_GLYPHS[store];
  const body: ReactNode = (
    <>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary transition-colors duration-200 group-hover:bg-transparent group-focus-visible:bg-transparent"
      >
        <svg viewBox="0 0 24 24" width={20} height={20} focusable="false" className="overflow-visible">
          {store === 'googlePlay' && (
            <defs>
              <linearGradient id="yusr-google-play" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#00C3FF" />
                <stop offset="0.38" stopColor="#00E676" />
                <stop offset="0.68" stopColor="#FFD400" />
                <stop offset="1" stopColor="#FF3A44" />
              </linearGradient>
            </defs>
          )}
          <path d={glyph.d} fill="currentColor" className="transition-opacity duration-200 group-hover:opacity-0 group-focus-visible:opacity-0" />
          <path d={glyph.d} fill={glyph.fill} className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100" />
        </svg>
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[0.7rem] text-muted-foreground transition-colors duration-200 group-hover:text-white/80 group-focus-visible:text-white/80">
          {caption}
        </span>
        <span dir="ltr" className="text-[0.95rem] font-semibold">
          {name}
        </span>
      </span>
    </>
  );
  const classes = cn(
    'group inline-flex h-13 min-w-40 items-center gap-2.5 rounded-xl border border-border bg-card ps-2 pe-4 text-foreground outline-none',
    'transition-colors duration-200 hover:border-[#A6A6A6] hover:bg-black hover:text-white focus-visible:border-[#A6A6A6] focus-visible:bg-black focus-visible:text-white focus-visible:ring-[3px] focus-visible:ring-ring/50',
    className,
  );
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label ?? `${caption} ${name}`} className={classes}>
      {body}
    </a>
  ) : (
    <span className={classes}>{body}</span>
  );
}
