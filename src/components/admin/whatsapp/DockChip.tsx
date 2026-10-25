'use client';

import { useEffect, useState } from 'react';
import { DOCK_EVENTS, type WaCounts } from './dock-shared';

/**
 * "WhatsApp 4" in the app header on tablets (761–1023px), where there's no room for the dock's strip:
 * opens the WhatsApp panel over the page. CSS shows it only there, and only on pages with the dock.
 */
export function DockChip({ initial }: { initial: number }) {
  const [live, setLive] = useState<number | null>(null);
  useEffect(() => {
    const on = (e: Event) => setLive((e as CustomEvent<WaCounts>).detail.unread);
    window.addEventListener(DOCK_EVENTS.counts, on);
    return () => window.removeEventListener(DOCK_EVENTS.counts, on);
  }, []);
  const n = live ?? initial;
  return (
    <button
      type="button"
      className="hx-dockchip"
      aria-label={n ? `WhatsApp, ${n} unread` : 'WhatsApp'}
      onClick={() => window.dispatchEvent(new CustomEvent(DOCK_EVENTS.open, { detail: {} }))}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.2a9.7 9.7 0 0 0-8.3 14.8L2.3 21.8l4.9-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 19.9z" />
      </svg>
      <span className="hx-dockchip__label">WhatsApp</span>
      {n > 0 && <span className="hx-badge">{n > 99 ? '99+' : n}</span>}
    </button>
  );
}
