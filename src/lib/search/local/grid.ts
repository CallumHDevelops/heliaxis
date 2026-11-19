/**
 * M5 map grid (spec §5 M5, §9): which areas get a grid, where each grid sits, the 25 points, what each point's Maps
 * result says about us, and the scan's summary. Pure (no database, no network), so every rule is tested.
 */

export type LatLng = { lat: number; lng: number };

/** Where Heliaxis is (Newport, South Wales): the business address the map pack measures distance from. */
export const BASE: LatLng & { name: string } = { name: 'Newport', lat: 51.5842, lng: -2.9977 };

/**
 * Grid centres for the Tier 1 areas, their main towns and the better-off pockets named in §9 (approximate town centres,
 * WGS84). An area's `gridCentre` (or, failing that, its first town) is looked up here; "51.6,-2.95" also works.
 */
export const CENTRES: Record<string, LatLng> = {
  newport: { lat: 51.5842, lng: -2.9977 },
  /** Newport, Pembrokeshire: a different town 140 km west. */
  'newport (pembs)': { lat: 52.0190, lng: -4.8360 },
  'newport, pembrokeshire': { lat: 52.0190, lng: -4.8360 },
  caerleon: { lat: 51.6109, lng: -2.9566 },
  langstone: { lat: 51.5930, lng: -2.9230 },
  rogerstone: { lat: 51.5930, lng: -3.0570 },
  cardiff: { lat: 51.4816, lng: -3.1791 },
  lisvane: { lat: 51.5323, lng: -3.1797 },
  cyncoed: { lat: 51.5150, lng: -3.1630 },
  radyr: { lat: 51.5160, lng: -3.2500 },
  llandaff: { lat: 51.4950, lng: -3.2170 },
  chepstow: { lat: 51.6418, lng: -2.6750 },
  caldicot: { lat: 51.5910, lng: -2.7500 },
  usk: { lat: 51.7037, lng: -2.9026 },
  raglan: { lat: 51.7660, lng: -2.8510 },
  monmouth: { lat: 51.8116, lng: -2.7163 },
  abergavenny: { lat: 51.8240, lng: -3.0167 },
  penarth: { lat: 51.4386, lng: -3.1737 },
  'dinas powys': { lat: 51.4330, lng: -3.2160 },
  cowbridge: { lat: 51.4620, lng: -3.4480 },
  barry: { lat: 51.3990, lng: -3.2830 },
  bridgend: { lat: 51.5043, lng: -3.5769 },
  porthcawl: { lat: 51.4790, lng: -3.7050 },
  swansea: { lat: 51.6214, lng: -3.9436 },
  mumbles: { lat: 51.5720, lng: -3.9990 },
  killay: { lat: 51.6120, lng: -4.0090 },
  carmarthen: { lat: 51.8576, lng: -4.3121 },
  llandeilo: { lat: 51.8850, lng: -3.9920 },
  bristol: { lat: 51.4545, lng: -2.5879 },
  'westbury-on-trym': { lat: 51.4930, lng: -2.6180 },
  henleaze: { lat: 51.4880, lng: -2.6040 },
  'stoke bishop': { lat: 51.4880, lng: -2.6330 },
  chippenham: { lat: 51.4600, lng: -2.1170 },
  corsham: { lat: 51.4340, lng: -2.1860 },
};

/** Regions far from Newport: won through town pages, hub pages and reviews, not the map pack (§9). */
export const FAR_REGIONS = ['West Wales', 'South West England', 'Wiltshire', 'Bath and Wiltshire', 'North Somerset', 'South Gloucestershire', 'Ceredigion', 'Powys'];
/** Beyond this distance from the business address, the map pack is out of reach whatever the region. */
export const REACH_KM = 50;

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** "51.6,-2.95" → a point, or a known town name → its centre. */
export function centreOf(name: string | null | undefined): LatLng | null {
  const s = String(name ?? '').trim();
  if (!s) return null;
  const m = /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(s);
  if (m) {
    const p = { lat: Number(m[1]), lng: Number(m[2]) };
    return Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 ? p : null;
  }
  // Exact names only: "Newport (Pembs)" must never fall back to Newport, South Wales (spec §9, the two Newports).
  return CENTRES[s.toLowerCase().replace(/\s+/g, ' ')] ?? null;
}

export type AreaLike = { name: string; region?: string; tier: number; towns: string[]; gridCentre?: string };

export type Reach =
  | { grid: true; centreName: string; centre: LatLng; km: number }
  | { grid: false; label: 'organic only' | 'not tier 1' | 'no centre'; why: string; centreName?: string; km?: number };

/**
 * Does this area get a map grid? Only Tier 1 areas within reach of the business address do: a far region (West Wales,
 * Bristol, Wiltshire…) or anything over REACH_KM away is labelled "organic only".
 */
export function gridReach(area: AreaLike, base: LatLng = BASE): Reach {
  if (area.tier !== 1) return { grid: false, label: 'not tier 1', why: `Tier ${area.tier}: grids run for Tier 1 areas only.` };
  const centreName = (area.gridCentre || area.towns[0] || area.name).trim();
  const centre = centreOf(centreName) ?? centreOf(area.towns[0]) ?? centreOf(area.name);
  const far = FAR_REGIONS.some((r) => r.toLowerCase() === String(area.region ?? '').toLowerCase());
  if (far) return { grid: false, label: 'organic only', why: `${area.region} is too far from ${BASE.name} for the map pack; won through town pages and reviews.`, centreName, ...(centre ? { km: Math.round(distanceKm(base, centre)) } : {}) };
  if (!centre) return { grid: false, label: 'no centre', why: `No map point on file for “${centreName}”: set the grid centre in Settings › Target areas (a town or "lat,lng").`, centreName };
  const km = Math.round(distanceKm(base, centre));
  if (km > REACH_KM) return { grid: false, label: 'organic only', why: `${km} km from ${BASE.name}: beyond map-pack reach (${REACH_KM} km).`, centreName, km };
  return { grid: true, centreName, centre, km };
}

/** A size×size grid, widthKm across, centred on the point (rows north to south, west to east). Rounded to 5 places. */
export function gridPoints(c: LatLng, size = 5, widthKm = 10): LatLng[] {
  const step = size > 1 ? widthKm / (size - 1) : 0;
  const half = (size - 1) / 2;
  const kmLat = 111.32;
  const kmLng = 111.32 * Math.cos((c.lat * Math.PI) / 180);
  const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
  const out: LatLng[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const north = (half - row) * step;
      const east = (col - half) * step;
      out.push({ lat: r5(c.lat + north / kmLat), lng: r5(c.lng + east / kmLng) });
    }
  }
  return out;
}

/** DataForSEO Maps `location_coordinate`: "latitude,longitude,zoom". 13z shows a few kilometres round the point. */
export const coordinate = (p: LatLng, zoom = 13) => `${p.lat},${p.lng},${zoom}z`;

export type KeywordLike = { id: number; phrase: string; town: string | null; intent: string; priority: number; volume?: number | null; active?: boolean };

/** The searches for one area's grid: its own towns' searches, local commercial first, then priority, then volume. */
export function gridKeywords(area: AreaLike, kws: KeywordLike[], max = 10): KeywordLike[] {
  const towns = new Set(area.towns.map((t) => t.toLowerCase()));
  return kws
    .filter((k) => k.active !== false && k.town && towns.has(k.town.toLowerCase()))
    .sort((a, b) => Number(b.intent === 'local_commercial') - Number(a.intent === 'local_commercial') || a.priority - b.priority || (b.volume ?? 0) - (a.volume ?? 0) || a.id - b.id)
    .slice(0, max);
}

export type PlanRow = { area: string; reach: Reach; keywords: KeywordLike[] };

/** Every Tier 1 area: its reach and, when it gets a grid, the searches to run. */
export function gridPlan(areas: AreaLike[], kws: KeywordLike[], opts: { max?: number; base?: LatLng } = {}): PlanRow[] {
  return areas
    .filter((a) => a.tier === 1)
    .map((a) => {
      const reach = gridReach(a, opts.base);
      return { area: a.name, reach, keywords: reach.grid ? gridKeywords(a, kws, opts.max ?? 10) : [] };
    });
}

/** Standard-queue Maps SERP, per task (confirm in DataForSEO's calculator; the real cost is logged from each task). */
export const MAPS_TASK_USD = 0.0006;
export const POINTS_PER_SCAN = 25;
export const gridEstimate = (plan: PlanRow[]) => {
  const scans = plan.reduce((a, p) => a + p.keywords.length, 0);
  return { scans, tasks: scans * POINTS_PER_SCAN, usd: Math.round(scans * POINTS_PER_SCAN * MAPS_TASK_USD * 10000) / 10000 };
};

/* ── One point's result ──────────────────────────────────────────────────────────────────────────────────────────── */

export type TopRow = { pos: number; title: string; domain: string | null; rating: number | null; votes: number | null };

const host = (d: unknown, url: unknown): string => {
  const raw = typeof d === 'string' && d ? d : typeof url === 'string' ? url : '';
  if (!raw) return '';
  try {
    return (raw.includes('://') ? new URL(raw).hostname : raw).toLowerCase().replace(/^www\./, '');
  } catch {
    return raw.toLowerCase();
  }
};

/** Ours by website (heliaxis.co.uk) or by the name on the listing ("Heliaxis"). */
export function isOurListing(it: { domain?: unknown; url?: unknown; title?: unknown }): boolean {
  const d = host(it.domain, it.url);
  if (d === 'heliaxis.co.uk' || d.endsWith('.heliaxis.co.uk')) return true;
  return /\bheliaxis\b/i.test(String(it.title ?? ''));
}

/** Our rank in one Maps result (null when not listed) and the top three. */
export function parseMapsItems(items: unknown[]): { ourRank: number | null; top3: TopRow[]; listed: number } {
  const rows = (Array.isArray(items) ? items : [])
    .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
    // Organic listings only: paid "maps_paid_item" rows are adverts, not places in the pack.
    .filter((x): x is Record<string, unknown> => !!x && (x.type === undefined || x.type === 'maps_search'));
  const ranked = rows
    .map((r) => ({ r, pos: Number(r.rank_group ?? r.rank_absolute) }))
    .filter((x) => Number.isFinite(x.pos) && x.pos > 0)
    .sort((a, b) => a.pos - b.pos);
  const ours = ranked.find((x) => isOurListing(x.r));
  const top3 = ranked.slice(0, 3).map(({ r, pos }) => {
    const rating = (r.rating ?? null) as { value?: unknown; votes_count?: unknown } | null;
    return {
      pos,
      title: String(r.title ?? ''),
      domain: host(r.domain, r.url) || null,
      rating: rating && Number.isFinite(Number(rating.value)) ? Number(rating.value) : null,
      votes: rating && Number.isFinite(Number(rating.votes_count)) ? Number(rating.votes_count) : null,
    };
  });
  return { ourRank: ours ? ours.pos : null, top3, listed: ranked.length };
}

/* ── A scan's summary ────────────────────────────────────────────────────────────────────────────────────────────── */

/** our_rank on a stored point: 0 = still waiting for DataForSEO, null = checked and not listed, n = our place. */
export const WAITING = 0;

export type PointLike = { our_rank: number | null; task_id: string | null };

/**
 * Average rank where we are listed, the share of checked points where we are in the top 3, and how many points were
 * checked (a point that never came back is left out of both).
 */
export function scanSummary(points: PointLike[]): { checked: number; found: number; avgRank: number | null; top3Share: number | null; waiting: number } {
  const waiting = points.filter((p) => p.our_rank === WAITING).length;
  const checked = points.filter((p) => p.task_id && p.our_rank !== WAITING);
  const ranks = checked.map((p) => p.our_rank).filter((r): r is number => typeof r === 'number' && r > 0);
  return {
    checked: checked.length,
    found: ranks.length,
    waiting,
    avgRank: ranks.length ? Math.round((ranks.reduce((a, b) => a + b, 0) / ranks.length) * 10) / 10 : null,
    top3Share: checked.length ? Math.round((ranks.filter((r) => r <= 3).length / checked.length) * 1000) / 1000 : null,
  };
}

/** The colour band of a point on the heat map. */
export const rankBand = (r: number | null): 'top3' | 'top10' | 'top20' | 'out' => (r === null || r <= 0 ? 'out' : r <= 3 ? 'top3' : r <= 10 ? 'top10' : r <= 20 ? 'top20' : 'out');
