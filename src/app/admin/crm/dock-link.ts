'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLiveRefresh } from '@/lib/use-live-refresh';

/**
 * The CRM's side of the WhatsApp dock (Unit W, mounted in the admin layout). The two only meet at
 * runtime: window events, the #hx-dock element and GET /api/whatsapp/active. Nothing here imports the
 * dock's files, so the CRM works the same before the dock exists (every call is then a no-op, and
 * the callers fall back to what the CRM did before).
 */

/** The event names (the dock's DOCK_EVENTS). */
export const DOCK = {
  ready: 'hx:dock-ready',
  job: 'hx:dock-job',
  open: 'hx:dock-open',
  state: 'hx:dock-state',
  action: 'hx:dock-action',
  counts: 'hx:wa-counts',
} as const;

export type ChatFilter = 'needs_reply' | 'unread' | 'all' | 'waiting';
export type DockOpen = {
  tab?: 'job' | 'chats';
  threadId?: string;
  enquiryId?: string;
  messageId?: string;
  filter?: ChatFilter;
  draft?: string;
  focus?: boolean;
};
/** The record page's customer, for the dock's This job tab. `docs` is the job's documents. */
export type DockJob = {
  projectId: string;
  enquiryId: string;
  enquiryIds: string[];
  threadId: string | null;
  waId: string | null;
  name: string;
  ref: string | null;
  customerRef: string | null;
  stage: string;
  unread: number;
  docs: unknown[];
};
export type WaCounts = { unread: number; needsReply: number; active: number };

/** One WhatsApp number in GET /api/whatsapp/active (only the parts the CRM shows). */
export type ActiveChat = {
  threadId: string;
  enquiryIds: string[];
  name: string;
  phone: string | null;
  customerRef: string | null;
  postcode: string | null;
  last: { direction: 'in' | 'out'; body: string | null; kind: string; at: string } | null;
  unread: number;
  needsReply: boolean;
  windowClosesAt: string | null;
  project: { id: string; ref: string | null; stage: string; title: string } | null;
  chatHref: string;
};
type ActiveAnswer = { v?: string; same?: boolean; counts?: WaCounts & { waiting?: number }; rows?: ActiveChat[]; canInbox?: boolean };

/** The dock is on this page (open or folded to the strip), so it can be asked to open. */
export function dockAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById('hx-dock');
  const s = el?.getAttribute('data-state');
  return !!el && !el.hidden && (s === 'open' || s === 'collapsed');
}

/**
 * Open the dock (docked from 1280px, over the page below that). False on phones and pages without
 * it, so the caller can do its own thing instead (the full-screen chat, or the old sheet).
 */
export function openDock(detail: DockOpen): boolean {
  if (!dockAvailable() || !window.matchMedia('(min-width: 761px)').matches) return false;
  window.dispatchEvent(new CustomEvent(DOCK.open, { detail }));
  return true;
}

/** Tell the dock which job the page is showing (null when it goes). */
export function sendDockJob(job: DockJob | null) {
  window.dispatchEvent(new CustomEvent(DOCK.job, { detail: job }));
}

/* ── The dock's state, for the record page's Tasks card ──────────────────────── */

const onDockState = (cb: () => void) => {
  window.addEventListener(DOCK.state, cb);
  return () => window.removeEventListener(DOCK.state, cb);
};
/**
 * One string, so useSyncExternalStore sees an unchanged snapshot as unchanged. Which tab the Tasks
 * space is on (data-where: 'job', over the job's chat; 'chats', under the list or another chat) is part
 * of it, so the page puts its card in the new space when it moves.
 */
const dockSnapshot = () => {
  const el = document.getElementById('hx-dock');
  if (!el) return 'none|0||';
  const slot = document.getElementById('hx-dock-tasks');
  return `${el.getAttribute('data-state') || 'none'}|${el.getAttribute('data-panel') === '1' ? 1 : 0}|${slot ? 'hx-dock-tasks' : ''}|${slot?.getAttribute('data-where') || ''}`;
};

/** The dock as the page sees it: 'unknown' while rendering on the server. `tasksWhere`: the dock tab the Tasks space is on. */
export function useDockState(): { state: string; panel: boolean; tasksSlot: string | null; tasksWhere: string | null } {
  const snap = useSyncExternalStore(onDockState, dockSnapshot, () => 'unknown|0||');
  const [state, panel, slot, where] = snap.split('|');
  return { state, panel: panel === '1', tasksSlot: slot || null, tasksWhere: where || null };
}

/* ── WhatsApp counts and the chats needing a reply ──────────────────────────── */

/**
 * The CRM home's WhatsApp numbers and its Needs reply card: GET /api/whatsapp/active once on mount and
 * whenever the tab comes back into view, plus the dock's own counts (`hx:wa-counts`) as they arrive
 * (every 15s while it polls). `missing` when the endpoint isn't there (before the dock was built) or
 * the person can't use WhatsApp: the page then falls back to its own per-job count.
 */
export function useWaActive(limit = 40) {
  const [rows, setRows] = useState<ActiveChat[] | null>(null);
  const [counts, setCounts] = useState<WaCounts | null>(null);
  const [missing, setMissing] = useState(false);
  const version = useRef('');
  const seen = useRef('');
  const reloadRef = useRef<() => Promise<unknown>>(async () => {});

  const load = useCallback(async () => {
    try {
      const v = version.current ? `&v=${encodeURIComponent(version.current)}` : '';
      const r = await fetch(`/api/whatsapp/active?limit=${limit}${v}`, { cache: 'no-store' });
      if (r.status === 404 || r.status === 401 || r.status === 403) {
        setMissing(true);
        return true;
      }
      const d = (await r.json().catch(() => null)) as ActiveAnswer | null;
      if (!r.ok || !d) return false;
      setMissing(false);
      if (d.same) return true;
      version.current = d.v || '';
      setRows(d.rows ?? []);
      if (d.counts) {
        seen.current = `${d.counts.unread}.${d.counts.needsReply}.${d.counts.active}`;
        setCounts({ unread: d.counts.unread, needsReply: d.counts.needsReply, active: d.counts.active });
      }
      return true;
    } catch {
      // Offline: keep what's on screen.
      return false;
    }
  }, [limit]);

  useEffect(() => {
    const onCounts = (e: Event) => {
      const c = (e as CustomEvent<WaCounts>).detail;
      if (!c || typeof c.unread !== 'number') return;
      const key = `${c.unread}.${c.needsReply}.${c.active}`;
      if (key === seen.current) return;
      // The dock saw a change: show its numbers now, and fetch the rows to match.
      seen.current = key;
      setCounts(c);
      void reloadRef.current();
    };
    window.addEventListener(DOCK.counts, onCounts);
    return () => window.removeEventListener(DOCK.counts, onCounts);
  }, []);
  // On mount and on coming back to the tab; the dock's own 15s poll keeps the numbers moving in between.
  const { reload } = useLiveRefresh(load, 600_000);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  return { rows, counts, missing, reload };
}
