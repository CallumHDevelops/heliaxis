import { fold, hasText, nameRank, searchWords } from '../search-words';
import { toWaId } from '../whatsapp/shared';

/**
 * Organisations and their contacts (supabase/organisations.sql): the types, the words for them, what
 * a form may save (checked and tidied the same way in the browser and on the server), searching the
 * list, and the call / WhatsApp / email links. Pure, so it runs in the browser, on the server and in
 * scripts/test-orgs.mjs.
 *
 * A contact is its own row, not a customer record (enquiries): a supplier's account manager or a letting
 * agent's property manager never shows in the leads lists, never gets an opportunity, a reference or an
 * automatic WhatsApp. A job links to an organisation and to the contact it's dealt with through.
 */

export const ORG_TYPES = [
  { key: 'commercial', label: 'Commercial customer', short: 'Commercial', hint: 'A business we install for' },
  { key: 'landlord', label: 'Landlord or housing association', short: 'Landlord', hint: 'Lettings, housing associations' },
  { key: 'public_sector', label: 'School or public sector', short: 'Public sector', hint: 'Schools, councils, the NHS' },
  { key: 'partner', label: 'Partner who refers work', short: 'Partner', hint: 'Builders, architects, letting agents' },
  { key: 'supplier', label: 'Supplier', short: 'Supplier', hint: 'Wholesalers, manufacturers' },
  { key: 'other', label: 'Other', short: 'Other', hint: '' },
] as const;
export type OrgType = (typeof ORG_TYPES)[number]['key'];

export const isOrgType = (v: unknown): v is OrgType => ORG_TYPES.some((t) => t.key === v);
export const orgTypeLabel = (v: string | null | undefined) => ORG_TYPES.find((t) => t.key === v)?.label ?? 'Other';
export const orgTypeShort = (v: string | null | undefined) => ORG_TYPES.find((t) => t.key === v)?.short ?? 'Other';

export type Organisation = {
  id: string;
  name: string;
  type: OrgType;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  postcode: string | null;
  company_number: string | null;
  vat_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgContact = {
  id: string;
  organisation_id: string;
  name: string;
  role: string | null;
  mobile: string | null;
  email: string | null;
  notes: string | null;
  is_primary: boolean;
  created_at: string;
  /** On an organisation's page: the customer record whose WhatsApp chat is on this contact's number, if there is one. */
  chat_id?: string | null;
};

/** A row on the Organisations list. `people` is every contact's name, role and email, for the search box. */
export type OrgListRow = Organisation & {
  contacts: number;
  jobs: number;
  open_jobs: number;
  primary: Pick<OrgContact, 'id' | 'name' | 'role' | 'mobile' | 'email'> | null;
  people: string[];
};

/** A job on an organisation's page. */
export type OrgJob = {
  id: string;
  title: string;
  stage: string;
  ref: string | null;
  customer: string | null;
  contact_id: string | null;
  postcode: string | null;
  created_at: string;
};

/** The record page's Organisation card: the job's organisation, its contacts and which one this job is with. */
export type JobOrganisation = {
  id: string;
  name: string;
  type: OrgType;
  phone: string | null;
  email: string | null;
  contacts: OrgContact[];
  contact_id: string | null;
};

/* ── What a form may save ─────────────────────────────────────────────────────── */

export const ORG_LIMITS = { name: 160, phone: 40, email: 200, website: 200, address: 300, postcode: 10, company_number: 10, vat_number: 16, notes: 4000 } as const;
export const CONTACT_LIMITS = { name: 120, role: 120, mobile: 40, email: 200, notes: 2000 } as const;

type Clean<F> = { ok: true; fields: F } | { ok: false; error: string; field: string };
export type OrgFields = Partial<{ name: string; type: OrgType } & Record<Exclude<keyof typeof ORG_LIMITS, 'name'>, string | null>>;
export type ContactFields = Partial<{ name: string; is_primary: boolean } & Record<Exclude<keyof typeof CONTACT_LIMITS, 'name'>, string | null>>;

/** An email address; never one with a ? in it (a mailto: link would read the rest as cc, subject or body). */
export const isEmail = (s: unknown): s is string => typeof s === 'string' && s.length <= 200 && /^[^\s@,;<>?]+@[^\s@,;<>?]+\.[^\s@,;<>?]+$/.test(s);

/** One line: spaces squashed. Several (addresses, notes): each line trimmed, empty ones dropped. */
const oneLine = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lines = (v: unknown, max: number) =>
  String(v ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, max);

/** A phone number as typed, if it is one: digits with spaces, +, brackets or dashes, at least 6 digits. */
export function cleanPhone(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const v = oneLine(raw, ORG_LIMITS.phone);
  if (!v) return { ok: true, value: null };
  if (!/^[\d\s+()-]+$/.test(v) || v.replace(/\D/g, '').length < 6) return { ok: false };
  return { ok: true, value: v };
}

/** A website as a link: https:// added when it's left off; only http(s), and a host with a dot in it. */
export function cleanWebsite(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const v = oneLine(raw, ORG_LIMITS.website).replace(/\s/g, '');
  if (!v) return { ok: true, value: null };
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !/^[^.\s]+(\.[^.\s]+)+$/.test(u.hostname) || u.username || u.password) return { ok: false };
    // As typed (with the scheme), not URL's version of it ("example.com" stays without a trailing slash).
    return { ok: true, value: withScheme };
  } catch {
    return { ok: false };
  }
}

/** A UK postcode in capitals with its space ("np204ab" → "NP20 4AB"); anything else in capitals, as typed. */
export function cleanPostcode(raw: unknown): string | null {
  const v = oneLine(raw, 12).toUpperCase();
  if (!v) return null;
  const squashed = v.replace(/\s/g, '');
  if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(squashed)) return `${squashed.slice(0, -3)} ${squashed.slice(-3)}`;
  return v.slice(0, ORG_LIMITS.postcode);
}

/** Companies House: 8 characters, digits (padded: 1234567 → 01234567) or two letters and six digits (SC123456). */
export function cleanCompanyNumber(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const v = String(raw ?? '').replace(/\s/g, '').toUpperCase();
  if (!v) return { ok: true, value: null };
  if (/^\d{1,8}$/.test(v)) return { ok: true, value: v.padStart(8, '0') };
  if (/^[A-Z]{2}\d{6}$/.test(v)) return { ok: true, value: v };
  return { ok: false };
}

/** A UK VAT number: GB (or XI) and 9 or 12 digits, or GBGD / GBHA and 3; the GB is added when left off. */
export function cleanVatNumber(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  const v = String(raw ?? '').replace(/[\s.-]/g, '').toUpperCase();
  if (!v) return { ok: true, value: null };
  const m = /^(GB|XI)?(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/.exec(v);
  if (!m) return { ok: false };
  return { ok: true, value: `${m[1] ?? 'GB'}${m[2]}` };
}

/**
 * An organisation's details from a request, checked and tidied. Only the fields sent come back, so an
 * edit can change one thing; `creating` needs a name (and the type defaults to Commercial customer).
 */
export function cleanOrganisation(b: Record<string, unknown>, creating: boolean): Clean<OrgFields> {
  const f: OrgFields = {};
  const bad = (field: string, error: string): Clean<OrgFields> => ({ ok: false, error, field });
  if (creating || 'name' in b) {
    const name = oneLine(b.name, ORG_LIMITS.name);
    if (!name) return bad('name', 'The organisation needs a name.');
    f.name = name;
  }
  if ('type' in b || creating) {
    const t = b.type ?? 'commercial';
    if (!isOrgType(t)) return bad('type', 'Pick what kind of organisation it is.');
    f.type = t;
  }
  if ('phone' in b) {
    const p = cleanPhone(b.phone);
    if (!p.ok) return bad('phone', `“${oneLine(b.phone, 40)}” isn’t a phone number.`);
    f.phone = p.value;
  }
  if ('email' in b) {
    const e = oneLine(b.email, ORG_LIMITS.email).toLowerCase();
    if (e && !isEmail(e)) return bad('email', `“${e}” isn’t an email address.`);
    f.email = e || null;
  }
  if ('website' in b) {
    const w = cleanWebsite(b.website);
    if (!w.ok) return bad('website', `“${oneLine(b.website, 60)}” isn’t a website address.`);
    f.website = w.value;
  }
  if ('address' in b) f.address = lines(b.address, ORG_LIMITS.address) || null;
  if ('postcode' in b) f.postcode = cleanPostcode(b.postcode);
  if ('company_number' in b) {
    const c = cleanCompanyNumber(b.company_number);
    if (!c.ok) return bad('company_number', 'A company number is 8 characters, like 01234567 or SC123456.');
    f.company_number = c.value;
  }
  if ('vat_number' in b) {
    const v = cleanVatNumber(b.vat_number);
    if (!v.ok) return bad('vat_number', 'A UK VAT number is GB and 9 digits, like GB123456789.');
    f.vat_number = v.value;
  }
  if ('notes' in b) f.notes = lines(b.notes, ORG_LIMITS.notes) || null;
  return { ok: true, fields: f };
}

/** A contact's details from a request, as cleanOrganisation does it. `is_primary` only when sent as true or false. */
export function cleanContact(b: Record<string, unknown>, creating: boolean): Clean<ContactFields> {
  const f: ContactFields = {};
  const bad = (field: string, error: string): Clean<ContactFields> => ({ ok: false, error, field });
  if (creating || 'name' in b) {
    const name = oneLine(b.name, CONTACT_LIMITS.name);
    if (!name) return bad('name', 'The contact needs a name.');
    f.name = name;
  }
  if ('role' in b) f.role = oneLine(b.role, CONTACT_LIMITS.role) || null;
  if ('mobile' in b) {
    const p = cleanPhone(b.mobile);
    if (!p.ok) return bad('mobile', `“${oneLine(b.mobile, 40)}” isn’t a phone number.`);
    f.mobile = p.value;
  }
  if ('email' in b) {
    const e = oneLine(b.email, CONTACT_LIMITS.email).toLowerCase();
    if (e && !isEmail(e)) return bad('email', `“${e}” isn’t an email address.`);
    f.email = e || null;
  }
  if ('notes' in b) f.notes = lines(b.notes, CONTACT_LIMITS.notes) || null;
  if (typeof b.is_primary === 'boolean') f.is_primary = b.is_primary;
  return { ok: true, fields: f };
}

/* ── Contacts ─────────────────────────────────────────────────────────────────── */

/** The primary contact first, then by name. */
export const sortContacts = <T extends Pick<OrgContact, 'is_primary' | 'name'>>(list: T[]): T[] =>
  [...list].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name, 'en-GB'));

/** Who becomes primary when the primary contact is removed: the one added first of those left, or nobody. */
export function nextPrimary<T extends Pick<OrgContact, 'id' | 'created_at'>>(left: T[]): T | null {
  return [...left].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0] ?? null;
}

/* ── Links ────────────────────────────────────────────────────────────────────── */

/** "+44 (0)7700 900123" dials +447700900123 (the (0) is dropped). */
export const telHref = (n: string | null | undefined) => {
  const d = (n ?? '').replace(/[^\d+]/g, '').replace(/^\+440/, '+44');
  return /\d{3}/.test(d) ? `tel:${d}` : null;
};
export const mailHref = (e: string | null | undefined) => (e && isEmail(e) ? `mailto:${e}` : null);
/** WhatsApp on this device (wa.me), for a number that has no chat in the CRM yet. */
export const waMeHref = (n: string | null | undefined) => {
  const id = toWaId(n);
  return id ? `https://wa.me/${id}` : null;
};
/** Only http(s) links are ever made from a saved website. */
export const websiteHref = (w: string | null | undefined) => {
  const c = cleanWebsite(w);
  return c.ok && c.value ? c.value : null;
};
/** "example.co.uk" from "https://www.example.co.uk/". */
export const websiteShown = (w: string | null | undefined) => (w ?? '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');

/* ── Searching the list (in the browser) ──────────────────────────────────────── */

/**
 * Does every word turn up on the organisation: its name, postcode, email, phone (digits, however it was
 * typed), company or VAT number, or any of its people's names, roles and emails?
 */
export function matchesOrg(o: Pick<OrgListRow, 'name' | 'postcode' | 'email' | 'phone' | 'company_number' | 'vat_number' | 'people'>, q: string): boolean {
  const text = [o.name, o.postcode, o.email, o.company_number, o.vat_number, ...(o.people ?? [])].join(' \u0001 ');
  const digits = (o.phone ?? '').replace(/\D/g, '');
  return searchWords(q).every((w) => {
    if (hasText(text, w)) return true;
    const squashed = fold(w).replace(/\s/g, '');
    if (squashed.length >= 4 && fold(o.postcode).replace(/\s/g, '').includes(squashed)) return true;
    const d = w.replace(/\D/g, '');
    return d.length >= 4 && /^[\d\s+()-]+$/.test(w) && (digits.includes(d) || (d.startsWith('0') && digits.includes(`44${d.slice(1)}`)) || (d.startsWith('44') && digits.includes(`0${d.slice(2)}`)));
  });
}

/** The list in order: names the words start first (nameRank), then A to Z. */
export function sortOrgs<T extends Pick<OrgListRow, 'name'>>(rows: T[], q: string): T[] {
  const t = q.trim();
  return [...rows].sort((a, b) => (t ? nameRank(t, a.name) - nameRank(t, b.name) : 0) || a.name.localeCompare(b.name, 'en-GB'));
}

/** The type chips' numbers: every organisation the search finds, by type. */
export function countByType(rows: Pick<OrgListRow, 'type'>[]): Record<OrgType | 'all', number> {
  const out = Object.fromEntries([['all', rows.length], ...ORG_TYPES.map((t) => [t.key, 0])]) as Record<OrgType | 'all', number>;
  for (const r of rows) if (isOrgType(r.type)) out[r.type]++;
  return out;
}

/** "3 contacts · 2 jobs (1 open)". */
export function countsLine(r: Pick<OrgListRow, 'contacts' | 'jobs' | 'open_jobs'>): string {
  const c = `${r.contacts} contact${r.contacts === 1 ? '' : 's'}`;
  if (!r.jobs) return `${c} · no jobs yet`;
  return `${c} · ${r.jobs} job${r.jobs === 1 ? '' : 's'}${r.open_jobs && r.open_jobs !== r.jobs ? ` (${r.open_jobs} open)` : ''}`;
}

/* ── In the database (PostgREST filters) ──────────────────────────────────────── */

/**
 * One search word's alternatives on an organisation (`kind` 'org') or a contact ('contact'): text
 * columns by ilike, and phone digits however they were typed ("07700 900123" finds 07700900123 and
 * "07700 900 123"). The word must already be through cleanSearch (src/lib/global-search.ts), so it has
 * no comma, bracket, quote or wildcard to change the filter's meaning.
 */
export function orgWordFilter(w: string, kind: 'org' | 'contact'): string[] {
  const text = kind === 'org' ? ['name', 'postcode', 'email', 'company_number'] : ['name', 'email', 'role'];
  const phone = kind === 'org' ? 'phone' : 'mobile';
  const ors = text.map((c) => `${c}.ilike.%${w}%`);
  // A postcode with or without its space ("np204ab" finds NP20 4AB).
  const squashed = w.replace(/\s/g, '');
  if (kind === 'org' && /^[a-z]{1,2}\d[a-z\d]?\d[a-z]{2}$/i.test(squashed)) ors.push(`postcode.ilike.%${squashed.slice(0, -3)}%${squashed.slice(-3)}%`);
  // Phones are kept as typed: 07700 900123, 07700900123 or +44 7700 900123 all have 7700…900…123 in them.
  const digits = w.replace(/\D/g, '');
  if (digits.length >= 4 && /^[\d\s+-]+$/.test(w)) {
    const core = (digits.startsWith('44') ? digits.slice(2) : digits).replace(/^0/, '');
    ors.push(`${phone}.ilike.%${core.length >= 6 ? `${core.slice(0, -6)}%${core.slice(-6, -3)}%${core.slice(-3)}` : core}%`);
  }
  return ors;
}
