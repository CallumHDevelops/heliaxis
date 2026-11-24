/**
 * M8 Lead attribution: the funnel from a website visit to a won job (spec §5 M8). Pure, so it is tested with fixtures
 * (tests/search-leads.test.ts) and safe anywhere. Reading the rows is in ./funnel.ts.
 *
 * A "lead" is one enquiry that came in during the period: a row in `enquiries`, or a lead that a CRM merge moved or
 * joined (`crm_lead_origins`, whose customer row is gone). What happened next is read as it stands today, so a lead
 * from last month that was surveyed this week counts as surveyed for last month.
 */

import { anyChannelLabel, CHANNELS, fallbackChannel, ORGANIC_CHANNELS, type Channel } from '../channel';
import { isWonStage, stageIndex } from '@/lib/crm/stages';
import { PAGE_BRIEFS } from '@/lib/cms/page-briefs';

/* ── Channels ────────────────────────────────────────────────────────────────────────────────────────────────────── */

export type LeadChannel = Channel | 'offline' | 'untracked';

/** The order the channel table shows them in: organic first, then paid, then the rest. */
export const FUNNEL_CHANNELS: LeadChannel[] = ['organic_google', 'organic_bing', 'gbp', 'ai_assistant', 'paid_meta', 'paid_google', 'referral', 'direct', 'offline', 'untracked'];

export const channelLabel = (c: string) => anyChannelLabel(c);

const isChannel = (c: unknown): c is Channel => typeof c === 'string' && (CHANNELS as readonly string[]).includes(c);

/**
 * The channel a row counts under: the captured one, else Meta for Meta lead-form sources (the same rule as the
 * Overview's `channelOf` in metrics.ts), else "before tracking began". Nothing else is guessed.
 */
export function leadChannel(r: { channel: string | null; source: string | null }): LeadChannel {
  if (isChannel(r.channel)) return r.channel;
  return fallbackChannel(r.source);
}

export const isOrganic = (c: LeadChannel) => (ORGANIC_CHANNELS as string[]).includes(c);

/* ── Page groups ─────────────────────────────────────────────────────────────────────────────────────────────────── */

export type PageGroup = 'service' | 'town' | 'blog' | 'other' | 'none';
export const PAGE_GROUPS: PageGroup[] = ['service', 'town', 'blog', 'other', 'none'];
export const PAGE_GROUP_LABEL: Record<PageGroup, string> = {
  service: 'Service pages',
  town: 'Town pages',
  blog: 'Blog',
  other: 'Other pages',
  none: 'Landing page not recorded',
};

/** "/Solar-Panels/?utm=x#top" or "https://heliaxis.co.uk/solar-panels/" → "/solar-panels". Null for nothing usable. */
export function normalisePath(p: string | null | undefined): string | null {
  let s = String(p ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname;
    } catch {
      return null;
    }
  }
  s = s.split(/[?#]/)[0].toLowerCase();
  if (!s.startsWith('/')) s = `/${s}`;
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s || '/';
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const SERVICE_SLUGS = new Set(PAGE_BRIEFS.map((b) => normalisePath(b.slug)).filter((s): s is string => !!s && s !== '/'));
const SERVICE_WORDS = /(^|[/-])(solar|battery|batteries|heat-pumps?|air-source|ev-charg\w*|ev|infrared|commercial|residential|whole-home|ppa|funding|maintenance|warehousing|manufacturing|agriculture|care-homes|off-grid|grants?)($|[/-])/;

/**
 * Which group a landing page belongs to, from its path alone: the blog (/blog…), a town page (the path names one of
 * the target towns, e.g. /solar-panels-cardiff), a service page (a page brief's slug or a service word, e.g.
 * /battery-storage), or other (home, contact, quote forms). Town wins over service, since town pages name a service too.
 */
export function pageGroup(path: string | null | undefined, towns: string[]): PageGroup {
  const p = normalisePath(path);
  if (!p) return 'none';
  if (p === '/blog' || p.startsWith('/blog/')) return 'blog';
  for (const t of towns) {
    const slug = slugify(t);
    if (slug && new RegExp(`(^|[/-])${slug}($|[/-])`).test(p)) return 'town';
  }
  const first = `/${p.split('/')[1] ?? ''}`;
  if (SERVICE_SLUGS.has(p) || SERVICE_SLUGS.has(first) || SERVICE_WORDS.test(p)) return 'service';
  return 'other';
}

/* ── Rows from the database ──────────────────────────────────────────────────────────────────────────────────────── */

export type EnquiryRow = {
  id: string;
  name?: string | null;
  created_at: string;
  source: string | null;
  channel: string | null;
  landing_path: string | null;
  referrer_host: string | null;
  postcode?: string | null;
};
export type ProjectRow = { id: string; enquiry_id: string; stage: string; value: number | string | null; survey_at: string | null };
export type QuoteRow = { project_id: string; status: string; sent_at: string | null };
export type SurveyRow = { project_id: string; status: string };
export type OriginRow = {
  id: string;
  project_id: string;
  enquiry_id: string;
  role: 'own' | 'also';
  source: string | null;
  came_in_at: string | null;
  job_created_at: string;
  channel: string | null;
  landing_path: string | null;
  referrer_host: string | null;
};

export type Job = { id: string; stage: string; surveyed: boolean; quoted: boolean; won: boolean; value: number };

export type Lead = {
  /** The enquiry's id, or "origin:<id>" for a lead kept by a merge. */
  id: string;
  kind: 'enquiry' | 'origin';
  enquiryId: string;
  at: string;
  name: string | null;
  postcode: string | null;
  source: string | null;
  channel: LeadChannel;
  /** True when the channel was captured on the form, not worked out from the source. */
  captured: boolean;
  landingPath: string | null;
  referrerHost: string | null;
  jobs: Job[];
};

const QUOTE_SENT = new Set(['sent', 'accepted', 'declined', 'expired']);

/** How far one CRM job got. Survey: a booked survey, a survey record, or a stage past "Survey booked". Quote: a quote sent, or a stage past "Quote sent". */
export function jobOutcome(p: ProjectRow, quotes: QuoteRow[], surveys: SurveyRow[]): Job {
  const at = stageIndex(p.stage);
  const won = isWonStage(p.stage);
  const surveyed = !!p.survey_at || (p.stage !== 'lost' && at >= stageIndex('survey_booked')) || surveys.some((s) => s.status !== 'cancelled');
  const quoted = (p.stage !== 'lost' && at >= stageIndex('quote_sent')) || quotes.some((q) => !!q.sent_at || QUOTE_SENT.has(q.status));
  return { id: p.id, stage: p.stage, surveyed: surveyed || quoted || won, quoted: quoted || won, won, value: won ? Number(p.value) || 0 : 0 };
}

const group = <T, K>(rows: T[], key: (r: T) => K) => {
  const m = new Map<K, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
};

/**
 * Leads with their jobs. A job with an "own" lead origin moved to another customer in a merge: it counts for that
 * origin's lead, not for the customer it now sits under. An "also" origin is a lead joined into another job: it counts
 * as a lead with nothing sold (the sale counts once, for the job), as CRM Reports does.
 */
export function buildLeads(p: { enquiries: EnquiryRow[]; projects: ProjectRow[]; quotes?: QuoteRow[]; surveys?: SurveyRow[]; origins?: OriginRow[] }): Lead[] {
  const quotes = group(p.quotes ?? [], (q) => q.project_id);
  const surveys = group(p.surveys ?? [], (s) => s.project_id);
  const origins = p.origins ?? [];
  const moved = new Set(origins.filter((o) => o.role === 'own').map((o) => o.project_id));
  const job = new Map(p.projects.map((pr) => [pr.id, jobOutcome(pr, quotes.get(pr.id) ?? [], surveys.get(pr.id) ?? [])]));
  const byEnquiry = group(
    p.projects.filter((pr) => !moved.has(pr.id)),
    (pr) => pr.enquiry_id,
  );

  const leads: Lead[] = p.enquiries.map((e) => ({
    id: e.id,
    kind: 'enquiry',
    enquiryId: e.id,
    at: e.created_at,
    name: e.name ?? null,
    postcode: e.postcode ?? null,
    source: e.source,
    channel: leadChannel(e),
    captured: isChannel(e.channel),
    landingPath: normalisePath(e.landing_path),
    referrerHost: e.referrer_host,
    jobs: (byEnquiry.get(e.id) ?? []).map((pr) => job.get(pr.id)!),
  }));
  for (const o of origins) {
    leads.push({
      id: `origin:${o.id}`,
      kind: 'origin',
      enquiryId: o.enquiry_id,
      at: o.came_in_at ?? o.job_created_at,
      name: null,
      postcode: null,
      source: o.source,
      channel: leadChannel(o),
      captured: isChannel(o.channel),
      landingPath: normalisePath(o.landing_path),
      referrerHost: o.referrer_host,
      jobs: o.role === 'own' && job.has(o.project_id) ? [job.get(o.project_id)!] : [],
    });
  }
  return leads.sort((a, b) => b.at.localeCompare(a.at));
}

/* ── Dates (UK) ──────────────────────────────────────────────────────────────────────────────────────────────────── */

/** The UK calendar date of an instant. */
export const ukDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

/** UK midnight at the start of a date, as an ISO instant (for timestamptz filters). */
export function ukStart(date: string): string {
  const noon = new Date(`${date}T12:00:00Z`);
  const ukNoon = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(noon));
  return new Date(Date.parse(`${date}T00:00:00Z`) - (ukNoon - 12) * 3_600_000).toISOString();
}

export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const inRange = (lead: { at: string }, start: string, end: string) => {
  const d = ukDate(lead.at);
  return d >= start && d <= end;
};

/* ── The funnel ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export type Funnel = { enquiries: number; surveys: number; quotes: number; won: number; value: number };

export const emptyFunnel = (): Funnel => ({ enquiries: 0, surveys: 0, quotes: 0, won: 0, value: 0 });

/** Enquiries, then how many of them reached a survey, a quote and a won job, and the won jobs' value (£ inc. VAT). */
export function funnelOf(leads: Lead[]): Funnel {
  const f = emptyFunnel();
  for (const l of leads) {
    f.enquiries++;
    if (l.jobs.some((j) => j.surveyed)) f.surveys++;
    if (l.jobs.some((j) => j.quoted)) f.quotes++;
    if (l.jobs.some((j) => j.won)) f.won++;
    f.value += l.jobs.reduce((s, j) => s + j.value, 0);
  }
  f.value = Math.round(f.value * 100) / 100;
  return f;
}

export type ChannelRow = { channel: LeadChannel; label: string; now: Funnel; before: Funnel };

/** The funnel per channel for this period and the one it is compared with. Every channel is listed, empty or not. */
export function channelFunnel(now: Lead[], before: Lead[]): { rows: ChannelRow[]; total: { now: Funnel; before: Funnel }; organic: { now: Funnel; before: Funnel } } {
  const rows = FUNNEL_CHANNELS.map((c) => ({
    channel: c,
    label: channelLabel(c),
    now: funnelOf(now.filter((l) => l.channel === c)),
    before: funnelOf(before.filter((l) => l.channel === c)),
  }));
  return {
    rows,
    total: { now: funnelOf(now), before: funnelOf(before) },
    organic: { now: funnelOf(now.filter((l) => isOrganic(l.channel))), before: funnelOf(before.filter((l) => isOrganic(l.channel))) },
  };
}

/* ── Sessions from Umami ─────────────────────────────────────────────────────────────────────────────────────────── */

/** What Umami could give per page: sessions that started on it ("visits"), or only page views. */
export type PageSessions = { kind: 'visits' | 'pageviews'; byPath: Map<string, number> };

/**
 * Umami's per-page rows → counts by normalised path. Reads both shapes: `metrics` ([{x, y}]) and `metrics/expanded`
 * ([{name, visits, pageviews, …}], where `field` picks the column). Rows that normalise to the same path are added up.
 */
export function parseUmamiPages(raw: unknown, field: 'y' | 'visits' | 'pageviews' = 'y'): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const path = normalisePath(String(r.x ?? r.name ?? ''));
    const v = Number(field === 'y' ? (r.y ?? r.count ?? r.value) : r[field]);
    if (!path || !Number.isFinite(v)) continue;
    out.set(path, (out.get(path) ?? 0) + v);
  }
  return out;
}

export type PageRow = Funnel & { path: string | null; group: PageGroup; sessions: number | null; rate: number | null };

/** Enquiries ÷ sessions, as a percentage (null without sessions). */
export const rateOf = (enquiries: number, sessions: number | null) => (sessions && sessions > 0 ? Math.round((enquiries / sessions) * 1000) / 10 : null);

/**
 * The funnel per landing page, with Umami's sessions beside it. Pages with sessions but no enquiries are listed too,
 * so a busy page that never converts shows up. Leads with no landing page recorded share one row (path null).
 */
export function pageFunnel(leads: Lead[], sessions: PageSessions | null, towns: string[]): PageRow[] {
  const byPath = group(leads, (l) => l.landingPath);
  const paths = new Set<string | null>([...byPath.keys(), ...(sessions ? sessions.byPath.keys() : [])]);
  const rows: PageRow[] = [];
  for (const path of paths) {
    const f = funnelOf(byPath.get(path) ?? []);
    const s = path === null ? null : sessions ? (sessions.byPath.get(path) ?? 0) : null;
    rows.push({ ...f, path, group: pageGroup(path, towns), sessions: s, rate: rateOf(f.enquiries, s) });
  }
  return rows.sort((a, b) => b.enquiries - a.enquiries || b.value - a.value || (b.sessions ?? 0) - (a.sessions ?? 0) || String(a.path).localeCompare(String(b.path)));
}

export type GroupRow = Funnel & { group: PageGroup; label: string; pages: number; sessions: number | null; rate: number | null };

/** Page rows added up by group, in the fixed group order. */
export function groupFunnel(pages: PageRow[], haveSessions: boolean): GroupRow[] {
  return PAGE_GROUPS.map((g) => {
    const rows = pages.filter((p) => p.group === g);
    const f = emptyFunnel();
    for (const r of rows) {
      f.enquiries += r.enquiries;
      f.surveys += r.surveys;
      f.quotes += r.quotes;
      f.won += r.won;
      f.value += r.value;
    }
    const sessions = g === 'none' || !haveSessions ? null : rows.reduce((s, r) => s + (r.sessions ?? 0), 0);
    return { ...f, value: Math.round(f.value * 100) / 100, group: g, label: PAGE_GROUP_LABEL[g], pages: rows.filter((r) => r.path !== null).length, sessions, rate: rateOf(f.enquiries, sessions) };
  });
}

/* ── Cost per enquiry ────────────────────────────────────────────────────────────────────────────────────────────── */

/** Pence per enquiry, rounded to the penny; null when there is no spend figure or no enquiry to divide by. */
export const costPerEnquiry = (spendPence: number | null, enquiries: number): number | null =>
  spendPence === null || enquiries <= 0 ? null : Math.round(spendPence / enquiries);

/** Search's running costs in pence: US-dollar costs at the given rate. */
export const usdToPence = (usd: number, usdToGbp: number) => Math.round(usd * usdToGbp * 100);

/* ── Channel backfill ────────────────────────────────────────────────────────────────────────────────────────────── */

export type BackfillRule = { channel: Channel; rule: string };

/**
 * The channel an older row's source label names without doubt, or null. Only labels the site and the Meta lead
 * import write themselves (src/lib/attribution.ts `sourceLabel`, src/lib/ad-spend.ts `isMetaSource`):
 * - Meta lead forms and ad links ("meta: …", "meta-lead-ad", "meta-ad: …") and WhatsApp ads ("whatsapp-ad") → Meta ads
 * - "google-ads" or "google-ads: <campaign>" → Google Ads
 * - "chatgpt.com" (utm_source=chatgpt.com) → AI assistants
 * - a campaign of exactly "gbp" ("google: gbp") → Business Profile
 * "meta-organic" (a Meta form not on an ad) and website form names (cms-form, quote-form…) say nothing about the
 * channel, so they are left alone.
 */
export function channelFromSource(source: string | null | undefined): BackfillRule | null {
  const s = String(source ?? '').trim();
  if (!s) return null;
  if (/^(?:meta(?:-ad|-lead-ad)?\s*(?::|$)|whatsapp-ad\s*$)/i.test(s)) return { channel: 'paid_meta', rule: 'Meta lead form or ad link' };
  if (/^google-ads\s*(?::|$)/i.test(s)) return { channel: 'paid_google', rule: 'Google Ads link (gclid)' };
  if (/^chatgpt\.com\s*(?::|$)/i.test(s)) return { channel: 'ai_assistant', rule: 'utm_source=chatgpt.com' };
  if (/^[a-z0-9.\-]+:\s*gbp\s*(?:\/|$)/i.test(s)) return { channel: 'gbp', rule: 'Business Profile link (utm_campaign=gbp)' };
  return null;
}

export type BackfillRow = { table: 'enquiries' | 'crm_lead_origins'; id: string; at: string; name: string | null; source: string | null };
export type BackfillChange = BackfillRow & BackfillRule;

/** Rows with no channel whose source names one: exactly what "Label these" would change. Rows with a channel are never touched. */
export function backfillPreview(rows: (BackfillRow & { channel: string | null })[]): BackfillChange[] {
  const out: BackfillChange[] = [];
  for (const r of rows) {
    if (r.channel) continue;
    const hit = channelFromSource(r.source);
    if (hit) out.push({ table: r.table, id: r.id, at: r.at, name: r.name, source: r.source, ...hit });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** The changes that are both in the preview the admin saw and still true now (so nothing changed underneath is written). */
export function confirmedChanges(now: BackfillChange[], seen: { table: string; id: string; channel: string }[]): BackfillChange[] {
  const ok = new Set(seen.map((s) => `${s.table}:${s.id}:${s.channel}`));
  return now.filter((c) => ok.has(`${c.table}:${c.id}:${c.channel}`));
}
