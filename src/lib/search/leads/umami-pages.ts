import 'server-only';
import { getUmamiConfig } from '@/lib/umami';
import { parseUmamiPages, type PageSessions } from './aggregate';

/**
 * Umami sessions per landing page for a period (M8 funnel). Uses the same free share link (or API key) as the
 * analytics page. Umami's share API gives per-page rows through `metrics`:
 *   1. `metrics/expanded?type=entry` → visits (sessions) that started on each page, where the Umami version has it;
 *   2. `metrics?type=entry` → the same count, in the plain shape;
 *   3. failing both, `metrics?type=path` (or `url` on older Umami) → page views, which are NOT sessions: the page says so.
 * The site total comes from `stats` (visits). Nothing here is paid.
 */

export type SessionsResult =
  | { state: 'ok'; pages: PageSessions; totalVisits: number | null; endpoint: string }
  | { state: 'off'; error: string }
  | { state: 'error'; error: string };

type Auth = { headers: Record<string, string>; websiteId: string };

async function auth(): Promise<Auth | null> {
  const { websiteId, apiKey, apiBase, shareId } = getUmamiConfig();
  const base = { Accept: 'application/json', 'User-Agent': 'HeliaxisAnalytics/1.0' };
  if (shareId) {
    const r = await fetch(`${apiBase}/share/${encodeURIComponent(shareId)}`, { headers: base, next: { revalidate: 300 } });
    if (!r.ok) throw new Error(`Umami share link could not be read (${r.status})`);
    const d = (await r.json()) as { token?: string; websiteId?: string };
    if (!d.token || !d.websiteId) throw new Error('Umami share link gave no token');
    return { websiteId: d.websiteId, headers: { ...base, 'x-umami-share-token': d.token, 'x-umami-share-context': '1' } };
  }
  if (apiKey && websiteId) return { websiteId, headers: { ...base, 'x-umami-api-key': apiKey } };
  return null;
}

async function get(path: string, a: Auth): Promise<unknown> {
  const { apiBase } = getUmamiConfig();
  const r = await fetch(`${apiBase}${path}`, { headers: a.headers, next: { revalidate: 600 } });
  if (!r.ok) throw new Error(`Umami ${r.status}`);
  return r.json();
}

/** Sessions per landing page between two instants (ms since 1970). */
export async function landingSessions(startAt: number, until: number): Promise<SessionsResult> {
  if (!getUmamiConfig().canFetchStats) return { state: 'off', error: 'Umami is not connected: set NEXT_PUBLIC_UMAMI_SHARE_URL (or UMAMI_API_KEY) in Vercel.' };
  try {
    const endAt = Math.min(until, Date.now());
    const a = await auth();
    if (!a) return { state: 'off', error: 'Umami is not connected.' };
    const w = `/websites/${a.websiteId}`;
    const q = `startAt=${startAt}&endAt=${endAt}`;
    const stats = (await get(`${w}/stats?${q}`, a).catch(() => null)) as Record<string, unknown> | null;
    const v = stats?.visits;
    const totalVisits = typeof v === 'number' ? v : v && typeof v === 'object' && 'value' in v ? Number((v as { value: unknown }).value) : null;

    const tries: { path: string; field: 'y' | 'visits' | 'pageviews'; kind: PageSessions['kind'] }[] = [
      { path: `${w}/metrics/expanded?${q}&type=entry&limit=500`, field: 'visits', kind: 'visits' },
      { path: `${w}/metrics?${q}&type=entry&limit=500`, field: 'y', kind: 'visits' },
      { path: `${w}/metrics?${q}&type=path&limit=500`, field: 'y', kind: 'pageviews' },
      { path: `${w}/metrics?${q}&type=url&limit=500`, field: 'y', kind: 'pageviews' },
    ];
    for (const t of tries) {
      const raw = await get(t.path, a).catch(() => null);
      const byPath = parseUmamiPages(raw, t.field);
      if (byPath.size) return { state: 'ok', pages: { kind: t.kind, byPath }, totalVisits: Number.isFinite(totalVisits) ? totalVisits : null, endpoint: t.path.split('?')[0].replace(w, '') + `?type=${/type=(\w+)/.exec(t.path)?.[1]}` };
    }
    return { state: 'ok', pages: { kind: 'visits', byPath: new Map() }, totalVisits: Number.isFinite(totalVisits) ? totalVisits : null, endpoint: 'none' };
  } catch (e) {
    return { state: 'error', error: e instanceof Error ? e.message : 'Umami could not be read just now.' };
  }
}
