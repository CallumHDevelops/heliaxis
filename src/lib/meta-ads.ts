import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { graph, type GraphResult } from '@/lib/whatsapp/api';
import {
  adAccountNumber,
  adsFromRows,
  isRateLimit,
  mergeAds,
  periodDates,
  plainAdsError,
  totalsFromRows,
  type Ad,
  type InsightsRow,
  type Totals,
} from '@/lib/ad-spend';

/**
 * Meta ad spend for CRM → Reports: read-only, with a system user token that has ads_read
 * (META_ADS_TOKEN) on the ad account (META_AD_ACCOUNT_ID, with or without "act_"). Off until both
 * are set (the "Show ad spend in your reports" to-do).
 *
 * Figures are kept in cms_kv so Reports doesn't ask Meta every time: earlier days for an hour,
 * today's for 15 minutes (its spend is still going up), the account's currency and time zone for a
 * day. If Meta doesn't answer, the last figures it gave for the same dates are shown with a warning,
 * and Meta is left alone for a while (pause()). Nothing here throws: Reports always loads, with a
 * plain-words line when the figures can't come.
 *
 * Also keeps each new lead's ad, ad set and campaign ids on its enquiry (saveAdIds), so a lead can
 * be put beside its ad by id rather than by name.
 */

// Its own setting: Marketing API versions retire after about a year, sooner than the WhatsApp side's.
const VERSION = () => process.env.META_ADS_GRAPH_VERSION?.trim() || 'v26.0';
const MIN = 60_000;
const HOUR = 60 * MIN;
const PAGES = 20;
const TIMEOUT_MS = 20_000;
/** The periods Reports offers. Only these reach Meta, so the cache stays at three entries. */
const PERIODS = [30, 90, 365];

/** Every status an ad can have: without this filter Meta leaves deleted and archived ads out of ad-level figures. */
const ALL_STATUSES = [
  'ACTIVE',
  'PAUSED',
  'DELETED',
  'PENDING_REVIEW',
  'DISAPPROVED',
  'PREAPPROVED',
  'PENDING_BILLING_INFO',
  'CAMPAIGN_PAUSED',
  'ARCHIVED',
  'ADSET_PAUSED',
  'IN_PROCESS',
  'WITH_ISSUES',
];
const AD_FIELDS = 'campaign_id,campaign_name,ad_id,ad_name,spend,impressions,clicks,actions,account_currency';

const token = () => process.env.META_ADS_TOKEN?.trim() || '';
export const adSpendConfigured = () => !!(token() && process.env.META_AD_ACCOUNT_ID?.trim());

export type AdSpendFigures =
  | { state: 'off' }
  | { state: 'error'; error: string }
  | {
      state: 'ok';
      currency: string;
      since: string;
      until: string;
      fetchedAt: string;
      warning: string | null;
      ads: Ad[];
      /** The account's own totals (deleted ads included); null if Meta didn't give them. */
      account: Totals | null;
    };

type Paged<T> = { data?: T[]; paging?: { cursors?: { after?: string }; next?: string } };

/** Every page of an insights list. `path` already has a query string. */
async function allPages<T>(path: string): Promise<GraphResult<T[]>> {
  const out: T[] = [];
  let after = '';
  for (let i = 0; i < PAGES; i++) {
    const r = await graph<Paged<T>>(`${path}${after ? `&after=${encodeURIComponent(after)}` : ''}`, {
      token: token(),
      version: VERSION(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return r;
    out.push(...(r.data.data ?? []));
    // Stop when there's no next page, not on a short one. Only the cursor: paging.next has the token in it.
    const next = r.data.paging?.next ? r.data.paging.cursors?.after : undefined;
    if (!next || next === after) break;
    after = next;
  }
  return { ok: true, data: out };
}

async function readKv<T>(key: string): Promise<T | null> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', key).maybeSingle();
    return data?.value ? (JSON.parse(data.value) as T) : null;
  } catch {
    return null;
  }
}

async function writeKv(key: string, value: unknown) {
  try {
    await createAdminClient().from('cms_kv').upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() });
  } catch {
    // Not kept: the next Reports load asks Meta again.
  }
}

type Failure = Extract<GraphResult<unknown>, { ok: false }>;
type Pause = { v: 1; account: string; until: number; failure: Failure };

/**
 * After Meta fails, Reports leaves it alone for a while and shows the last figures (or the error):
 * half an hour after a rate limit (asking again only keeps it going), 3 minutes after a timeout or
 * an outage. A wrong key or account isn't remembered, so fixing it shows straight away.
 */
async function paused(account: string): Promise<Failure | null> {
  const p = await readKv<Pause>('meta-ads:pause');
  return p?.v === 1 && p.account === account && Date.now() < p.until ? p.failure : null;
}

async function pause(account: string, f: Failure) {
  const ms = isRateLimit(f) ? 30 * MIN : f.code == null || f.code === 1 || f.code === 2 || /aborted|timed? ?out/i.test(f.error) ? 3 * MIN : 0;
  if (ms) await writeKv('meta-ads:pause', { v: 1, account, until: Date.now() + ms, failure: f } satisfies Pause);
}

type Account = { v: 1; account: string; name: string; currency: string; timeZone: string; at: string };

/** The ad account's currency and time zone (its days run on that time zone). `cool`: Meta's paused, this is why. */
async function accountInfo(account: string, cool: Failure | null): Promise<GraphResult<Account> & { warning?: string }> {
  const key = 'meta-ads:account';
  const hit = await readKv<Account>(key);
  const same = hit?.v === 1 && hit.account === account;
  if (same && Date.now() - Date.parse(hit.at) < 24 * HOUR) return { ok: true, data: hit };
  const r =
    cool ??
    (await graph<{ name?: string; currency?: string; timezone_name?: string }>(`/act_${account}?fields=name,currency,timezone_name`, {
      token: token(),
      version: VERSION(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }));
  if (!r.ok) {
    // Not from the pause itself, or it would never run out.
    if (!cool) await pause(account, r);
    return same ? { ok: true, data: hit, warning: plainAdsError(r, account) } : r;
  }
  const info: Account = {
    v: 1,
    account,
    name: r.data.name || `act_${account}`,
    currency: r.data.currency || 'GBP',
    timeZone: r.data.timezone_name || 'Europe/London',
    at: new Date().toISOString(),
  };
  await writeKv(key, info);
  return { ok: true, data: info };
}

type Piece = { v: 1; account: string; since: string; until: string; at: string; ads: Ad[]; total: Totals | null };

/** One stretch of dates from Meta: each ad's figures, and the account's total as a check. */
async function fetchPiece(account: string, since: string, until: string): Promise<GraphResult<Piece>> {
  const range = encodeURIComponent(JSON.stringify({ since, until }));
  const filter = encodeURIComponent(JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ALL_STATUSES }]));
  const ads = (filtered: boolean) =>
    allPages<InsightsRow>(`/act_${account}/insights?level=ad&fields=${AD_FIELDS}&time_range=${range}&limit=500${filtered ? `&filtering=${filter}` : ''}`);
  const [first, total] = await Promise.all([ads(true), allPages<InsightsRow>(`/act_${account}/insights?level=account&fields=spend,actions&time_range=${range}`)]);
  let rows = first;
  // If Meta won't take the status filter, the account total below still catches deleted ads' spend.
  if (!rows.ok && rows.code === 100 && /filter|effective_status/i.test(rows.error)) rows = await ads(false);
  if (!rows.ok) return rows;
  return {
    ok: true,
    data: { v: 1, account, since, until, at: new Date().toISOString(), ads: adsFromRows(rows.data), total: total.ok ? totalsFromRows(total.data) : null },
  };
}

/** A stretch of dates, from cms_kv while it's fresh enough, else from Meta (the old copy if Meta fails or is paused). */
async function piece(
  key: string,
  account: string,
  since: string,
  until: string,
  maxAge: number,
  cool: Failure | null
): Promise<GraphResult<Piece> & { warning?: string }> {
  const hit = await readKv<Piece>(key);
  const same = hit?.v === 1 && hit.account === account && hit.since === since && hit.until === until;
  if (same && Date.now() - Date.parse(hit.at) < maxAge) return { ok: true, data: hit };
  const r = cool ?? (await fetchPiece(account, since, until));
  if (r.ok) {
    await writeKv(key, r.data);
    return r;
  }
  if (!cool) await pause(account, r);
  return same ? { ok: true, data: hit, warning: plainAdsError(r, account) } : r;
}

/** Ad spend for the last `days` days (today included) in the ad account's time zone, each ad on its own. */
export async function adSpendFigures(days: number): Promise<AdSpendFigures> {
  if (!adSpendConfigured()) return { state: 'off' };
  if (!PERIODS.includes(days)) return { state: 'error', error: 'Ad spend is shown for 30 days, 90 days or 1 year.' };
  // It goes in a header, where a line break fails before the request is sent (with the key in the error).
  if (/\s/.test(token())) return { state: 'error', error: 'META_ADS_TOKEN in Vercel has a space or line break in it: paste it again on one line, then redeploy.' };
  const account = adAccountNumber(process.env.META_AD_ACCOUNT_ID);
  if (!account) return { state: 'error', error: 'META_AD_ACCOUNT_ID in Vercel should be your ad account number from Ads Manager, like act_1234567890.' };
  try {
    const cool = await paused(account);
    const info = await accountInfo(account, cool);
    if (!info.ok) return { state: 'error', error: plainAdsError(info, account) };
    const { since, yesterday, today } = periodDates(days, info.data.timeZone);
    const [past, now] = await Promise.all([
      piece(`meta-ads:${days}`, account, since, yesterday, HOUR, cool),
      piece('meta-ads:today', account, today, today, 15 * MIN, cool),
    ]);
    if (!past.ok) return { state: 'error', error: plainAdsError(past, account) };
    if (!now.ok) return { state: 'error', error: plainAdsError(now, account) };
    const [a, b] = [past.data.total, now.data.total];
    const warning = past.warning || now.warning || info.warning || null;
    return {
      state: 'ok',
      currency: info.data.currency,
      since,
      until: today,
      fetchedAt: [past.data.at, now.data.at].sort()[0],
      warning: warning && `Meta didn’t send new figures just now, so these are the last ones it gave. ${warning}`,
      ads: mergeAds(past.data.ads, now.data.ads),
      account: a && b ? { spend: a.spend + b.spend, metaLeads: a.metaLeads + b.metaLeads } : null,
    };
  } catch (e) {
    console.error('Meta ad spend failed', e);
    return { state: 'error', error: 'The ad figures couldn’t be loaded just now. Try again in a minute.' };
  }
}

/**
 * A lead's ad, ad set and campaign ids on its enquiry (ad-spend.sql). Before that's run the columns
 * aren't there, the update fails and nothing changes. `onlyIfMissing` fills in an older lead
 * without touching one that has them. Never throws.
 */
export async function saveAdIds(
  enquiryId: string,
  lead: { ad_id?: string | null; adset_id?: string | null; campaign_id?: string | null },
  onlyIfMissing = false
) {
  const id = (v: string | null | undefined) => (v && /^\d{1,30}$/.test(String(v).trim()) ? String(v).trim() : null);
  const ids = { meta_ad_id: id(lead.ad_id), meta_adset_id: id(lead.adset_id), meta_campaign_id: id(lead.campaign_id) };
  if (!ids.meta_ad_id && !ids.meta_adset_id && !ids.meta_campaign_id) return;
  try {
    let q = createAdminClient().from('enquiries').update(ids).eq('id', enquiryId);
    if (onlyIfMissing) q = q.is('meta_ad_id', null);
    await q;
  } catch {
    // Matching falls back to the ad's name.
  }
}
