'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Small per-browser choices (Mine or Everyone, a one-time hint), kept in localStorage. Read through
 * useSyncExternalStore so the server render and the first client render agree (`fallback`), with no
 * state copied in an effect. If storage is blocked (a private window) the choice still works for the
 * visit, in memory.
 */

const CHANGED = 'hx-stored-change';
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeStored(key: string, value: string | null) {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Blocked: memory only.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** A stored choice from `allowed`; `fallback` on the server, while hydrating and when nothing is stored. */
export function useStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      const on = (e: Event) => {
        if (!(e instanceof StorageEvent) || e.key === key) cb();
      };
      window.addEventListener('storage', on);
      window.addEventListener(CHANGED, on);
      return () => {
        window.removeEventListener('storage', on);
        window.removeEventListener(CHANGED, on);
      };
    },
    [key]
  );
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null
  );
  const value = raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback((v: T) => writeStored(key, v), [key]);
  return [value, set];
}

/** A media query, for behaviour only (CSS does the layout). `server` until the page is running. */
export function useMedia(query: string, server = false): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => server
  );
}
