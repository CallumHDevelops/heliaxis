import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdLead, sourceNow, type SourceNow } from '@/lib/lead-source';
import { cachedAdNames } from '@/lib/meta-ads';

/**
 * Where leads came from, in words, with their Meta ad's name now (src/lib/lead-source.ts sourceNow),
 * for every page that shows it: the job record's Customer card, Enquiries, the dashboard's New Meta
 * leads, search and the CRM's enquiries to sort. enquiries.source keeps the name the ad had when they
 * came in ("meta: Video 1"), as Reports matches leads by it; only what's shown follows a rename.
 *
 * Cheap enough for every load: only when a lead came from a Meta ad, one cms_kv read for Meta's
 * names as Reports last kept them and the names the CRM has seen (meta-ads.ts cachedAdNames, which
 * never asks Meta), and the ad ids (ad-spend.sql) of leads given without one. Never throws: whatever
 * can't be read leaves the name the lead came in with.
 */

/** A lead: `meta_ad_id` undefined when it wasn't read (it's looked up here), null when it has none. */
export type SourceLead = { id: string; source: string | null; meta_ad_id?: string | null };

const BATCH = 100;

/** Leads' ad ids, by enquiry id. None before ad-spend.sql has been run, or when the read fails. */
async function adIds(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  try {
    const db = createAdminClient();
    const batches: string[][] = [];
    for (let i = 0; i < unique.length; i += BATCH) batches.push(unique.slice(i, i + BATCH));
    const reads = await Promise.all(batches.map((b) => db.from('enquiries').select('id, meta_ad_id').in('id', b).not('meta_ad_id', 'is', null)));
    for (const r of reads) for (const row of r.error ? [] : ((r.data ?? []) as { id: string; meta_ad_id: string | null }[])) if (row.meta_ad_id) out.set(row.id, row.meta_ad_id);
  } catch {
    // The names the leads came in with will do.
  }
  return out;
}

/** Each lead's source now, by enquiry id. */
export async function sourcesNow(leads: SourceLead[]): Promise<Map<string, SourceNow>> {
  const fromAds = leads.filter((l) => isAdLead(l.source));
  const [ids, names] = fromAds.length
    ? await Promise.all([adIds(fromAds.filter((l) => l.meta_ad_id === undefined).map((l) => l.id)), cachedAdNames()])
    : [new Map<string, string>(), null];
  return new Map(leads.map((l) => [l.id, sourceNow(l.source, l.meta_ad_id ?? ids.get(l.id), names)]));
}

/** One lead's source now. */
export async function sourceNowOf(lead: SourceLead): Promise<SourceNow> {
  return (await sourcesNow([lead])).get(lead.id) ?? sourceNow(lead.source, null, null);
}
