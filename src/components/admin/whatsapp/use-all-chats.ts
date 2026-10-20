'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveChat, AllChatsPage } from './dock-shared';

/**
 * The chat list beyond the last 14 days: "All chats" (everyone with WhatsApp history, imported chats
 * too) and the search box across all of them. Neither polls; the live list (useActiveChats) is laid
 * over them, so a new message still shows straight away (mergeChats in dock-shared.ts).
 */

const PAGE = 200;
const SEARCH_WAIT_MS = 300;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', signal });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error === 'unauthorized' ? 'Sign in again to see WhatsApp chats.' : d.error || 'Could not load the chats');
  return d as T;
}

/** One page of All chats: the newest, or the 200 after `before` (the last page's `next`). */
const allChatsPage = (before: string | null) =>
  getJson<AllChatsPage>(`/api/whatsapp/active?all=1&limit=${PAGE}${before ? `&before=${encodeURIComponent(before)}` : ''}`);

/**
 * "All chats", newest message first, 200 people at a time: loaded the first time it's `wanted`, and
 * afresh each time `reload` is called (picking the chip again). `more` loads the next 200.
 */
export function useAllChats(wanted: boolean) {
  const [list, setList] = useState<AllChatsPage | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const asked = useRef(false);

  /** A page that's come back: the first replaces what's there, later ones go after it (nobody twice). */
  const took = useCallback((before: string | null, d: AllChatsPage) => {
    setList((l) => {
      const have = before && l ? l.rows : [];
      const seen = new Set(have.map((r) => r.threadId));
      return { rows: [...have, ...(d.rows ?? []).filter((r) => !seen.has(r.threadId))], next: d.next ?? null };
    });
    setError('');
  }, []);
  const failed = useCallback((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the chats'), []);

  useEffect(() => {
    if (!wanted || asked.current) return;
    asked.current = true;
    allChatsPage(null).then((d) => took(null, d), failed);
  }, [wanted, took, failed]);

  const reload = useCallback(() => {
    asked.current = true;
    allChatsPage(null).then((d) => took(null, d), failed);
  }, [took, failed]);

  const more = useCallback(async () => {
    const before = list?.next;
    if (!before || busy) return;
    setBusy(true);
    await allChatsPage(before).then((d) => took(before, d), failed);
    setBusy(false);
  }, [list, busy, took, failed]);

  return { rows: list?.rows ?? null, hasMore: !!list?.next, busy, error, reload, more };
}

/**
 * The search box across every chat, not just the ones loaded: asks the server once typing stops.
 * `pending` while the answer for what's typed now hasn't come back.
 */
export function useChatSearch(query: string) {
  const q = query.trim();
  const [found, setFound] = useState<{ q: string; rows: ActiveChat[] } | null>(null);

  useEffect(() => {
    if (q.length < 2) return;
    const stop = new AbortController();
    const t = setTimeout(() => {
      getJson<{ rows?: ActiveChat[] }>(`/api/whatsapp/active?q=${encodeURIComponent(q)}`, stop.signal)
        .then((d) => setFound({ q, rows: d.rows ?? [] }))
        // Offline or signed out: what's loaded is still searched.
        .catch(() => {
          if (!stop.signal.aborted) setFound({ q, rows: [] });
        });
    }, SEARCH_WAIT_MS);
    return () => {
      clearTimeout(t);
      stop.abort();
    };
  }, [q]);

  const ready = found?.q === q;
  return { rows: ready ? found.rows : [], pending: q.length >= 2 && !ready };
}
