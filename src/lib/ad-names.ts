/**
 * Meta's ad and campaign names over time, for CRM → Reports. An ad can be renamed in Ads Manager
 * whenever ("Video 4" → "Valley Vets Off Grid"), but a lead keeps the name its ad had when it came
 * in ("meta: Video 4"), and the CRM's copies of Meta's figures keep the names they were fetched
 * with. So the CRM keeps, by Meta's own ids, the names it has seen each ad and campaign have: in
 * Meta's figures and its list of ads, on leads as they arrive, and on leads whose ad is known.
 * Reports then shows each ad under its name now and puts a lead that only has a name with the
 * ad(s) that have had it (spendTable in src/lib/ad-spend.ts).
 *
 * Also: which older leads to ask Meta's Lead API for their ad, and what its answers mean.
 *
 * Pure, so it runs in the browser and in scripts/test-ad-names.mjs. Meta and cms_kv are in
 * src/lib/meta-ads.ts (names) and src/lib/meta-ad-ids.ts (leads).
 */
import type { Ad, MetaError, PastNames } from './ad-spend';

/** A name, and the last time the CRM saw it on the ad or campaign (ms). */
export type SeenName = { name: string; at: number };

/** cms_kv 'meta-ads:names-seen': every name each ad and campaign has had, by Meta's id. */
export type NameHistory = { v: 1; ads: Record<string, SeenName[]>; campaigns: Record<string, SeenName[]> };
type Kind = 'ads' | 'campaigns';
const KINDS: Kind[] = ['ads', 'campaigns'];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Kept to size: a few names for each id, and the ids seen most recently. */
const MAX_NAMES = 8;
const MAX_IDS: Record<Kind, number> = { ads: 3000, campaigns: 1000 };

export const emptyHistory = (): NameHistory => ({ v: 1, ads: {}, campaigns: {} });

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const tidy = (s: unknown) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, 200) : '');
// Meta's ids are digits; letters too so the tests can say 'c1'. Never "__proto__" and the like.
const okId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(id);
const own = <T>(rec: Record<string, T>, id: string): T | undefined => (Object.hasOwn(rec, id) ? rec[id] : undefined);

/**
 * `id` was called `name` at `at` (ms). True when that's worth saving: a name not seen on it
 * before, or one seen again over an hour later. Seeing the same names every few minutes (each
 * Reports load) only moves the time on, so cms_kv isn't rewritten every time.
 */
export function noteName(h: NameHistory, kind: Kind, id: string, name: string | null | undefined, at: number): boolean {
  const n = tidy(name);
  if (!okId(id) || !n || !Number.isFinite(at)) return false;
  let list = own(h[kind], id);
  if (!list) list = h[kind][id] = [];
  const was = list.find((x) => norm(x.name) === norm(n));
  if (!was) {
    list.push({ name: n, at });
    return true;
  }
  if (at <= was.at) return false;
  const news = at - was.at > HOUR;
  was.at = at;
  // Meta's spelling now (capitals, spaces).
  if (news) was.name = n;
  return news;
}

/** The names in a list of Meta's ads (its figures, or its ad list). True if any were news. */
export function noteAds(h: NameHistory, ads: Pick<Ad, 'id' | 'name' | 'campaignId' | 'campaignName'>[], at: number): boolean {
  let news = false;
  for (const a of ads) {
    // Not the stand-ins for a name Meta didn't send ("Ad 123", "Campaign 456").
    if (a.name !== `Ad ${a.id}`) news = noteName(h, 'ads', a.id, a.name, at) || news;
    if (a.campaignId && a.campaignName !== `Campaign ${a.campaignId}` && a.campaignName !== 'No campaign') {
      news = noteName(h, 'campaigns', a.campaignId, a.campaignName, at) || news;
    }
  }
  return news;
}

/** cms_kv's copy → a history. Anything unreadable is left out; nothing there is an empty one. */
export function readHistory(raw: unknown): NameHistory {
  const h = emptyHistory();
  const v = raw as Partial<NameHistory> | null | undefined;
  if (v?.v !== 1) return h;
  for (const kind of KINDS)
    for (const [id, list] of Object.entries(v[kind] ?? {}))
      if (Array.isArray(list)) for (const x of list) noteName(h, kind, id, x?.name, Number(x?.at));
  return h;
}

/** Histories as one: every name each id has had, each at the last time any of them saw it. */
export function mergeHistory(...hs: NameHistory[]): NameHistory {
  const out = emptyHistory();
  for (const h of hs) for (const kind of KINDS) for (const [id, list] of Object.entries(h[kind])) for (const x of list) noteName(out, kind, id, x.name, x.at);
  return out;
}

/** Kept to size: each id's newest names, and the ids seen most recently. */
export function trimHistory(h: NameHistory): NameHistory {
  const out = emptyHistory();
  for (const kind of KINDS) {
    const ids = Object.entries(h[kind])
      .map(([id, list]) => [id, [...list].sort((a, b) => b.at - a.at).slice(0, MAX_NAMES)] as const)
      .filter(([, list]) => list.length)
      .sort((a, b) => b[1][0].at - a[1][0].at)
      .slice(0, MAX_IDS[kind]);
    for (const [id, list] of ids) out[kind][id] = list;
  }
  return out;
}

/** Each id's names, newest first: what Reports matches leads' old names with (spendTable's `past`). */
export function namesById(h: NameHistory, kind: Kind): Record<string, string[]> {
  return Object.fromEntries(Object.entries(h[kind]).map(([id, list]) => [id, [...list].sort((a, b) => b.at - a.at).map((x) => x.name)]));
}

export const pastNames = (h: NameHistory): PastNames => ({ ads: namesById(h, 'ads'), campaigns: namesById(h, 'campaigns') });

// ── Meta's names now ──

/** An ad as Meta's ad list has it now (GET /act_{id}/ads). `createdAt`: when it was made (ISO), if Meta said. */
export type CurrentAd = { name: string; campaignId: string; campaignName: string; adsetId: string; adsetName: string; createdAt?: string };

/** One ad in that list, as Meta sends it. */
export type AdRow = {
  id?: string;
  name?: string;
  campaign_id?: string;
  campaign?: { id?: string; name?: string };
  adset_id?: string;
  adset?: { id?: string; name?: string };
  created_time?: string;
};

/** Meta's ad list (or ads looked up by id) → each ad's names now, by ad id. */
export function currentFromRows(rows: AdRow[]): Record<string, CurrentAd> {
  const out: Record<string, CurrentAd> = {};
  for (const r of rows) {
    const id = String(r?.id ?? '');
    if (!okId(id) || !tidy(r.name)) continue;
    const made = Date.parse(r.created_time ?? '');
    out[id] = {
      name: tidy(r.name),
      campaignId: String(r.campaign_id || r.campaign?.id || ''),
      campaignName: tidy(r.campaign?.name),
      adsetId: String(r.adset_id || r.adset?.id || ''),
      adsetName: tidy(r.adset?.name),
      ...(made ? { createdAt: new Date(made).toISOString() } : {}),
    };
  }
  return out;
}

/**
 * Ads with the names Meta has for them now: figures fetched earlier (kept for up to an hour) still
 * show a renamed ad under its new name. A campaign renamed is renamed for all its ads, ones Meta's
 * list leaves out included. An ad Meta's list doesn't have keeps the name in the figures. Also when
 * each ad was made, so a lead from before then isn't put with it.
 */
export function withCurrentNames<T extends Pick<Ad, 'id' | 'name' | 'campaignId' | 'campaignName' | 'createdAt'>>(ads: T[], current: Record<string, CurrentAd> | null | undefined): T[] {
  const now = current ?? {};
  const campaigns = new Map<string, string>();
  for (const c of Object.values(now)) if (c.campaignId && c.campaignName) campaigns.set(c.campaignId, c.campaignName);
  return ads.map((a) => {
    const c = own(now, a.id);
    return { ...a, name: c?.name || a.name, campaignName: campaigns.get(a.campaignId) || a.campaignName, ...(c?.createdAt ? { createdAt: c.createdAt } : {}) };
  });
}

/**
 * For putting a lead's ad's name now beside it on other pages: each ad's and campaign's name by
 * id, and `renamed`: an old ad name (lower case, single spaces) → the one name the ad(s) that had
 * it have now. A name two ads with different names now have had isn't in it (it can't say which):
 * it's in `shared`, with each of their names now.
 */
export type AdNameLookup = { ads: Record<string, string>; campaigns: Record<string, string>; renamed: Record<string, string>; shared: Record<string, string[]> };

/**
 * Meta's names now (null if not known) and the names seen → a lookup. Meta's list wins over the
 * history's newest, unless the CRM has seen the ad since Meta gave the list (`listedAt`, ms; a
 * lead from it, say): then the ad may have been renamed since, and the history's newest is newer.
 */
export function nameLookup(current: Record<string, CurrentAd> | null | undefined, h: NameHistory, listedAt = Infinity): AdNameLookup {
  const ads: Record<string, string> = {};
  const campaigns: Record<string, string> = {};
  for (const [id, names] of Object.entries(namesById(h, 'ads'))) ads[id] = names[0];
  for (const [id, names] of Object.entries(namesById(h, 'campaigns'))) campaigns[id] = names[0];
  for (const [id, c] of Object.entries(current ?? {})) {
    if (!(own(h.ads, id) ?? []).some((x) => x.at > listedAt)) ads[id] = c.name;
    if (c.campaignId && c.campaignName) campaigns[c.campaignId] = c.campaignName;
  }
  // Each name → the names the ads that have had it have now (one of each, whatever its capitals).
  const now = new Map<string, Map<string, string>>();
  const add = (name: string, id: string) => {
    const k = norm(name);
    const to = now.get(k) ?? new Map<string, string>();
    if (ads[id] && !to.has(norm(ads[id]))) to.set(norm(ads[id]), ads[id]);
    now.set(k, to);
  };
  for (const [id, list] of Object.entries(h.ads)) for (const x of list) add(x.name, id);
  for (const id of Object.keys(ads)) add(ads[id], id);
  const renamed: Record<string, string> = {};
  const shared: Record<string, string[]> = {};
  for (const [k, to] of now) {
    const names = [...to.values()];
    if (names.length > 1) shared[k] = names;
    else if (names.length && norm(names[0]) !== k) renamed[k] = names[0];
  }
  return { ads, campaigns, renamed, shared };
}

/** A lead's ad's name now: by its ad id, else by the name it came in with. Null when the CRM knows no newer name than the lead's own. */
export function leadAdName(l: AdNameLookup, source: string, metaAdId?: string | null): string | null {
  const byId = metaAdId ? own(l.ads, metaAdId) : undefined;
  if (byId) return byId;
  const m = /^meta\s*:(.*)$/i.exec(source.trim());
  return m ? (own(l.renamed, norm(m[1])) ?? null) : null;
}

/**
 * What to call a lead's ad on other pages, from the name it came in with (`cameAs`, null when Meta
 * didn't name it) and its ad id when known: by the id; else the one name the ad(s) that had that
 * name have now; else, when ads now named differently have had it, all their names ("Valley Vets
 * Off Grid / Video 4") rather than a guess. `note` says what it came in as when that's not its
 * name now ("was Video 1"). Null when there's nothing to go on.
 */
export function adNameNow(l: AdNameLookup, cameAs: string | null | undefined, metaAdId?: string | null): { name: string; note: string | null } | null {
  const was = tidy(cameAs);
  const byId = metaAdId ? own(l.ads, metaAdId) : undefined;
  if (byId) return { name: byId, note: was && norm(was) !== norm(byId) ? `was ${was}` : null };
  if (!was) return null;
  const k = norm(was);
  const to = own(l.renamed, k);
  if (to) return { name: to, note: `was ${was}` };
  const several = own(l.shared, k);
  if (!several) return { name: was, note: null };
  // The new names first (A to Z), then the old one if an ad still has it.
  const names = [...several].sort((a, b) => Number(norm(a) === k) - Number(norm(b) === k) || a.localeCompare(b));
  return { name: names.join(' / '), note: `was ${was} · ${names.length} ads have had this name` };
}

// ── Older leads' ads, from Meta's Lead API ──

/** An enquiry that may need its ad from Meta's Lead API. */
export type LeadRow = { id: string; source: string | null; meta_lead_id: string | null; meta_ad_id?: string | null; created_at?: string | null };

/** cms_kv 'meta-ads:lead-misses': Meta lead ids Meta couldn't give an ad for, and when it said so (ms). */
export type LeadMisses = { v: 1; ids: Record<string, number> };

/** A miss is asked about again after this long (one Meta can't see today may be shared with the key later). */
const MISS_DAYS = 30;
const MAX_MISSES = 5000;
/** Meta keeps a lead this long; after that its answer for it is always "does not exist". */
const KEPT_DAYS = 89;

/** cms_kv's copy → the misses still in date, newest kept when there are too many. */
export function readMisses(raw: unknown, now = Date.now()): LeadMisses {
  const v = raw as Partial<LeadMisses> | null | undefined;
  const ids = Object.entries(v?.v === 1 && v.ids ? v.ids : {})
    .filter(([id, at]) => /^\d{1,30}$/.test(id) && Number.isFinite(at) && now - at < MISS_DAYS * DAY)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_MISSES);
  return { v: 1, ids: Object.fromEntries(ids) };
}

/** Lead-form leads: "meta: <ad>" and "meta-lead-ad" (not "meta-organic": no ad is behind it). */
const FORM_SOURCE = /^meta\s*(?::|-lead-ad\s*$)/i;

/**
 * The leads to ask Meta for their ad, newest first (Meta keeps leads 90 days, so the newest are
 * likeliest to come back): lead-form leads with Meta's lead id and no ad id, that Meta hasn't said
 * in the last 30 days it can't give an ad for.
 */
export function leadsToBackfill(rows: LeadRow[], misses: LeadMisses, now = Date.now(), limit = 50): LeadRow[] {
  const seen = new Set<string>();
  const time = (r: LeadRow) => Date.parse(r.created_at ?? '') || 0;
  return rows
    .filter((r) => {
      const id = (r.meta_lead_id ?? '').trim();
      if (!/^\d{1,30}$/.test(id) || r.meta_ad_id || !FORM_SOURCE.test(r.source ?? '') || seen.has(id)) return false;
      const missed = own(misses.ids, id);
      if (missed != null && now - missed < MISS_DAYS * DAY) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => time(b) - time(a))
    .slice(0, Math.max(0, limit));
}

/** One answer in a Graph batch: its HTTP status and its body (JSON as text). Null if Meta ran out of time for it. */
export type BatchAnswer = { code?: number; body?: string } | null;

/** The ad fields asked for on each lead. */
export type LeadAd = {
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  created_time?: string;
  is_organic?: boolean;
};

export type LeadBatch = {
  /** Leads Meta gave an ad for. */
  found: { row: LeadRow; lead: LeadAd }[];
  /** Meta lead ids not to ask about for a while: no ad (organic or a test lead), or ones Meta no longer has. */
  missed: string[];
  /** Meta's other errors (limits, the key, an outage, or "does not exist" when the key may be why): nothing is remembered about those leads. */
  errors: MetaError[];
};

const gone = (e: MetaError) => e.code === 100 && (e.subcode === 33 || /does not exist|cannot be loaded|unsupported get request/i.test(e.error));

/**
 * Meta's answers to a batch of lead lookups (in the order asked). Meta says the same for a lead it
 * no longer keeps as for one the key can't see ("does not exist, cannot be loaded due to missing
 * permissions"), so such a lead only counts as gone when it's over 89 days old, or when Meta gave
 * another lead in the same batch (so the key works). Otherwise it's left for another time.
 */
export function readLeadBatch(rows: LeadRow[], answers: unknown, now = Date.now()): LeadBatch {
  const out: LeadBatch = { found: [], missed: [], errors: [] };
  if (!Array.isArray(answers)) {
    out.errors.push({ error: 'Meta’s answer wasn’t a list of leads' });
    return out;
  }
  const maybe: { row: LeadRow; e: MetaError }[] = [];
  rows.forEach((row, i) => {
    const a = answers[i] as BatchAnswer | undefined;
    // Meta ran out of time for this one: another time.
    if (!a || typeof a !== 'object') return;
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(String(a.body ?? 'null'));
    } catch {
      body = null;
    }
    const id = String(row.meta_lead_id ?? '').trim();
    if (a.code === 200 && body) {
      const lead = body as LeadAd;
      if (lead.ad_id && /^\d{1,30}$/.test(String(lead.ad_id))) out.found.push({ row, lead });
      else out.missed.push(id);
      return;
    }
    const e = (body?.error ?? {}) as { message?: string; code?: number; error_subcode?: number };
    const err: MetaError = { error: e.message || `Meta returned ${a.code ?? 'nothing'}`, code: e.code, subcode: e.error_subcode };
    if (gone(err)) maybe.push({ row, e: err });
    else out.errors.push(err);
  });
  const keyWorks = out.found.length + out.missed.length > 0;
  for (const { row, e } of maybe) {
    const old = now - (Date.parse(row.created_at ?? '') || now) > KEPT_DAYS * DAY;
    if (keyWorks || old) out.missed.push(String(row.meta_lead_id).trim());
    else out.errors.push(e);
  }
  return out;
}
