/**
 * Google rankings: one snapshot a week (or on demand) of the top 100 results for every tracked search, as seen from that
 * search's town on a phone (DataForSEO). Pure functions only (no network), so they can be tested; the fetching is in serp.ts.
 */

export const OUR_DOMAIN = 'heliaxis.co.uk';

/** How a result's real address was found: DataForSEO's resolved url, the green breadcrumb line, the site name, or not at all. */
export type ResolvedBy = 'url' | 'breadcrumb' | 'website_name' | 'unresolved';
export type SerpItem = { pos: number; domain: string; url: string; title: string; rankAbsolute?: number; resolvedBy?: ResolvedBy };
export type PackItem = { pos: number; title: string; domain: string };

export type SerpResult = {
  keywordId: number;
  keyword: string;
  town: string;
  location: string;
  organic: SerpItem[];
  localPack: PackItem[];
  /** Heliaxis's place: organic position (1 to 100) and URL, map-pack position, or null when not shown. */
  ours: { pos: number | null; url: string | null; pack: number | null; abs?: number | null; also?: string[] };
  /** SERP features shown (local_pack, ai_overview, people_also_ask, video, images…). */
  features?: string[];
  /** Whether Google showed an AI Overview, and whether it cites a Heliaxis page. */
  aio?: { present: boolean; cited: boolean };
  error?: string;
};

export type SerpSnapshot = {
  /** YYYY-MM-DD (UK), also its key. */
  id: string;
  at: string;
  /** What the run cost at DataForSEO, US dollars. */
  costUsd: number;
  results: SerpResult[];
};

/** Sites that rank but are not installers: directories, comparison sites, advice and news. Shown, but not as competitors. */
export const NOT_INSTALLERS = [
  'checkatrade.com', 'trustatrader.com', 'mybuilder.com', 'ratedpeople.com', 'yell.com', 'bark.com', 'houzz.co.uk', 'trustpilot.com',
  'which.co.uk', 'energysavingtrust.org.uk', 'gov.uk', 'gov.wales', 'nidirect.gov.uk', 'mcscertified.com', 'recc.org.uk', 'napit.org.uk',
  'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'reddit.com', 'mumsnet.com', 'quora.com', 'x.com', 'twitter.com',
  'wikipedia.org', 'bbc.co.uk', 'walesonline.co.uk', 'theguardian.com', 'telegraph.co.uk', 'independent.co.uk', 'moneysavingexpert.com',
  'greenmatch.co.uk', 'theecoexperts.co.uk', 'greenmatch.com', 'solarguide.co.uk', 'heatable.co.uk', 'nimblefins.co.uk', 'homebuilding.co.uk',
  'octopus.energy', 'britishgas.co.uk', 'eonenergy.com', 'edfenergy.com', 'ovoenergy.com', 'nationalgrid.co.uk', 'citizensadvice.org.uk',
  'google.com', 'amazon.co.uk', 'screwfix.com', 'toolstation.com', 'ebay.co.uk', 'gumtree.com', 'indeed.co.uk', 'companieshouse.gov.uk',
  'yelp.com', 'yelp.co.uk', 'solarlocator.co.uk', 'renewableenergyhub.co.uk', 'switchtogether.co.uk', 'solarinfo.uk', 'tradehand.com',
];

export const cleanDomain = (d: string) => d.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

export function isOurs(domain: string): boolean {
  const d = cleanDomain(domain);
  return d === OUR_DOMAIN || d.endsWith(`.${OUR_DOMAIN}`);
}

export function isInstaller(domain: string): boolean {
  const d = cleanDomain(domain);
  return !!d && !NOT_INSTALLERS.some((n) => d === n || d.endsWith(`.${n}`));
}

/** Rough share of clicks a position gets: what visibility is built from. Pages 3 to 10 still count, a little. */
export function clickShare(pos: number | null): number {
  if (!pos || pos < 1) return 0;
  const t = [0, 0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  if (pos <= 10) return t[pos];
  if (pos <= 20) return 0.01;
  if (pos <= 50) return 0.002;
  return pos <= 100 ? 0.0005 : 0;
}

export type Summary = {
  searches: number;
  checked: number;
  top3: number;
  top10: number;
  top20: number;
  /** Searches where we appear anywhere in the top 100. */
  top100: number;
  /** Average organic position over the searches where we appear (null when nowhere). */
  avgPos: number | null;
  inPack: number;
  /** Our share of the visibility of all sites across every search, 0 to 100. */
  visibility: number;
};

export function summarise(s: SerpSnapshot | null): Summary | null {
  if (!s) return null;
  const ok = s.results.filter((r) => !r.error);
  const ranked = ok.map((r) => r.ours.pos).filter((p): p is number => p !== null);
  const league = visibility(s, false);
  const ours = league.find((x) => isOurs(x.domain));
  return {
    searches: s.results.length,
    checked: ok.length,
    top3: ranked.filter((p) => p <= 3).length,
    top10: ranked.filter((p) => p <= 10).length,
    top20: ranked.filter((p) => p <= 20).length,
    top100: ranked.length,
    avgPos: ranked.length ? Math.round((ranked.reduce((a, b) => a + b, 0) / ranked.length) * 10) / 10 : null,
    inPack: ok.filter((r) => r.ours.pack !== null).length,
    visibility: ours ? ours.share : 0,
  };
}

export type LeagueRow = {
  domain: string;
  installer: boolean;
  /** Share of all visibility, 0 to 100, one decimal. */
  share: number;
  /** Searches it appears in (top 100), and in the top 3. */
  searches: number;
  top3: number;
  avgPos: number;
  /** Towns it ranks in. */
  towns: string[];
  /** Its best URLs, most searches first. */
  urls: { url: string; searches: number; bestPos: number }[];
};

/** Every site that ranks, by share of visibility (installers only when `installersOnly`). Heliaxis included. */
export function visibility(s: SerpSnapshot, installersOnly = true): LeagueRow[] {
  const by = new Map<string, { score: number; pos: number[]; top3: number; towns: Set<string>; urls: Map<string, { n: number; best: number }> }>();
  let total = 0;
  for (const r of s.results) {
    if (r.error) continue;
    const seen = new Set<string>();
    for (const it of r.organic) {
      const d = cleanDomain(it.domain);
      if (!d || seen.has(d)) continue; // a site's best result per search only
      seen.add(d);
      const sc = clickShare(it.pos);
      total += sc;
      const e = by.get(d) ?? { score: 0, pos: [] as number[], top3: 0, towns: new Set<string>(), urls: new Map() };
      e.score += sc;
      e.pos.push(it.pos);
      if (it.pos <= 3) e.top3++;
      e.towns.add(r.town);
      const u = e.urls.get(it.url) ?? { n: 0, best: 999 };
      u.n++;
      u.best = Math.min(u.best, it.pos);
      e.urls.set(it.url, u);
      by.set(d, e);
    }
  }
  return [...by.entries()]
    .map(([domain, e]) => ({
      domain,
      installer: isInstaller(domain),
      share: total ? Math.round((e.score / total) * 1000) / 10 : 0,
      searches: e.pos.length,
      top3: e.top3,
      avgPos: Math.round((e.pos.reduce((a, b) => a + b, 0) / e.pos.length) * 10) / 10,
      towns: [...e.towns].sort(),
      urls: [...e.urls.entries()].map(([url, u]) => ({ url, searches: u.n, bestPos: u.best })).sort((a, b) => b.searches - a.searches || a.bestPos - b.bestPos),
    }))
    .filter((x) => !installersOnly || x.installer || isOurs(x.domain))
    .sort((a, b) => b.share - a.share || b.searches - a.searches);
}

export type Move = { keywordId: number; keyword: string; town: string; before: number | null; now: number | null; change: number };

/** Our position changes between two snapshots (positive = up). A move into or out of the top 100 counts as 101. */
export function movers(before: SerpSnapshot | null, now: SerpSnapshot | null): Move[] {
  if (!before || !now) return [];
  const prev = new Map(before.results.filter((r) => !r.error).map((r) => [r.keywordId, r.ours.pos]));
  return now.results
    .filter((r) => !r.error && prev.has(r.keywordId))
    .map((r) => {
      const b = prev.get(r.keywordId) ?? null;
      const n = r.ours.pos;
      return { keywordId: r.keywordId, keyword: r.keyword, town: r.town, before: b, now: n, change: (b ?? 101) - (n ?? 101) };
    })
    .filter((m) => m.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/** One search's history of our position, oldest first, for a small trend line. */
export function history(snaps: SerpSnapshot[], keywordId: number): { id: string; pos: number | null }[] {
  return [...snaps]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({ id: s.id, pos: s.results.find((r) => r.keywordId === keywordId && !r.error)?.ours.pos ?? null }));
}

const isGoogle = (d: string) => d === 'google.com' || d.endsWith('.google.com') || d === 'google.co.uk';

/** "solarplanet.uk", "www.yell.com": a site name that is itself a web address. */
const hostLike = (v: unknown) => {
  const h = cleanDomain(String(v ?? '').trim().replace(/^https?:\/\//i, '').split(/[/\s›]/)[0]);
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) && !isGoogle(h) ? h : null;
};

/**
 * The real site and page of a result. Google now wraps result links ("google.com/goto?url=…"); DataForSEO resolves them when
 * asked (resolve_goto_urls), but if a row still says google.com, the breadcrumb (the green address line, "https://www.yell.com
 * › Renewable Energy › Cardiff") or the site name still identifies it. The page address is rebuilt from the breadcrumb unless
 * Google shortened it ("…"). Never null: a row nobody can place is kept as "unresolved" so positions below it stay right.
 */
export function realAddress(it: { domain?: unknown; url?: unknown; breadcrumb?: unknown; website_name?: unknown }): { domain: string; url: string; resolvedBy: ResolvedBy } {
  const d = cleanDomain(String(it.domain ?? ''));
  const u = String(it.url ?? '');
  const wrapped = /google\.[a-z.]+\/goto\b/i.test(u);
  if (d && !isGoogle(d) && !wrapped) return { domain: d, url: u, resolvedBy: 'url' };
  // A resolved url on a row whose domain still says google.com.
  if (u && !wrapped) {
    try {
      const host = cleanDomain(new URL(u).hostname);
      if (host && !isGoogle(host)) return { domain: host, url: u, resolvedBy: 'url' };
    } catch {
      /* not a url */
    }
  }
  const bc = String(it.breadcrumb ?? '').trim();
  const m = /^(https?:\/\/)?([^\s/›]+)/i.exec(bc);
  const host = m ? cleanDomain(m[2]) : '';
  if (m && host.includes('.') && !isGoogle(host)) {
    const segs: string[] = [];
    for (const s of bc.slice(m[0].length).split('›').map((x) => x.trim()).filter(Boolean)) {
      if (/\.\.\.|…/.test(s) || /\s/.test(s)) break; // shortened, or a label rather than a path
      segs.push(s);
    }
    return { domain: host, url: `https://${host}/${segs.join('/')}`, resolvedBy: 'breadcrumb' };
  }
  const named = hostLike(it.website_name);
  if (named) return { domain: named, url: `https://${named}/`, resolvedBy: 'website_name' };
  return { domain: '', url: '', resolvedBy: 'unresolved' };
}

/** Every reference an AI Overview cites, however deeply DataForSEO nests them. */
function aioReferences(node: unknown, out: { domain: string; url: string }[]): void {
  if (Array.isArray(node)) {
    for (const n of node) aioReferences(n, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  if (Array.isArray(o.references)) {
    for (const r of o.references as Record<string, unknown>[]) {
      const a = realAddress({ domain: r.domain, url: r.url, website_name: r.source });
      if (a.domain) out.push({ domain: a.domain, url: a.url });
    }
  }
  if (Array.isArray(o.items)) aioReferences(o.items, out);
}

export type ParsedSerp = {
  organic: SerpItem[];
  localPack: PackItem[];
  features: string[];
  aio: { present: boolean; cited: boolean; references: { domain: string; url: string }[] };
};

/** Turn one DataForSEO "advanced" result into ours (only what we keep). No row is dropped, so positions stay true. */
export function parseSerp(items: unknown[]): ParsedSerp {
  const organic: SerpItem[] = [];
  const localPack: PackItem[] = [];
  const features = new Set<string>();
  const refs: { domain: string; url: string }[] = [];
  let aioPresent = false;
  for (const raw of Array.isArray(items) ? items : []) {
    const it = raw as Record<string, unknown>;
    const type = String(it.type ?? '');
    if (type && type !== 'organic' && type !== 'paid') features.add(type);
    if (type === 'organic' && typeof it.rank_group === 'number') {
      const a = realAddress(it);
      organic.push({
        pos: it.rank_group,
        domain: a.domain,
        url: a.url,
        title: String(it.title ?? '').slice(0, 140),
        rankAbsolute: typeof it.rank_absolute === 'number' ? it.rank_absolute : undefined,
        resolvedBy: a.resolvedBy,
      });
    } else if (type === 'local_pack' && typeof it.rank_group === 'number') {
      // Map-pack entries are known by their business name; the domain is kept only when DataForSEO resolved it.
      const a = realAddress({ domain: it.domain, url: it.url });
      localPack.push({ pos: it.rank_group, title: String(it.title ?? '').slice(0, 100), domain: a.resolvedBy === 'url' ? a.domain : '' });
    } else if (type === 'ai_overview') {
      aioPresent = true;
      aioReferences(it, refs);
    }
  }
  organic.sort((a, b) => a.pos - b.pos);
  localPack.sort((a, b) => a.pos - b.pos);
  return {
    organic: organic.slice(0, 100),
    localPack: localPack.slice(0, 5),
    features: [...features].sort(),
    aio: { present: aioPresent, cited: refs.some((r) => isOurs(r.domain)), references: refs },
  };
}

/** Where Heliaxis is in a result: organic and map pack (matched by domain, or by name in the pack), plus any second page of ours. */
export function ourPlace(organic: SerpItem[], localPack: PackItem[]): SerpResult['ours'] {
  const mine = organic.filter((x) => isOurs(x.domain));
  const o = mine[0];
  const p = localPack.find((x) => isOurs(x.domain) || /heliaxis/i.test(x.title));
  const also = [...new Set(mine.slice(1).map((x) => x.url).filter((u) => u && u !== o?.url))];
  return { pos: o?.pos ?? null, url: o?.url ?? null, pack: p?.pos ?? null, ...(o?.rankAbsolute ? { abs: o.rankAbsolute } : {}), ...(also.length ? { also } : {}) };
}

export type PackRow = { name: string; appearances: number; first: number; towns: string[] };

/** Who is in Google's map pack (the three businesses under the map), by business name: where local installers compete. */
export function packLeague(s: SerpSnapshot): PackRow[] {
  const by = new Map<string, { n: number; first: number; towns: Set<string> }>();
  for (const r of s.results) {
    if (r.error) continue;
    for (const p of r.localPack) {
      const name = p.title.trim();
      if (!name) continue;
      const e = by.get(name) ?? { n: 0, first: 0, towns: new Set<string>() };
      e.n++;
      if (p.pos === 1) e.first++;
      e.towns.add(r.town);
      by.set(name, e);
    }
  }
  return [...by.entries()]
    .map(([name, e]) => ({ name, appearances: e.n, first: e.first, towns: [...e.towns].sort() }))
    .sort((a, b) => b.appearances - a.appearances || b.first - a.first);
}
