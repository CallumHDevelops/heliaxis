import { NextRequest, NextResponse } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTrackableAnalyticsPath, normalizeAnalyticsPath } from '@/lib/analytics-paths';
import {
  aggregateHeatmapPoints,
  heatmapTrackingEnabled,
  parseHeatmapRange,
  rangeToStartMs,
  sanitizeClickBatch,
} from '@/lib/heatmap';
// Catalog is server-only (kept out of @/lib/heatmap so client trackers stay clean)
import { buildHeatmapPathCatalog } from '@/lib/heatmap-catalog';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Public ingest — batched anonymised click points from the site. */
export async function POST(req: NextRequest) {
  if (!heatmapTrackingEnabled()) {
    return NextResponse.json({ ok: true, stored: 0, skipped: true }, { headers: CORS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400, headers: CORS });
  }

  const rows = sanitizeClickBatch(body);
  if (!rows.length) {
    return NextResponse.json({ ok: true, stored: 0 }, { headers: CORS });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from('heatmap_clicks').insert(rows);
    if (error) {
      console.error('[heatmap] insert failed:', error.message);
      return NextResponse.json({ error: 'store failed' }, { status: 500, headers: CORS });
    }
    return NextResponse.json({ ok: true, stored: rows.length }, { headers: CORS });
  } catch (e) {
    console.error('[heatmap] insert threw:', e);
    return NextResponse.json({ error: 'store failed' }, { status: 500, headers: CORS });
  }
}

/** Admin read — full page catalog or aggregated points for one URL. */
export async function GET(req: NextRequest) {
  const session = await requireApproved();
  if (!session || session.profile.role !== 'admin') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }

  const sp = req.nextUrl.searchParams;
  const range = parseHeatmapRange(sp.get('range'));
  const startIso = new Date(rangeToStartMs(range)).toISOString();
  const listPaths = sp.get('paths') === '1';
  const pathRaw = sp.get('path');

  try {
    const admin = createAdminClient();

    if (listPaths) {
      const { data, error } = await admin
        .from('heatmap_clicks')
        .select('path')
        .gte('created_at', startIso)
        .limit(20000);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
      }

      const counts = new Map<string, number>();
      for (const row of data || []) {
        const p = normalizeAnalyticsPath(String((row as { path?: string }).path || ''));
        if (!p || !isTrackableAnalyticsPath(p)) continue;
        counts.set(p, (counts.get(p) || 0) + 1);
      }

      const paths = await buildHeatmapPathCatalog(counts);
      return NextResponse.json({ range, paths }, { headers: NO_STORE });
    }

    const path = normalizeAnalyticsPath(pathRaw || '/');
    if (!isTrackableAnalyticsPath(path)) {
      return NextResponse.json({ error: 'invalid path' }, { status: 400, headers: NO_STORE });
    }

    // Match both normalised and legacy trailing-slash variants — never other paths
    const variants = path === '/' ? ['/'] : [path, `${path}/`];
    const { data, error } = await admin
      .from('heatmap_clicks')
      .select('x_pct, y_pct, path')
      .in('path', variants)
      .gte('created_at', startIso)
      .limit(12000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
    }

    // Defensive: drop any row that doesn't normalise to the requested path
    const rows = (data || [])
      .map((row) => row as { x_pct: number; y_pct: number; path?: string })
      .filter((row) => normalizeAnalyticsPath(String(row.path || '')) === path)
      .map((row) => ({ x_pct: row.x_pct, y_pct: row.y_pct }));

    const { points, max, total } = aggregateHeatmapPoints(rows);

    return NextResponse.json({ range, path, total, max, points }, { headers: NO_STORE });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'failed';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE });
  }
}
