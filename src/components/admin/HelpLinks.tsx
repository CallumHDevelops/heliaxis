'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { HELP_HOME, helpHref } from '@/lib/help/context';

/**
 * Help for the page you're on: /admin/help?from=<this page>, so Help shows that page's articles first.
 * The link is drawn with the path (the same on the server and in the browser); a click adds the query
 * (?view=board…) as it is at that moment.
 */
export function useHelpLink() {
  const pathname = usePathname() || '/admin';
  const router = useRouter();
  const href = helpHref(pathname);
  const on = pathname === HELP_HOME || pathname.startsWith(`${HELP_HOME}/`);
  /** `soft`: a next/link (moves without a page load); otherwise a plain link. */
  function onClick(e: MouseEvent<HTMLAnchorElement>, soft: boolean) {
    const full = helpHref(window.location.pathname + window.location.search);
    if (full === href) return;
    // A new tab or window (or a plain link): the browser follows the link, so it gets the full address.
    if (!soft || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      e.currentTarget.href = full;
      return;
    }
    e.preventDefault();
    router.push(full);
  }
  return { href, on, onClick };
}

/** The phone's "More" sheet: Help, as a plain link like the sheet's other tiles. */
export function HelpTile({ icon }: { icon: ReactNode }) {
  const { href, on, onClick } = useHelpLink();
  return (
    <a href={href} onClick={(e) => onClick(e, false)} className={on ? 'hx-tile is-active' : 'hx-tile'} aria-current={on ? 'page' : undefined}>
      <span className="hx-tile__icon">{icon}</span>
      <span className="hx-tile__label">Help</span>
    </a>
  );
}
