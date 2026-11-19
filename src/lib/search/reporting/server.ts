import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { newDocument } from '@/lib/documents/pdf-kit';
import { esc, buttonsHtml } from '@/lib/email-brand';
import { sendEmail } from '@/lib/subcontractors/server';
import { siteBase } from '@/lib/seo/server';
import { CHANNELS, ORGANIC_CHANNELS } from '../channel';
import { delta, visibilityScore, weightedPosition } from '../maths';
import { channelOf, overview, periodFor, type Filters, type Period } from '../metrics';
import { ukClock, weekOf } from '../schedule';
import { getSetting } from '../server';
import { tierOf } from '../settings';
import { latestHealth } from '../health/server';
import {
  addDaysIso,
  ALL_SECTIONS,
  comparisonFor,
  monthPeriods,
  monthlyStatus,
  periodHeadline,
  periodWords,
  rangeLabel,
  reportTables,
  reportTextProblems,
  reportTitle,
  type ContentShipped,
  type CustomView,
  type ReportKind,
  type ReportRow,
  type Section,
  type StoredNumbers,
  ukMidnight,
} from './shape';

/**
 * The monthly Growth Report and custom reports (spec §10.3), built alongside the weekly report in reports.ts, and the
 * outputs every report shares: the PDF (document kit), the email to Settings › Reports and alerts recipients, and CSV.
 */

type Db = ReturnType<typeof createAdminClient>;

async function contentShipped(start: string, end: string, db: Db): Promise<ContentShipped> {
  const [pub, review] = await Promise.all([
    db.from('seo_content').select('title, slug, published_at').eq('status', 'published').gte('published_at', `${start}T00:00:00Z`).lt('published_at', `${addDaysIso(end, 1)}T00:00:00Z`).order('published_at').limit(200),
    db.from('seo_content').select('id', { count: 'exact', head: true }).eq('status', 'in_review'),
  ]);
  return {
    published: ((pub.data ?? []) as { title: string | null; slug: string | null; published_at: string }[]).map((r) => ({ title: r.title ?? '(untitled)', slug: r.slug ?? '', publishedAt: r.published_at })),
    inReview: review.count ?? 0,
  };
}

/** Is there data from a year before `start`? (Search Console history in gsc_daily is what a year-on-year needs.) */
async function haveYearOfData(yearAgoStart: string, db: Db): Promise<boolean> {
  const { data } = await db.from('gsc_daily').select('date').order('date', { ascending: true }).limit(1);
  const first = data?.[0]?.date as string | undefined;
  return !!first && first <= yearAgoStart;
}

/**
 * The tile measures for a date range read straight from the tables. overview() only loads the 26 weeks up to the period's
 * end, so a comparison a year back (the Growth Report's same-month-last-year, a custom "a year earlier") is worked out
 * here, the same way: Search Console daily sums, position weighted by impressions, enquiries by UK day, and the last
 * rankings run in the range.
 */
async function rangeValues(a: string, b: string, filters: Filters, db: Db): Promise<{ values: Record<string, number | null>; leads: Map<string, number> }> {
  const [areas, gscRes, enqRes, kwRes, resRes] = await Promise.all([
    getSetting('areas', db),
    db.from('gsc_daily').select('clicks, impressions, position').gte('date', a).lte('date', b).limit(200000),
    db.from('enquiries').select('created_at, channel, source').gte('created_at', ukMidnight(a)).lt('created_at', ukMidnight(addDaysIso(b, 1))).limit(20000),
    db.from('seo_keyword').select('id, town, service, intent, volume').eq('active', true),
    db.from('seo_serp_result').select('keyword_id, date, our_pos, error').eq('device', filters.device ?? 'mobile').gte('date', a).lte('date', b).limit(50000),
  ]);
  const g = (gscRes.data ?? []) as { clicks: number; impressions: number; position: number | null }[];
  const enq = (enqRes.data ?? []) as { channel: string | null; source: string | null }[];
  const leads = new Map<string, number>();
  for (const e of enq) leads.set(channelOf(e), (leads.get(channelOf(e)) ?? 0) + 1);
  const kws = ((kwRes.data ?? []) as { id: number; town: string | null; service: string | null; intent: string; volume: number | null }[]).filter(
    (k) => (!filters.town || k.town === filters.town) && (!filters.service || k.service === filters.service) && (!filters.intent || k.intent === filters.intent) && (!filters.tier || tierOf(k.town, areas.list) === filters.tier),
  );
  const vol = new Map(kws.map((k) => [k.id, k.volume]));
  const res = ((resRes.data ?? []) as { keyword_id: number; date: string; our_pos: number | null; error: string | null }[]).filter((r) => vol.has(r.keyword_id) && !r.error);
  const last = res.reduce((m, r) => (r.date > m ? r.date : m), '');
  const run = last ? res.filter((r) => r.date === last) : [];
  return {
    values: {
      organic_enquiries: enq.filter((e) => (ORGANIC_CHANNELS as string[]).includes(channelOf(e))).length,
      clicks: g.length ? g.reduce((s, r) => s + r.clicks, 0) : null,
      impressions: g.length ? g.reduce((s, r) => s + r.impressions, 0) : null,
      avg_position: weightedPosition(g),
      top3: run.length ? run.filter((r) => r.our_pos !== null && r.our_pos <= 3).length : null,
      visibility: run.length ? visibilityScore(run.map((r) => ({ pos: r.our_pos, volume: vol.get(r.keyword_id) ?? null }))) : null,
    },
    leads,
  };
}

/** The numbers and words for a period, checked against the number rule before anything is saved. */
async function snapshot(o: { kind: ReportKind; period: Period; filters?: Filters; yearAgo?: { start: string; end: string } | null; sections?: Section[]; view?: CustomView | null }, db: Db) {
  const filters = o.filters ?? {};
  const ov = await overview({ period: o.period, filters }, db);
  // A comparison older than the Overview's 26 weeks: the tiles' "before" and the leads' "before" come from the tables.
  if (o.period.compareStart < addDaysIso(weekOf(o.period.end).start, -24 * 7)) {
    const before = await rangeValues(o.period.compareStart, o.period.compareEnd, filters, db);
    ov.tiles = ov.tiles.map((t) => ({ ...t, delta: delta(t.delta.now, t.key in before.values ? before.values[t.key] : null, t.lowerIsBetter) }));
    ov.leads = [...CHANNELS, 'untracked' as const]
      .map((ch) => ({ channel: ch, now: ov.leads.find((l) => l.channel === ch)?.now ?? 0, before: before.leads.get(ch) ?? 0 }))
      .filter((l) => l.now || l.before);
  }
  let yearAgo: StoredNumbers['yearAgo'] = null;
  if (o.yearAgo) {
    const y = await rangeValues(o.yearAgo.start, o.yearAgo.end, filters, db);
    yearAgo = Object.fromEntries(ov.tiles.map((t) => [t.key, delta(t.delta.now, t.key in y.values ? y.values[t.key] : null, t.lowerIsBetter)]));
  }
  const sections = o.sections ?? ALL_SECTIONS;
  const [content, health] = await Promise.all([
    sections.includes('content') ? contentShipped(o.period.start, o.period.end, db) : Promise.resolve(null),
    sections.includes('health') ? latestHealth(db).then((h) => h.summary).catch(() => null) : Promise.resolve(null),
  ]);
  const numbers: StoredNumbers = {
    tiles: ov.tiles,
    winners: ov.winners,
    losers: ov.losers,
    leads: ov.leads,
    freshness: ov.freshness,
    rankRunDates: ov.rankRunDates,
    yearAgo,
    yearAgoPeriod: o.yearAgo ?? null,
    content,
    health,
    view: o.view ?? null,
    sections,
  };
  const headline = periodHeadline(numbers, periodWords(o.kind, o.view?.compare));
  const bad = reportTextProblems(headline, numbers);
  if (bad.length) throw new Error(`Report text has numbers not in the snapshot: ${bad.join(', ')}`);
  return { numbers, text: { headline, actions: [] as string[] } };
}

/* ── Monthly Growth Report ───────────────────────────────────────────────────────────────────────────────────────── */

/**
 * First Tuesday of the month, 08:00: last month against the month before, and against the same month last year once a
 * year of data exists. Final (frozen) once Search Console has the month's last day; built before that (the 1st to the
 * 3rd), it is provisional, and calling this again on or after `finalOn` makes it final.
 */
export async function buildMonthlyReport(db: Db = createAdminClient(), opts: { today?: string } = {}) {
  const today = opts.today ?? ukClock().date;
  const { period, yearAgo } = monthPeriods(today);
  const { data: existing } = await db.from('seo_report').select('id, status').eq('kind', 'monthly').eq('period_start', period.start).eq('period_end', period.end).maybeSingle();
  if (existing?.status === 'final') return { id: existing.id as number, status: 'final' as const, frozen: true };
  const yoy = (await haveYearOfData(yearAgo.start, db)) ? yearAgo : null;
  const { numbers, text } = await snapshot({ kind: 'monthly', period, yearAgo: yoy }, db);
  const status = monthlyStatus(period.end, today);
  const row = { kind: 'monthly', name: `Growth Report ${period.start.slice(0, 7)}`, period_start: period.start, period_end: period.end, compare_start: period.compareStart, compare_end: period.compareEnd, status, numbers, text };
  const { data, error } = await db.from('seo_report').upsert(row, { onConflict: 'kind,period_start,period_end' }).select('id').single();
  if (error) throw new Error(error.message);
  return { id: data.id as number, status, frozen: false, finalOn: status === 'final' ? null : addDaysIso(period.end, 4) };
}

/* ── Custom reports (saved, named views) ─────────────────────────────────────────────────────────────────────────── */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function periodForView(v: CustomView, today = ukClock().date): Period {
  if (v.periodKey !== 'custom') return periodFor(v.periodKey, today, v.compare);
  if (!v.start || !v.end || !ISO.test(v.start) || !ISO.test(v.end) || v.start > v.end) throw new Error('Pick a start and an end date, the start first.');
  if (Date.parse(v.end) - Date.parse(v.start) > 400 * 86_400_000) throw new Error('A custom report can cover up to 400 days.');
  return { start: v.start, end: v.end, ...comparisonFor(v.start, v.end, v.compare), label: rangeLabel(v.start, v.end) };
}

/**
 * Build and save a custom report. A report is unique by its kind and dates, so saving a second view over the same dates
 * replaces the first (its name changes to the new one).
 */
export async function buildCustomReport(input: { name: string; view: CustomView }, db: Db = createAdminClient(), opts: { id?: number } = {}) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error('Give the report a name.');
  const v: CustomView = { ...input.view, sections: input.view.sections.filter((s) => ALL_SECTIONS.includes(s)) };
  if (!v.sections.length) throw new Error('Pick at least one section.');
  const period = periodForView(v);
  const filters: Filters = { ...(v.tier ? { tier: v.tier } : {}), ...(v.service ? { service: v.service } : {}) };
  const { numbers, text } = await snapshot({ kind: 'custom', period, filters, sections: v.sections, view: v }, db);
  const row = { kind: 'custom', name, period_start: period.start, period_end: period.end, compare_start: period.compareStart, compare_end: period.compareEnd, status: 'final' as const, numbers, text };
  if (opts.id) {
    const { error } = await db.from('seo_report').update({ ...row, created_at: new Date().toISOString() }).eq('id', opts.id).eq('kind', 'custom');
    if (!error) return opts.id;
    // The rolling dates now match another saved view: fall through and replace that one.
  }
  const { data, error } = await db.from('seo_report').upsert(row, { onConflict: 'kind,period_start,period_end' }).select('id').single();
  if (error) throw new Error(error.message);
  if (opts.id && opts.id !== data.id) await db.from('seo_report').delete().eq('id', opts.id).eq('kind', 'custom');
  return data.id as number;
}

/** Rebuild a saved view with today's data (a rolling period such as "last month" moves on). */
export async function rebuildCustomReport(id: number, db: Db = createAdminClient()) {
  const r = await readReport(id, db);
  if (!r || r.kind !== 'custom' || !r.numbers.view) throw new Error('That saved view is gone.');
  return buildCustomReport({ name: r.name ?? 'Custom report', view: r.numbers.view }, db, { id });
}

/* ── Outputs ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

export async function readReport(id: number, db: Db = createAdminClient()): Promise<ReportRow | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const { data } = await db.from('seo_report').select('*').eq('id', id).maybeSingle();
  return (data as ReportRow | null) ?? null;
}

export const reportFileName = (r: ReportRow, ext: 'pdf' | 'csv') => `${reportTitle(r).replace(/[^A-Za-z0-9 ,-]+/g, '').replace(/\s+/g, ' ').trim()}.${ext}`;

const sourcesLine = (r: ReportRow) =>
  `Sources: Search Console to ${r.numbers.freshness?.gscTo ?? 'not connected'}; rankings run ${r.numbers.rankRunDates?.now ?? 'none'} against ${r.numbers.rankRunDates?.before ?? 'none'}; enquiries by date received. Compared with ${rangeLabel(r.compare_start, r.compare_end)}${r.numbers.yearAgoPeriod ? ` and ${rangeLabel(r.numbers.yearAgoPeriod.start, r.numbers.yearAgoPeriod.end)}` : ''}. Built ${r.created_at.slice(0, 10)}.`;

/** The report as a PDF in the document kit, with the Heliaxis header. */
export async function reportPdf(r: ReportRow): Promise<Uint8Array> {
  const kit = await newDocument({ code: 'HX-SEARCH', label: 'Search report', title: reportTitle(r), jobRef: null, issued: r.created_at.slice(0, 10) });
  const filters = [r.numbers.view?.tier ? `Tier ${r.numbers.view.tier} areas` : null, r.numbers.view?.service ? r.numbers.view.service : null].filter(Boolean).join(', ');
  kit.header({
    meta: [
      ['Period', rangeLabel(r.period_start, r.period_end)],
      ['Compared with', rangeLabel(r.compare_start, r.compare_end)],
      ['Status', r.status === 'final' ? 'Final' : 'Provisional'],
      ...(filters ? ([['Showing', filters]] as [string, string][]) : []),
    ],
  });
  kit.section('In short');
  for (const line of r.text.headline ?? []) kit.paragraph(line);
  for (const t of reportTables(r)) {
    kit.section(t.title, { intro: t.key === 'measures' ? 'The source of each measure is listed under the table.' : `Source: ${t.source}` });
    if (!t.rows.length) {
      kit.note('Nothing in this period.');
      continue;
    }
    if (t.key === 'measures') {
      // The source column is too wide for the page: it goes in a list under the table.
      kit.grid({ columns: t.columns.filter((_, i) => i !== 1), rows: t.rows.map((row) => row.filter((_, i) => i !== 1)), widths: [2.4, 1, 1, 1, 1, ...(t.columns.length > 6 ? [1.2] : [])] });
      kit.list(t.rows.map((row) => `${row[0]}: ${row[1]}`));
    } else kit.grid({ columns: t.columns, rows: t.rows });
  }
  kit.note(sourcesLine(r));
  return kit.save();
}

/**
 * Email a report (PDF attached) to Settings › Reports and alerts recipients. Run after a final weekly or monthly report is
 * built; sends once (sent_at), unless `force` (the Email button).
 */
export async function sendReport(reportId: number, db: Db = createAdminClient(), opts: { force?: boolean } = {}) {
  const r = await readReport(reportId, db);
  if (!r) return { sent: 0, skipped: 'no such report' };
  if (r.sent_at && !opts.force) return { sent: 0, skipped: `already sent ${r.sent_at.slice(0, 10)}` };
  if (r.status !== 'final' && !opts.force) return { sent: 0, skipped: 'provisional' };
  const { recipients } = await getSetting('alerts', db);
  const to = [...new Set(recipients.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
  if (!to.length) return { sent: 0, skipped: 'No recipients: add them in Settings › Reports and alerts.' };

  const pdf = await reportPdf(r);
  const title = reportTitle(r);
  const href = `${siteBase()}/admin/search/reports?id=${r.id}`;
  const measures = reportTables(r).find((t) => t.key === 'measures');
  const html = [
    `<p>${esc(title)}${r.status === 'final' ? '' : ' (provisional)'}.</p>`,
    ...(r.text.headline ?? []).map((l) => `<p>${esc(l)}</p>`),
    measures
      ? `<table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr>${measures.columns.filter((_, i) => i !== 1).map((c) => `<th align="left" style="border-bottom:1px solid #d9d4ca">${esc(c)}</th>`).join('')}</tr>${measures.rows.map((row) => `<tr>${row.filter((_, i) => i !== 1).map((c) => `<td style="border-bottom:1px solid #eee">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
      : '',
    `<p style="color:#6e6a5e;font-size:12px">${esc(sourcesLine(r))} The full report, with every table, is attached.</p>`,
    buttonsHtml([{ href, label: 'Open in Search' }]),
  ].join('');
  let sent = 0;
  const errors: string[] = [];
  for (const email of to) {
    const res = await sendEmail({
      to: email,
      from: 'Heliaxis Search <noreply@heliaxis.co.uk>',
      subject: title,
      html,
      attachments: [{ filename: reportFileName(r, 'pdf'), content: pdf, contentType: 'application/pdf' }],
      idempotencyKey: `seo-report-${r.id}-${r.status}-${opts.force ? Date.now() : 'auto'}-${email}`,
    });
    if (res.ok) sent++;
    else errors.push(`${email}: ${res.error}`);
  }
  if (sent) await db.from('seo_report').update({ sent_at: new Date().toISOString() }).eq('id', r.id);
  return { sent, errors };
}
