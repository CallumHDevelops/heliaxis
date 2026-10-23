import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { adNameNow } from '@/lib/ad-names';
import { isAdLead, metaAdName } from '@/lib/lead-source';
import { cachedAdNames } from '@/lib/meta-ads';
import { missingColumn } from '@/lib/projects/server';
import { adMessageFor, choicesFor, cleanFirst, DEFAULT_FIRST, type AdKey, type FirstMessages, type LeadAd } from './first-messages-shared';

/**
 * First messages to new Meta leads on the server: the choices (cms_kv), each lead's ad, and the ads
 * that have brought leads lately, for WhatsApp templates → First messages. The rules are in
 * first-messages-shared.ts; queueFirstContact (inbox.ts) sends it.
 */

const KEY = 'whatsapp-first-messages';
/** How far back the First messages list looks for ads that brought leads. */
export const ADS_DAYS = 90;

export async function getFirstMessages(): Promise<FirstMessages> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    return cleanFirst(data?.value ? JSON.parse(data.value) : {});
  } catch {
    return DEFAULT_FIRST;
  }
}

export async function saveFirstMessages(f: FirstMessages) {
  const { error } = await createAdminClient()
    .from('cms_kv')
    .upsert({ key: KEY, value: JSON.stringify(cleanFirst(f)), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** WHATSAPP_AUTO_FIRST_MESSAGE=true in Vercel: first messages go by itself, whatever the page says. */
export const autoFirstInVercel = () => process.env.WHATSAPP_AUTO_FIRST_MESSAGE === 'true';

/** First messages go by themselves: switched on in WhatsApp templates → First messages, or in Vercel. */
export const sendsByItself = (f: FirstMessages) => f.auto || autoFirstInVercel();

/**
 * A customer's ad, for choosing their first message: Meta's id for it (ad-spend.sql; none before
 * that's run) and its names, when they came in and now. Nobody's ad when they didn't come from one.
 */
export async function leadAdOf(e: { id: string; source: string | null }): Promise<LeadAd> {
  const was = metaAdName(e.source);
  if (!isAdLead(e.source)) return { names: [] };
  const [row, names] = await Promise.all([
    createAdminClient()
      .from('enquiries')
      .select('meta_ad_id')
      .eq('id', e.id)
      .maybeSingle<{ meta_ad_id: string | null }>()
      .then(
        (r) => (r.error ? null : r.data),
        () => null
      ),
    cachedAdNames(),
  ]);
  const id = row?.meta_ad_id ?? null;
  return { id, names: [was, names ? adNameNow(names, was, id)?.name : null] };
}

/**
 * The template a customer's chat offers first (the draft of their first message): the one chosen for
 * the ad they came from, else `general` (the general first message). Null when neither is set.
 */
export async function firstTemplateFor(e: { id: string; source: string | null }, general: string | null): Promise<string | null> {
  const first = await getFirstMessages();
  const own = first.byAd.length && isAdLead(e.source) ? adMessageFor(first.byAd, await leadAdOf(e)) : null;
  return own?.template || general || null;
}

/** One ad on the First messages list. */
export type AdRow = AdKey & {
  /** Its leads in the last ADS_DAYS days, and when the newest came in (null: none lately, only chosen before). */
  leads: number;
  lastAt: string | null;
  /** The template its leads get; '' = the general first message. */
  template: string;
};

/**
 * The ads that brought Meta leads in the last ADS_DAYS days, each under its name now (one row per
 * name, so the same video in two ad sets is one row), busiest first, with what's chosen for each;
 * then any ad chosen for before that hasn't brought a lead lately.
 */
export async function adRows(first: FirstMessages, now = Date.now()): Promise<AdRow[]> {
  const db = createAdminClient();
  const since = new Date(now - ADS_DAYS * 86_400_000).toISOString();
  const read = (cols: string) => db.from('enquiries').select(cols).ilike('source', 'meta:%').gte('created_at', since).order('created_at', { ascending: false }).limit(5000);
  let r = await read('source, meta_ad_id, created_at');
  if (r.error && missingColumn(r.error)) r = await read('source, created_at');
  const leads = (r.error ? [] : (r.data ?? [])) as unknown as { source: string | null; meta_ad_id?: string | null; created_at: string }[];
  const names = leads.length ? await cachedAdNames() : null;

  const rows = new Map<string, AdRow & { was: string[] }>();
  for (const l of leads) {
    const was = metaAdName(l.source);
    if (!was) continue;
    const id = l.meta_ad_id ?? null;
    const name = (names && adNameNow(names, was, id)?.name) || was;
    const key = name.toLowerCase();
    const row = rows.get(key) ?? { name, was: [], ids: [], leads: 0, lastAt: null, template: '' };
    row.leads++;
    if (!row.lastAt || l.created_at > row.lastAt) row.lastAt = l.created_at;
    if (id && !row.ids.includes(id)) row.ids.push(id);
    if (was.toLowerCase() !== key && !row.was.some((w) => w.toLowerCase() === was.toLowerCase())) row.was.push(was);
    rows.set(key, row);
  }
  const out = [...rows.values()].sort((a, b) => b.leads - a.leads || (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  const shown = new Set<string>();
  for (const row of out) {
    const m = choicesFor(first.byAd, row)[0];
    if (m) {
      row.template = m.template;
      shown.add(m.name.toLowerCase());
    }
  }
  for (const m of first.byAd) {
    if (shown.has(m.name.toLowerCase()) || out.some((row) => choicesFor([m], row).length)) continue;
    out.push({ name: m.name, was: [], ids: m.ids, leads: 0, lastAt: null, template: m.template });
  }
  return out;
}
