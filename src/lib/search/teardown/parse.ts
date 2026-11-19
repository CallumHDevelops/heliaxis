import { cleanDomain, isOurs } from '@/lib/seo/rankings';

/**
 * M2 SERP teardown, the parsing half (spec §5 M2). Pure: turns DataForSEO On-Page and Business Data responses (and a
 * page's own HTML, read only for its structured data) into the rows we store in seo_page_facts, seo_business and
 * seo_business_snapshot. No network and no database, so every rule here is tested against fixtures.
 */

/* ── Small helpers ──────────────────────────────────────────────────────────────────────────────────────────────── */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

export const hostOf = (url: string): string => {
  try {
    return cleanDomain(new URL(url).hostname);
  } catch {
    return '';
  }
};

const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return '';
  }
};

export const townSlug = (t: string) => t.toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** A date DataForSEO or a page gives ("2026-11-01 10:00:00 +00:00", "Tue, 04 Nov 2026 09:12:00 GMT", ISO) as ISO, or null. */
export function isoDate(v: unknown): string | null {
  const s = str(v).trim();
  if (!s) return null;
  const fixed = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T').replace(' ', '') : s;
  const t = Date.parse(fixed);
  if (!Number.isFinite(t)) return null;
  const y = new Date(t).getUTCFullYear();
  return y >= 1995 && y <= 2100 ? new Date(t).toISOString() : null;
}

/** A short, stable hash of a page's text (FNV-1a), so a changed page can be spotted without keeping it. */
export function textHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/* ── robots.txt ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Whether robots.txt lets a crawler fetch this path: the group naming one of `agents` if there is one, else the "*"
 * group; the longest matching rule wins, Allow beats Disallow on a tie; "*" and "$" work as Google reads them.
 */
export function robotsAllows(body: string, url: string, agents: string[] = ['dataforseobot']): boolean {
  let path = '/';
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    return true;
  }
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      lastWasAgent = false;
      if (val) cur.rules.push({ allow: key === 'allow', path: val });
    } else {
      lastWasAgent = false;
    }
  }
  const want = agents.map((a) => a.toLowerCase());
  const named = groups.filter((g) => g.agents.some((a) => want.includes(a)));
  const use = named.length ? named : groups.filter((g) => g.agents.includes('*'));
  const rules = use.flatMap((g) => g.rules);
  const matches = (rule: string) => {
    const anchored = rule.endsWith('$');
    const re = rule
      .replace(/\$$/, '')
      .split('*')
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${re}${anchored ? '$' : ''}`).test(path);
  };
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (!matches(r.path)) continue;
    const len = r.path.length;
    if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

/* ── Page type ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export type PageType = 'service' | 'town' | 'guide' | 'directory' | 'manufacturer' | 'government' | 'other';
export const PAGE_TYPES: PageType[] = ['service', 'town', 'guide', 'directory', 'manufacturer', 'government', 'other'];

/** Listings of installers and review sites (most of the directories in NOT_INSTALLERS, plus the scheme registers). */
export const DIRECTORIES = [
  'checkatrade.com', 'trustatrader.com', 'mybuilder.com', 'ratedpeople.com', 'yell.com', 'bark.com', 'houzz.co.uk', 'trustpilot.com',
  'yelp.com', 'yelp.co.uk', 'solarlocator.co.uk', 'renewableenergyhub.co.uk', 'switchtogether.co.uk', 'tradehand.com', 'mcscertified.com',
  'recc.org.uk', 'napit.org.uk', 'freeindex.co.uk', 'thomsonlocal.com', 'scoot.co.uk', 'cylex-uk.co.uk', 'hotfrog.co.uk', 'uk.trustpilot.com',
  'which.co.uk/trusted-traders',
];
/** Panel, battery, inverter, heat pump and charger makers. */
export const MANUFACTURERS = [
  'tesla.com', 'givenergy.co.uk', 'sunsynk.com', 'myenergi.com', 'solaredge.com', 'enphase.com', 'huawei.com', 'solar.huawei.com', 'fusionsolar.huawei.com',
  'foxess.com', 'sigenergy.com', 'jinkosolar.com', 'longi.com', 'aikosolar.com', 'trinasolar.com', 'ja-solar.com', 'canadiansolar.com', 'sunpower.com',
  'mitsubishi-les.com', 'daikin.co.uk', 'vaillant.co.uk', 'worcester-bosch.co.uk', 'samsung.com', 'lg.com', 'panasonic.com', 'ohme-ev.com', 'zappi.co.uk',
  'podpoint.com', 'hypervolt.co.uk', 'growatt.com', 'solis.com', 'ginlong.com', 'victronenergy.com', 'puredrive.energy', 'duracell-energy.com',
];
/** Advice, news, comparison and forum sites. */
export const GUIDE_SITES = [
  'which.co.uk', 'energysavingtrust.org.uk', 'moneysavingexpert.com', 'bbc.co.uk', 'walesonline.co.uk', 'theguardian.com', 'telegraph.co.uk',
  'independent.co.uk', 'greenmatch.co.uk', 'greenmatch.com', 'theecoexperts.co.uk', 'solarguide.co.uk', 'heatable.co.uk', 'nimblefins.co.uk',
  'homebuilding.co.uk', 'citizensadvice.org.uk', 'wikipedia.org', 'reddit.com', 'mumsnet.com', 'quora.com', 'solarinfo.uk',
];
/** Social networks, marketplaces and job boards: shown, never compared. */
export const OTHER_SITES = [
  'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'x.com', 'twitter.com', 'pinterest.com', 'pinterest.co.uk',
  'amazon.co.uk', 'ebay.co.uk', 'screwfix.com', 'toolstation.com', 'gumtree.com', 'indeed.co.uk', 'google.com',
];

const onList = (domain: string, path: string, list: string[]) =>
  list.some((entry) => {
    const [d, ...rest] = entry.split('/');
    const p = rest.length ? `/${rest.join('/')}` : '';
    return (domain === d || domain.endsWith(`.${d}`)) && (!p || path.startsWith(p));
  });

export const isGovernment = (domain: string) => /(^|\.)(gov\.uk|gov\.wales|llyw\.cymru|parliament\.uk|nhs\.uk|police\.uk|gov)$/.test(domain);

const GUIDE_PATH = /\/(blog|blogs|news|guide|guides|advice|learn|learning|faq|faqs|article|articles|insights|resources|knowledge|help|hub|info|information|magazine)(\/|$|-)/;
const QUESTION_START = /^(how|what|why|when|where|which|who|is|are|can|do|does|should|will|would|could)\b/i;

/**
 * What kind of page this is: government, directory, manufacturer, guide (an advice site, or an installer's blog or
 * question-led article), town (an installer page named after a tracked town), service (any other installer page), or
 * other (social, marketplaces).
 */
export function classifyPage(p: { url: string; domain?: string; h1?: string | null; title?: string | null; towns?: string[] }): PageType {
  const domain = cleanDomain(p.domain || hostOf(p.url));
  const path = pathOf(p.url);
  if (isGovernment(domain)) return 'government';
  if (onList(domain, path, DIRECTORIES)) return 'directory';
  if (onList(domain, path, OTHER_SITES)) return 'other';
  if (onList(domain, path, MANUFACTURERS)) return 'manufacturer';
  if (onList(domain, path, GUIDE_SITES)) return 'guide';
  const head = squash(str(p.h1) || str(p.title));
  if (GUIDE_PATH.test(path) || QUESTION_START.test(head) || head.endsWith('?') || /\b(guide|explained|everything you need|pros and cons|is it worth)\b/i.test(head)) return 'guide';
  const towns = (p.towns ?? []).filter(Boolean);
  const slugs = towns.map(townSlug).filter((s) => s.length >= 3);
  const pathHit = slugs.some((s) => new RegExp(`(^|[/-])${s}($|[/-])`).test(path));
  const headHit = towns.some((t) => new RegExp(`\\b${t.replace(/\(.*?\)/g, '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(head));
  if (pathHit || headHit) return 'town';
  return 'service';
}

/* ── Page facts ─────────────────────────────────────────────────────────────────────────────────────────────────── */

export type Heading = { level: number; text: string };

export type PageFactsRow = {
  url: string;
  domain: string;
  status: number | null;
  page_type: PageType;
  title: string | null;
  words: number | null;
  h1: string | null;
  headings: Heading[];
  questions: string[];
  schema: string[];
  images: number | null;
  has_video: boolean | null;
  prices_shown: boolean | null;
  reviews_on_page: boolean | null;
  author: string | null;
  published_at: string | null;
  modified_at: string | null;
  town_mentions: Record<string, number>;
  town_links: number | null;
  mentions_mcs: boolean | null;
  internal_links: number | null;
  external_links: number | null;
  lighthouse_perf: number | null;
  content_hash: string | null;
  text_sample: string | null;
  error: string | null;
};

/** What On-Page instant_pages tells us about one page (tasks[0].result[0].items[0]). */
export type InstantFacts = {
  status: number | null;
  title: string | null;
  headings: Heading[];
  words: number | null;
  images: number | null;
  internalLinks: number | null;
  externalLinks: number | null;
  modifiedAt: string | null;
  hasMicromarkup: boolean | null;
};

export function parseInstantPages(task: unknown): InstantFacts | null {
  const result = obj(arr(obj(task).result)[0]);
  const item = obj(arr(result.items)[0]);
  if (!Object.keys(item).length) return null;
  const meta = obj(item.meta);
  const htags = obj(meta.htags);
  const headings: Heading[] = [];
  for (let level = 1; level <= 4; level++) for (const t of arr(htags[`h${level}`])) if (squash(str(t))) headings.push({ level, text: squash(str(t)).slice(0, 200) });
  const content = obj(meta.content);
  const lm = obj(item.last_modified);
  const checks = obj(item.checks);
  return {
    status: num(item.status_code),
    title: squash(str(meta.title)) || null,
    headings,
    words: num(content.plain_text_word_count),
    images: num(meta.images_count),
    internalLinks: num(meta.internal_links_count),
    externalLinks: num(meta.external_links_count),
    modifiedAt: isoDate(lm.meta_tag) ?? isoDate(lm.sitemap) ?? isoDate(lm.header),
    hasMicromarkup: typeof checks.has_micromarkup === 'boolean' ? checks.has_micromarkup : null,
  };
}

/** What content_parsing/live tells us: the readable text, the topic headings, the author, links, ratings and offers. */
export type ParsedContent = {
  status: number | null;
  text: string;
  headings: Heading[];
  author: string | null;
  publishedAt: string | null;
  links: string[];
  ratings: number;
  offers: number;
};

export function parseContentParsing(task: unknown): ParsedContent | null {
  const result = obj(arr(obj(task).result)[0]);
  const item = obj(arr(result.items)[0]);
  if (!Object.keys(item).length) return null;
  const pc = obj(item.page_content);
  const texts: string[] = [];
  const headings: Heading[] = [];
  const links = new Set<string>();
  let author: string | null = null;
  let publishedAt: string | null = null;
  const readContent = (list: unknown) => {
    for (const c of arr(list)) {
      const co = obj(c);
      const t = squash(str(co.text));
      if (t) texts.push(t);
      if (str(co.url)) links.add(str(co.url));
      for (const u of arr(co.urls)) if (str(obj(u).url)) links.add(str(obj(u).url));
    }
  };
  const readTopics = (list: unknown) => {
    for (const t of arr(list)) {
      const to = obj(t);
      const h = squash(str(to.h_title) || str(to.main_title));
      const level = num(to.level) ?? 2;
      if (h) {
        headings.push({ level: Math.min(Math.max(level, 1), 6), text: h.slice(0, 200) });
        texts.push(h);
      }
      if (!author && squash(str(to.author))) author = squash(str(to.author)).slice(0, 120);
      publishedAt ??= isoDate(to.date_published) ?? isoDate(to.published_time);
      readContent(to.primary_content);
      readContent(to.secondary_content);
    }
  };
  readTopics(pc.main_topic);
  readTopics(pc.secondary_topic);
  for (const part of [obj(pc.header), obj(pc.footer)]) {
    for (const c of [...arr(part.primary_content), ...arr(part.secondary_content)]) {
      const co = obj(c);
      if (str(co.url)) links.add(str(co.url));
      for (const u of arr(co.urls)) if (str(obj(u).url)) links.add(str(obj(u).url));
    }
  }
  return {
    status: num(item.status_code),
    text: texts.join('\n'),
    headings,
    author,
    publishedAt,
    links: [...links],
    ratings: arr(pc.ratings).length,
    offers: arr(pc.offers).length,
  };
}

/** What the page's own HTML says about itself: structured-data types, video embeds, and dates or author in JSON-LD and meta tags. */
export type HtmlExtras = { schema: string[]; hasVideo: boolean; author: string | null; publishedAt: string | null; modifiedAt: string | null; links: string[] };

export function parseHtmlExtras(html: string, base?: string): HtmlExtras {
  const types = new Set<string>();
  let author: string | null = null;
  let publishedAt: string | null = null;
  let modifiedAt: string | null = null;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const o = node as Obj;
    const t = o['@type'];
    for (const x of Array.isArray(t) ? t : [t]) if (typeof x === 'string' && x.trim()) types.add(x.trim().replace(/^https?:\/\/schema\.org\//i, ''));
    publishedAt ??= isoDate(o.datePublished);
    modifiedAt ??= isoDate(o.dateModified);
    if (!author && o.author) {
      const a = Array.isArray(o.author) ? o.author[0] : o.author;
      const name = typeof a === 'string' ? a : str(obj(a).name);
      if (squash(name)) author = squash(name).slice(0, 120);
    }
    for (const [k, v] of Object.entries(o)) if (k !== '@context' && v && typeof v === 'object') walk(v);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      /* a broken block: skip it */
    }
  }
  for (const m of html.matchAll(/itemtype=["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi)) types.add(m[1]);
  const metaContent = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i');
    const m = re.exec(html);
    return m ? m[1] ?? m[2] ?? '' : '';
  };
  publishedAt ??= isoDate(metaContent('article:published_time'));
  modifiedAt ??= isoDate(metaContent('article:modified_time')) ?? isoDate(metaContent('og:updated_time'));
  if (!author && squash(metaContent('author'))) author = squash(metaContent('author')).slice(0, 120);
  const hasVideo = /<video[\s>]/i.test(html) || /<iframe[^>]+src=["'][^"']*(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|wistia\.(com|net)|loom\.com)/i.test(html) || types.has('VideoObject');
  const links: string[] = [];
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      links.push(new URL(m[1], base).toString());
    } catch {
      /* not a link */
    }
  }
  return { schema: [...types].sort(), hasVideo, author, publishedAt, modifiedAt, links };
}

const PRICE_RE = /£\s?\d[\d,]*(\.\d{2})?|\b\d[\d,]*(\.\d{2})?\s?(gbp|pounds)\b/i;
const REVIEW_RE = /\b(\d[\d,]*\s+(google\s+|five[- ]star\s+|5[- ]star\s+)?reviews|rated\s+\d(\.\d)?|\d(\.\d)?\s*(\/\s*5|out of 5)|(google|trustpilot|checkatrade|which\?)\s+reviews?)\b|★/i;
const MCS_RE = /\bMCS\b/;

/** Is a heading or FAQ line a question someone might ask? */
export const isQuestion = (s: string) => {
  const t = s.trim();
  // "What our customers say" is a label, not a question: without a question mark, only the clearly asking openings count.
  return t.endsWith('?') || (/^(how|why|is|are|can|do|does|should|will)\b/i.test(t) && t.split(/\s+/).length >= 3);
};

/** Mentions of a town by its full tracked name ("Newport (Pembs)" counts only when written so, never as plain Newport). */
function countTown(text: string, town: string): number {
  const name = town.trim();
  if (name.length < 3) return 0;
  const re = new RegExp(`(?<![A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'gi');
  return (text.match(re) ?? []).length;
}

/** Links from this page to other pages on the same site named after a tracked town. */
export function townLinkCount(pageUrl: string, links: string[], towns: string[]): number {
  const host = hostOf(pageUrl);
  const self = pathOf(pageUrl).replace(/\/$/, '');
  const slugs = towns.map(townSlug).filter((s) => s.length >= 3);
  const out = new Set<string>();
  for (const l of links) {
    if (hostOf(l) !== host) continue;
    const p = pathOf(l).replace(/\/$/, '');
    if (!p || p === self) continue;
    if (slugs.some((s) => new RegExp(`(^|[/-])${s}($|[/-])`).test(p))) out.add(p);
  }
  return out.size;
}

/**
 * One row of seo_page_facts from the two On-Page responses and (when robots.txt let us read it) the page's HTML. Missing
 * parts give null, never a guess: a page DataForSEO could not read has words null, not 0.
 */
export function buildPageFacts(input: {
  url: string;
  towns: string[];
  instant: InstantFacts | null;
  content: ParsedContent | null;
  html?: HtmlExtras | null;
  error?: string | null;
}): PageFactsRow {
  const { url, towns, instant, content } = input;
  const html = input.html ?? null;
  const domain = hostOf(url);
  const headings: Heading[] = [];
  const seenH = new Set<string>();
  for (const h of [...(instant?.headings ?? []), ...(content?.headings ?? [])]) {
    const key = h.text.toLowerCase();
    if (seenH.has(key)) continue;
    seenH.add(key);
    headings.push(h);
  }
  const h1 = instant?.headings.find((h) => h.level === 1)?.text ?? content?.headings.find((h) => h.level === 1)?.text ?? null;
  const title = instant?.title ?? null;
  const text = content?.text ?? '';
  const read = !!(instant || content);
  const allText = [title ?? '', ...headings.map((h) => h.text), text].join('\n');
  const questions = [...new Set(headings.map((h) => h.text).filter(isQuestion))].slice(0, 30);
  const townMentions: Record<string, number> = {};
  if (read) for (const t of towns) {
    const c = countTown(allText, t);
    if (c) townMentions[t] = c;
  }
  const links = [...new Set([...(content?.links ?? []), ...(html?.links ?? [])])];
  const schema = html?.schema ?? [];
  const words = instant?.words ?? (text ? text.split(/\s+/).filter(Boolean).length : null);
  const status = instant?.status ?? content?.status ?? null;
  const sample = text ? text.split(/\s+/).slice(0, 4000).join(' ') : null;
  return {
    url,
    domain,
    status,
    page_type: classifyPage({ url, domain, h1, title, towns }),
    title,
    words: read ? words : null,
    h1,
    headings: headings.slice(0, 80),
    questions,
    schema,
    images: instant?.images ?? null,
    has_video: html ? html.hasVideo : null,
    prices_shown: read ? (content?.offers ?? 0) > 0 || PRICE_RE.test(allText) || schema.includes('Offer') : null,
    reviews_on_page: read ? (content?.ratings ?? 0) > 0 || schema.some((s) => s === 'Review' || s === 'AggregateRating') || REVIEW_RE.test(allText) : null,
    author: content?.author ?? html?.author ?? null,
    published_at: content?.publishedAt ?? html?.publishedAt ?? null,
    modified_at: instant?.modifiedAt ?? html?.modifiedAt ?? null,
    town_mentions: townMentions,
    town_links: read ? townLinkCount(url, links, towns) : null,
    mentions_mcs: read ? headings.some((h) => MCS_RE.test(h.text)) : null,
    internal_links: instant?.internalLinks ?? null,
    external_links: instant?.externalLinks ?? null,
    lighthouse_perf: null,
    content_hash: text ? textHash(text) : null,
    text_sample: sample,
    error: input.error ?? (read ? null : 'DataForSEO could not read the page'),
  };
}

/** Mobile performance score 0 to 100 from on_page/lighthouse/live/json (tasks[0].result[0]). */
export function parseLighthouse(task: unknown): number | null {
  const r = obj(arr(obj(task).result)[0]);
  const score = num(obj(obj(r.categories).performance).score);
  return score === null ? null : Math.round(score * 100);
}

/* ── Business Profiles ──────────────────────────────────────────────────────────────────────────────────────────── */

/** A business name reduced for matching: "Heliaxis Ltd." and "HELIAXIS" are the same firm. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(ltd|limited|llp|plc|uk|co|company|the|group)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same business by name: equal once reduced, or one name wholly contains the other (both at least 6 letters). */
export function sameName(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.length >= 6 && y.length >= 6 && (` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `));
}

export type BusinessInfo = {
  cid: string | null;
  place_id: string | null;
  name: string;
  domain: string | null;
  primary_category: string | null;
  categories: string[];
  website: string | null;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviews: number | null;
  photos: number | null;
  claimed: boolean | null;
};

/** The first profile in a my_business_info/live answer (tasks[0].result[0].items[0]), or null when Google had none. */
export function parseBusinessInfo(task: unknown): BusinessInfo | null {
  const result = obj(arr(obj(task).result)[0]);
  const item = obj(arr(result.items)[0]);
  const name = squash(str(item.title));
  if (!name) return null;
  const rating = obj(item.rating);
  const website = str(item.url) || null;
  const domain = str(item.domain) ? cleanDomain(str(item.domain)) : website ? hostOf(website) || null : null;
  const primary = squash(str(item.category)) || null;
  const extra = arr(item.additional_categories).map((c) => squash(str(c))).filter(Boolean);
  return {
    cid: str(item.cid) || null,
    place_id: str(item.place_id) || null,
    name: name.slice(0, 160),
    domain,
    primary_category: primary,
    categories: [...new Set([...(primary ? [primary] : []), ...extra])],
    website,
    address: squash(str(item.address)) || null,
    phone: squash(str(item.phone)) || null,
    lat: num(item.latitude),
    lng: num(item.longitude),
    rating: num(rating.value),
    reviews: num(rating.votes_count),
    photos: num(item.total_photos),
    claimed: typeof item.is_claimed === 'boolean' ? item.is_claimed : null,
  };
}

export type ReviewPace = {
  /** Reviews dated in the 90 days before `asOf`, among the newest `depth` read. */
  reviews90d: number;
  /** True when every review read was inside 90 days, so the real figure may be higher. */
  capped: boolean;
  read: number;
  /** Share of the reviews read that the owner answered, 0 to 100. */
  respondedPct: number | null;
  rating: number | null;
  reviews: number | null;
  newest: string | null;
};

/** Review pace from a reviews task_get answer (tasks[0].result[0], newest first). */
export function parseReviews(task: unknown, asOf: Date, depth = 50): ReviewPace | null {
  const result = obj(arr(obj(task).result)[0]);
  if (!Object.keys(result).length) return null;
  const items = arr(result.items).map(obj);
  const since = asOf.getTime() - 90 * 86_400_000;
  const dates = items.map((i) => isoDate(i.timestamp)).filter((d): d is string => !!d);
  const recent = dates.filter((d) => Date.parse(d) >= since).length;
  const answered = items.filter((i) => squash(str(i.owner_answer))).length;
  const rating = obj(result.rating);
  return {
    reviews90d: recent,
    capped: items.length >= depth && recent === items.length,
    read: items.length,
    respondedPct: items.length ? Math.round((answered / items.length) * 1000) / 10 : null,
    rating: num(rating.value),
    reviews: num(result.reviews_count) ?? num(rating.votes_count),
    newest: dates.sort().at(-1) ?? null,
  };
}

/** Our own pages (heliaxis.co.uk) are read like everyone else's, so the card can compare like with like. */
export const isOurPage = (url: string) => isOurs(hostOf(url));

/**
 * A page read that was paid for but could not be saved: a marker row (with the error) so the next round does not pay
 * for the same page again until the facts go stale.
 */
export function unsavedFactsRow(url: string, fetchedAt: string, message: string): { url: string; domain: string | null; fetched_at: string; error: string } {
  return { url, domain: hostOf(url) || null, fetched_at: fetchedAt, error: `Read, but saving the facts failed: ${message}`.slice(0, 500) };
}

/** A Business Profile lookup that was paid for but left nothing saved (keyed by name and day), so it is not bought again. */
export type ProfileTry = { name: string; date: string; note: string };

const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** True when this business was looked up (and paid for) within the last `days` days without a usable result saved. */
export function triedRecently(tries: ProfileTry[], name: string, today: string, days = 6): boolean {
  const key = normName(name);
  const from = dayMs(today) - days * 86_400_000;
  return tries.some((t) => t.name === key && dayMs(t.date) >= from);
}

/** The tries still inside the window, plus this one (same name and day replaced). */
export function addTry(tries: ProfileTry[], name: string, today: string, note: string, days = 6): ProfileTry[] {
  const key = normName(name);
  const from = dayMs(today) - days * 86_400_000;
  const kept = tries.filter((t) => dayMs(t.date) >= from && !(t.name === key && t.date === today));
  return [...kept, { name: key, date: today, note: note.slice(0, 300) }];
}
