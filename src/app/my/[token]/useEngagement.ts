'use client';

import { useEffect } from 'react';

/**
 * Time on the page (only while it is on screen) and which parts were scrolled to (anything marked data-track), sent every 15 seconds
 * and as the page is left. Quiet, and only while the customer still has a quote to decide on.
 */
export function useEngagement(token: string, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const seen = new Set<string>();
    let pending = new Set<string>();
    let visibleSince: number | null = document.visibilityState === 'visible' ? Date.now() : null;
    let seconds = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.track;
          if (e.isIntersecting && id && !seen.has(id)) {
            seen.add(id);
            pending.add(id);
          }
        }
      },
      { threshold: 0.4 }
    );
    document.querySelectorAll<HTMLElement>('[data-track]').forEach((el) => io.observe(el));
    const flush = (leaving: boolean) => {
      if (visibleSince !== null) {
        seconds += (Date.now() - visibleSince) / 1000;
        visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
      }
      if (seconds < 1 && !pending.size) return;
      const body = JSON.stringify({ type: 'engaged', seconds, sections: [...pending] });
      seconds = 0;
      pending = new Set();
      try {
        if (leaving && navigator.sendBeacon) navigator.sendBeacon(`/api/my/${token}/event`, new Blob([body], { type: 'application/json' }));
        else void fetch(`/api/my/${token}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => null);
      } catch {
        // Tracking must never get in the way.
      }
    };
    const beat = setInterval(() => flush(false), 15_000);
    const vis = () => {
      if (document.visibilityState === 'hidden') flush(true);
      else visibleSince = Date.now();
    };
    const leave = () => flush(true);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', leave);
    return () => {
      clearInterval(beat);
      io.disconnect();
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('pagehide', leave);
      flush(true);
    };
  }, [token, on]);
}

