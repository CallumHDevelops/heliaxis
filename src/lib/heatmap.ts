import { isTrackableAnalyticsPath, normalizeAnalyticsPath } from '@/lib/analytics-paths';

export type HeatmapRange = '24h' | '7d' | '30d';

export type HeatmapClickInput = {
  path: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  dh?: number;
};

export type HeatmapClickRow = {
  path: string;
  x_pct: number;
  y_pct: number;
  vw: number | null;
  vh: number | null;
  doc_h: number | null;
};

export type HeatmapPoint = {
  x: number;
  y: number;
  value: number;
};

export type HeatmapPathStat = {
  path: string;
  clicks: number;
  /** Display name (CMS page title or friendly label) */
  label?: string;
  /** How this path entered the catalog */
  source?: 'cms' | 'static' | 'clicks' | 'blog';
};

const MAX_BATCH = 40;
/** ~5% bins so repeated clicks on the same control stack into one hot spot */
const GRID = 20;

export function heatmapTrackingEnabled(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return false;
  if (process.env.NODE_ENV === 'development') {
    return process.env.NEXT_PUBLIC_HEATMAP_TRACK_DEV === '1';
  }
  return true;
}

/** Client-side mirror (no service key check). */
export function heatmapClientTrackingEnabled(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!url) return false;
  if (process.env.NODE_ENV === 'development') {
    return process.env.NEXT_PUBLIC_HEATMAP_TRACK_DEV === '1';
  }
  return true;
}

export function rangeToStartMs(range: HeatmapRange): number {
  const now = Date.now();
  if (range === '24h') return now - 24 * 60 * 60 * 1000;
  if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  return now - 7 * 24 * 60 * 60 * 1000;
}

export function parseHeatmapRange(raw: string | null | undefined): HeatmapRange {
  if (raw === '24h' || raw === '30d' || raw === '7d') return raw;
  return '7d';
}

function clampPct(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

function clampInt(n: unknown, max = 10000): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  const i = Math.round(v);
  if (i < 0 || i > max) return null;
  return i;
}

/** Validate + normalise a public ingest batch. */
export function sanitizeClickBatch(raw: unknown): HeatmapClickRow[] {
  if (!raw || typeof raw !== 'object') return [];
  const clicks = (raw as { clicks?: unknown }).clicks;
  if (!Array.isArray(clicks)) return [];

  const out: HeatmapClickRow[] = [];
  for (const item of clicks.slice(0, MAX_BATCH)) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const path = normalizeAnalyticsPath(String(c.path || ''));
    if (!isTrackableAnalyticsPath(path)) continue;

    const x = clampPct(Number(c.x));
    const y = clampPct(Number(c.y));
    if (x === null || y === null) continue;

    out.push({
      path,
      x_pct: x,
      y_pct: y,
      vw: clampInt(c.w, 8000),
      vh: clampInt(c.h, 8000),
      doc_h: clampInt(c.dh, 100000),
    });
  }
  return out;
}

/** Bin raw % points into denser heatmap.js data. */
export function aggregateHeatmapPoints(
  rows: Array<{ x_pct: number; y_pct: number }>
): { points: HeatmapPoint[]; max: number; total: number } {
  const bins = new Map<string, number>();
  for (const row of rows) {
    const xi = Math.min(GRID - 1, Math.max(0, Math.floor((row.x_pct / 100) * GRID)));
    const yi = Math.min(GRID - 1, Math.max(0, Math.floor((row.y_pct / 100) * GRID)));
    const key = `${xi}:${yi}`;
    bins.set(key, (bins.get(key) || 0) + 1);
  }

  let max = 1;
  const points: HeatmapPoint[] = [];
  for (const [key, value] of bins) {
    const [xs, ys] = key.split(':');
    const xi = Number(xs);
    const yi = Number(ys);
    const x = ((xi + 0.5) / GRID) * 100;
    const y = ((yi + 0.5) / GRID) * 100;
    if (value > max) max = value;
    points.push({ x, y, value });
  }

  return { points, max, total: rows.length };
}
