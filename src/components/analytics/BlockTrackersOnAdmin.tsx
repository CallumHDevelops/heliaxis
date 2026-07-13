'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

/**
 * Pause Clarity while in admin — do NOT call clarity('stop')
 * (stop permanently kills collection until a full page reload).
 */
export function BlockTrackersOnAdmin() {
  useEffect(() => {
    const pause = () => {
      try {
        window.clarity?.('consent', false);
        window.clarity?.('set', 'area', 'admin');
      } catch {
        /* ignore */
      }
    };
    pause();
    const t = window.setTimeout(pause, 300);
    return () => window.clearTimeout(t);
  }, []);

  return null;
}
