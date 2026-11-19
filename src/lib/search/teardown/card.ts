import { isInstaller, isOurs } from '@/lib/seo/rankings';
import { unknownNumbers } from '@/lib/search/maths';
import type { PageFactsRow, PageType } from './parse';
import { sameName } from './parse';

/**
 * M2's "What it takes" card and the checks on its write-up (spec §5 M2, phase 2 gate in §8). Pure. Every number on the
 * card is worked out from stored rows and carries the keys of the rows it came from, so the gate ("every number in a
 * teardown summary can be traced to a stored row") is checkable: a source is "table:key", for example
 * "seo_page_facts:https://…", "seo_business_snapshot:12@2026-11-17", "seo_serp_result:41@2026-11-17/mobile".
 */

export const CARD_VERSION = 1;
/** How many results the card looks at: also a number the write-up may use ("the top 10"). */
export const TOP_N = 10;

export type Source = string;
export const src = {
  page: (url: string) => `seo_page_facts:${url}`,
  item: (kw: number, date: string, pos: number, type = 'organic') => `seo_serp_item:${kw}@${date}/mobile/${type}/${pos}`,
  result: (kw: number, date: string) => `seo_serp_result:${kw}@${date}/mobile`,
  snap: (businessId: number, date: string) => `seo_business_snapshot:${businessId}@${date}`,
  business: (businessId: number) => `seo_business:${businessId}`,
};

/** One line of the card: the top 10's figure (a median or a count "n of `of`") against ours, and where both came from. */
export type Metric = {
  key: string;
  label: string;
  kind: 'median' | 'count';
  /** The median, or how many of `of` have the thing. Null when none of them could be read. */
  value: number | null;
  /** How many results the figure is taken over (pages read, or businesses found). */
  of: number;
  ours: number | null;
  /** Ours as a yes/no, for count lines ("does our page name MCS in a heading?"). */
  oursHas?: boolean | null;
  from: Source[];
  oursFrom: Source[];
  note?: string;
};

export type TopRow = { pos: number; domain: string; url: string; title: string; pageType: PageType | null; read: boolean; installer: boolean; ours: boolean };
export type PackRow = { pos: number; name: string; businessId: number | null; rating: number | null; reviews: number | null; reviews90d: number | null; photos: number | null; website: boolean | null; ours: boolean };

export type TeardownFacts = {
  version: number;
  keyword: { id: number; phrase: string; town: string | null };
  date: string;
  device: 'mobile';
  topN: number;
  ours: { pos: number | null; packPos: number | null; url: string | null; pageRead: boolean; pageFrom: 'ranking' | 'target' | null; businessFound: boolean };
  top10: TopRow[];
  pack: PackRow[];
  pageTypes: Partial<Record<PageType, number>>;
  schemaTypes: { type: string; count: number; ours: boolean; from: Source[] }[];
  metrics: Metric[];
  /** The result rows the card read: the stored SERP result and items for this search and date. */
  basis: Source[];
};

export type BusinessFact = {
  id: number;
  name: string;
  isOurs: boolean;
  website: string | null;
  snapDate: string | null;
  rating: number | null;
  reviews: number | null;
  reviews90d: number | null;
  photos: number | null;
};

export type CardInput = {
  keyword: { id: number; phrase: string; town: string | null };
  date: string;
  result: { our_pos: number | null; our_pack_pos: number | null; our_url: string | null } | null;
  items: { pos: number; type: string; domain: string | null; url: string | null; title: string | null }[];
  facts: Map<string, PageFactsRow>;
  /** Our page for this search: the ranking URL, or the keyword's target page when we don't rank. */
  ourPage: { url: string; from: 'ranking' | 'target' } | null;
  businesses: BusinessFact[];
  /** Our own Business Profile, when found. */
  ourBusiness: BusinessFact | null;
  now?: Date;
};

export function median(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  const out = v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  return Math.round(out * 10) / 10;
}

const readable = (f: PageFactsRow | undefined): f is PageFactsRow => !!f && !f.error && f.words !== null;

/** Build the card from stored rows only. */
export function buildCard(input: CardInput): TeardownFacts {
  const { keyword, date, items, facts } = input;
  const now = input.now ?? new Date();
  const organic = items.filter((i) => i.type === 'organic' && i.pos <= TOP_N).sort((a, b) => a.pos - b.pos);
  const packItems = items.filter((i) => i.type === 'local_pack').sort((a, b) => a.pos - b.pos);

  const top10: TopRow[] = organic.map((i) => {
    const f = i.url ? facts.get(i.url) : undefined;
    const domain = i.domain ?? '';
    return { pos: i.pos, domain, url: i.url ?? '', title: i.title ?? '', pageType: f?.page_type ?? null, read: readable(f), installer: !!domain && isInstaller(domain), ours: !!domain && isOurs(domain) };
  });
  // The rivals' pages: the top 10 without ours, read successfully.
  const rivals = organic.filter((i) => !(i.domain && isOurs(i.domain))).map((i) => (i.url ? facts.get(i.url) : undefined)).filter(readable);
  const ourF = input.ourPage ? facts.get(input.ourPage.url) : undefined;
  const ours = readable(ourF) ? ourF : null;
  const ourSrc = ours ? [src.page(ours.url)] : [];

  const metrics: Metric[] = [];
  const med = (key: string, label: string, pick: (f: PageFactsRow) => number | null, note?: string) => {
    const vals = rivals.map((f) => ({ f, v: pick(f) })).filter((x): x is { f: PageFactsRow; v: number } => x.v !== null);
    metrics.push({ key, label, kind: 'median', value: median(vals.map((x) => x.v)), of: vals.length, ours: ours ? pick(ours) : null, from: vals.map((x) => src.page(x.f.url)), oursFrom: ourSrc, ...(note ? { note } : {}) });
  };
  const cnt = (key: string, label: string, has: (f: PageFactsRow) => boolean | null, note?: string) => {
    const known = rivals.filter((f) => has(f) !== null);
    const yes = known.filter((f) => has(f) === true);
    const oursHas = ours ? has(ours) : null;
    metrics.push({ key, label, kind: 'count', value: known.length ? yes.length : null, of: known.length, ours: oursHas === null ? null : oursHas ? 1 : 0, oursHas, from: yes.map((f) => src.page(f.url)), oursFrom: ourSrc, ...(note ? { note } : {}) });
  };

  med('words', 'Words on the page', (f) => f.words);
  cnt('mcs_heading', 'Name MCS in a heading', (f) => f.mentions_mcs);
  cnt('prices', 'Show prices', (f) => f.prices_shown);
  cnt('reviews_on_page', 'Show reviews on the page', (f) => f.reviews_on_page);
  med('h2s', 'Subheadings (H2)', (f) => f.headings.filter((h) => h.level === 2).length);
  med('questions', 'Questions answered', (f) => f.questions.length);
  cnt('faq', 'Answer at least one question', (f) => f.questions.length > 0);
  med('images', 'Images', (f) => f.images);
  cnt('video', 'Have a video', (f) => f.has_video);
  cnt('author', 'Name an author', (f) => (f.author ? true : false));
  cnt('dated', 'Show a date in the last 12 months', (f) => {
    const d = f.modified_at ?? f.published_at;
    return d ? now.getTime() - Date.parse(d) <= 365 * 86_400_000 : false;
  });
  med('town_mentions', `Mentions of ${keyword.town ?? 'the town'}`, (f) => (keyword.town ? (f.town_mentions[keyword.town] ?? 0) : null));
  med('town_links', 'Links to town pages', (f) => f.town_links);
  cnt('town_page', 'Are town pages', (f) => f.page_type === 'town');
  cnt('local_schema', 'Have LocalBusiness-type markup', (f) => f.schema.some((s) => /LocalBusiness|HomeAndConstructionBusiness|Electrician|GeneralContractor|RoofingContractor|HVACBusiness|Plumber/i.test(s)));
  cnt('faq_schema', 'Have FAQ markup', (f) => f.schema.includes('FAQPage'));
  const lh = rivals.filter((f) => f.lighthouse_perf !== null);
  if (lh.length || ours?.lighthouse_perf != null) med('lighthouse', 'Mobile speed score (Lighthouse)', (f) => f.lighthouse_perf);

  // Page types and structured data across the whole top 10 (read or not, for types; read only, for schema).
  const pageTypes: Partial<Record<PageType, number>> = {};
  for (const i of organic) {
    const f = i.url ? facts.get(i.url) : undefined;
    if (f?.page_type) pageTypes[f.page_type] = (pageTypes[f.page_type] ?? 0) + 1;
  }
  const schemaBy = new Map<string, Source[]>();
  for (const f of rivals) for (const s of new Set(f.schema)) schemaBy.set(s, [...(schemaBy.get(s) ?? []), src.page(f.url)]);
  const schemaTypes = [...schemaBy.entries()]
    .map(([type, from]) => ({ type, count: from.length, ours: !!ours?.schema.includes(type), from }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
    .slice(0, 12);

  // The map pack: each business matched to its stored profile by name.
  const findBiz = (name: string) => input.businesses.find((b) => sameName(b.name, name)) ?? null;
  const pack: PackRow[] = packItems.map((p) => {
    const b = findBiz(p.title ?? '');
    const isUs = /heliaxis/i.test(p.title ?? '') || (b?.isOurs ?? false);
    return { pos: p.pos, name: p.title ?? '', businessId: b?.id ?? null, rating: b?.rating ?? null, reviews: b?.reviews ?? null, reviews90d: b?.reviews90d ?? null, photos: b?.photos ?? null, website: b ? !!b.website : null, ours: isUs };
  });
  const packBiz = pack.filter((p) => !p.ours && p.businessId !== null).map((p) => input.businesses.find((b) => b.id === p.businessId)!).filter((b) => b.snapDate);
  const ob = input.ourBusiness && input.ourBusiness.snapDate ? input.ourBusiness : null;
  const obSrc = ob ? [src.snap(ob.id, ob.snapDate!)] : [];
  const bizMed = (key: string, label: string, pick: (b: BusinessFact) => number | null, note?: string) => {
    const vals = packBiz.map((b) => ({ b, v: pick(b) })).filter((x): x is { b: BusinessFact; v: number } => x.v !== null);
    if (!packItems.length) return;
    metrics.push({ key, label, kind: 'median', value: median(vals.map((x) => x.v)), of: vals.length, ours: ob ? pick(ob) : null, from: vals.map((x) => src.snap(x.b.id, x.b.snapDate!)), oursFrom: obSrc, ...(note ? { note } : {}) });
  };
  bizMed('pack_reviews', 'Map pack: Google reviews', (b) => b.reviews);
  bizMed('pack_rating', 'Map pack: star rating', (b) => b.rating);
  bizMed('pack_reviews_90d', 'Map pack: reviews in the last 90 days', (b) => b.reviews90d, 'Counted from the newest 50 reviews.');
  bizMed('pack_photos', 'Map pack: photos on the profile', (b) => b.photos);
  if (packItems.length) {
    const known = packBiz;
    const yes = known.filter((b) => !!b.website);
    metrics.push({ key: 'pack_website', label: 'Map pack: website linked', kind: 'count', value: known.length ? yes.length : null, of: known.length, ours: ob ? (ob.website ? 1 : 0) : null, oursHas: ob ? !!ob.website : null, from: yes.map((b) => src.snap(b.id, b.snapDate!)), oursFrom: obSrc });
  }

  const r = input.result;
  return {
    version: CARD_VERSION,
    keyword,
    date,
    device: 'mobile',
    topN: TOP_N,
    ours: { pos: r?.our_pos ?? null, packPos: r?.our_pack_pos ?? null, url: input.ourPage?.url ?? null, pageRead: !!ours, pageFrom: input.ourPage?.from ?? null, businessFound: !!ob },
    top10,
    pack,
    pageTypes,
    schemaTypes,
    metrics,
    basis: [src.result(keyword.id, date), ...organic.map((i) => src.item(keyword.id, date, i.pos)), ...packItems.map((i) => src.item(keyword.id, date, i.pos, 'local_pack'))],
  };
}

/** Every number on the card, which is all the write-up may use (plus the numbers in the search phrase itself). */
export function factNumbers(f: TeardownFacts): number[] {
  const out = new Set<number>([f.topN]);
  const add = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.add(v);
  };
  add(f.ours.pos);
  add(f.ours.packPos);
  for (const t of f.top10) add(t.pos);
  for (const p of f.pack) [p.pos, p.rating, p.reviews, p.reviews90d, p.photos].forEach(add);
  for (const n of Object.values(f.pageTypes)) add(n);
  for (const s of f.schemaTypes) add(s.count);
  for (const m of f.metrics) {
    add(m.value);
    add(m.of);
    add(m.ours);
    // "1,450 against our 941" is fine; so is the gap between them ("509 fewer words").
    if (typeof m.value === 'number' && typeof m.ours === 'number') add(Math.round(Math.abs(m.value - m.ours) * 10) / 10);
  }
  for (const n of f.keyword.phrase.match(/\d+/g) ?? []) out.add(Number(n));
  return [...out];
}

/* ── The write-up ───────────────────────────────────────────────────────────────────────────────────────────────── */

export type Writeup = { shared: string[]; gaps: string[]; outline: string[] };
export type CheckedWriteup = Writeup & { rejected: { part: keyof Writeup; text: string; numbers: string[] }[] };

/** "H1", "H2": heading names, not figures. */
const forCheck = (s: string) => s.replace(/\bH[1-6]s?\b/gi, 'H');

/** Numbers in a piece of text that are not on the card. */
export function badNumbers(text: string, f: TeardownFacts): string[] {
  return unknownNumbers(forCheck(text), factNumbers(f));
}

/** Keep every line whose numbers are all on the card; list the rest as rejected (spec §8 gate). */
export function checkWriteup(w: Writeup, f: TeardownFacts): CheckedWriteup {
  const out: CheckedWriteup = { shared: [], gaps: [], outline: [], rejected: [] };
  for (const part of ['shared', 'gaps', 'outline'] as const) {
    for (const line of w[part]) {
      const bad = badNumbers(line, f);
      if (bad.length) out.rejected.push({ part, text: line, numbers: bad });
      else out[part].push(line);
    }
  }
  return out;
}

/** Read the model's JSON answer, tolerating code fences. Null when it is not the shape asked for. */
export function parseWriteup(content: string): Writeup | null {
  try {
    const j = JSON.parse(content.replace(/```json|```/g, '').trim()) as Record<string, unknown>;
    const list = (v: unknown, max: number) =>
      (Array.isArray(v) ? v : [])
        .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, max);
    const w = { shared: list(j.shared, 6), gaps: list(j.gaps, 6), outline: list(j.outline, 14) };
    return w.shared.length || w.gaps.length || w.outline.length ? w : null;
  } catch {
    return null;
  }
}

/** What the model is shown: the card's figures and the page outlines, never HTML or page text. */
export function factsForModel(f: TeardownFacts, pages: PageFactsRow[]) {
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  return {
    search: f.keyword.phrase,
    town: f.keyword.town,
    resultsLookedAt: f.topN,
    heliaxis: { organicPosition: f.ours.pos ?? 'not in the top 100', mapPackPosition: f.ours.packPos ?? 'not in the map pack', page: f.ours.url, pageRead: f.ours.pageRead, businessProfileFound: f.ours.businessFound },
    top10: f.top10.map((t) => {
      const p = byUrl.get(t.url);
      return {
        position: t.pos,
        site: t.domain,
        pageType: t.pageType,
        isInstaller: t.installer,
        isHeliaxis: t.ours,
        ...(p && !p.error ? { h1: p.h1, h2s: p.headings.filter((h) => h.level === 2).map((h) => h.text).slice(0, 12), questions: p.questions.slice(0, 8), schema: p.schema } : { read: false }),
      };
    }),
    mapPack: f.pack.map((p) => ({ position: p.pos, name: p.name, rating: p.rating, reviews: p.reviews, reviewsLast90Days: p.reviews90d, photos: p.photos, websiteLinked: p.website, isHeliaxis: p.ours })),
    pageTypes: f.pageTypes,
    schemaTypesAmongRivals: f.schemaTypes.map((s) => ({ type: s.type, pages: s.count, heliaxisHasIt: s.ours })),
    whatItTakes: f.metrics.map((m) => ({ measure: m.label, [m.kind === 'median' ? 'medianOfRivals' : 'rivalsWithIt']: m.value, rivalsCounted: m.of, heliaxis: m.kind === 'count' ? (m.oursHas ?? 'unknown') : (m.ours ?? 'unknown'), ...(m.note ? { note: m.note } : {}) })),
  };
}

/** The prompt, following writeAnalysis's rules in src/lib/seo/serp.ts: facts only, British English, no invented figures. */
export function buildPrompt(f: TeardownFacts, pages: PageFactsRow[], feedback?: string[]): string {
  return `You are an SEO analyst for Heliaxis, an MCS-certified installer of solar panels, batteries, heat pumps and EV chargers in South Wales and the South West of England.

Below are FACTS about the Google results for one search ("${f.keyword.phrase}"${f.keyword.town ? `, searched on a phone in ${f.keyword.town}` : ''}): the top ${f.topN} organic results, what each page contains (read by a crawler), and the businesses in the map pack (the three under the map, from their Google Business Profiles). "whatItTakes" compares the rival pages with Heliaxis's page: a median, or how many of the rivals counted have the thing.

Rules: use ONLY these facts. Every number you write must appear in the facts exactly; do not work out new figures, percentages or ranges, and do not add numbers of your own (write "a few FAQs", not "5 FAQs"). Do not invent reviews, prices, years in business, awards or anything not shown. The only credentials Heliaxis may claim are MCS, RECC and NAPIT. If a fact is missing (a page could not be read), say less rather than guess. British English, plain, short. No emoji.

Write three lists:
- "shared": 3 to 5 short points on what the winning pages and businesses have in common.
- "gaps": 3 to 5 short points on where Heliaxis falls short of them, each citing the facts.
- "outline": a suggested outline for Heliaxis's page for this search: the H1 first, then 5 to 10 H2 headings in order, each as "H2: heading text". Only topics the facts support.
${feedback?.length ? `\nYour last answer used numbers that are not in the facts: ${feedback.join(', ')}. Leave them out.\n` : ''}
FACTS:
${JSON.stringify(factsForModel(f, pages)).slice(0, 22000)}

Return ONLY JSON: {"shared":[""],"gaps":[""],"outline":[""]}`;
}
