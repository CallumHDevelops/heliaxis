import 'server-only';

import { isTrackableAnalyticsPath, normalizeAnalyticsPath, STATIC_PUBLIC_PATHS } from '@/lib/analytics-paths';
import type { HeatmapPathStat } from '@/lib/heatmap';

function friendlyStaticLabel(path: string): string {
  if (path === '/') return 'Home';
  const map: Record<string, string> = {
    '/brand': 'Brand',
    '/blog': 'Blog',
    '/solar-estimator': 'Solar estimator',
    '/roof-designer': 'Roof designer',
    '/commercial-funding': 'Commercial funding',
    '/newport-net-zero-grant': 'Newport Net Zero grant',
    '/warehousing': 'Warehousing',
    '/updates': 'Updates',
  };
  return map[path] || path;
}

/**
 * Admin page catalog: published public URLs only (static live routes +
 * CMS rendered snapshot + public blog posts).
 * Server-only — must not be imported from Client Components.
 */
export async function buildHeatmapPathCatalog(
  clickCounts: Map<string, number>
): Promise<HeatmapPathStat[]> {
  const { getCmsRendered } = await import('@/lib/cms-rendered');
  const byPath = new Map<string, HeatmapPathStat>();

  const upsert = (path: string, partial: Partial<HeatmapPathStat>) => {
    const p = normalizeAnalyticsPath(path);
    if (!isTrackableAnalyticsPath(p)) return;
    const prev = byPath.get(p);
    byPath.set(p, {
      path: p,
      clicks: Math.max(prev?.clicks || 0, partial.clicks || 0, clickCounts.get(p) || 0),
      label: partial.label || prev?.label || friendlyStaticLabel(p),
      source: partial.source || prev?.source || 'clicks',
    });
  };

  for (const p of STATIC_PUBLIC_PATHS) {
    upsert(p, { label: friendlyStaticLabel(p), source: 'static', clicks: clickCounts.get(p) || 0 });
  }

  try {
    const rendered = await getCmsRendered();
    for (const page of rendered?.pages || []) {
      const slug = normalizeAnalyticsPath(String(page.slug || '/'));
      upsert(slug, {
        label: (page.name || '').trim() || friendlyStaticLabel(slug),
        source: 'cms',
        clicks: clickCounts.get(slug) || 0,
      });
    }
  } catch {
    /* ignore catalog CMS failures */
  }

  try {
    const { getPublicPosts } = await import('@/lib/blog/queries');
    const posts = await getPublicPosts();
    for (const post of posts || []) {
      const slug = normalizeAnalyticsPath(`/blog/${post.slug}`);
      upsert(slug, {
        label: post.title || slug,
        source: 'blog',
        clicks: clickCounts.get(slug) || 0,
      });
    }
  } catch {
    /* ignore blog catalog failures */
  }

  for (const [p, clicks] of clickCounts) {
    if (!byPath.has(p)) continue;
    const prev = byPath.get(p)!;
    byPath.set(p, { ...prev, clicks: Math.max(prev.clicks, clicks) });
  }

  return Array.from(byPath.values()).sort((a, b) => {
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    if (a.path === '/') return -1;
    if (b.path === '/') return 1;
    return a.path.localeCompare(b.path);
  });
}
