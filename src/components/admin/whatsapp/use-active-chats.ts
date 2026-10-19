'use client';

import { useCallback, useRef, useState } from 'react';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { DOCK_EVENTS, type ActiveList, type WaCounts } from './dock-shared';

/**
 * The WhatsApp chat list (GET /api/whatsapp/active), kept fresh: every 15s while the tab is visible,
 * paused while it's hidden, and straight away on coming back. Polls send the last version, so most
 * answers are { same: true }. Each answer tells the menu badge and the CRM home (`hx:wa-counts`).
 *
 * `enabled` false (phones, pages without the dock, no access) makes no requests at all.
 */
export function useActiveChats(enabled: boolean, limit = 60) {
  const [data, setData] = useState<ActiveList | null>(null);
  const [error, setError] = useState('');
  const version = useRef('');
  const counts = useRef<WaCounts | null>(null);

  const load = useCallback(
    async (full: boolean) => {
      try {
        const v = !full && version.current ? `&v=${version.current}` : '';
        const r = await fetch(`/api/whatsapp/active?limit=${limit}${v}`, { cache: 'no-store' });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error === 'unauthorized' ? 'Sign in again to see WhatsApp chats.' : d.error || 'Could not load the chats');
        if (!d.same) {
          const list = d as ActiveList;
          setData(list);
          version.current = list.v || '';
          counts.current = { unread: list.counts.unread, needsReply: list.counts.needsReply, active: list.counts.active };
        }
        setError('');
        if (counts.current) window.dispatchEvent(new CustomEvent<WaCounts>(DOCK_EVENTS.counts, { detail: counts.current }));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the chats');
        return false;
      }
    },
    [limit]
  );
  const idle = useCallback(async () => true, []);

  // Off: a do-nothing load on an hour's timer, so the hook order never changes.
  const { reload } = useLiveRefresh(enabled ? load : idle, enabled ? 15_000 : 3_600_000);
  return { data, error, reload };
}
