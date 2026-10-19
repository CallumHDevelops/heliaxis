'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps a page's data live without a reload (the WhatsApp inbox and chats): runs `load` every
 * `every` ms while the tab is visible, pauses while it's hidden, and runs straight away when you
 * come back to it (focus, visible again, back online). Never two at once: the next one is timed
 * from when the last one finished, and after errors it slows down (doubling, up to a minute).
 *
 * `load` returns false (or throws) when it failed; `full` is true when it shouldn't take shortcuts
 * (a "nothing changed?" check). `refresh` is for a Refresh button: a full load now, with `busy`
 * true until it's done. `reload` is the same without `busy`, for after a change (e.g. sending a
 * message), so it queues behind a poll that's on its way instead of racing it.
 *
 * Polling rather than Supabase Realtime: the tables are server-only (RLS on, no policies), so the
 * browser can't subscribe to them, and a poll survives sleep, flaky signal and redeploys by itself.
 */
export function useLiveRefresh(load: (full: boolean) => Promise<boolean | void>, every: number) {
  const [busy, setBusy] = useState(false);
  const runNow = useRef<(manual?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let current = Promise.resolve();
    let again = false;
    let full = false;
    let failures = 0;
    let lastDone = 0;
    let stopped = false;

    const schedule = () => {
      clearTimeout(timer);
      if (stopped || document.visibilityState !== 'visible') return;
      timer = setTimeout(() => void run(), Math.min(60_000, every * 2 ** failures));
    };

    const run = (manual = false): Promise<void> => {
      if (manual) full = true;
      if (running) {
        // One already on its way: a Refresh tap (or a reload) gets a fresh one straight after it.
        if (manual) again = true;
        return current;
      }
      running = true;
      clearTimeout(timer);
      current = (async () => {
        do {
          again = false;
          const thorough = full;
          full = false;
          let ok = false;
          try {
            ok = (await load(thorough)) !== false;
          } catch {
            ok = false;
          }
          failures = ok ? 0 : Math.min(failures + 1, 4);
        } while (again && !stopped);
        // In the same step as the last check of `again`, so a request can't fall in between.
        running = false;
        lastDone = Date.now();
        schedule();
      })();
      return current;
    };
    runNow.current = run;

    // Back to the tab: focus and visibilitychange come together, so once is enough. Too soon after
    // the last one to run again, it still restarts the timer (hiding the tab cleared it).
    const onBack = () => {
      if (document.visibilityState !== 'visible') clearTimeout(timer);
      else if (Date.now() - lastDone > 1500) void run();
      else if (!running) schedule();
    };
    void run();
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    window.addEventListener('online', onBack);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
      window.removeEventListener('online', onBack);
    };
  }, [load, every]);

  const reload = useCallback(() => runNow.current(true), []);
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await runNow.current(true);
    } finally {
      setBusy(false);
    }
  }, []);

  return { refresh, busy, reload };
}
