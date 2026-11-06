import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { lookupOutcode, outcodeOf } from '@/lib/booking/geo';
import { sourceGroup, type SourceGroup } from '@/lib/lead-source';

/** Where a period's leads came from, by postcode area (the part before the space, "NP20"), with their source and sales. */
export type LeadArea = { outcode: string; town: string; lat: number; lng: number; leads: number; won: number; bySource: Record<SourceGroup, number> };
export type LeadGeo = { days: number; total: number; located: number; unplaced: number; areas: LeadArea[]; bySource: Record<SourceGroup, number> };

const MAX_AREAS = 150;

export async function leadAreas(days: number): Promise<LeadGeo> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = createAdminClient();
  const { data: enq } = await db.from('enquiries').select('id, source, postcode').gte('created_at', since).limit(10000);
  const rows = enq ?? [];
  const ids = rows.map((r) => r.id as string);
  // Which of them were sold (an accepted job).
  const wonIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('crm_projects').select('enquiry_id').in('enquiry_id', ids.slice(i, i + 200)).not('accepted_at', 'is', null);
    for (const r of data ?? []) wonIds.add(r.enquiry_id as string);
  }
  const bySource: Record<SourceGroup, number> = { meta: 0, website: 0, whatsapp: 0, other: 0 };
  const groups = new Map<string, { leads: number; won: number; bySource: Record<SourceGroup, number> }>();
  for (const r of rows) {
    const g = sourceGroup(r.source as string | null);
    bySource[g] += 1;
    const oc = outcodeOf(r.postcode as string | null);
    if (!oc) continue;
    const a = groups.get(oc) ?? { leads: 0, won: 0, bySource: { meta: 0, website: 0, whatsapp: 0, other: 0 } };
    a.leads += 1;
    a.bySource[g] += 1;
    if (wonIds.has(r.id as string)) a.won += 1;
    groups.set(oc, a);
  }
  const top = [...groups.entries()].sort((a, b) => b[1].leads - a[1].leads).slice(0, MAX_AREAS);
  const areas: LeadArea[] = [];
  const found = await Promise.all(top.map(async ([oc]) => [oc, await lookupOutcode(oc).catch(() => null)] as const));
  const where = new Map(found);
  for (const [oc, a] of top) {
    const hit = where.get(oc);
    if (!hit) continue;
    areas.push({ outcode: oc, town: hit.town, lat: hit.ll.lat, lng: hit.ll.lng, ...a });
  }
  const located = areas.reduce((n, a) => n + a.leads, 0);
  return { days, total: rows.length, located, unplaced: rows.length - located, areas, bySource };
}
