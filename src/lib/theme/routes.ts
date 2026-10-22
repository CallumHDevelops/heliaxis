/**
 * Which pages follow the light/dark choice, and the phone's status bar colour on each. Pure (tested
 * by scripts/test-theme.mjs). The middleware asks themeRouteFor() for every page and hands the answer
 * to the root layout in a request header (THEME_ROUTE_HEADER). A page built ahead of time (the site
 * app's home and offline shell) gets no header: SELF_ROUTE_SCRIPT works the same answer out in the
 * browser from the address, from the same table.
 *
 * - scope 'app': the staff app, the trades' pages, the customer's pages and the sign-in pages. They
 *   follow the person's choice (default "Match phone") and declare it, so Chrome never auto-darkens them.
 * - scope 'light': pinned light (the CMS editor and its previews), declared `only light`.
 * - null: the public website, /branding and /subcontractor-form. Untouched: no attributes, no change.
 */
import { colorSchemeFor, type ThemePref } from './shared';

export type ThemeScope = 'app' | 'light';
export type ThemeRoute = { scope: ThemeScope; bar: readonly [light: string, dark: string] };

/** Staff app header: the card colour in light, the dark surface in dark. Also the customer's portal and booking headers. */
export const CARD_BAR = ['#FFFDF8', '#211F18'] as const;
/** The site app and the subcontractor portal: ink top bars in both themes. */
export const INK_BAR = ['#211F18', '#211F18'] as const;
/** Sign-in pages: the page itself. */
export const PAGE_BAR = ['#F7F2E7', '#171510'] as const;
/** Pinned light. */
export const LIGHT_BAR = ['#FFFDF8', '#FFFDF8'] as const;

/** The public website's status bar colour, as before. */
export const SITE_THEME_COLOR = '#16222F';

/** First match wins. Plain regex sources (no flags), so the browser-side script can use them as they are. */
const TABLE: readonly (readonly [pattern: string, scope: ThemeScope, bar: readonly [string, string]])[] = [
  ['^/admin/(cms|preview)(/|$)|^/admin/blog/preview(/|$)', 'light', LIGHT_BAR],
  ['^/admin(/|$)', 'app', CARD_BAR],
  // The site app and the subcontractor portal.
  ['^/portal(/|$)', 'app', INK_BAR],
  ['^/my/[^/]+', 'app', CARD_BAR],
  // A personal booking link; not /book-a-survey (the public website).
  ['^/book/[^/]+$', 'app', CARD_BAR],
  ['^/(login|register|pending|forgot-password|reset-password|auth|get-app)(/|$)', 'app', PAGE_BAR],
];
const COMPILED = TABLE.map(([re, scope, bar]) => ({ re: new RegExp(re), route: { scope, bar } as ThemeRoute }));

const tidy = (path: string) => path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';

export function themeRouteFor(pathname: string): ThemeRoute | null {
  const p = tidy(pathname);
  return COMPILED.find((r) => r.re.test(p))?.route ?? null;
}

/**
 * An address on this site that is pinned light (the CMS editor and its previews). Links to one from a
 * themed page are plain <a> (a full load), not next/link: a client-side navigation keeps the old page's
 * <html>, so the editor would start in the dark theme until ThemeSync reloads it.
 */
export function isPinnedLight(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && themeRouteFor(href)?.scope === 'light';
}

/**
 * For a page with no route header (built ahead of time): sets data-theme-scope and data-bar from the
 * address, before BOOT_SCRIPT runs. ES5, never throws, does nothing where the server already said.
 */
export const SELF_ROUTE_SCRIPT = `(function(){try{var d=document.documentElement;if(d.hasAttribute('data-theme-scope'))return;
var p=location.pathname.replace(/\\/+$/,'')||'/',R=${JSON.stringify(TABLE.map(([re, scope, bar]) => [re, scope, `${bar[0]} ${bar[1]}`]))};
for(var i=0;i<R.length;i++){if(new RegExp(R[i][0]).test(p)){d.setAttribute('data-theme-scope',R[i][1]);d.setAttribute('data-bar',R[i][2]);return}}
}catch(e){}})();`;

/** For the request header: "app #FFFDF8 #211F18", or '' for pages that aren't themed. */
export function encodeThemeRoute(route: ThemeRoute | null): string {
  return route ? `${route.scope} ${route.bar[0]} ${route.bar[1]}` : '';
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export function decodeThemeRoute(header: string | null | undefined): ThemeRoute | null {
  const [scope, light, dark] = (header ?? '').trim().split(/\s+/);
  if ((scope !== 'app' && scope !== 'light') || !HEX.test(light ?? '') || !HEX.test(dark ?? '')) return null;
  return { scope, bar: [light, dark] };
}

export type ThemeViewport = {
  colorScheme?: 'only light' | 'dark' | 'light dark';
  themeColor?: string | { media: string; color: string }[];
};

/**
 * The page's `color-scheme` and `theme-color` metas. An explicit choice gets one bar colour; "Match
 * phone" gets a pair keyed to the phone's setting. `route === undefined`: a page built ahead of time,
 * where the server can't tell; the page's own layout and the browser-side scripts see to it.
 */
export function themeViewportFor(route: ThemeRoute | null | undefined, pref: ThemePref): ThemeViewport {
  if (route === undefined) return {};
  if (!route) return { themeColor: SITE_THEME_COLOR };
  if (route.scope === 'light') return { colorScheme: 'only light', themeColor: route.bar[0] };
  const colorScheme = colorSchemeFor(pref);
  if (pref !== 'system') return { colorScheme, themeColor: pref === 'dark' ? route.bar[1] : route.bar[0] };
  if (route.bar[0] === route.bar[1]) return { colorScheme, themeColor: route.bar[0] };
  return {
    colorScheme,
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: route.bar[0] },
      { media: '(prefers-color-scheme: dark)', color: route.bar[1] },
    ],
  };
}
