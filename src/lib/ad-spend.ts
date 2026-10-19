/**
 * Meta ad spend beside the CRM's leads, surveys and sales (CRM → Reports). Pure, so it runs in the
 * browser and in scripts/test-meta-ads.mjs: Meta's insights rows → ads, a period's dates in the ad
 * account's time zone, which CRM leads came from which ad, the money maths and Meta's errors in
 * plain words. Fetching and caching are in src/lib/meta-ads.ts.
 *
 * Meta sends spend as text in the account's currency ("5339.5" is £5,339.50). It's kept here in
 * hundredths (pence), so totals add up to the penny.
 */

export type MetaAction = { action_type?: string; value?: string | number };

/** One row of GET /act_{id}/insights (every number comes as text). */
export type InsightsRow = {
  ad_id?: string;
  ad_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaAction[];
  account_currency?: string;
};

/** One ad's figures for a period. `spend` is in pence. */
export type Ad = {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  /** Meta's own count of leads from the ad. */
  metaLeads: number;
};

/** The whole ad account for a period, ads Meta no longer lists included. */
export type Totals = { spend: number; metaLeads: number };

/** "12.34" → 1234. Rounds half a penny up; anything unreadable is 0. */
export function toMinor(v: unknown): number {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(String(v ?? '').trim());
  if (!m || (!m[2] && !m[3])) return 0;
  const frac = (m[3] ?? '').padEnd(3, '0');
  const n = Number(m[2] || '0') * 100 + Number(frac.slice(0, 2)) + (Number(frac[2]) >= 5 ? 1 : 0);
  return m[1] ? -n : n;
}

const count = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/**
 * Meta's lead count from a row's actions. 'lead' is its total (lead forms and website leads); the
 * others are parts of it, and one lead is often listed under several, so they're never added to it.
 */
export function metaLeadCount(actions: MetaAction[] | undefined): number {
  const get = (type: string) => {
    const a = actions?.find((x) => x.action_type === type);
    return a ? count(a.value) : null;
  };
  const all = get('lead');
  if (all != null) return all;
  return (get('onsite_conversion.lead_grouped') ?? get('leadgen_grouped') ?? 0) + (get('offsite_conversion.fb_pixel_lead') ?? 0);
}

/** Ad-level insights rows → one entry per ad id (rows without one are left out). */
export function adsFromRows(rows: InsightsRow[]): Ad[] {
  return mergeAds(
    rows
      .filter((r) => r.ad_id)
      .map((r) => ({
        id: String(r.ad_id),
        name: (r.ad_name || '').trim() || `Ad ${r.ad_id}`,
        campaignId: String(r.campaign_id || ''),
        campaignName: (r.campaign_name || '').trim() || (r.campaign_id ? `Campaign ${r.campaign_id}` : 'No campaign'),
        spend: toMinor(r.spend),
        impressions: count(r.impressions),
        clicks: count(r.clicks),
        metaLeads: metaLeadCount(r.actions),
      }))
  );
}

/** Account-level rows → the account's totals. */
export const totalsFromRows = (rows: InsightsRow[]): Totals => ({
  spend: rows.reduce((n, r) => n + toMinor(r.spend), 0),
  metaLeads: rows.reduce((n, r) => n + metaLeadCount(r.actions), 0),
});

/** The same ads over several stretches of time, added up. Names come from the last list (Meta gives today's names). */
export function mergeAds(...lists: Ad[][]): Ad[] {
  const out = new Map<string, Ad>();
  for (const list of lists)
    for (const a of list) {
      const was = out.get(a.id);
      out.set(
        a.id,
        was
          ? {
              ...a,
              spend: was.spend + a.spend,
              impressions: was.impressions + a.impressions,
              clicks: was.clicks + a.clicks,
              metaLeads: was.metaLeads + a.metaLeads,
            }
          : { ...a }
      );
    }
  return [...out.values()];
}

/** META_AD_ACCOUNT_ID as digits: "act_1234567890", "1234567890" or "act 1234567890" → "1234567890"; null if it isn't one. */
export function adAccountNumber(raw: string | null | undefined): string | null {
  const s = (raw || '').trim().replace(/^act[_\s-]*/i, '');
  return /^\d{5,25}$/.test(s) ? s : null;
}

// ── Dates ──

/** The date ('YYYY-MM-DD') of a moment in a time zone (Europe/London if Meta's name for it isn't known here). */
export function dayIn(at: number | Date, timeZone: string): string {
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = fmt(timeZone || 'Europe/London');
  } catch {
    parts = fmt('Europe/London');
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Y-M-D arithmetic at noon UTC, so the clocks changing can't move a date. */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/**
 * A Reports period ("the last 90 days") as the ad account's dates: `days` days ending today, today
 * included. Earlier days (since → yesterday) settle; today's spend is still going up.
 */
export function periodDates(days: number, timeZone: string, now = Date.now()) {
  const today = dayIn(now, timeZone);
  return { since: addDays(today, -(Math.max(1, Math.trunc(days)) - 1)), yesterday: addDays(today, -1), today };
}

// ── Which leads came from which ad ──

/** Leads from Meta: its lead forms ("meta: <ad>", "meta-lead-ad"), the website's ad links ("meta-ad…") and WhatsApp ads. */
export const isMetaSource = (source: string) => /^(?:meta(?:-ad|-lead-ad)?\s*(?::|$)|whatsapp-ad\s*$)/i.test(source.trim());

/** One CRM opportunity from the period, with how far it got. */
export type LeadOutcome = {
  source: string;
  /** The ad Meta said it came from (ad-spend.sql), when known. */
  metaAdId?: string | null;
  surveyed: boolean;
  won: boolean;
  lost: boolean;
  /** £ won (0 unless won). */
  value: number;
};

export type SpendRow = {
  key: string;
  label: string;
  /** A short line under the name: several ads in one row, or why a row has no spend. */
  note?: string;
  leads: number;
  surveys: number;
  won: number;
  lost: number;
  /** £ won. */
  value: number;
  /** In pence of the ad account's currency; null when no spend is the row's own. */
  spend: number | null;
  /** Meta's own lead count for the row's ads. */
  metaLeads: number | null;
};
export type SpendGroup = { key: string; label: string; rows: SpendRow[]; total: SpendRow };

/** What GET /api/crm/reports says about ad spend. */
export type AdSpendReport =
  | { state: 'off' }
  | { state: 'error'; error: string }
  | {
      state: 'ok';
      currency: string;
      since: string;
      until: string;
      /** When the oldest of the figures was fetched from Meta. */
      fetchedAt: string;
      /** Meta didn't answer, so these are the last figures it gave. */
      warning: string | null;
      /** Campaigns (their ads beneath), then "Other Meta leads and spend". */
      groups: SpendGroup[];
      /** Every Meta lead and all the account's spend. */
      total: SpendRow;
    };

export const OTHER_GROUP = 'other';

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const blank = (key: string, label: string, note?: string): SpendRow => ({
  key,
  label,
  ...(note ? { note } : {}),
  leads: 0,
  surveys: 0,
  won: 0,
  lost: 0,
  value: 0,
  spend: null,
  metaLeads: null,
});
const plus = (a: number | null, b: number | null) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));

type Target = { kind: 'ad'; id: string } | { kind: 'name'; name: string } | { kind: 'web'; campaignId: string } | { kind: 'other' };

/** A Meta lead that couldn't be put with an ad: what to call its row. */
function otherLabel(source: string): { label: string; note: string } {
  const s = source.trim();
  const rest = s.replace(/^[^:]*:/, '').trim();
  if (/^meta\s*:/i.test(s)) return { label: rest || 'Meta lead form', note: 'Not in Meta’s figures for this period: the ad may have been renamed or deleted' };
  if (/^meta-ad\s*:/i.test(s)) return { label: `Website: ${rest}`, note: 'Campaign not in Meta’s figures for this period' };
  if (/^meta-ad\s*$/i.test(s)) return { label: 'Website, from a Meta ad', note: 'The ad link didn’t say which campaign' };
  if (/^whatsapp-ad\s*$/i.test(s)) return { label: 'WhatsApp ad chats', note: 'Which ad wasn’t recorded' };
  return { label: 'Meta lead form', note: 'Meta didn’t say which ad' };
}

/**
 * The period's Meta leads beside Meta's ads, grouped by campaign. Every ad's spend lands in exactly
 * one row, so the rows add up to the account's total. A lead goes with:
 *  1. the ad Meta said it came from (its ad id, saved since ad-spend.sql);
 *  2. otherwise its ad name ("meta: Video 4", from lead forms and the importer). When several ads
 *     share the name, they share one row, under the campaign that spent most on them;
 *  3. otherwise, for the website's ad links ("meta-ad: <campaign> / <ad>"), the ad in that campaign,
 *     or just the campaign ("Website enquiries", no spend of its own: it counts in the campaign's total);
 *  4. otherwise "Other Meta leads and spend", with a note saying why.
 * Ads with spend and no leads get their own rows. Spend Meta counts for the account but not under
 * any ad it lists (deleted or archived ads) goes in the last group too.
 */
export function spendTable(leads: LeadOutcome[], ads: Ad[], account?: Totals | null): { groups: SpendGroup[]; total: SpendRow } {
  const byId = new Map(ads.map((a) => [a.id, a]));
  const named = (name: string) => ads.filter((a) => norm(a.name) === norm(name) || a.id === name.trim());
  const campaignIds = (name: string) => new Set(ads.filter((a) => norm(a.campaignName) === norm(name) || a.campaignId === name.trim()).map((a) => a.campaignId));
  const spendOn = (pick: (a: Ad) => boolean) => ads.filter(pick).reduce((n, a) => n + a.spend, 0);
  /** The one that spent most, when a name fits several. */
  const biggest = (ids: Iterable<string>, spend: (id: string) => number) => [...ids].sort((a, b) => spend(b) - spend(a))[0];
  const oneAd = (hits: Ad[], name: string): Target | null =>
    hits.length === 1 ? { kind: 'ad', id: hits[0].id } : hits.length > 1 ? { kind: 'name', name: norm(name) } : null;

  const targetOf = (l: LeadOutcome): Target => {
    if (l.metaAdId && byId.has(l.metaAdId)) return { kind: 'ad', id: l.metaAdId };
    const s = l.source.trim();
    if (/^meta\s*:/i.test(s)) return oneAd(named(s.replace(/^meta\s*:/i, '')), s.replace(/^meta\s*:/i, '')) ?? { kind: 'other' };
    if (/^meta-ad\s*:/i.test(s)) {
      // "<utm_campaign> / <utm_content>": names can have " / " in them too, so try each split.
      const rest = s.replace(/^meta-ad\s*:/i, '').trim();
      const parts = rest.split(' / ');
      for (let i = 1; i < parts.length; i++) {
        const inCampaign = campaignIds(parts.slice(0, i).join(' / '));
        const ad = parts.slice(i).join(' / ');
        const hits = named(ad).filter((a) => inCampaign.has(a.campaignId));
        if (hits.length === 1) return { kind: 'ad', id: hits[0].id };
        if (hits.length > 1) return { kind: 'web', campaignId: hits[0].campaignId };
      }
      for (let i = parts.length; i >= 1; i--) {
        const ids = campaignIds(parts.slice(0, i).join(' / '));
        if (ids.size) return { kind: 'web', campaignId: biggest(ids, (id) => spendOn((a) => a.campaignId === id)) };
      }
      // Only the ad in the link (utm_content without utm_campaign).
      return oneAd(named(rest), rest) ?? { kind: 'other' };
    }
    return { kind: 'other' };
  };

  const metaLeads = leads.filter((l) => isMetaSource(l.source));
  const targets = metaLeads.map(targetOf);
  // A name some lead couldn't pin to one ad: every ad with that name shares one row.
  const shared = new Set(targets.flatMap((t) => (t.kind === 'name' ? [t.name] : [])));
  const keyOf = (t: Target, source: string) =>
    t.kind === 'ad'
      ? shared.has(norm(byId.get(t.id)!.name))
        ? `name:${norm(byId.get(t.id)!.name)}`
        : `ad:${t.id}`
      : t.kind === 'name'
        ? `name:${t.name}`
        : t.kind === 'web'
          ? `web:${t.campaignId}`
          : `other:${source.trim().toLowerCase()}`;

  const rows = new Map<string, SpendRow & { group: string; groupLabel: string }>();
  const row = (key: string, make: () => SpendRow & { group: string; groupLabel: string }) => {
    let r = rows.get(key);
    if (!r) rows.set(key, (r = make()));
    return r;
  };
  const campaignName = (id: string) => ads.find((a) => a.campaignId === id)?.campaignName ?? 'Campaign';
  const make = (key: string): SpendRow & { group: string; groupLabel: string } => {
    if (key.startsWith('ad:')) {
      const a = byId.get(key.slice(3))!;
      return { ...blank(key, a.name), group: `c:${a.campaignId}`, groupLabel: a.campaignName };
    }
    if (key.startsWith('name:')) {
      const same = named(key.slice(5));
      const top = [...same].sort((a, b) => b.spend - a.spend)[0];
      const elsewhere = [...new Set(same.filter((a) => a.campaignId !== top.campaignId).map((a) => `“${a.campaignName}”`))];
      const note = `${same.length} ads with this name${elsewhere.length ? `, also in ${elsewhere.join(' and ')}` : ''}`;
      return { ...blank(key, top.name, note), group: `c:${top.campaignId}`, groupLabel: top.campaignName };
    }
    if (key.startsWith('web:')) {
      const id = key.slice(4);
      return { ...blank(key, 'Website enquiries', 'From this campaign’s ad links; the ad wasn’t recorded'), group: `c:${id}`, groupLabel: campaignName(id) };
    }
    return { ...blank(key, ''), group: OTHER_GROUP, groupLabel: 'Other Meta leads and spend' };
  };

  metaLeads.forEach((l, i) => {
    const key = keyOf(targets[i], l.source);
    const r = row(key, () => {
      const r = make(key);
      if (r.group === OTHER_GROUP) Object.assign(r, otherLabel(l.source));
      return r;
    });
    r.leads++;
    if (l.surveyed && !l.lost) r.surveys++;
    if (l.won) {
      r.won++;
      r.value += Number(l.value) || 0;
    }
    if (l.lost) r.lost++;
  });

  // Each ad's spend goes to exactly one row.
  for (const a of ads) {
    const key = shared.has(norm(a.name)) ? `name:${norm(a.name)}` : `ad:${a.id}`;
    const r = row(key, () => make(key));
    r.spend = (r.spend ?? 0) + a.spend;
    r.metaLeads = (r.metaLeads ?? 0) + a.metaLeads;
  }
  const listed = ads.reduce((n, a) => n + a.spend, 0);
  if (account && account.spend > listed) {
    const r = row('other:unlisted', () => ({ ...make('other:unlisted'), label: 'Ads Meta no longer lists', note: 'Deleted or archived ads: Meta only gives their total' }));
    r.spend = account.spend - listed;
    r.metaLeads = Math.max(0, account.metaLeads - ads.reduce((n, a) => n + a.metaLeads, 0));
  }

  const order = (a: SpendRow, b: SpendRow) =>
    b.value - a.value || b.leads - a.leads || (b.spend ?? 0) - (a.spend ?? 0) || a.label.localeCompare(b.label);
  const sum = (key: string, label: string, list: SpendRow[]): SpendRow =>
    list.reduce(
      (t, r) => ({
        ...t,
        leads: t.leads + r.leads,
        surveys: t.surveys + r.surveys,
        won: t.won + r.won,
        lost: t.lost + r.lost,
        value: t.value + r.value,
        spend: plus(t.spend, r.spend),
        metaLeads: plus(t.metaLeads, r.metaLeads),
      }),
      blank(key, label)
    );

  const byGroup = new Map<string, { label: string; rows: SpendRow[] }>();
  for (const { group, groupLabel, ...r } of rows.values()) {
    // Nothing spent and nothing came in (an ad Meta showed but didn't charge for).
    if (!r.leads && !r.spend) continue;
    const g = byGroup.get(group) ?? { label: groupLabel, rows: [] };
    g.rows.push(r);
    byGroup.set(group, g);
  }
  const groups = [...byGroup.entries()]
    .map(([key, g]) => ({ key, label: g.label, rows: g.rows.sort(order), total: sum(key, g.label, g.rows) }))
    .sort((a, b) => Number(a.key === OTHER_GROUP) - Number(b.key === OTHER_GROUP) || order(a.total, b.total));
  const total = sum('meta', 'All Meta ads', groups.map((g) => g.total));
  // Meta's own count for the whole account (deleted ads included), when it gave one.
  if (account) total.metaLeads = account.metaLeads;
  return { groups, total };
}

// ── Money ──

/** Pence → "£4.20", or whole pounds from £100 ("£1,250"), in the ad account's currency. "—" for nothing. */
export function adMoney(minor: number | null | undefined, currency = 'GBP'): string {
  if (minor == null || !Number.isFinite(minor)) return '—';
  const whole = Math.abs(Math.round(minor)) >= 10_000;
  try {
    const digits = whole ? 0 : (new Intl.NumberFormat('en-GB', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2);
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(whole ? 0 : 2)}`;
  }
}

/** Spend ÷ how many (leads, surveys or sales), in pence; null when there's nothing to divide. */
export const costPer = (spend: number | null | undefined, n: number): number | null => (spend == null || n <= 0 ? null : spend / n);

/** £ won for each 1 of spend: "£4.20 per £1" ("£4.20 per €1" for a euro account), or "—" with no spend. */
export function returnOn(value: number, spend: number | null | undefined, currency = 'GBP'): string {
  if (spend == null || spend <= 0) return '—';
  const per = (Number(value) || 0) / (spend / 100);
  let unit = `${currency} 1`;
  try {
    unit = new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(1);
  } catch {
    // An unknown currency code: "XYZ 1".
  }
  return `${per.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 })} per ${unit}`;
}

// ── Meta's errors, in plain words ──

export type MetaError = { error: string; code?: number; subcode?: number };

const RATE_LIMITS = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008, 80009, 80014]);

/** What went wrong and what to do about it. `account` is the ad account number (digits). */
export function plainAdsError(r: MetaError, account = ''): string {
  const m = r.error || '';
  const act = account ? `act_${account}` : 'the ad account';
  if (/aborted|timed? ?out/i.test(m) || (r.code === 100 && r.subcode === 1504018)) {
    return 'Meta took too long to send the ad figures. Try again in a minute.';
  }
  if (RATE_LIMITS.has(r.code ?? 0) || /request limit|too many calls|rate limit/i.test(m)) {
    return 'Meta is limiting how often the CRM can ask for ad figures. They come back by themselves, usually within the hour.';
  }
  if (r.code === 2635 || /deprecated version/i.test(m)) {
    return 'Meta has retired the version of its API the CRM asks for. Set META_ADS_GRAPH_VERSION in Vercel to Meta’s current version (like v26.0), then redeploy.';
  }
  if (r.code === 190 || /access token|session has expired|has not authori[sz]ed application/i.test(m)) {
    return (
      'Meta didn’t accept the ad spend key (META_ADS_TOKEN): it may have expired or been removed. In Meta Business settings → ' +
      'Users → System users, generate a new token with ads_read, paste it into META_ADS_TOKEN in Vercel and redeploy.'
    );
  }
  if (r.code === 100 && (r.subcode === 33 || /does not exist|cannot be loaded|unsupported get request/i.test(m))) {
    return (
      `Meta can’t find ad account ${act} for this key. Check META_AD_ACCOUNT_ID in Vercel is the number from Ads Manager, and that ` +
      'the system user has that ad account (Business settings → Users → System users → Assign assets).'
    );
  }
  if ([10, 200, 272, 294].includes(r.code ?? 0) || /ads_read|ads_management|permission/i.test(m)) {
    return (
      `The ad spend key can’t read ${act}. It needs ads_read, and the system user needs the ad account with at least ` +
      '“View performance” (Business settings → Users → System users → Assign assets → Ad accounts). If you add ads_read, generate a new token.'
    );
  }
  return `Meta said: “${m || 'something went wrong'}”`;
}
