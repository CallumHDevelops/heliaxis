import { useSyncExternalStore } from 'react';

/**
 * The current time in ms, refreshed every `everyMs` (default 30 s), for client components ("overdue",
 * "in 5 minutes"). Components can't call Date.now() while rendering (react-hooks/purity), so this
 * keeps one shared clock per interval outside React.
 *
 * Returns 0 on the server and during hydration: treat 0 as "not known yet".
 */

type Clock = { now: number; timer: ReturnType<typeof setInterval> | null; listeners: Set<() => void>; subscribe: (l: () => void) => () => void; get: () => number };

const clocks = new Map<number, Clock>();

function clockFor(everyMs: number): Clock {
  const found = clocks.get(everyMs);
  if (found) return found;
  const tick = () => {
    c.now = Date.now();
    for (const l of c.listeners) l();
  };
  // Phones pause timers in the background: catch up as soon as the page is shown again.
  const onShow = () => {
    if (document.visibilityState === 'visible') tick();
  };
  const c: Clock = {
    now: 0,
    timer: null,
    listeners: new Set(),
    subscribe(l) {
      c.listeners.add(l);
      if (!c.timer) {
        c.timer = setInterval(tick, everyMs);
        document.addEventListener('visibilitychange', onShow);
      }
      return () => {
        c.listeners.delete(l);
        if (!c.listeners.size && c.timer) {
          clearInterval(c.timer);
          c.timer = null;
          c.now = 0; // read afresh by the next component that needs it
          document.removeEventListener('visibilitychange', onShow);
        }
      };
    },
    get() {
      if (!c.now) c.now = Date.now();
      return c.now;
    },
  };
  clocks.set(everyMs, c);
  return c;
}

const serverNow = () => 0;

export function useNow(everyMs = 30_000): number {
  const c = clockFor(Math.max(1000, Math.round(everyMs) || 30_000));
  return useSyncExternalStore(c.subscribe, c.get, serverNow);
}
