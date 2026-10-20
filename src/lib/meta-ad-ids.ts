import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { graph } from '@/lib/whatsapp/api';
import { isRateLimit } from '@/lib/ad-spend';
import { leadsToBackfill, readLeadBatch, readMisses, type LeadRow } from '@/lib/ad-names';
import { readKv, rememberNames, updateAdIds, writeKv, type LeadNames } from '@/lib/meta-ads';

/**
 * Every Meta lead with its ad, by Meta's ids, for CRM → Reports. Leads from before ad-spend.sql
 * (or imported before it) only have the name their ad had when they came in ("meta: Video 4"),
 * which stops fitting once the ad is renamed. After Reports has answered (next/server after()),
 * this asks Meta's Lead API for up to 50 of them in one batch request, newest first, and saves
 * their ad, ad set and campaign ids (nothing else on the lead changes). It also keeps the names
 * leads with an ad id came in with (meta-ads.ts rememberNames), so a lead that only has a name
 * finds its ad too.
 *
 * Meta keeps leads for 90 days. Older ones, deleted ones and ones not from an ad are remembered
 * (cms_kv 'meta-ads:lead-misses') and not asked for again for 30 days. Before ad-spend.sql there's
 * nowhere to save the ids, so only the names are kept: Meta's answer says which ad "Video 4" was,
 * even once the CRM's copies of Meta's figures only have the new names. A no-op before
 * whatsapp.sql. Never throws.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const RUN_KEY = 'meta-ads:lead-run';
const MISSES_KEY = 'meta-ads:lead-misses';
/** Before ad-spend.sql: leads whose names are kept already (nowhere on the lead says so), asked again after 30 days. */
const NAMED_KEY = 'meta-ads:lead-names-kept';
const BATCH = 50; // Meta's most in one batch request
const LEAD_FIELDS = 'id,created_time,ad_id,adset_id,campaign_id,ad_name,adset_name,campaign_name,is_organic';

type Db = ReturnType<typeof createAdminClient>;
type Run = { v: 1; at: number; until: number };

/** "meta: Video 4" → "Video 4" ('' for other sources). */
const formName = (source: string | null) => /^meta\s*:(.*)$/i.exec(source?.trim() ?? '')?.[1].trim() ?? '';

/**
 * Up to 50 leads' ad ids from Meta's Lead API (fetchLead's token). Returns how long to leave Meta
 * alone (ms): an hour after a rate limit, 5 minutes after a timeout or an outage, 6 hours when
 * nothing came back (a key that can't see the leads), else 0.
 */
async function backfillAdIds(db: Db): Promise<number> {
  const token = (process.env.META_PAGE_ACCESS_TOKEN || process.env.WHATSAPP_TOKEN)?.trim();
  // It goes in a header, where a line break fails before the request is sent (with the key in the error, which would be logged).
  if (!token || /\s/.test(token)) return 0;
  const withIds = await db
    .from('enquiries')
    .select('id, source, meta_lead_id, meta_ad_id, created_at')
    .not('meta_lead_id', 'is', null)
    .is('meta_ad_id', null)
    .order('created_at', { ascending: false })
    .limit(2000);
  // Before ad-spend.sql (no meta_ad_id) Meta's answers still say which ad each old name was: only the names are kept.
  const namesOnly = !!withIds.error;
  const { data, error } = namesOnly
    ? await db
        .from('enquiries')
        .select('id, source, meta_lead_id, created_at')
        .not('meta_lead_id', 'is', null)
        .ilike('source', 'meta:%')
        .order('created_at', { ascending: false })
        .limit(2000)
    : withIds;
  // Before whatsapp.sql (meta_lead_id): nothing to do yet.
  if (error || !data?.length) return 0;
  const misses = readMisses(await readKv<unknown>(MISSES_KEY));
  const named = namesOnly ? readMisses(await readKv<unknown>(NAMED_KEY)) : null;
  const ask = leadsToBackfill(data as LeadRow[], named ? { v: 1, ids: { ...misses.ids, ...named.ids } } : misses, Date.now(), BATCH);
  if (!ask.length) return 0;

  // One request for them all; each answer comes back on its own, so a lead Meta no longer has doesn't sink the rest.
  const body = new URLSearchParams({
    batch: JSON.stringify(ask.map((l) => ({ method: 'GET', relative_url: `${l.meta_lead_id}?fields=${LEAD_FIELDS}` }))),
    include_headers: 'false',
  });
  const r = await graph<unknown>('/', {
    method: 'POST',
    token,
    body: body.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) {
    console.error('Meta lead ad ids failed', r.error);
    return isRateLimit(r) ? HOUR : r.code == null || r.code === 1 || r.code === 2 ? 5 * MIN : 6 * HOUR;
  }
  const out = readLeadBatch(ask, r.data, Date.now());
  const names: LeadNames[] = [];
  for (const { row, lead } of out.found) {
    if (!namesOnly) await updateAdIds(row.id, lead, true);
    // What Meta calls the ad, and what the lead says it was called when it came in.
    names.push(
      { adId: lead.ad_id, adName: lead.ad_name, campaignId: lead.campaign_id, campaignName: lead.campaign_name, at: lead.created_time ?? row.created_at },
      { adId: lead.ad_id, adName: formName(row.source), at: row.created_at }
    );
  }
  if (names.length) await rememberNames(names);
  if (out.missed.length) {
    const now = Date.now();
    for (const id of out.missed) misses.ids[id] = now;
    await writeKv(MISSES_KEY, readMisses(misses, now));
  }
  // Not in the misses: once ad-spend.sql is run these are asked again straight away, for their ids (Meta keeps leads 90 days).
  if (named && out.found.length) {
    const now = Date.now();
    for (const { row } of out.found) named.ids[String(row.meta_lead_id).trim()] = now;
    await writeKv(NAMED_KEY, readMisses(named, now));
  }
  if (out.errors.length) console.error('Meta lead ad ids: some leads not read', out.errors.slice(0, 3));
  return out.errors.some(isRateLimit) ? HOUR : out.errors.length && !out.found.length ? 6 * HOUR : 0;
}

/** The names leads with an ad id came in with ("meta: Video 4" on a lead from ad 123: ad 123 was called Video 4). */
async function learnLeadNames(db: Db) {
  const { data, error } = await db
    .from('enquiries')
    .select('meta_ad_id, source, created_at')
    .not('meta_ad_id', 'is', null)
    .ilike('source', 'meta:%')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error || !data?.length) return;
  await rememberNames(data.map((e) => ({ adId: e.meta_ad_id, adName: formName(e.source), at: e.created_at })));
}

/**
 * After a Reports load: older leads' ad ids from Meta, then the names leads came in with. At most
 * every 5 minutes (a "Refresh from Meta" that Meta was asked for doesn't wait), not while Meta's
 * being left alone, and not while the last batch is still running.
 */
export async function afterReports({ force = false } = {}) {
  try {
    const now = Date.now();
    const run = await readKv<Run>(RUN_KEY);
    if (run?.v === 1 && (now < run.until || (!force && now - run.at < 5 * MIN))) return;
    // Held a minute while the batch runs (it gives up after 25 seconds), so a Refresh meanwhile doesn't ask for the same leads.
    await writeKv(RUN_KEY, { v: 1, at: now, until: now + MIN } satisfies Run);
    const db = createAdminClient();
    const wait = await backfillAdIds(db);
    await writeKv(RUN_KEY, { v: 1, at: now, until: wait ? now + wait : 0 } satisfies Run);
    await learnLeadNames(db);
  } catch (e) {
    console.error('Meta lead ad ids failed', e);
  }
}
