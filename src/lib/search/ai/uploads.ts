/**
 * The two AI reports that have no API yet (spec §3 finding 7, §4.2): the Search Console Generative AI report and Bing's
 * AI Performance report. An admin exports the CSV; this reads it defensively (either delimiter, a BOM, quoted fields,
 * "1,234" and "12%", a title line above the header, columns in any order) into plain rows. Pure.
 */

export type UploadSource = 'gsc_genai' | 'bing_ai';
export const SOURCE_LABEL: Record<UploadSource, string> = { gsc_genai: 'Search Console, Generative AI', bing_ai: 'Bing, AI Performance' };

export type UploadRow = { date?: string; page?: string; query?: string; country?: string; device?: string; values: Record<string, number> };
export type ParsedUpload = { rows: UploadRow[]; measures: string[]; period: string | null; skipped: number; warning?: string };

/** RFC 4180-ish: commas, semicolons or tabs, quotes with "" escapes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const count = (c: string) => firstLine.split(c).length;
  const delim = count('\t') > count(',') && count('\t') > count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"' && !field) q = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some(Boolean));
}

/** "1,234" → 1234, "12.5%" → 12.5, "–" or "" → null. */
export function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.replace(/[\s,£$%]/g, '');
  if (!s || /^[-–—]$/.test(s) || !/^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) return null;
  return Number(s);
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

/** Dates as the exports write them: 2026-11-03, 03/11/2026 (UK), 11/3/2026 (US, when the day is over 12), "3 Nov 2026", "Nov 3, 2026". */
export function isoDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(s);
  if (m) {
    let [d, mo] = [Number(m[1]), Number(m[2])];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2].padStart(2, '0')}`;
  return undefined;
}

type Role = 'date' | 'page' | 'query' | 'country' | 'device';
const ROLE: [Role, RegExp][] = [
  ['date', /^(date|day|week|month)$/i],
  ['page', /page|url|address/i],
  ['query', /quer|keyword|prompt/i],
  ['country', /country|region|market/i],
  ['device', /device/i],
];

/** Header cells to measure names: "AI Overview impressions" → "ai_overview_impressions". */
const measureName = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'value';

/** Reads either export. Rows without any number are skipped and counted. */
export function parseUpload(source: UploadSource, text: string): ParsedUpload {
  const table = parseCsv(text);
  // The header is the first row with two or more non-numeric cells that a later row has numbers under.
  const hi = table.findIndex((r, i) => r.filter((c) => c && num(c) === null).length >= 2 && table.slice(i + 1).some((x) => x.some((c) => num(c) !== null)));
  if (hi < 0) return { rows: [], measures: [], period: null, skipped: table.length, warning: 'No header row with numbers under it was found. Export the report as CSV and upload that file.' };
  const header = table[hi];
  const body = table.slice(hi + 1);
  const numeric = (i: number) => body.filter((r) => num(r[i]) !== null).length >= Math.max(1, body.length / 2);
  const roles = new Map<number, Role>();
  header.forEach((h, i) => {
    // A key column holds words ("Cited pages" full of counts is a measure, not the page).
    if (numeric(i)) return;
    for (const [role, re] of ROLE) {
      if (re.test(h) && ![...roles.values()].includes(role)) {
        roles.set(i, role);
        break;
      }
    }
  });
  // Measures: columns, other than the key columns, that hold numbers in most rows.
  const measureCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ i }) => !roles.has(i) && numeric(i));
  const rows: UploadRow[] = [];
  let skipped = 0;
  for (const r of body) {
    const values: Record<string, number> = {};
    for (const { h, i } of measureCols) {
      const v = num(r[i]);
      if (v !== null) values[measureName(h)] = v;
    }
    if (!Object.keys(values).length) {
      skipped++;
      continue;
    }
    const row: UploadRow = { values };
    for (const [i, role] of roles) {
      const v = r[i];
      if (!v) continue;
      if (role === 'date') {
        const d = isoDate(v);
        if (d) row.date = d;
      } else row[role] = v.slice(0, 500);
    }
    rows.push(row);
  }
  const months = [...new Set(rows.map((r) => r.date?.slice(0, 7)).filter(Boolean))].sort() as string[];
  const period = months.length ? (months.length === 1 ? months[0] : `${months[0]} to ${months[months.length - 1]}`) : null;
  const measures = measureCols.map((c) => measureName(c.h));
  const want = source === 'gsc_genai' ? /impression/ : /citation|impression|click/;
  return { rows, measures, period, skipped, ...(measures.some((m) => want.test(m)) ? {} : { warning: `No ${source === 'gsc_genai' ? 'impressions' : 'citations'} column was found; the numbers were kept under their own names.` }) };
}

export type UploadRecord = { source: UploadSource; period: string; rows: UploadRow[] };

/**
 * Monthly totals per measure. Dated rows count in their own month; an undated table (a by-page export) counts in the
 * upload's period. Where two uploads cover the same month, the later one wins for that month.
 */
export function monthlyTrend(uploads: UploadRecord[], source: UploadSource): { months: string[]; measures: string[]; totals: Record<string, Record<string, number>> } {
  const byMonth = new Map<string, Record<string, number>>();
  for (const u of uploads.filter((x) => x.source === source)) {
    const local = new Map<string, Record<string, number>>();
    for (const r of u.rows) {
      const m = r.date?.slice(0, 7) ?? (/^\d{4}-\d{2}$/.test(u.period) ? u.period : null);
      if (!m) continue;
      const t = local.get(m) ?? {};
      for (const [k, v] of Object.entries(r.values)) t[k] = (t[k] ?? 0) + v;
      local.set(m, t);
    }
    for (const [m, t] of local) byMonth.set(m, t);
  }
  const months = [...byMonth.keys()].sort();
  const measures = [...new Set(months.flatMap((m) => Object.keys(byMonth.get(m)!)))];
  return { months, measures, totals: Object.fromEntries(months.map((m) => [m, byMonth.get(m)!])) };
}
