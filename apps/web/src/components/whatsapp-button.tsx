import { PLATFORM_GLYPHS } from '@yusr/ui';
import type { CSSProperties } from 'react';

const GLYPH = PLATFORM_GLYPHS.whatsapp;

/** A floating button on every page that opens a WhatsApp chat with Yusr's number (site.whatsapp). */
export function WhatsAppButton({ number, label }: { number: string; label: string }) {
  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      style={{ '--wa-brand': GLYPH.brand, '--wa-on-brand': GLYPH.onBrand } as CSSProperties}
      className="fixed bottom-5 end-5 z-40 grid size-14 place-items-center rounded-full bg-[var(--wa-brand)] text-[var(--wa-on-brand)] shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/60 print:hidden"
    >
      <svg viewBox="0 0 24 24" width={30} height={30} fill="currentColor" aria-hidden focusable="false">
        <path d={GLYPH.d} />
      </svg>
    </a>
  );
}
