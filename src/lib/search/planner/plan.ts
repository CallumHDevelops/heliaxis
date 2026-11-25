import { clickShare } from '@/lib/seo/rankings';
import type { Intent, PlannerSettings } from './config';
import {
  AREA_DISTRICTS,
  detectService,
  detectTown,
  foldPhrase,
  intentClass,
  normalisePhrase,
  outcode,
  pageTypeOf,
  wordsKey,
  type PageType,
  type Service,
  isOtherBusiness,
  isRelevantIdea,
} from './words';

/**
 * The opportunity planner (spec §5 M3), pure: merge the keyword pool into candidates, group them so one page serves each
 * group (SERP overlap, never a page per variation), map each group to Improve, Create or Hold, and score it. No database.
 */

/* ── Candidates: one per distinct search, merged across every source ───────────────────────────────────────────── */

export type PoolRow = { keyword: string; source: string; volume: number | null; difficulty: number | null; intent: string | null; pos: number | null; url: string | null; rival: string | null };
export type TrackedRow = { id: number; phrase: string; town: string | null; service: string | null; intent: string; target_page: string | null; volume: number | null; our_pos: number | null; our_url: string | null; top10: string[] };

export type VolumeFrom = 'labs' | 'tracked' | 'gsc_impressions' | null;

export type Candidate = {
  key: string;
  phrase: string;
  keywordId: number | null;
  sources: string[];
  volume: number | null;
  volumeFrom: VolumeFrom;
  difficulty: number | null;
  intent: Intent;
  pos: number | null;
  url: string | null;
  targetPage: string | null;
  service: Service;
  town: string | null;
  rivals: string[];
  top10: string[];
};

const BRAND = /\bheliaxis\b/i;
const SERVICES: Service[] = ['solar', 'battery', 'heat_pump', 'ev', 'infrared', 'general'];
const asService = (s: string | null | undefined): Service | null => (SERVICES.includes(s as Service) ? (s as Service) : s === 'heatpump' ? 'heat_pump' : null);

/** Merge pool rows and tracked searches into one candidate per phrase (plurals folded). */
export function buildCandidates(pool: PoolRow[], tracked: TrackedRow[], matchers: { town: string; re: RegExp }[], opts: { businessNames?: string[] } = {}): Candidate[] {
  const by = new Map<string, Candidate & { rawIntent: string | null; ours: boolean }>();
  const get = (phrase: string) => {
    const key = foldPhrase(phrase);
    let c = by.get(key);
    if (!c) {
      c = { key, phrase: normalisePhrase(phrase), keywordId: null, sources: [], volume: null, volumeFrom: null, difficulty: null, intent: 'commercial', rawIntent: null, ours: false, pos: null, url: null, targetPage: null, service: 'general', town: null, rivals: [], top10: [] };
      by.set(key, c);
    }
    return c;
  };
  const better = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

  for (const t of tracked) {
    const c = get(t.phrase);
    c.phrase = normalisePhrase(t.phrase);
    c.keywordId = c.keywordId ?? t.id;
    if (!c.sources.includes('tracked')) c.sources.push('tracked');
    if (t.volume !== null && t.volume !== undefined) {
      c.volume = t.volume;
      c.volumeFrom = 'tracked';
    }
    c.rawIntent = t.intent;
    c.ours = true;
    c.town = t.town ?? c.town;
    c.service = asService(t.service) ?? c.service;
    c.targetPage = t.target_page ?? c.targetPage;
    if (t.our_pos !== null && (c.pos === null || t.our_pos < c.pos)) {
      c.pos = t.our_pos;
      c.url = t.our_url;
    }
    if (t.top10.length > c.top10.length) c.top10 = t.top10;
  }

  for (const r of pool) {
    // Searches for our own name, for another business by name, or off-topic searches Google matched us to (from ranked
    // keywords and Search Console, which skip the ideas filter) are not page opportunities.
    if (!r.keyword || BRAND.test(r.keyword)) continue;
    if (!isRelevantIdea(r.keyword) || isOtherBusiness(r.keyword, opts.businessNames ?? [])) continue;
    const c = get(r.keyword);
    if (!c.sources.includes(r.source)) c.sources.push(r.source);
    if (r.source === 'gsc') {
      // For Search Console rows the pool's volume column holds impressions over 28 days: used only when nothing better.
      if (c.volume === null && r.volume !== null) {
        c.volume = r.volume;
        c.volumeFrom = 'gsc_impressions';
      }
    } else if (r.volume !== null && (c.volumeFrom === null || c.volumeFrom === 'gsc_impressions')) {
      c.volume = r.volume;
      c.volumeFrom = r.source === 'tracked' ? 'tracked' : 'labs';
    }
    if (r.difficulty !== null && c.difficulty === null) c.difficulty = r.difficulty;
    if (r.intent && !c.rawIntent) {
      c.rawIntent = r.intent;
      c.ours = r.source === 'tracked';
    }
    // Positions and URLs in the pool are ours (tracked, Labs ranked, Search Console); a gap row's position is the rival's.
    if (r.source !== 'gap' && r.pos !== null) {
      const p = better(c.pos, r.pos);
      if (p !== c.pos) {
        c.pos = p;
        c.url = r.url ?? c.url;
      }
    }
    if (r.rival && !c.rivals.includes(r.rival)) c.rivals.push(r.rival);
  }

  return [...by.values()].map(({ rawIntent, ours, ...c }) => {
    const town = c.town ?? detectTown(c.phrase, matchers);
    const service = c.service !== 'general' ? c.service : detectService(c.phrase);
    return { ...c, town, service, intent: intentClass(rawIntent, c.phrase, town, ours), pos: c.pos === null ? null : Math.round(c.pos * 10) / 10 };
  });
}

/* ── Grouping: one page per group of searches ──────────────────────────────────────────────────────────────────── */

export type GroupedBy = 'serp' | 'words' | 'mixed';
export type Member = Candidate & { by: 'primary' | 'serp' | 'words'; shared: number | null };
export type Group = { primary: Candidate; members: Member[]; by: GroupedBy };

const overlap = (a: string[], b: Set<string>) => a.reduce((n, u) => n + (b.has(u) ? 1 : 0), 0);
const order = (a: Candidate, b: Candidate) => (b.volume ?? -1) - (a.volume ?? -1) || (a.keywordId === null ? 1 : 0) - (b.keywordId === null ? 1 : 0) || a.key.localeCompare(b.key);

/**
 * Two searches belong on one page when their top 10s share at least `minShared` URLs. Each group has a primary search
 * (the biggest by volume) and every other member shares at least `minShared` URLs with it, so groups never chain loosely.
 * Searches with no SERP data join a SERP group whose primary has the same service, town and page kind, or else group
 * with each other by those words; those groups are labelled as grouped by words.
 */
export function groupCandidates(cands: Candidate[], minShared = 4): Group[] {
  const withSerp = cands.filter((c) => c.top10.length > 0).sort(order);
  const noSerp = cands.filter((c) => c.top10.length === 0).sort(order);
  const groups: Group[] = [];
  const taken = new Set<string>();

  for (const hub of withSerp) {
    if (taken.has(hub.key)) continue;
    taken.add(hub.key);
    const hubUrls = new Set(hub.top10);
    const g: Group = { primary: hub, members: [{ ...hub, by: 'primary', shared: null }], by: 'serp' };
    for (const c of withSerp) {
      if (taken.has(c.key)) continue;
      const shared = overlap(c.top10, hubUrls);
      if (shared >= minShared) {
        taken.add(c.key);
        g.members.push({ ...c, by: 'serp', shared });
      }
    }
    groups.push(g);
  }

  const byWords = new Map<string, Group>();
  for (const g of groups) {
    const k = wordsKey(g.primary.phrase, g.primary.service, g.primary.town, g.primary.intent);
    if (!byWords.has(k)) byWords.set(k, g);
  }
  for (const c of noSerp) {
    const k = wordsKey(c.phrase, c.service, c.town, c.intent);
    const g = byWords.get(k);
    if (g) {
      g.members.push({ ...c, by: g.primary.key === c.key ? 'primary' : 'words', shared: null });
      if (g.by === 'serp') g.by = 'mixed';
    } else {
      const ng: Group = { primary: c, members: [{ ...c, by: 'primary', shared: null }], by: 'words' };
      byWords.set(k, ng);
      groups.push(ng);
    }
  }
  return groups;
}

/* ── Proof: real local work, from the CRM by postcode district and from Target areas ───────────────────────────── */

export type AreaLike = { name: string; towns: string[]; installs: 'yes' | 'no' | 'unknown' };
export type CrmCounts = Record<string, { installs: number; surveys: number }>;
export type Proof = { has: boolean; installs: number; surveys: number; districts: string[]; areaSays: 'yes' | 'no' | 'unknown' | 'not listed'; area: string | null };

/** Count won-onwards projects (and won enquiries) and completed surveys per postcode district. */
export function countByDistrict(rows: { postcode: string | null; kind: 'install' | 'survey' }[]): CrmCounts {
  const out: CrmCounts = {};
  for (const r of rows) {
    const oc = outcode(r.postcode);
    if (!oc) continue;
    const e = (out[oc] ??= { installs: 0, surveys: 0 });
    if (r.kind === 'install') e.installs++;
    else e.surveys++;
  }
  return out;
}

export function proofForTown(town: string, areas: AreaLike[], crm: CrmCounts): Proof {
  const t = town.toLowerCase();
  const area = areas.find((a) => a.towns.some((x) => x.toLowerCase() === t) || a.name.toLowerCase() === t) ?? null;
  const districts = area ? (AREA_DISTRICTS[area.name] ?? []) : [];
  let installs = 0;
  let surveys = 0;
  for (const d of districts) {
    installs += crm[d]?.installs ?? 0;
    surveys += crm[d]?.surveys ?? 0;
  }
  const areaSays = area ? area.installs : 'not listed';
  return { has: installs > 0 || areaSays === 'yes', installs, surveys, districts, areaSays, area: area?.name ?? null };
}

export function holdReason(town: string, p: Proof): string {
  const where = p.districts.length ? `in ${p.districts.join(', ')}` : '(no postcode districts are known for it)';
  const surveys = p.surveys ? ` There ${p.surveys === 1 ? 'is 1 completed survey' : `are ${p.surveys} completed surveys`}, which is not an install.` : '';
  const said = p.areaSays === 'not listed' ? `${town} is not in Settings › Target areas` : `Settings › Target areas says installs there are "${p.areaSays}"`;
  return `No installs on record for ${town}: no won or completed CRM project ${where}, and ${said}.${surveys} A town page without real local work reads as a doorway page (strategy §3). Add a real project there first, or set installs to yes once there is one.`;
}

/* ── Mapping and score ─────────────────────────────────────────────────────────────────────────────────────────── */

export type Action = 'improve' | 'create' | 'hold';

export type ScoreInputs = {
  key: string;
  volume: number;
  volumeKnown: number;
  volumeUnknown: number;
  bestPos: number | null;
  gain: number;
  intent: Intent;
  intentWeight: number;
  proof: boolean;
  proofWeight: number;
  difficulty: number | null;
  band: number;
  groupedBy: GroupedBy;
  proofDetail?: Proof;
  stale?: boolean;
};

export type PlannedCluster = {
  key: string;
  name: string;
  primaryKeywordId: number | null;
  keywords: { phrase: string; keyword_id: number | null; volume: number | null; volume_from: VolumeFrom; pos: number | null; url: string | null; sources: string[]; by: Member['by']; shared: number | null }[];
  pageType: PageType;
  action: Action;
  targetPage: string | null;
  town: string | null;
  service: Service;
  score: number;
  inputs: ScoreInputs;
  holdReason: string | null;
};

export function difficultyBand(kd: number | null, s: Pick<PlannerSettings, 'difficultyCuts' | 'unknownDifficultyBand'>): number {
  if (kd === null || kd === undefined || Number.isNaN(kd)) return s.unknownDifficultyBand;
  return 1 + s.difficultyCuts.filter((c) => kd >= c).length;
}

/** The share of clicks there is to gain by moving from our best position to first (click share at 1 minus now). */
export const positionGain = (bestPos: number | null) => Math.round((clickShare(1) - clickShare(bestPos === null ? null : Math.round(bestPos))) * 10000) / 10000;

export function scoreOf(i: Pick<ScoreInputs, 'volume' | 'gain' | 'intentWeight' | 'proofWeight' | 'band'>): number {
  if (i.band <= 0) return 0;
  return Math.round(((i.volume * i.gain * i.intentWeight * i.proofWeight) / i.band) * 10) / 10;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const sentence = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

/** One group → one queued page: Improve (a page of ours already targets it), Create, or Hold (needs proof we lack). */
export function planGroup(g: Group, s: PlannerSettings, ctx: { areas: AreaLike[]; crm: CrmCounts; anyInstall: boolean }): PlannedCluster {
  const p = g.primary;
  const town = p.town ?? g.members.find((m) => m.town)?.town ?? null;
  const pageType = pageTypeOf(p.phrase, town, p.intent);

  let volumeKnown = 0;
  let volumeUnknown = 0;
  for (const m of g.members) {
    if (m.volume === null) volumeUnknown++;
    else volumeKnown += m.volume;
  }
  const volume = volumeKnown + volumeUnknown * s.unknownVolume;

  const ranked = g.members.filter((m) => m.pos !== null).sort((a, b) => (a.pos as number) - (b.pos as number));
  const bestPos = ranked[0]?.pos ?? null;
  const ourPage = ranked.find((m) => m.url)?.url ?? g.members.find((m) => m.targetPage)?.targetPage ?? null;

  const kd = p.difficulty ?? median(g.members.map((m) => m.difficulty).filter((d): d is number => d !== null));
  const band = difficultyBand(kd, s);
  const gain = positionGain(bestPos);

  const needsTownProof = !!town && (pageType === 'town' || pageType === 'case_study');
  const proofDetail = town ? proofForTown(town, ctx.areas, ctx.crm) : undefined;
  const proof = town ? !!proofDetail?.has : ctx.anyInstall;

  let action: Action = 'create';
  let reason: string | null = null;
  if (ourPage) action = 'improve';
  else if (needsTownProof && proofDetail && !proofDetail.has) {
    action = 'hold';
    reason = holdReason(town as string, proofDetail);
  }

  const inputs: ScoreInputs = {
    key: p.key,
    volume,
    volumeKnown,
    volumeUnknown,
    bestPos,
    gain,
    intent: p.intent,
    intentWeight: s.intentWeights[p.intent],
    proof,
    proofWeight: proof ? s.proofWeights.with : s.proofWeights.without,
    difficulty: kd === null ? null : Math.round(kd),
    band,
    groupedBy: g.by,
    ...(proofDetail ? { proofDetail } : {}),
  };

  return {
    key: p.key,
    name: sentence(p.phrase),
    primaryKeywordId: p.keywordId,
    keywords: g.members.map((m) => ({ phrase: m.phrase, keyword_id: m.keywordId, volume: m.volume, volume_from: m.volumeFrom, pos: m.pos, url: m.url, sources: m.sources, by: m.by, shared: m.shared })),
    pageType,
    action,
    targetPage: ourPage,
    town,
    service: p.service,
    score: scoreOf(inputs),
    inputs,
    holdReason: reason,
  };
}

/* ── Keeping the queue stable between runs ─────────────────────────────────────────────────────────────────────── */

export type ExistingCluster = { id: number; key: string | null; primaryKeywordId: number | null };

/**
 * Which existing seo_cluster row each planned page updates, so re-scoring never duplicates: the same primary search
 * first, then the same tracked primary keyword, then an old primary that is now a member of this group.
 */
export function matchExisting(planned: { key: string; primaryKeywordId: number | null; memberKeys: string[] }[], existing: ExistingCluster[]): (number | null)[] {
  const used = new Set<number>();
  const out: (number | null)[] = planned.map(() => null);
  const pass = (test: (p: (typeof planned)[number], e: ExistingCluster) => boolean) => {
    planned.forEach((p, i) => {
      if (out[i] !== null) return;
      const e = existing.find((x) => !used.has(x.id) && test(p, x));
      if (e) {
        out[i] = e.id;
        used.add(e.id);
      }
    });
  };
  pass((p, e) => !!e.key && e.key === p.key);
  pass((p, e) => p.primaryKeywordId !== null && e.primaryKeywordId === p.primaryKeywordId);
  pass((p, e) => !!e.key && p.memberKeys.includes(e.key));
  return out;
}

/* ── Effort, for the impact-against-effort view ────────────────────────────────────────────────────────────────── */

const EFFORT: Record<PageType, number> = { pillar: 4, sector: 4, town: 3, case_study: 3, cost_guide: 2, comparison: 2, article: 2 };

/** 1 (an edit) to 4 (a new pillar). Improving a page is one step less work than writing it. */
export const effortOf = (type: PageType, action: Action) => Math.max(1, EFFORT[type] - (action === 'improve' ? 1 : 0));

export type Quadrant = 'quick_win' | 'big_bet' | 'fill_in' | 'later';
export const QUADRANT_LABEL: Record<Quadrant, string> = { quick_win: 'Quick wins', big_bet: 'Big bets', fill_in: 'Fill-ins', later: 'Later' };

/** High impact is a score at or above the median of the open queue; high effort is 3 or more. */
export function quadrantOf(score: number, effort: number, medianScore: number): Quadrant {
  const high = score >= medianScore && score > 0;
  const hard = effort >= 3;
  return high ? (hard ? 'big_bet' : 'quick_win') : hard ? 'later' : 'fill_in';
}

export const medianOf = (xs: number[]) => median(xs) ?? 0;
