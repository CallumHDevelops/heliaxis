/**
 * Google rankings: one snapshot a week (or on demand) of the top 20 results for every tracked search, as seen from that
 * search's town on a phone (DataForSEO). Pure functions only (no network), so they can be tested; the fetching is in serp.ts.
 */

export const OUR_DOMAIN = 'heliaxis.co.uk';

export type SerpItem = { pos: number; domain: string; url: string; title: string };
export type PackItem = { pos: number; title: string; domain: string };

export type SerpResult = {
  keywordId: number;
  keyword: string;
  town: string;
  location: string;
  organic: SerpItem[];
  localPack: PackItem[];
  /** Heliaxis's place: organic position (1 to 20) and URL, map-pack position, or null when not shown. */
  ours: { pos: number | null; url: string | null; pack: number | null };
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
const NOT_INSTALLERS = [
  'checkatrade.com', 'trustatrader.com', 'mybuilder.com', 'ratedpeople.com', 'yell.com', 'bark.com', 'houzz.co.uk', 'trustpilot.com',
  'which.co.uk', 'energysavingtrust.org.uk', 'gov.uk', 'gov.wales', 'nidirect.gov.uk', 'mcscertified.com', 'recc.org.uk', 'napit.org.uk',
  'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'tiktok.com', 'reddit.com', 'mumsnet.com', 'quora.com', 'x.com', 'twitter.com',
  'wikipedia.org', 'bbc.co.uk', 'walesonline.co.uk', 'theguardian.com', 'telegraph.co.uk', 'independent.co.uk', 'moneysavingexpert.com',
  'greenmatch.co.uk', 'theecoexperts.co.uk', 'greenmatch.com', 'solarguide.co.uk', 'heatable.co.uk', 'nimblefins.co.uk', 'homebuilding.co.uk',
  'octopus.energy', 'britishgas.co.uk', 'eonenergy.com', 'edfenergy.com', 'ovoenergy.com', 'nationalgrid.co.uk', 'citizensadvice.org.uk',
  'google.com', 'amazon.co.uk', 'screwfix.com', 'toolstation.com', 'ebay.co.uk', 'gumtree.com', 'indeed.co.uk', 'companieshouse.gov.uk',
];

export const cleanDomain = (d: string) => d.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

export function isOurs(domain: string): boolean {
  const d = cleanDomain(domain);
  return d === OUR_DOMAIN || d.endsWith(`.${OUR_DOMAIN}`);
}

export function isInstaller(domain: string): boolean {
  const d = cleanDomain(domain);
  return !NOT_INSTALLERS.some((n) => d === n || d.endsWith(`.${n}`));
}

/** Rough share of clicks a position gets: what visibility is built from. Beyond 20 counts as nothing. */
export function clickShare(pos: number | null): number {
  if (!pos || pos < 1) return 0;
  const t = [0, 0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  return pos <= 10 ? t[pos] : pos <= 20 ? 0.01 : 0;
}

export type Summary = {
  searches: number;
  checked: number;
  top3: number;
  top10: number;
  top20: number;
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
    top20: ranked.length,
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
  /** Searches it appears in (top 20), and in the top 3. */
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
      const u = e.urls.get(it.url) ?? { n: 0, best: 99 };
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

/** Our position changes between two snapshots (positive = up). A move into or out of the top 20 counts as 21. */
export function movers(before: SerpSnapshot | null, now: SerpSnapshot | null): Move[] {
  if (!before || !now) return [];
  const prev = new Map(before.results.filter((r) => !r.error).map((r) => [r.keywordId, r.ours.pos]));
  return now.results
    .filter((r) => !r.error && prev.has(r.keywordId))
    .map((r) => {
      const b = prev.get(r.keywordId) ?? null;
      const n = r.ours.pos;
      return { keywordId: r.keywordId, keyword: r.keyword, town: r.town, before: b, now: n, change: (b ?? 21) - (n ?? 21) };
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

/**
 * The real site and page of a result. Google now wraps result links ("google.com/goto?url=…"), so DataForSEO's domain and url
 * say google.com; the breadcrumb (the green address line, "https://www.yell.com › Renewable Energy › Cardiff") still names
 * the site. The page address is rebuilt from it unless Google shortened it ("…").
 */
export function realAddress(it: { domain?: unknown; url?: unknown; breadcrumb?: unknown }): { domain: string; url: string } | null {
  const d = cleanDomain(String(it.domain ?? ''));
  if (d && !isGoogle(d)) return { domain: d, url: String(it.url ?? '') };
  const bc = String(it.breadcrumb ?? '').trim();
  const m = /^(https?:\/\/)?([^\s/›]+)/i.exec(bc);
  if (!m) return null;
  const host = cleanDomain(m[2]);
  if (!host.includes('.') || isGoogle(host)) return null;
  const segs: string[] = [];
  for (const s of bc.slice(m[0].length).split('›').map((x) => x.trim()).filter(Boolean)) {
    if (/\.\.\.|…/.test(s) || /\s/.test(s)) break; // shortened, or a label rather than a path
    segs.push(s);
  }
  return { domain: host, url: `https://${host}/${segs.join('/')}` };
}

/** Turn one DataForSEO "live/advanced" result into ours (only what we keep). */
export function parseSerp(items: unknown[]): { organic: SerpItem[]; localPack: PackItem[] } {
  const organic: SerpItem[] = [];
  const localPack: PackItem[] = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const it = raw as Record<string, unknown>;
    if (it.type === 'organic' && typeof it.rank_group === 'number') {
      const a = realAddress(it);
      if (!a) continue;
      organic.push({ pos: it.rank_group, domain: a.domain, url: a.url, title: String(it.title ?? '').slice(0, 140) });
    } else if (it.type === 'local_pack' && typeof it.rank_group === 'number') {
      // Map-pack entries have no address of their own any more: they are known by their business name.
      const d = cleanDomain(String(it.domain ?? ''));
      localPack.push({ pos: it.rank_group, title: String(it.title ?? '').slice(0, 100), domain: isGoogle(d) ? '' : d });
    }
  }
  organic.sort((a, b) => a.pos - b.pos);
  localPack.sort((a, b) => a.pos - b.pos);
  return { organic: organic.slice(0, 20), localPack: localPack.slice(0, 5) };
}

/** Where Heliaxis is in a result: organic and map pack (matched by domain, or by name in the pack). */
export function ourPlace(organic: SerpItem[], localPack: PackItem[]): SerpResult['ours'] {
  const o = organic.find((x) => isOurs(x.domain));
  const p = localPack.find((x) => isOurs(x.domain) || /heliaxis/i.test(x.title));
  return { pos: o?.pos ?? null, url: o?.url ?? null, pack: p?.pos ?? null };
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
