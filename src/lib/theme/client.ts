/**
 * Light and dark mode in the browser: change the choice, and read it in components.
 * CSS needs nothing from here (it keys on html[data-theme]); this is for the toggle and for anything
 * drawn by script. See src/lib/theme/shared.ts for how the pieces fit.
 */
import { useSyncExternalStore } from 'react';
import {
  colorSchemeFor,
  DEFAULT_PREF,
  parsePref,
  parseScheme,
  SCHEME_COOKIE,
  THEME_AT_COOKIE,
  THEME_COOKIE,
  THEME_EVENT,
  THEME_MAX_AGE,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePref,
} from './shared';

/** When this device's choice was made (localStorage, beside the choice itself). */
const THEME_AT_STORAGE_KEY = `${THEME_STORAGE_KEY}-at`;
const cookieTail = () => `; Path=/; Max-Age=${THEME_MAX_AGE}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
const phoneScheme = (): ResolvedTheme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/** Point the page's theme-color and color-scheme metas at the theme on screen (the bar colours come from data-bar). */
export function syncThemeMetas() {
  const d = document.documentElement;
  const theme = parseScheme(d.getAttribute('data-theme'));
  const pref = parsePref(d.getAttribute('data-theme-pref'));
  const bar = (d.getAttribute('data-bar') || '').split(' ');
  if (theme && bar.length === 2) {
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
      m.content = theme === 'dark' ? bar[1] : bar[0];
    });
  }
  if (pref && d.getAttribute('data-theme-scope') === 'app') {
    const scheme = colorSchemeFor(pref);
    document.querySelectorAll<HTMLMetaElement>('meta[name="color-scheme"]').forEach((m) => {
      m.content = scheme;
    });
  }
}

/**
 * Change the theme. Cookies first (so any later server render matches the screen), then this device's
 * copy, then the page: the colours flip at once, with transitions held off for two frames. The account
 * copy is saved in the background (/api/theme), and is skipped while offline.
 */
export function setTheme(pref: ThemePref) {
  const d = document.documentElement;
  if (d.getAttribute('data-theme-scope') !== 'app') return;
  const sys = phoneScheme();
  const theme: ResolvedTheme = pref === 'system' ? sys : pref;
  const at = Date.now();
  const tail = cookieTail();
  document.cookie = `${THEME_COOKIE}=${pref}${tail}`;
  document.cookie = `${THEME_AT_COOKIE}=${at}${tail}`;
  document.cookie = `${SCHEME_COOKIE}=${sys}${tail}`;
  try {
    localStorage.setItem(THEME_AT_STORAGE_KEY, String(at));
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* private mode: the cookie still holds it */
  }
  d.setAttribute('data-theme-switching', '');
  d.setAttribute('data-theme', theme);
  d.setAttribute('data-theme-pref', pref);
  syncThemeMetas();
  requestAnimationFrame(() => requestAnimationFrame(() => d.removeAttribute('data-theme-switching')));
  window.dispatchEvent(new Event(THEME_EVENT));
  saveSoon({ theme: pref, at });
}

/*
 * The account copy: one request at a time, the latest choice only, so a quick Dark → Light can't land
 * the other way round (each response sets the cookie too). Sent half a second after the last change,
 * or straight away if the page is closing. If a newer choice was made meanwhile (here or in another
 * tab, which leaves it in localStorage), its cookies are put back once the response has landed.
 */
function reassertNewer(sentAt: number) {
  try {
    const pref = parsePref(localStorage.getItem(THEME_STORAGE_KEY));
    const at = Number(localStorage.getItem(THEME_AT_STORAGE_KEY));
    if (!pref || !(at > sentAt)) return;
    const tail = cookieTail();
    document.cookie = `${THEME_COOKIE}=${pref}${tail}`;
    document.cookie = `${THEME_AT_COOKIE}=${at}${tail}`;
  } catch {
    /* storage blocked: nothing newer to know about */
  }
}
let pending: { theme: ThemePref; at: number } | null = null;
let inFlight = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let hooked = false;

function saveSoon(choice: { theme: ThemePref; at: number }) {
  pending = choice;
  clearTimeout(timer);
  timer = setTimeout(flush, 500);
  if (!hooked) {
    hooked = true;
    window.addEventListener('pagehide', flush);
  }
}

function flush() {
  clearTimeout(timer);
  if (inFlight || !pending || navigator.onLine === false) return;
  const sent = pending;
  pending = null;
  inFlight = true;
  fetch('/api/theme', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent) })
    .catch(() => {})
    .finally(() => {
      inFlight = false;
      reassertNewer(sent.at);
      if (pending) flush();
    });
}

function subscribe(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

/** The person's choice, kept up to date. `serverPref` is what the server rendered with (so hydration matches). */
export function useThemePref(serverPref: ThemePref = DEFAULT_PREF): ThemePref {
  return useSyncExternalStore(
    subscribe,
    () => parsePref(document.documentElement.getAttribute('data-theme-pref')) ?? DEFAULT_PREF,
    () => serverPref
  );
}

/** The theme on screen, for colours drawn by script (canvas, charts). CSS needs nothing: it keys on html[data-theme]. */
export function useResolvedTheme(serverTheme: ResolvedTheme = 'light'): ResolvedTheme {
  return useSyncExternalStore(
    subscribe,
    () => parseScheme(document.documentElement.getAttribute('data-theme')) ?? 'light',
    () => serverTheme
  );
}
