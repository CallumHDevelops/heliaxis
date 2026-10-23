/**
 * AI search visibility (the GEO bot): the pure parts, shared by the server, the /admin/geo screen and
 * scripts/test-geo.mjs. Nothing here touches the database or the network.
 */

export const SITE_HOST = 'heliaxis.co.uk';
const BRAND = /\bheliaxis\b/i;

export type GeoSource = { url: string; title?: string };

export type GeoSettings = {
  /** Days between scheduled runs; 0 = only when someone taps Run now. */
  everyDays: number;
  /** Put the bot's page title and description suggestions live without asking. */
  autoMeta: boolean;
};

export const DEFAULT_SETTINGS: GeoSettings = { everyDays: 7, autoMeta: false };

export function parseSettings(raw: unknown): GeoSettings {
  let v: Record<string, unknown> = {};
  try {
    v = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
  } catch {
    /* defaults */
  }
  if (!v || typeof v !== 'object') v = {};
  const every = Math.round(Number(v.everyDays));
  return {
    everyDays: Number.isFinite(every) && every >= 0 && every <= 60 ? every : DEFAULT_SETTINGS.everyDays,
    autoMeta: v.autoMeta === true,
  };
}

/** Whether a URL is on our own site (any subdomain). */
export function isOwnUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return host === SITE_HOST || host.endsWith(`.${SITE_HOST}`);
  } catch {
    return false;
  }
}

/** Named in the answer, and cited (a link to heliaxis.co.uk among its sources or in its text). */
export function scoreAnswer(answer: string, sources: GeoSource[]): { mentioned: boolean; cited: boolean } {
  const text = String(answer || '');
  const linked = (text.match(/https?:\/\/[^\s)\]>"']+/g) || []).some(isOwnUrl);
  return {
    mentioned: BRAND.test(text) || text.toLowerCase().includes(SITE_HOST),
    cited: linked || sources.some((s) => isOwnUrl(s.url)),
  };
}

/** Where Heliaxis comes in the businesses an answer names (1 = first), or null if it isn't there. */
export function brandRank(businesses: string[]): number | null {
  const i = businesses.findIndex((b) => BRAND.test(b) || b.toLowerCase().includes(SITE_HOST));
  return i < 0 ? null : i + 1;
}

/** Sources once each, by URL without its fragment, in the order first seen. */
export function dedupeSources(list: GeoSource[], max = 30): GeoSource[] {
  const seen = new Set<string>();
  const out: GeoSource[] = [];
  for (const s of list) {
    if (!s?.url || !/^https?:\/\//i.test(s.url)) continue;
    const key = s.url.replace(/#.*$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: key, ...(s.title ? { title: String(s.title).slice(0, 200) } : {}) });
    if (out.length >= max) break;
  }
  return out;
}

/** The engine's short name for the screen: "claude" → Claude, "openrouter:perplexity/sonar" → Perplexity sonar. */
export function engineLabel(engine: string): string {
  if (engine === 'claude') return 'Claude';
  const model = engine.replace(/^openrouter:/, '');
  const [maker, name = ''] = model.split('/');
  const makers: Record<string, string> = { perplexity: 'Perplexity', openai: 'ChatGPT', google: 'Gemini', 'x-ai': 'Grok', meta: 'Llama' };
  const who = makers[maker] || maker;
  const what = name.replace(/:online$/, '').replace(/-search-preview$/, ' search');
  return what ? `${who} (${what})` : who;
}

export type RunTally = { total: number; mentioned: number; cited: number };

/** Share of answered checks that name Heliaxis / cite the site, overall and per engine. */
export function tally(checks: { engine: string; status: string; mentioned: boolean | null; cited: boolean | null }[]) {
  const all: RunTally = { total: 0, mentioned: 0, cited: 0 };
  const byEngine: Record<string, RunTally> = {};
  for (const c of checks) {
    if (c.status !== 'done') continue;
    const e = (byEngine[c.engine] ??= { total: 0, mentioned: 0, cited: 0 });
    for (const t of [all, e]) {
      t.total++;
      if (c.mentioned) t.mentioned++;
      if (c.cited) t.cited++;
    }
  }
  return { all, byEngine };
}

export const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** Text of a page's HTML, for the bot to read: no tags, scripts or styles, spaces collapsed. */
export function htmlText(html: string, max = 1500): string {
  const text = String(html || '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|div|section)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/(\.\s*){2,}/g, '. ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Plain text only: tags and control characters out, trimmed to `max`. For FAQ answers and meta tags. */
export function plain(s: unknown, max: number): string {
  return String(s ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export const sameQuestion = (a: string, b: string) =>
  a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === b.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** A CMS page path as the site serves it: leading slash, no trailing one, "/" for home. */
export function normPath(slug: string): string {
  const s = String(slug || '').trim().replace(/\/+$/, '');
  if (!s || s === '/') return '/';
  return s.startsWith('/') ? s : `/${s}`;
}
