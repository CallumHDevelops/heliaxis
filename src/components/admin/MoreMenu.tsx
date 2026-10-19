'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The phone "More" sheet (AdminShell renders what's in it). It's a <details>, so it opens, and a tap
 * on the dimmed backdrop closes it, even before the page's scripts have loaded (see admin-shell.css).
 * This adds the rest: it closes when any link is tapped, in the sheet or the tab bar, and on Escape.
 */
export function MoreMenu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = ref.current;
      if (el?.open && e.target instanceof Element && e.target.closest('a')) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key !== 'Escape' || !el?.open) return;
      el.open = false;
      el.querySelector('summary')?.focus();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <details ref={ref} className="hx-more">
      {children}
    </details>
  );
}
