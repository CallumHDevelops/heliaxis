/**
 * The CMS report (SEO and GEO): the pure parts, shared by the server, /admin/cms-report and
 * scripts/test-report.mjs. Reading Google results, adding up who beats us, and reading a page's
 * on-page signals. Nothing here touches the database or the network.
 */

export const OUR_DOMAIN = 'heliaxis.co.uk';

export type ReportSettings = {
  /** Searches to check in Google, without a town ("solar panel installers"). */
  keywords: string[];
  /** DataForSEO location names, "Town,Region,Country". */
  locations: string[];
  /** Days between automatic reports; 0 = only when someone taps Build. */
  everyDays: number;
};

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  keywords: [
    'solar panel installers',
    'solar panels',
    'solar battery storage',
    'air source heat pump installers',
    'ev charger installation',
    'commercial solar panels',
    'solar panel cost',
    'infrared heating panels',
  ],
  locations: ['Newport,Wales,United Kingdom', 'Cardiff,Wales,United Kingdom', 'Swansea,Wales,United Kingdom', 'Bristol,England,United Kingdom'],
  everyDays: 30,
};

const cleanList = (v: unknown, max: number, len: number) =>
  Array.isArray(v)
    ? [...new Set(v.map((s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean))].slice(0, max)
    : null;

export function parseReportSettings(raw: unknown): ReportSettings {
  let v: Record<string, unknown> = {};
  try {
    v = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
  } catch {
    /* defaults */
  }
  if (!v || typeof v !== 'object') v = {};
  const every = Math.round(Number(v.everyDays));
  return {
    keywords: cleanList(v.keywords, 25, 80) ?? DEFAULT_REPORT_SETTINGS.keywords,
    locations: cleanList(v.locations, 8, 80) ?? DEFAULT_REPORT_SETTINGS.locations,
    everyDays: Number.isFinite(every) && every >= 0 && every <= 90 ? every : DEFAULT_REPORT_SETTINGS.everyDays,
  };
}

/** "Newport,Wales,United Kingdom" → "Newport". */
export const town = (location: string) => location.split(',')[0].trim();

export const serpKey = (keyword: string, location: string) => `${keyword}@@${location}`;

/** A bare host: no www., lower case. */
export function hostOf(urlOrDomain: string): string {
  const s = String(urlOrDomain || '').trim().toLowerCase();
  let host = s;
  try {
    if (/^https?:\/\//.test(s)) host = new URL(s).hostname;
  } catch {
    /* as typed */
  }
  return host.replace(/^www\./, '').replace(/\.$/, '');
}

export const isOurs = (urlOrDomain: string) => {
  const h = hostOf(urlOrDomain);
  return h === OUR_DOMAIN || h.endsWith(`.${OUR_DOMAIN}`);
};

/** Directories, marketplaces and big publishers: they take places in the results but aren't installers. */
const DIRECTORIES = [
  'checkatrade.com', 'yell.com', 'mybuilder.com', 'trustatrade.com', 'ratedpeople.com', 'bark.com', 'trustpilot.com',
  'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'reddit.com', 'wikipedia.org', 'gov.uk', 'gov.wales',
  'which.co.uk', 'energysavingtrust.org.uk', 'mcscertified.com', 'theecoexperts.co.uk', 'greenmatch.co.uk', 'nimblefins.co.uk',
  'moneysavingexpert.com', 'bbc.co.uk', 'theguardian.com', 'yelp.co.uk', 'thomsonlocal.com', 'freeindex.co.uk', 'houzz.co.uk',
  'google.com', 'amazon.co.uk', 'screwfix.com', 'tiktok.com', 'x.com', 'twitter.com', 'nextdoor.co.uk', 'ofgem.gov.uk',
];
export const isDirectory = (domain: string) => {
  const h = hostOf(domain);
  return DIRECTORIES.some((d) => h === d || h.endsWith(`.${d}`));
};

export type SerpOrganic = { pos: number; domain: string; url: string; title: string };
export type SerpLocal = { pos: number; title: string; domain: string; rating: number | null; reviews: number | null };
export type SerpResult = {
  keyword: string;
  location: string;
  /** Our best organic place (1 = top), null if not in the results read. */
  ours: number | null;
  ourUrl: string | null;
  /** Our place in the map pack, null if not in it. */
  oursLocal: number | null;
  organic: SerpOrganic[];
  local: SerpLocal[];
  features: string[];
  error?: string;
};

type RawItem = Record<string, unknown> & { type?: string };

/** Read one DataForSEO "Google organic live advanced" result into what the report keeps. */
export function parseSerp(keyword: string, location: string, result: { items?: RawItem[]; item_types?: string[] } | null | undefined): SerpResult {
  const items = Array.isArray(result?.items) ? result!.items : [];
  const organic: SerpOrganic[] = [];
  const local: SerpLocal[] = [];
  for (const it of items) {
    if (it.type === 'organic') {
      organic.push({
        pos: Number(it.rank_group) || organic.length + 1,
        domain: hostOf(String(it.domain || it.url || '')),
        url: String(it.url || ''),
        title: String(it.title || '').slice(0, 160),
      });
    } else if (it.type === 'local_pack') {
      const rating = (it.rating ?? null) as { value?: number; votes_count?: number } | null;
      local.push({
        pos: Number(it.rank_group) || local.length + 1,
        title: String(it.title || '').slice(0, 120),
        domain: hostOf(String(it.domain || it.url || '')),
        rating: typeof rating?.value === 'number' ? rating.value : null,
        reviews: typeof rating?.votes_count === 'number' ? rating.votes_count : null,
      });
    }
  }
  const mine = organic.find((o) => isOurs(o.domain) || isOurs(o.url));
  const mineLocal = local.find((l) => isOurs(l.domain) || /\bheliaxis\b/i.test(l.title));
  return {
    keyword,
    location,
    ours: mine?.pos ?? null,
    ourUrl: mine?.url ?? null,
    oursLocal: mineLocal?.pos ?? null,
    organic: organic.slice(0, 20),
    local: local.slice(0, 6),
    features: [...new Set((result?.item_types ?? []).map(String))].slice(0, 20),
  };
}

export type Rival = {
  domain: string;
  /** Searches (keyword × town) where they appear in the top 20. */
  appearances: number;
  /** Of those, how many times they were above us (or there when we weren't). */
  beatsUs: number;
  avgPos: number;
  top3: number;
  bestUrl: string;
  bestTitle: string;
  localPack: number;
};

/** Who beats us across the searches checked: installers (not directories) ranked by how often they're above us. */
export function rivals(serps: SerpResult[], max = 15): Rival[] {
  const map = new Map<string, Rival & { sum: number; best: number }>();
  for (const s of serps) {
    if (s.error) continue;
    const seen = new Set<string>();
    for (const o of s.organic) {
      if (!o.domain || isOurs(o.domain) || isDirectory(o.domain) || seen.has(o.domain)) continue;
      seen.add(o.domain);
      const r = map.get(o.domain) ?? { domain: o.domain, appearances: 0, beatsUs: 0, avgPos: 0, top3: 0, bestUrl: '', bestTitle: '', localPack: 0, sum: 0, best: 999 };
      r.appearances++;
      r.sum += o.pos;
      if (o.pos <= 3) r.top3++;
      if (s.ours == null || o.pos < s.ours) r.beatsUs++;
      if (o.pos < r.best) Object.assign(r, { best: o.pos, bestUrl: o.url, bestTitle: o.title });
      map.set(o.domain, r);
    }
    for (const l of s.local) {
      const r = l.domain ? map.get(l.domain) : undefined;
      if (r) r.localPack++;
    }
  }
  return [...map.values()]
    .map((r) => ({
      domain: r.domain,
      appearances: r.appearances,
      beatsUs: r.beatsUs,
      avgPos: Math.round((r.sum / r.appearances) * 10) / 10,
      top3: r.top3,
      bestUrl: r.bestUrl,
      bestTitle: r.bestTitle,
      localPack: r.localPack,
    }))
    .sort((a, b) => b.beatsUs - a.beatsUs || a.avgPos - b.avgPos)
    .slice(0, max);
}

/** Businesses in the map packs, by how often they show (the map pack is often above every website). */
export function localLeaders(serps: SerpResult[], max = 10) {
  const map = new Map<string, { title: string; count: number; best: number; rating: number | null; reviews: number | null }>();
  for (const s of serps) {
    if (s.error) continue;
    for (const l of s.local) {
      const key = l.title.toLowerCase();
      const r = map.get(key) ?? { title: l.title, count: 0, best: 99, rating: l.rating, reviews: l.reviews };
      r.count++;
      r.best = Math.min(r.best, l.pos);
      if (l.reviews != null && (r.reviews == null || l.reviews > r.reviews)) Object.assign(r, { rating: l.rating, reviews: l.reviews });
      map.set(key, r);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.best - b.best).slice(0, max);
}

export type PageAudit = {
  url: string;
  ours: boolean;
  /** Why it was read: the search it ranks for. */
  keyword: string;
  pos: number | null;
  ok: boolean;
  error?: string;
  status?: number;
  ms?: number;
  kb?: number;
  title?: string;
  description?: string;
  h1?: string[];
  h2?: string[];
  words?: number;
  schema?: string[];
  faq?: boolean;
  images?: number;
  imagesNoAlt?: number;
  internalLinks?: number;
  externalLinks?: number;
  towns?: Record<string, number>;
  reviewsMentioned?: boolean;
  accreditations?: string[];
  canonical?: string;
};

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));

const textOf = (html: string) =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const ACCREDITATIONS: [string, RegExp][] = [
  ['MCS', /\bMCS\b/],
  ['RECC', /\bRECC\b/],
  ['NICEIC', /\bNICEIC\b/i],
  ['NAPIT', /\bNAPIT\b/i],
  ['TrustMark', /\btrust\s?mark\b/i],
  ['HIES', /\bHIES\b/],
  ['Which? Trusted Trader', /which\?\s*trusted/i],
  ['Checkatrade', /checkatrade/i],
  ['Tesla Powerwall certified', /powerwall\s+certified|certified\s+(?:tesla|powerwall)\s+installer|tesla\s+certified/i],
];

/** On-page signals of one HTML page: what search engines and AI assistants read first. */
export function auditHtml(html: string, url: string, towns: string[]): Omit<PageAudit, 'ours' | 'keyword' | 'pos' | 'ok' | 'status' | 'ms' | 'kb'> {
  const head = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? html.slice(0, 50_000);
  const meta = (name: string) =>
    decode(
      head.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1] ??
        head.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'))?.[1] ??
        ''
    ).trim();
  const schema = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of m[1].matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) {
      for (const one of t[1].matchAll(/"([^"]+)"/g)) schema.add(one[1]);
    }
  }
  const body = html
    .replace(/<head\b[\s\S]*?<\/head>/i, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ');
  const text = textOf(body);
  const tags = (tag: string) => [...body.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))].map((m) => textOf(m[1])).filter(Boolean);
  const imgs = [...body.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  let host = '';
  try {
    host = hostOf(url);
  } catch {
    /* none */
  }
  let internal = 0;
  let external = 0;
  for (const m of body.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    const href = m[1];
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    if (/^https?:\/\//i.test(href) && hostOf(href) !== host) external++;
    else internal++;
  }
  const townCounts: Record<string, number> = {};
  for (const t of towns) {
    const n = (text.match(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []).length;
    if (n) townCounts[t] = n;
  }
  return {
    url,
    title: textOf(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 200),
    description: meta('description').slice(0, 320),
    h1: tags('h1').slice(0, 3).map((s) => s.slice(0, 160)),
    h2: tags('h2').slice(0, 12).map((s) => s.slice(0, 120)),
    words: text ? text.split(' ').length : 0,
    schema: [...schema].slice(0, 15),
    faq: schema.has('FAQPage') || /frequently asked|\bFAQs?\b/i.test(tags('h2').join(' ')),
    images: imgs.length,
    imagesNoAlt: imgs.filter((i) => !/\balt=["'][^"']+["']/i.test(i)).length,
    internalLinks: internal,
    externalLinks: external,
    towns: townCounts,
    reviewsMentioned: /\breviews?\b|\btestimonials?\b|★|\bstars?\b/i.test(text),
    accreditations: ACCREDITATIONS.filter(([, re]) => re.test(text)).map(([n]) => n),
    canonical: (head.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? '').slice(0, 300),
  };
}

/** A public web address we may fetch: http(s), a real host name, no IPs, no ports, no local names. */
export function fetchable(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    if (u.port || u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    if (!h.includes('.') || h.endsWith('.local') || h.endsWith('.internal') || h === 'localhost') return false;
    if (/^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return false;
    return true;
  } catch {
    return false;
  }
}

export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
export type GscTotals = { clicks: number; impressions: number; ctr: number; position: number };

/** Totals over rows from Search Console (position weighted by impressions, as Search Console does). */
export function gscTotals(rows: GscRow[]): GscTotals {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    weighted += r.position * r.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? Math.round((weighted / impressions) * 10) / 10 : 0,
  };
}

/** Searches where we're on page one's edge or page two with real impressions: the quickest wins. */
export function strikingDistance(rows: GscRow[], max = 15): GscRow[] {
  return rows
    .filter((r) => r.position >= 4 && r.position <= 20 && r.impressions >= 10)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, max);
}

/** YYYY-MM-DD, `daysAgo` days before `from` (UTC). */
export function isoDay(from: Date, daysAgo: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
