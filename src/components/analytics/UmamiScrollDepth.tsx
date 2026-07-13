'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isTrackableAnalyticsPath } from '@/lib/analytics-paths';

const MILESTONES = [25, 50, 75, 100] as const;

/** Page must offer at least this much scroll range (px) or we skip scroll events. */
const MIN_SCROLLABLE_PX = 320;
/** Ignore tiny scroll jitter before counting a real interaction. */
const MIN_SCROLL_DELTA_PX = 24;

declare global {
  interface Window {
    umami?: {
      track: (event: string, data?: Record<string, string | number | boolean>) => void;
    };
  }
}

function trackingEnabled(): boolean {
  const websiteId = (process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '').trim();
  if (!websiteId) return false;
  if (process.env.NODE_ENV === 'development') {
    return process.env.NEXT_PUBLIC_UMAMI_TRACK_DEV === '1';
  }
  return true;
}

function pageKey(pathname: string): string {
  const path = (pathname || '/').split('?')[0] || '/';
  // Leave room for "100% · " prefix in the event name
  return path.length > 72 ? `${path.slice(0, 69)}...` : path;
}

function metrics() {
  const el = document.documentElement;
  const docH = Math.max(el.scrollHeight, document.body?.scrollHeight || 0);
  const viewH = window.innerHeight || el.clientHeight || 0;
  const scrollablePx = Math.max(0, docH - viewH);
  const scrollTop = window.scrollY || el.scrollTop || 0;
  const pct =
    scrollablePx <= 0 ? 0 : Math.min(100, Math.floor((scrollTop / scrollablePx) * 100));
  return { docH, viewH, scrollablePx, scrollTop, pct };
}

function debugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    process.env.NODE_ENV === 'development' ||
    new URLSearchParams(window.location.search).has('umami_scroll_debug')
  );
}

function log(...args: unknown[]) {
  if (debugEnabled()) console.info('[umami-scroll]', ...args);
}

function sendScrollEvent(
  depth: number,
  pathname: string,
  meta: { scrollablePx: number; docH: number; viewH: number },
) {
  const page = pageKey(pathname || window.location.pathname);
  if (!isTrackableAnalyticsPath(page)) return;

  /**
   * Two events on purpose:
   * 1) scroll-25/50/75/100 → clean 4-series funnel chart in Umami
   * 2) "50% · /path"     → readable Events list (page + % at a glance)
   */
  const funnelName = `scroll-${depth}`;
  const detailName = `${depth}% · ${page}`;

  const data = {
    page,
    percentage: `${depth}%`,
    depth,
    scrollable_px: meta.scrollablePx,
    doc_h: meta.docH,
    view_h: meta.viewH,
  };

  const trySend = () => {
    if (typeof window.umami?.track !== 'function') return false;
    window.umami.track(funnelName, data);
    window.umami.track(detailName, data);
    log('sent', funnelName, detailName);
    return true;
  };

  if (trySend()) return;

  let tries = 0;
  const id = window.setInterval(() => {
    tries += 1;
    if (trySend() || tries >= 20) window.clearInterval(id);
  }, 250);
}

/**
 * Scroll milestones on public pages only → Umami Events.
 * Admin / auth / CMS preview never send scroll events.
 */
export function UmamiScrollDepth() {
  const pathname = usePathname();

  useEffect(() => {
    if (!trackingEnabled()) return;
    if (typeof window === 'undefined') return;
    if (!isTrackableAnalyticsPath(pathname || '')) {
      log('skip non-public path', pathname);
      return;
    }

    const fired = new Set<number>();
    let engaged = false;
    let startY = window.scrollY || 0;
    let eligible = false;

    const recomputeEligible = () => {
      const m = metrics();
      eligible = m.scrollablePx >= MIN_SCROLLABLE_PX;
      if (!eligible) log('not scrollable enough', m);
      return m;
    };

    if ((window.scrollY || 0) >= MIN_SCROLL_DELTA_PX) {
      engaged = true;
    }

    const maybeFire = (reason: string) => {
      if (!isTrackableAnalyticsPath(pathname || window.location.pathname)) return;
      const m = recomputeEligible();
      if (!eligible || !engaged) return;

      for (const depth of MILESTONES) {
        if (m.pct >= depth && !fired.has(depth)) {
          fired.add(depth);
          sendScrollEvent(depth, pathname || window.location.pathname, m);
          log('milestone', depth, reason, m.pct);
        }
      }
    };

    const layoutTimers = [400, 1200, 2500].map((ms) =>
      window.setTimeout(() => {
        recomputeEligible();
        if (engaged) maybeFire('layout');
      }, ms),
    );

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        if (!engaged && Math.abs(y - startY) >= MIN_SCROLL_DELTA_PX) {
          engaged = true;
          log('engaged', { y, startY });
        }
        maybeFire('scroll');
        ticking = false;
      });
    };

    const onResize = () => {
      recomputeEligible();
      if (engaged) maybeFire('resize');
    };

    recomputeEligible();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      layoutTimers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [pathname]);

  return null;
}
