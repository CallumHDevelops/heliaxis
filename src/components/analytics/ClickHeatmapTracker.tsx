'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { isTrackableAnalyticsPath, normalizeAnalyticsPath } from '@/lib/analytics-paths';
import { heatmapClientTrackingEnabled, type HeatmapClickInput } from '@/lib/heatmap';

const FLUSH_MS = 3500;
const MAX_QUEUE = 40;
const ENDPOINT = '/api/analytics/heatmap';

type Queued = HeatmapClickInput;

function shouldSkipTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest('[data-no-heatmap]')) return true;
  if (target.closest('textarea')) return true;
  return false;
}

function isHeatmapPreview(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('heatmap_preview') === '1';
  } catch {
    return false;
  }
}

/** Live URL path for this click (not a React closure that can lag on soft nav). */
function livePublicPath(): string | null {
  const path = normalizeAnalyticsPath(window.location.pathname || '/');
  if (!isTrackableAnalyticsPath(path)) return null;
  return path;
}

/** Content-box metrics (matches admin overlay measure). */
function contentMetrics() {
  const body = document.body;
  const doc = document.documentElement;
  let bottom = 0;
  for (const el of Array.from(body.children)) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (style.position === 'fixed' || style.position === 'sticky') continue;
    const r = el.getBoundingClientRect();
    bottom = Math.max(bottom, r.bottom + window.scrollY);
  }
  const scrollH = Math.max(bottom, doc.clientHeight, 1);
  const scrollW = Math.max(doc.clientWidth, body.clientWidth, 1);
  return { scrollW, scrollH };
}

function pushBeacon(payload: { clicks: Queued[] }) {
  const body = JSON.stringify(payload);
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
  } catch {
    /* fall through */
  }
  void fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {});
}

/**
 * Records anonymised click positions on every public page (keyed by URL path).
 * Mounted from PublicTrackers — never on /admin.
 */
export function ClickHeatmapTracker() {
  const pathname = usePathname();
  const queueRef = useRef<Queued[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!heatmapClientTrackingEnabled()) return;
    // Re-check current route each mount / navigation
    if (!isTrackableAnalyticsPath(pathname || window.location.pathname || '/')) return;
    if (isHeatmapPreview()) return;

    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!queueRef.current.length) return;
      const clicks = queueRef.current.splice(0, MAX_QUEUE);
      pushBeacon({ clicks });
    };

    const schedule = () => {
      if (timerRef.current) return;
      timerRef.current = setTimeout(flush, FLUSH_MS);
    };

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (isHeatmapPreview()) return;
      if (shouldSkipTarget(e.target)) return;

      const path = livePublicPath();
      if (!path) return;

      const { scrollW, scrollH } = contentMetrics();
      const pageX = e.clientX + (window.scrollX || window.pageXOffset || 0);
      const pageY = e.clientY + (window.scrollY || window.pageYOffset || 0);
      const x = (pageX / scrollW) * 100;
      const y = (pageY / scrollH) * 100;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < 0 || x > 100 || y < 0 || y > 100) return;

      queueRef.current.push({
        path,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        w: window.innerWidth,
        h: window.innerHeight,
        dh: Math.round(scrollH),
      });

      if (queueRef.current.length >= MAX_QUEUE) flush();
      else schedule();
    };

    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    document.addEventListener('click', onClick, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);

    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [pathname]);

  return null;
}
