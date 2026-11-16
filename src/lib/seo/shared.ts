/**
 * The weekly site check: what one page looks like to a search engine or an AI assistant, the problems with it, and how this
 * week compares with last. Pure functions (no network), so they can be tested. The fetching is in server.ts.
 */
export type Severity = 'high' | 'medium' | 'low';
export type Finding = { code: string; severity: Severity; message: string };

export type PageAudit = {
  path: string;
  status: number;
  ms: number;
  title: string;
  description: string;
  h1: number;
  imgs: number;
  imgsNoAlt: number;
  canonical: string | null;
  noindex: boolean;
  /** schema.org types found in JSON-LD ("LocalBusiness", "FAQPage"). */
  jsonld: string[];
  words: number;
  /** Internal links on the page (paths). */
  links: string[];
  findings: Finding[];
};

export type SiteFinding = { code: string; severity: Severity; message: string; paths?: string[] };

export type Audit = {
  /** The date it ran, YYYY-MM-DD (also its key). */
  id: string;
  at: string;
  pages: PageAudit[];
  site: SiteFinding[];
  summary: { pages: number; clean: number; high: number; medium: number; low: number; score: number };
};

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const attr = (tag: string, name: string) => {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? '') : null;
};

/** Read what matters out of a page's HTML. */
export function parsePage(html: string, path: string, status: number, ms: number): Omit<PageAudit, 'findings'> {
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''));
  let description = '';
  let noindex = false;
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name = (attr(m[0], 'name') ?? '').toLowerCase();
    if (name === 'description') description = decode(attr(m[0], 'content') ?? '');
    if (name === 'robots' && /noindex/i.test(attr(m[0], 'content') ?? '')) noindex = true;
  }
  let canonical: string | null = null;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) if ((attr(m[0], 'rel') ?? '').toLowerCase() === 'canonical') canonical = attr(m[0], 'href');
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  // An image with an empty alt is deliberate (decorative); only a missing alt is a problem.
  const imgsNoAlt = imgTags.filter((t) => attr(t, 'alt') === null).length;
  const jsonld: string[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          const t = o['@type'];
          for (const x of Array.isArray(t) ? t : t ? [t] : []) jsonld.push(String(x));
          if (o['@graph']) walk(o['@graph']);
        }
      };
      walk(JSON.parse(m[1]));
    } catch {
      jsonld.push('invalid-json');
    }
  }
  const text = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const words = decode(text).split(' ').filter(Boolean).length;
  const links = [...new Set([...html.matchAll(/<a\b[^>]*href=("([^"]*)"|'([^']*)')/gi)].map((m) => (m[2] ?? m[3] ?? '').split('#')[0].split('?')[0]).filter((h) => h.startsWith('/') && !h.startsWith('//')))];
  return { path, status, ms, title, description, h1: (html.match(/<h1[\s>]/gi) ?? []).length, imgs: imgTags.length, imgsNoAlt, canonical, noindex, jsonld, words, links };
}

/** What's wrong with one page. */
export function findingsFor(p: Omit<PageAudit, 'findings'>): Finding[] {
  const f: Finding[] = [];
  const add = (code: string, severity: Severity, message: string) => f.push({ code, severity, message });
  if (p.status >= 400 || p.status === 0) {
    add('status', 'high', p.status ? `The page answers ${p.status}.` : 'The page did not answer.');
    return f;
  }
  if (!p.title) add('title-missing', 'high', 'No page title.');
  else if (p.title.length < 30) add('title-short', 'medium', `The title is short (${p.title.length} characters): it could say more about the page.`);
  else if (p.title.length > 65) add('title-long', 'low', `The title is long (${p.title.length} characters) and may be cut off in search results.`);
  if (!p.description) add('desc-missing', 'high', 'No meta description.');
  else if (p.description.length < 70) add('desc-short', 'medium', `The description is short (${p.description.length} characters).`);
  else if (p.description.length > 165) add('desc-long', 'low', `The description is long (${p.description.length} characters) and may be cut off.`);
  if (p.h1 === 0) add('h1-missing', 'high', 'No main heading (h1).');
  else if (p.h1 > 1) add('h1-many', 'medium', `${p.h1} main headings (h1): there should be one.`);
  if (p.imgsNoAlt > 0) add('img-alt', 'medium', `${p.imgsNoAlt} of ${p.imgs} images have no alt text.`);
  if (p.noindex) add('noindex', 'high', 'The page tells search engines not to list it (noindex).');
  if (!p.canonical) add('canonical', 'low', 'No canonical link.');
  if (p.words < 150 && p.path !== '/') add('thin', 'low', `Only about ${p.words} words of text.`);
  if (p.ms > 2500) add('slow', 'medium', `Slow to answer (${(p.ms / 1000).toFixed(1)} seconds).`);
  return f;
}

export const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export function summarise(pages: PageAudit[], site: SiteFinding[]): Audit['summary'] {
  const count = (s: Severity) => pages.reduce((n, p) => n + p.findings.filter((x) => x.severity === s).length, 0) + site.filter((x) => x.severity === s).length;
  const clean = pages.filter((p) => !p.findings.some((x) => x.severity !== 'low')).length;
  const high = count('high');
  const medium = count('medium');
  const low = count('low');
  // A plain score: the share of pages with no high or medium problem.
  return { pages: pages.length, clean, high, medium, low, score: pages.length ? Math.round((clean / pages.length) * 100) : 0 };
}

export type AuditChange = { fixed: string[]; appeared: string[]; scoreBefore: number | null; scoreNow: number };

const keys = (a: Audit) => new Set([...a.pages.flatMap((p) => p.findings.filter((f) => f.severity !== 'low').map((f) => `${p.path}|${f.code}|${f.message}`)), ...a.site.filter((f) => f.severity !== 'low').map((f) => `site|${f.code}|${f.message}`)]);
const words = (k: string) => {
  const [where, , msg] = k.split('|');
  return `${where === 'site' ? 'Site' : where}: ${msg}`;
};

/** What changed since the last check: problems that are gone, and ones that are new. */
export function compareAudits(prev: Audit | null, now: Audit): AuditChange {
  if (!prev) return { fixed: [], appeared: [], scoreBefore: null, scoreNow: now.summary.score };
  const before = keys(prev);
  const after = keys(now);
  // A page that's no longer there doesn't count as fixed.
  const live = new Set(now.pages.map((p) => p.path));
  const fixed = [...before].filter((k) => !after.has(k) && (k.startsWith('site|') || live.has(k.split('|')[0]))).map(words);
  return { fixed, appeared: [...after].filter((k) => !before.has(k)).map(words), scoreBefore: prev.summary.score, scoreNow: now.summary.score };
}

/** robots.txt blocking the crawlers AI assistants use to learn about a business. */
export const AI_CRAWLERS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'];
export function blockedCrawlers(robots: string): string[] {
  const blocked: string[] = [];
  const groups = robots.split(/\n\s*\n/);
  for (const g of groups) {
    const agents = [...g.matchAll(/^\s*user-agent:\s*(.+)$/gim)].map((m) => m[1].trim());
    const disallowAll = /^\s*disallow:\s*\/\s*$/im.test(g) && !/^\s*allow:\s*\/\s*$/im.test(g);
    if (!disallowAll) continue;
    for (const a of agents) {
      if (a === '*') continue; // everyone is another matter (that would block search too)
      const hit = AI_CRAWLERS.find((c) => c.toLowerCase() === a.toLowerCase());
      if (hit) blocked.push(hit);
    }
  }
  return [...new Set(blocked)];
}

/** Titles and descriptions two pages share. */
export function duplicates(pages: PageAudit[], field: 'title' | 'description'): { text: string; paths: string[] }[] {
  const by = new Map<string, string[]>();
  for (const p of pages) {
    const t = p[field].trim().toLowerCase();
    if (t) by.set(t, [...(by.get(t) ?? []), p.path]);
  }
  return [...by.entries()].filter(([, ps]) => ps.length > 1).map(([text, paths]) => ({ text, paths }));
}
