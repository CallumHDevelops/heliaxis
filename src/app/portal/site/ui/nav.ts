'use client';

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import { SITE_CHANGED } from '@/lib/site/offline';
import { subscribeSync, syncState } from '@/lib/site/sync';

/**
 * Moving around the site app without asking the server for anything: the address changes with
 * history.pushState and the app draws the screen for it, so it works the same with no signal.
 * A reload (or a cold start) gets the page from the service worker, which is the same app.
 */

const ROUTE_EVENT = 'hx-site-route';

export function go(path: string, opts: { replace?: boolean } = {}) {
  // hxSite marks a page reached inside the app, so Back knows it can go back to it.
  const state = { hxSite: opts.replace ? !!(window.history.state as { hxSite?: boolean } | null)?.hxSite : true };
  if (opts.replace) window.history.replaceState(state, '', path);
  else window.history.pushState(state, '', path);
  window.dispatchEvent(new Event(ROUTE_EVENT));
  window.scrollTo(0, 0);
}

/** Back within the app, or home when there's nothing to go back to (opened straight from a link). */
export function back(fallback = '/portal/site') {
  if ((window.history.state as { hxSite?: boolean } | null)?.hxSite) window.history.back();
  else go(fallback, { replace: true });
}

const subscribeRoute = (fn: () => void) => {
  window.addEventListener('popstate', fn);
  window.addEventListener(ROUTE_EVENT, fn);
  return () => {
    window.removeEventListener('popstate', fn);
    window.removeEventListener(ROUTE_EVENT, fn);
  };
};

/** The path ('' while the server renders the page: the server never knows which job). */
export const usePath = () => useSyncExternalStore(subscribeRoute, () => window.location.pathname, () => '');

export type Route =
  | { name: 'link'; token: string }
  | { name: 'job'; id: string; rest: string[] }
  | { name: 'home' }
  | { name: 'loading' };

export function parseRoute(path: string): Route {
  if (!path) return { name: 'loading' };
  const parts = path.replace(/\/+$/, '').split('/').slice(3);
  if (parts[0] === 'j' && parts[1]) return { name: 'link', token: parts[1] };
  if (parts[0] === 'job' && /^[0-9a-f-]{36}$/i.test(parts[1] ?? '')) return { name: 'job', id: parts[1], rest: parts.slice(2) };
  return { name: 'home' };
}

/** Something read from the phone's copy, read again whenever it changes. */
export function useLive<T>(load: () => Promise<T>, key: string): T | undefined {
  const [value, setValue] = useState<{ key: string; v: T } | undefined>();
  const run = useEffectEvent((alive: () => boolean) => {
    load().then(
      (v) => alive() && setValue({ key, v }),
      () => {}
    );
  });
  useEffect(() => {
    let live = true;
    const alive = () => live;
    const again = () => run(alive);
    again();
    window.addEventListener(SITE_CHANGED, again);
    return () => {
      live = false;
      window.removeEventListener(SITE_CHANGED, again);
    };
  }, [key]);
  return value && value.key === key ? value.v : undefined;
}

export const useSync = () => useSyncExternalStore(subscribeSync, syncState, syncState);

/** An object URL for a blob from the phone, let go of when it's no longer shown. */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    // Set from a microtask, not in the effect body.
    queueMicrotask(() => setUrl({ blob, url: u }));
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return blob && url && url.blob === blob ? url.url : null;
}
