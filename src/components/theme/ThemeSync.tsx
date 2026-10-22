'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { syncThemeMetas } from '@/lib/theme/client';
import { themeRouteFor } from '@/lib/theme/routes';

declare global {
  interface Window {
    /** Set by the boot script (src/lib/theme/shared.ts) when it had to correct what the server painted. */
    __hxThemeFixed?: number;
  }
}

/**
 * On themed pages (root layout). When the boot script had to correct the server's guess (a page from
 * a service worker's cache, a first visit, a choice recovered from this device), the status bar colour
 * follows once the page is live. Renders nothing.
 *
 * <html> belongs to the root layout, which a client-side navigation never re-renders. So a link or
 * router.push into or out of the pinned-light CMS editor (or out to the public website) loads the new
 * page afresh, and the server and the boot script set its theme as on any first load: the boot script
 * keeps the page's scope for its phone-flip and other-tab listeners, so it can't be switched in place.
 * Between themed pages, the new page's status bar colours become the ones the next toggle or phone
 * flip uses.
 */
export function ThemeSync() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.__hxThemeFixed) syncThemeMetas();
  }, []);
  useEffect(() => {
    const d = document.documentElement;
    const route = themeRouteFor(pathname ?? location.pathname);
    if ((route?.scope ?? null) !== (d.getAttribute('data-theme-scope') || null)) {
      location.reload();
      return;
    }
    const bar = route ? `${route.bar[0]} ${route.bar[1]}` : null;
    if (bar && d.getAttribute('data-bar') !== bar) {
      d.setAttribute('data-bar', bar);
      syncThemeMetas();
    }
  }, [pathname]);
  return null;
}
