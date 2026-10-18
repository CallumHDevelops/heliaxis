import type { LeadField } from '@/lib/whatsapp/api';

/**
 * Meta's lead downloads (Instant forms → Download, Ads Manager → Download leads) turned into leads
 * shaped like the Graph API's, so the importer treats them like leads fetched from Meta. Pure:
 * the browser uses it to preview a file before anything is sent, the server for its limits.
 */

export type CsvLead = {
  /** Meta's lead id, digits only. */
  id?: string;
  /** When they filled in the form (ISO). */
  created_time: string;
  field_data: LeadField[];
  ad_name?: string;
  campaign_name?: string;
  form_name?: string;
  platform?: string;
};

/** Caps on one lead: the parser trims to these and the API refuses anything bigger. */
export const CSV_LIMITS = { fields: 100, name: 200, value: 1000, text: 200 } as const;

/** Made with Meta's Lead Ads Testing Tool: "<test lead: dummy data for full_name>", test@fb.com. */
export const isTestLead = (fields: LeadField[]) =>
  fields.some((f) => (f.values ?? []).some((v) => /^<test lead\b/i.test(v.trim()) || v.trim().toLowerCase() === 'test@fb.com'));

/**
 * A downloaded file as text. Meta's own downloads are usually UTF-16 with tabs; other exports and
 * spreadsheets save UTF-8 (sometimes with a BOM) or, from older Excel, Windows-1252.
 */
export function decodeLeadFile(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  // Each decoder drops its own BOM.
  const as = (label: string) => new TextDecoder(label).decode(b);
  if (b[0] === 0xff && b[1] === 0xfe) return as('utf-16le');
  if (b[0] === 0xfe && b[1] === 0xff) return as('utf-16be');
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return as('utf-8');
  // No BOM: in UTF-16, plain English has a NUL in every other byte (after each letter in LE).
  const n = Math.min(b.length, 4096) & ~1;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < n; i += 2) {
    if (b[i] === 0) even++;
    if (b[i + 1] === 0) odd++;
  }
  const half = n / 2;
  if (half && odd > half * 0.3 && odd > even * 2) return as('utf-16le');
  if (half && even > half * 0.3 && even > odd * 2) return as('utf-16be');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return as('windows-1252');
  }
}

/** Spreadsheet text → rows of cells. Quoted cells may hold the delimiter, newlines and "" for a quote. */
function splitRows(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"' && !cell.trim()) {
      quoted = true;
      cell = '';
    } else if (c === delim) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Tab, comma or semicolon: whichever the header row has most of (outside quotes). */
function sniffDelimiter(text: string): string {
  const counts: Record<string, number> = { '\t': 0, ',': 0, ';': 0 };
  let quoted = false;
  for (const c of text.slice(0, 5000)) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r')) break;
    else if (!quoted && c in counts) counts[c]++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n ? best : ',';
}

const norm = (h: string) =>
  h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

/** Columns about the lead rather than answers. */
const META_COLUMNS: Record<string, 'id' | 'created_time' | 'ad_name' | 'campaign_name' | 'form_name' | 'platform'> = {
  id: 'id',
  lead_id: 'id',
  leadgen_id: 'id',
  created_time: 'created_time',
  created: 'created_time',
  created_at: 'created_time',
  created_date: 'created_time',
  date: 'created_time',
  date_created: 'created_time',
  submitted: 'created_time',
  submitted_at: 'created_time',
  ad_name: 'ad_name',
  ad: 'ad_name',
  campaign_name: 'campaign_name',
  campaign: 'campaign_name',
  form_name: 'form_name',
  form: 'form_name',
  platform: 'platform',
};

/** Answers under the names mapLeadFields knows. */
const ANSWER_COLUMNS: Record<string, string> = {
  full_name: 'full_name',
  fullname: 'full_name',
  name: 'full_name',
  your_name: 'full_name',
  customer_name: 'full_name',
  contact_name: 'full_name',
  first_name: 'first_name',
  firstname: 'first_name',
  forename: 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  surname: 'last_name',
  email: 'email',
  email_address: 'email',
  e_mail: 'email',
  work_email: 'email',
  phone_number: 'phone_number',
  phone: 'phone_number',
  mobile: 'phone_number',
  mobile_number: 'phone_number',
  mobile_phone: 'phone_number',
  mobile_phone_number: 'phone_number',
  contact_number: 'phone_number',
  telephone: 'phone_number',
  telephone_number: 'phone_number',
  work_phone_number: 'phone_number',
  post_code: 'post_code',
  postcode: 'post_code',
  postal_code: 'post_code',
  zip_code: 'post_code',
  zip: 'post_code',
  company_name: 'company_name',
  company: 'company_name',
};

/** Meta's own bookkeeping: nothing the customer typed. */
const SKIP_COLUMNS = new Set([
  'ad_id',
  'adset_id',
  'adset_name',
  'campaign_id',
  'form_id',
  'is_organic',
  'lead_status',
  'inbox_url',
  'retailer_item_id',
  'partner_name',
  'vehicle',
  'home_listing',
]);

const CONTACT = new Set(['full_name', 'first_name', 'last_name', 'email', 'phone_number']);

type DateParts = { y: number; mo: number; d: number; h: number; mi: number; s: number; tz: number | null };

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const SLASHED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i;

function toMs(p: DateParts): number | null {
  if (p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > 31 || p.h > 23 || p.mi > 59 || p.s > 59) return null;
  // No time zone given: the time as it reads where the file is opened (the UK, for us).
  const ms = p.tz === null ? new Date(p.y, p.mo - 1, p.d, p.h, p.mi, p.s).getTime() : Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - p.tz;
  return Number.isFinite(ms) ? ms : null;
}

/** Meta writes ISO dates; spreadsheets re-save them as 12/03/2025 (UK) or 03/12/2025 (US). */
function parseDate(raw: string, dayFirst: boolean): number | null {
  const s = raw.trim();
  let m = ISO.exec(s);
  if (m) {
    let tz: number | null = null;
    if (m[7]) {
      const z = m[7].toUpperCase().replace(':', '');
      tz = z === 'Z' ? 0 : (z[0] === '-' ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(3, 5))) * 60_000;
    }
    return toMs({ y: +m[1], mo: +m[2], d: +m[3], h: +(m[4] ?? 0), mi: +(m[5] ?? 0), s: +(m[6] ?? 0), tz });
  }
  m = SLASHED.exec(s);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    let h = +(m[4] ?? 0);
    const ampm = m[7]?.toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return toMs({ y, mo: dayFirst ? b : a, d: dayFirst ? a : b, h, mi: +(m[5] ?? 0), s: +(m[6] ?? 0), tz: null });
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * A lead download → leads, plus plain-English notes on anything left out. Blank rows are skipped;
 * rows with no readable date, a date in the future, or no name, email or phone, and Meta's test
 * leads, are left out (and counted in the warnings). Columns it doesn't know become answers under
 * their header text, so they end up in the enquiry's message like any other question on the form.
 */
export function parseLeadCsv(text: string, now = Date.now()): { leads: CsvLead[]; warnings: string[] } {
  const clean = text.replace(/^﻿/, '');
  const all = splitRows(clean, sniffDelimiter(clean));
  const nonBlank = all.filter((r) => r.some((c) => c.trim()));
  const warnings: string[] = [];
  if (nonBlank.length < 2) return { leads: [], warnings: ['There are no leads in this file.'] };

  const [header, ...rows] = nonBlank;
  const cols = header.map((raw) => {
    const label = raw.trim().slice(0, CSV_LIMITS.name);
    const key = norm(raw);
    if (META_COLUMNS[key]) return { kind: 'meta' as const, to: META_COLUMNS[key] };
    if (ANSWER_COLUMNS[key]) return { kind: 'answer' as const, to: ANSWER_COLUMNS[key] };
    if (!key || SKIP_COLUMNS.has(key)) return { kind: 'skip' as const, to: '' };
    return { kind: 'answer' as const, to: label };
  });
  const dateCol = cols.findIndex((c) => c.kind === 'meta' && c.to === 'created_time');
  if (dateCol < 0) {
    return {
      leads: [],
      warnings: ['This file has no date column (created_time), so we can’t tell when these people got in touch.'],
    };
  }
  if (!cols.some((c) => c.kind === 'answer' && CONTACT.has(c.to))) {
    warnings.push('This file has no name, email or phone column, so there’s no one to add.');
  }

  // 03/04/2025: a day over 12 anywhere in the file settles which way round; otherwise day first (UK).
  const slashed = rows.map((r) => SLASHED.exec((r[dateCol] ?? '').trim())).filter((m) => m !== null);
  const dayFirst = slashed.some((m) => +m[1] > 12) || !slashed.some((m) => +m[2] > 12);
  if (slashed.length && !slashed.some((m) => +m[1] > 12 || +m[2] > 12)) {
    warnings.push('Dates like 03/04/2025 were read as day/month/year (3 April 2025).');
  }

  const leads: CsvLead[] = [];
  let noDate = 0;
  let future = 0;
  let noContact = 0;
  let test = 0;
  for (const r of rows) {
    const ms = parseDate(r[dateCol] ?? '', dayFirst);
    if (ms === null) {
      noDate++;
      continue;
    }
    if (ms > now + 5 * 60_000) {
      future++;
      continue;
    }
    const lead: CsvLead = { created_time: new Date(ms).toISOString(), field_data: [] };
    cols.forEach((c, i) => {
      // Meta prefixes ids (l:123, f:456) and phone numbers (p:+44…).
      const v = (r[i] ?? '').trim().replace(/^p:(?=[+\d(])/, '').slice(0, CSV_LIMITS.value);
      if (!v || c.kind === 'skip') return;
      if (c.kind === 'answer') {
        if (lead.field_data.length < CSV_LIMITS.fields) lead.field_data.push({ name: c.to, values: [v] });
      } else if (c.to === 'id') {
        // Meta's are 15 digits or so; a spreadsheet's own row numbers aren't lead ids.
        const id = v.replace(/^[a-z]{1,3}:/i, '');
        if (/^\d{8,30}$/.test(id)) lead.id = id;
      } else if (c.to !== 'created_time') lead[c.to] = v.slice(0, CSV_LIMITS.text);
    });
    if (!lead.field_data.some((f) => CONTACT.has(f.name))) {
      noContact++;
      continue;
    }
    if (isTestLead(lead.field_data)) {
      test++;
      continue;
    }
    leads.push(lead);
  }
  if (noDate) warnings.push(`${plural(noDate, 'row has', 'rows have')} no date we can read and will be left out.`);
  if (future) warnings.push(`${plural(future, 'row is', 'rows are')} dated in the future and will be left out.`);
  if (noContact) warnings.push(`${plural(noContact, 'row has', 'rows have')} no name, email or phone number and will be left out.`);
  if (test) warnings.push(`${plural(test, 'test lead', 'test leads')} from Meta’s testing tool will be left out.`);
  return { leads, warnings };
}
