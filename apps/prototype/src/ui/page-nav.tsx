import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePrototype } from '../app/prefs';
import { cx } from './primitives';

export interface PageNavItem {
  id: string;
  label: string;
}

/**
 * Sticky in-page navigation for long documentation pages. Sections are found by
 * `${prefix}-${id}`; the link for the section nearest the top is highlighted.
 * Buttons scroll instead of changing the URL hash, which the prototype uses for surfaces.
 */
export function PageNav({ prefix, items, label, end }: { prefix: string; items: readonly PageNavItem[]; label: string; end?: ReactNode }) {
  const { reducedMotion } = usePrototype();
  const [active, setActive] = useState(items[0]?.id ?? '');
  const bar = useRef<HTMLDivElement>(null);
  const ids = items.map((item) => item.id).join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const order = ids.split('|');
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id.slice(prefix.length + 1), entry.isIntersecting);
        const first = order.find((id) => visible.get(id));
        if (first) setActive(first);
      },
      { rootMargin: '-130px 0px -55% 0px' },
    );
    for (const id of order) {
      const node = document.getElementById(`${prefix}-${id}`);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [prefix, ids]);

  // Keep the active link visible when the bar scrolls horizontally on phones.
  useEffect(() => {
    const link = bar.current?.querySelector<HTMLElement>('.page-nav-link.is-active');
    const container = bar.current;
    if (!link || !container || container.scrollWidth <= container.clientWidth) return;
    const target = link.offsetLeft - (container.clientWidth - link.offsetWidth) / 2;
    container.scrollTo({ left: target, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [active, reducedMotion]);

  return (
    <nav className="page-nav" aria-label={label}>
      <div className="container page-nav-row">
        <div className="page-nav-links" ref={bar}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cx('page-nav-link', active === item.id && 'is-active')}
              aria-current={active === item.id ? 'location' : undefined}
              onClick={() => {
                setActive(item.id);
                document.getElementById(`${prefix}-${item.id}`)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {end}
      </div>
    </nav>
  );
}

/** Numbered section heading shared by the brand book and the architecture page. */
export function DocSectionHead({
  index,
  title,
  body,
  eyebrow,
  action,
}: {
  index: string;
  title: ReactNode;
  body?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="doc-head">
      <div className="doc-head-text">
        <span className="doc-index" aria-hidden>
          {index}
        </span>
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {body && <p>{body}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
