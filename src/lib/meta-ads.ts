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
  type PastNames,
  type Refresh,
  type Totals,
} from '@/lib/ad-spend';
import {
  currentFromRows,
  emptyHistory,
  mergeHistory,
  nameLookup,
  noteAds,
  noteName,
  pastNames,
  readHistory,
  trimHistory,
  withCurrentNames,
  type AdNameLookup,
  type AdRow,
  type CurrentAd,
  type NameHistory,
} from '@/lib/ad-names';

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
 * Ads can be renamed in Ads Manager whenever, so the names shown are Meta's current ones, from its
 * list of ads (kept 10 minutes), not the ones inside the figures. Every name seen on an ad or
 * campaign is kept too ('meta-ads:names-seen', src/lib/ad-names.ts), so a lead that came in under
 * an old name ("meta: Video 4") stays with its ad. "Refresh from Meta" in Reports asks for the
 * names and today's figures straight away, at most once a minute.
 *
 * Also keeps each new lead's ad, ad set and campaign ids on its enquiry (saveAdIds), so a lead can
 * be put beside its ad by id rather than by name; src/lib/meta-ad-ids.ts fills them in for older leads.
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
/** Meta's ad list errors on DELETED (deleted ads are looked up by id instead) and leaves ARCHIVED out unless asked. */
const LISTED = ALL_STATUSES.filter((s) => s !== 'DELETED');
const AD_LIST_FIELDS = encodeURIComponent('id,name,created_time,campaign_id,campaign{name},adset_id,adset{name}');
const NAMES_KEY = 'meta-ads:names';
const SEEN_KEY = 'meta-ads:names-seen';

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
      /** Every name each ad and campaign has had, for matching leads that came in under an old one. */
      pastNames: PastNames;
      todayAt: string;
      pastAt: string;
      /** When Meta's current names were read; null if they couldn't be (the figures' own names are shown). */
      namesAt: string | null;
      refresh: Refresh | null;
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

/** A cms_kv value (null if it isn't there or can't be read). Also used by src/lib/meta-ad-ids.ts. */
export async function readKv<T>(key: string): Promise<T | null> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', key).maybeSingle();
    return data?.value ? (JSON.parse(data.value) as T) : null;
  } catch {
    return null;
  }
}

export async function writeKv(key: string, value: unknown) {
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

/**
 * A stretch of dates, from cms_kv while it's fresh enough, else from Meta (the old copy if Meta
 * fails or is paused). `saw` hears the names in the copy before it's replaced, and in the new one.
 */
async function piece(
  key: string,
  account: string,
  since: string,
  until: string,
  maxAge: number,
  cool: Failure | null,
  saw: (ads: Ad[], at: string) => void
): Promise<GraphResult<Piece> & { warning?: string }> {
  const hit = await readKv<Piece>(key);
  if (hit?.v === 1 && hit.account === account) saw(hit.ads ?? [], hit.at);
  const same = hit?.v === 1 && hit.account === account && hit.since === since && hit.until === until;
  if (same && Date.now() - Date.parse(hit.at) < maxAge) return { ok: true, data: hit };
  const r = cool ?? (await fetchPiece(account, since, until));
  if (r.ok) {
    saw(r.data.ads, r.data.at);
    await writeKv(key, r.data);
    return r;
  }
  if (!cool) await pause(account, r);
  return same ? { ok: true, data: hit, warning: plainAdsError(r, account) } : r;
}

// ── Names: Meta's current ones, and every one the CRM has seen ──

type Names = { v: 1; account: string; at: string; ads: Record<string, CurrentAd> };

/** Meta's list of the account's ads now (deleted ones aside), with each one's ad set and campaign names. */
async function fetchNames(account: string): Promise<GraphResult<Record<string, CurrentAd>>> {
  const status = encodeURIComponent(JSON.stringify(LISTED));
  const list = (filtered: boolean) => allPages<AdRow>(`/act_${account}/ads?fields=${AD_LIST_FIELDS}&limit=100${filtered ? `&effective_status=${status}` : ''}`);
  let r = await list(true);
  // If Meta won't take the status filter, live and paused ads will do: the others keep the figures' names.
  if (!r.ok && r.code === 100 && /status/i.test(r.error)) r = await list(false);
  return r.ok ? { ok: true, data: currentFromRows(r.data) } : r;
}

/** Ads in the figures that Meta's list leaves out (deleted ones), by id, 50 at a time (Meta's most). */
async function fetchNamesById(account: string, ids: string[]): Promise<Record<string, CurrentAd>> {
  const out: Record<string, CurrentAd> = {};
  for (let i = 0; i < Math.min(ids.length, 100); i += 50) {
    const r = await graph<Record<string, AdRow>>(`/?ids=${ids.slice(i, i + 50).join(',')}&fields=${AD_LIST_FIELDS}`, {
      token: token(),
      version: VERSION(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // One Meta can't find fails the lot: those ads keep the names in the figures.
    if (!r.ok) {
      await pause(account, r);
      break;
    }
    Object.assign(out, currentFromRows(Object.values(r.data ?? {})));
  }
  return out;
}

/**
 * Meta's current ad, ad set and campaign names, from cms_kv while under 10 minutes old (unless
 * `fresh`), else from Meta. If Meta fails or is paused, the last ones it gave (null if none).
 * `figures`: the ad ids in the figures, so ones Meta's list leaves out are looked up by id.
 */
async function currentNames(account: string, cool: Failure | null, fresh: boolean, figures: Promise<string[]>): Promise<Names | null> {
  const hit = await readKv<Names>(NAMES_KEY);
  const same = hit?.v === 1 && hit.account === account && hit.ads ? hit : null;
  if (same && !fresh && Date.now() - Date.parse(same.at) < 10 * MIN) return same;
  if (cool) return same;
  const r = await fetchNames(account);
  if (!r.ok) {
    await pause(account, r);
    return same;
  }
  const missing = [...new Set(await figures)].filter((id) => !Object.hasOwn(r.data, id));
  const names: Names = { v: 1, account, at: new Date().toISOString(), ads: { ...(missing.length ? await fetchNamesById(account, missing) : {}), ...r.data } };
  await writeKv(NAMES_KEY, names);
  return names;
}

/** Meta's current names in the shape the history notes. */
const listed = (n: Names) => Object.entries(n.ads).map(([id, a]) => ({ id, name: a.name, campaignId: a.campaignId, campaignName: a.campaignName }));

/** "Refresh from Meta": at most once a minute, and not while Meta's being left alone (pause()). */
async function mayRefresh(account: string, cool: Failure | null): Promise<Refresh> {
  if (cool) return 'paused';
  const last = await readKv<{ v: 1; account: string; at: number }>('meta-ads:refresh');
  if (last?.v === 1 && last.account === account && Date.now() - last.at < MIN) return 'wait';
  await writeKv('meta-ads:refresh', { v: 1, account, at: Date.now() });
  return 'done';
}

/**
 * The names the CRM has seen. The first time, the ones in its copies of Meta's figures too (they
 * were fetched before any rename since), so `news` says it's worth saving.
 */
async function loadHistory(): Promise<{ seen: NameHistory; news: boolean }> {
  const raw = await readKv<unknown>(SEEN_KEY);
  if (raw) return { seen: readHistory(raw), news: false };
  const seen = emptyHistory();
  let news = false;
  const pieces = await Promise.all([...PERIODS.map((d) => `meta-ads:${d}`), 'meta-ads:today'].map((k) => readKv<Piece>(k)));
  for (const p of pieces) if (p?.v === 1) news = noteAds(seen, p.ads ?? [], Date.parse(p.at)) || news;
  return { seen, news };
}

/**
 * Saves the names seen, with any another request saved meanwhile (a lead arriving, another Reports
 * load), so neither loses the other's. Kept to size.
 */
async function saveHistory(seen: NameHistory) {
  await writeKv(SEEN_KEY, trimHistory(mergeHistory(readHistory(await readKv<unknown>(SEEN_KEY)), seen)));
}

/** Names a lead came in with: its ad id and the ad's (and campaign's) name. `at`: when the lead came in. */
export type LeadNames = { adId?: string | null; adName?: string | null; campaignId?: string | null; campaignName?: string | null; at?: string | number | null };

/** Keeps the names leads came in with beside their ad and campaign ids, so a lead with only the name still finds its ad after a rename. Never throws. */
export async function rememberNames(list: LeadNames[]) {
  try {
    const { seen, news: first } = await loadHistory();
    let news = first;
    for (const x of list) {
      const at = typeof x.at === 'number' ? x.at : Date.parse(x.at ?? '') || Date.now();
      if (x.adId) news = noteName(seen, 'ads', String(x.adId), x.adName, at) || news;
      if (x.campaignId) news = noteName(seen, 'campaigns', String(x.campaignId), x.campaignName, at) || news;
    }
    if (news) await saveHistory(seen);
  } catch {
    // Kept next time: Reports reads the names leads with an ad id came in with.
  }
}

/** The ad account number when ad spend is set up and its key looks right, else null. */
const configuredAccount = () => (adSpendConfigured() && !/\s/.test(token()) ? adAccountNumber(process.env.META_AD_ACCOUNT_ID) : null);

/**
 * For putting a lead's ad's name now beside it on other pages (src/lib/ad-names.ts leadAdName):
 * each ad's and campaign's current name by id, and old ad names → the name their ad has now. Meta's
 * list as Reports keeps it (asked for again when over 10 minutes old, never while Meta's paused),
 * then the names the CRM has seen. Never throws.
 */
export async function currentAdNames(): Promise<AdNameLookup> {
  try {
    const account = configuredAccount();
    const [names, { seen, news }] = await Promise.all([
      account ? paused(account).then((cool) => currentNames(account, cool, false, Promise.resolve([]))) : null,
      loadHistory(),
    ]);
    if ((names && noteAds(seen, listed(names), Date.parse(names.at))) || news) await saveHistory(seen);
    return nameLookup(names?.ads, seen);
  } catch {
    return nameLookup(null, emptyHistory());
  }
}

/**
 * currentAdNames from cms_kv alone, for pages that show a lead's source on every load
 * (src/lib/lead-source-server.ts): Meta's list as Reports last kept it and the names the CRM has
 * seen, in one read. Never asks Meta and never writes. Null when neither is there or the read fails.
 */
export async function cachedAdNames(): Promise<AdNameLookup | null> {
  try {
    const { data, error } = await createAdminClient().from('cms_kv').select('key, value').in('key', [NAMES_KEY, SEEN_KEY]);
    if (error || !data?.length) return null;
    const value = (key: string): unknown => {
      try {
        const v: unknown = data.find((r) => r.key === key)?.value;
        return typeof v === 'string' ? JSON.parse(v) : (v ?? null);
      } catch {
        return null;
      }
    };
    const names = value(NAMES_KEY) as Names | null;
    // Another ad account's names (META_AD_ACCOUNT_ID changed) aren't these leads' ads.
    const account = configuredAccount();
    const listed = names?.v === 1 && names.ads && (!account || names.account === account) ? names.ads : null;
    return nameLookup(listed, readHistory(value(SEEN_KEY)));
  } catch {
    return null;
  }
}

/**
 * Ad spend for the last `days` days (today included) in the ad account's time zone, each ad on its
 * own under its name now. `refresh`: "Refresh from Meta", the names and today's figures asked for now.
 */
export async function adSpendFigures(days: number, opts: { refresh?: boolean } = {}): Promise<AdSpendFigures> {
  if (!adSpendConfigured()) return { state: 'off' };
  if (!PERIODS.includes(days)) return { state: 'error', error: 'Ad spend is shown for 30 days, 90 days or 1 year.' };
  // It goes in a header, where a line break fails before the request is sent (with the key in the error).
  if (/\s/.test(token())) return { state: 'error', error: 'META_ADS_TOKEN in Vercel has a space or line break in it: paste it again on one line, then redeploy.' };
  const account = adAccountNumber(process.env.META_AD_ACCOUNT_ID);
  if (!account) return { state: 'error', error: 'META_AD_ACCOUNT_ID in Vercel should be your ad account number from Ads Manager, like act_1234567890.' };
  try {
    const cool = await paused(account);
    const refresh = opts.refresh ? await mayRefresh(account, cool) : null;
    const [info, { seen, news: first }] = await Promise.all([accountInfo(account, cool), loadHistory()]);
    if (!info.ok) return { state: 'error', error: plainAdsError(info, account) };
    const { since, yesterday, today } = periodDates(days, info.data.timeZone);
    let news = first;
    const saw = (ads: Ad[], at: string) => {
      news = noteAds(seen, ads, Date.parse(at)) || news;
    };
    const pieces = Promise.all([
      piece(`meta-ads:${days}`, account, since, yesterday, HOUR, cool, saw),
      piece('meta-ads:today', account, today, today, refresh === 'done' ? 0 : 15 * MIN, cool, saw),
    ]);
    const ids = pieces.then((ps) => ps.flatMap((p) => (p.ok ? p.data.ads.map((x) => x.id) : [])));
    const [[past, now], names] = await Promise.all([pieces, currentNames(account, cool, refresh === 'done', ids)]);
    if (names) news = noteAds(seen, listed(names), Date.parse(names.at)) || news;
    if (news) await saveHistory(seen);
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
      ads: withCurrentNames(mergeAds(past.data.ads, now.data.ads), names?.ads),
      account: a && b ? { spend: a.spend + b.spend, metaLeads: a.metaLeads + b.metaLeads } : null,
      pastNames: pastNames(seen),
      todayAt: now.data.at,
      pastAt: past.data.at,
      namesAt: names?.at ?? null,
      refresh,
    };
  } catch (e) {
    console.error('Meta ad spend failed', e);
    return { state: 'error', error: 'The ad figures couldn’t be loaded just now. Try again in a minute.' };
  }
}

/** A lead's ad as Meta's Lead API (or a WhatsApp ad's referral) gives it. */
export type LeadAdIds = {
  ad_id?: string | null;
  adset_id?: string | null;
  campaign_id?: string | null;
  ad_name?: string | null;
  campaign_name?: string | null;
  created_time?: string | null;
};

/**
 * A lead's ad, ad set and campaign ids on its enquiry (ad-spend.sql), and the names it came with
 * (rememberNames). Before ad-spend.sql is run the columns aren't there, the update fails and
 * nothing changes. `onlyIfMissing` fills in an older lead without touching one that has them.
 * Never throws.
 */
export async function saveAdIds(enquiryId: string, lead: LeadAdIds, onlyIfMissing = false) {
  await updateAdIds(enquiryId, lead, onlyIfMissing);
  if ((lead.ad_id && lead.ad_name) || (lead.campaign_id && lead.campaign_name)) {
    await rememberNames([{ adId: lead.ad_id, adName: lead.ad_name, campaignId: lead.campaign_id, campaignName: lead.campaign_name, at: lead.created_time }]);
  }
}

/** Just the ids (saveAdIds without the names: src/lib/meta-ad-ids.ts keeps a batch's names in one go). Only ever these three columns. */
export async function updateAdIds(enquiryId: string, lead: LeadAdIds, onlyIfMissing = false) {
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
