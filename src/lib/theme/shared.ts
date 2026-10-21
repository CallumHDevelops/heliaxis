/**
 * Light and dark mode: the rules shared by the server (root layout, middleware, /api/theme), the
 * browser (setTheme, the boot script) and scripts/test-theme.mjs. Pure: no imports, erasable
 * TypeScript only, so the tests run it with `node --experimental-strip-types`.
 *
 * How it fits together (see src/app/theme.css for the colours):
 * - The person's choice is `light`, `dark` or `system` ("Match phone", the default). It lives in the
 *   hx-theme cookie (so the server paints the right theme first time) and in localStorage (so a
 *   page cached by a service worker, or a lost cookie, still comes back right).
 * - hx-scheme remembers what the phone was last seen set to, so the server can resolve "Match phone"
 *   too. hx-theme-at is when the choice was made: the newest choice wins across devices once
 *   supabase/theme.sql has run (profiles.theme / theme_at).
 * - <html> carries data-theme (light|dark), data-theme-pref, data-theme-scope (app|light) and
 *   data-bar (the status bar colour for each theme). BOOT_SCRIPT corrects them before first paint.
 * - Rule that keeps React happy: every change writes the cookies before it touches the page, so the
 *   next server render of the root layout (router.refresh, polling) matches what is on screen.
 */

export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFS: readonly ThemePref[] = ['light', 'dark', 'system'];
/** What the toggle says (UK English). */
export const THEME_LABELS: Record<ThemePref, string> = { light: 'Light', dark: 'Dark', system: 'Match phone' };
export const THEME_GROUP_LABEL = 'Appearance';

export const THEME_COOKIE = 'hx-theme';
export const SCHEME_COOKIE = 'hx-scheme';
export const THEME_AT_COOKIE = 'hx-theme-at';
export const THEME_STORAGE_KEY = 'hx-theme';
/** Request header the middleware sets for the root layout: "<scope> <light bar> <dark bar>", or empty. */
export const THEME_ROUTE_HEADER = 'x-hx-theme-route';
/** Window event after the theme or the choice changed (setTheme, the phone flipping, another tab). */
export const THEME_EVENT = 'hx:theme';
/** 400 days, the longest a browser keeps a cookie. */
export const THEME_MAX_AGE = 34560000;

export function parsePref(v: unknown): ThemePref | null {
  return v === 'light' || v === 'dark' || v === 'system' ? v : null;
}

export function parseScheme(v: unknown): ResolvedTheme | null {
  return v === 'light' || v === 'dark' ? v : null;
}

/** The theme to paint: the explicit choice, or for "Match phone" what the phone was last seen set to (undefined if never seen). */
export function resolveTheme(pref: ThemePref, scheme: ResolvedTheme | null | undefined): ResolvedTheme | undefined {
  if (pref !== 'system') return pref;
  return scheme ?? undefined;
}

/** The `color-scheme` to declare. Explicit Light is `only light`: plain `light` still gets auto-darkened by Chrome. */
export function colorSchemeFor(pref: ThemePref): 'only light' | 'dark' | 'light dark' {
  return pref === 'light' ? 'only light' : pref === 'dark' ? 'dark' : 'light dark';
}

/** Cookie options for the theme cookies set by the server (/api/theme, the middleware). Readable by scripts on purpose. */
export function themeCookieOptions(secure: boolean) {
  return { path: '/', maxAge: THEME_MAX_AGE, sameSite: 'lax' as const, httpOnly: false, secure };
}

/**
 * The account's saved choice to adopt on this device, or null to keep the device's. The profile wins
 * when it is newer than the device's own choice (or the device has none), so the last change made on
 * any device follows the person around; a device that has just changed it is never overwritten by
 * an older account value. Before supabase/theme.sql has run, `theme` is undefined and nothing happens.
 */
export function profileThemeToAdopt(
  profile: { theme?: unknown; theme_at?: unknown } | null | undefined,
  device: { pref?: string | null; at?: string | null }
): { pref: ThemePref; at: number } | null {
  const want = parsePref(profile?.theme);
  if (!want) return null;
  const have = parsePref(device.pref);
  if (have === want) return null;
  const parsed = typeof profile?.theme_at === 'string' ? Date.parse(profile.theme_at) : NaN;
  const at = Number.isFinite(parsed) ? parsed : 0;
  if (have) {
    const haveAt = Number(device.at) || 0;
    if (!(at > haveAt)) return null;
  }
  return { pref: want, at };
}

/**
 * Inlined at the top of <head> on themed pages. ES5, never throws, touches only <html> attributes,
 * cookies and localStorage while the page is parsed (never <meta>: React adopts head tags it did not
 * render). After load it also follows the phone flipping, another tab choosing, and the back/forward
 * cache, and then sets the theme-color metas from data-bar.
 */
export const BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,s=d.getAttribute('data-theme-scope');if(!s)return;
var K='${THEME_COOKIE}',A='; Path=/; Max-Age=${THEME_MAX_AGE}; SameSite=Lax'+(location.protocol==='https:'?'; Secure':'');
var q=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
function g(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?m[1]:null}
function ok(v){return v==='light'||v==='dark'||v==='system'}
function pref(){if(s!=='app')return 'light';var p=g(K),l=null;try{l=localStorage.getItem(K)}catch(e){}
if(!ok(p)&&ok(l)){p=l;document.cookie=K+'='+p+A}
if(ok(p)&&l!==p){try{localStorage.setItem(K,p)}catch(e){}}
return ok(p)?p:'system'}
function apply(){var p=pref(),y=q&&q.matches?'dark':'light',t=p==='system'?y:p;
if(s==='app'&&g('${SCHEME_COOKIE}')!==y)document.cookie='${SCHEME_COOKIE}='+y+A;
if(d.getAttribute('data-theme')!==t){d.setAttribute('data-theme',t);window.__hxThemeFixed=1}
if(d.getAttribute('data-theme-pref')!==p){d.setAttribute('data-theme-pref',p);window.__hxThemeFixed=1}
return t}
function later(){var t=apply(),b=(d.getAttribute('data-bar')||'').split(' ');
if(b.length===2){var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute('content',t==='dark'?b[1]:b[0])}
try{window.dispatchEvent(new Event('${THEME_EVENT}'))}catch(e){}}
apply();
if(q){if(q.addEventListener)q.addEventListener('change',later);else if(q.addListener)q.addListener(later)}
window.addEventListener('storage',function(e){if(e.key===K){if(ok(e.newValue))document.cookie=K+'='+e.newValue+A;later()}});
window.addEventListener('pageshow',function(e){if(e.persisted)later()});
}catch(e){}})();`;
