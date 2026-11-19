import { cleanDomain, isInstaller, isOurs } from '@/lib/seo/rankings';
import { normalisePhrase } from './words';

/**
 * Reading DataForSEO Labs and Search Console data into keyword-pool rows. Pure, so the shapes can be tested on fixtures.
 */

export type LabsKeyword = { keyword: string; volume: number | null; difficulty: number | null; intent: string | null; rivalPos: number | null; rivalUrl: string | null };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The items of a Labs task result (keyword_ideas, related_keywords, domain_intersection), one row per keyword. */
export function parseLabsItems(result: unknown): LabsKeyword[] {
  const first = obj(Array.isArray(result) ? result[0] : result);
  const items = Array.isArray(first.items) ? (first.items as unknown[]) : [];
  const out: LabsKeyword[] = [];
  for (const raw of items) {
    const it = obj(raw);
    const kd = obj(it.keyword_data ?? it);
    const keyword = normalisePhrase(String(kd.keyword ?? ''));
    if (!keyword) continue;
    const info = obj(kd.keyword_info);
    const props = obj(kd.keyword_properties);
    const intent = obj(kd.search_intent_info);
    const serp = obj(it.first_domain_serp_element);
    out.push({
      keyword,
      volume: num(info.search_volume),
      difficulty: num(props.keyword_difficulty),
      intent: typeof intent.main_intent === 'string' ? intent.main_intent : null,
      rivalPos: num(serp.rank_group),
      rivalUrl: typeof serp.url === 'string' ? serp.url : null,
    });
  }
  return out;
}

/** bulk_keyword_difficulty → keyword → difficulty (0 to 100). */
export function parseDifficulty(result: unknown): Map<string, number> {
  const first = obj(Array.isArray(result) ? result[0] : result);
  const m = new Map<string, number>();
  for (const raw of Array.isArray(first.items) ? (first.items as unknown[]) : []) {
    const it = obj(raw);
    const kd = num(it.keyword_difficulty);
    if (typeof it.keyword === 'string' && kd !== null) m.set(normalisePhrase(it.keyword), kd);
  }
  return m;
}

/** search_intent → keyword → main intent label (informational, navigational, commercial, transactional). */
export function parseIntent(result: unknown): Map<string, string> {
  const first = obj(Array.isArray(result) ? result[0] : result);
  const m = new Map<string, string>();
  for (const raw of Array.isArray(first.items) ? (first.items as unknown[]) : []) {
    const it = obj(raw);
    const label = obj(it.keyword_intent).label;
    if (typeof it.keyword === 'string' && typeof label === 'string') m.set(normalisePhrase(it.keyword), label);
  }
  return m;
}

export type GscRow = { query: string; page: string; impressions: number; position: number | null };
export type Striking = { keyword: string; impressions: number; pos: number; url: string | null };

/**
 * Search Console "striking distance": queries whose impression-weighted average position over the period sits between
 * `from` and `to` (8 to 30 by default) with at least `minImpressions` impressions. The page is the one with most impressions.
 */
export function strikingDistance(rows: GscRow[], opts: { from: number; to: number; minImpressions: number }): Striking[] {
  const by = new Map<string, { impr: number; wpos: number; pages: Map<string, number> }>();
  for (const r of rows) {
    const q = normalisePhrase(r.query);
    if (!q || !r.impressions || r.position === null || r.position === undefined) continue;
    const e = by.get(q) ?? { impr: 0, wpos: 0, pages: new Map() };
    e.impr += r.impressions;
    e.wpos += r.impressions * Number(r.position);
    if (r.page) e.pages.set(r.page, (e.pages.get(r.page) ?? 0) + r.impressions);
    by.set(q, e);
  }
  const out: Striking[] = [];
  for (const [keyword, e] of by) {
    const pos = Math.round((e.wpos / e.impr) * 10) / 10;
    if (e.impr < opts.minImpressions || pos < opts.from || pos > opts.to) continue;
    const url = [...e.pages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    out.push({ keyword, impressions: e.impr, pos, url });
  }
  return out.sort((a, b) => b.impressions - a.impressions);
}

/** The rival installers that appear most often in the latest top 10s (not us, not directories), most first. */
export function topRivals(items: { domain: string | null }[], n = 8): string[] {
  const count = new Map<string, number>();
  for (const it of items) {
    if (!it.domain) continue;
    const d = cleanDomain(it.domain);
    if (!d || isOurs(d) || !isInstaller(d)) continue;
    count.set(d, (count.get(d) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([d]) => d);
}
