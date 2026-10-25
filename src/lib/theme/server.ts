import 'server-only';
import type { Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { decodeThemeRoute, themeViewportFor, type ThemeRoute } from './routes';
import { DEFAULT_PREF, parsePref, parseScheme, resolveTheme, SCHEME_COOKIE, THEME_COOKIE, THEME_ROUTE_HEADER, type ResolvedTheme, type ThemePref } from './shared';

export type ThemeContext = {
  /**
   * null: a page that isn't themed (the public website). undefined: a page built ahead of time (no
   * request, so no route header): the browser works it out (SELF_ROUTE_SCRIPT).
   */
  route: ThemeRoute | null | undefined;
  /** The person's choice on this device ("system" = Match phone). */
  pref: ThemePref;
  /** The theme to paint, when the server can tell (undefined: Match phone on a phone not seen yet; the boot script decides). */
  resolved: ResolvedTheme | undefined;
};

/** This request's theme, from the middleware's route header and the theme cookies. One read per request. */
export const themeContext = cache(async (): Promise<ThemeContext> => {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const header = h.get(THEME_ROUTE_HEADER);
  // The middleware sets the header on every page request (empty for the website); none means prerendered.
  if (header === null) return { route: undefined, pref: DEFAULT_PREF, resolved: undefined };
  const route = decodeThemeRoute(header);
  if (!route) return { route: null, pref: DEFAULT_PREF, resolved: undefined };
  if (route.scope === 'light') return { route, pref: 'light', resolved: 'light' };
  const pref = parsePref(jar.get(THEME_COOKIE)?.value) ?? DEFAULT_PREF;
  return { route, pref, resolved: resolveTheme(pref, parseScheme(jar.get(SCHEME_COOKIE)?.value)) };
});

/** The root layout's viewport: color-scheme and theme-color for this page and choice. */
export async function themeViewport(): Promise<Viewport> {
  const t = await themeContext();
  return themeViewportFor(t.route, t.pref);
}
