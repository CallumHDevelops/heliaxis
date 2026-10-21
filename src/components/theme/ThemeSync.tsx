'use client';

import { useEffect } from 'react';
import { syncThemeMetas } from '@/lib/theme/client';

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
 */
export function ThemeSync() {
  useEffect(() => {
    if (window.__hxThemeFixed) syncThemeMetas();
  }, []);
  return null;
}
