/**
 * Customers find their portal at /my with their postcode and any one of: their project number
 * (HX-0113), their surname, or the last 6 characters of their inverter's serial number, as well as by
 * the private link we send. The serial is the one typed on Job details or scanned on site (the PV array
 * test). Pure matching rules here (the route does the lookups and the rate limit), so
 * tests/portal-login.test.ts reads the same rules.
 */

/** "np19 7az" → "NP197AZ". */
export const postcodeKey = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A UK postcode's shape, so nonsense isn't looked up. */
export const looksLikePostcode = (s: string) => /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(postcodeKey(s));

/** A serial with spaces, dashes and case taken out. */
export const serialKey = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Does any of these serials end with the 6 characters typed? */
export const serialEndMatches = (serials: (string | null | undefined)[], typed: string) => {
  const want = serialKey(typed);
  return want.length === 6 && serials.some((s) => serialKey(s).length >= 6 && serialKey(s).endsWith(want));
};

/** The serials a site capture holds ([{ s, unread? }]), or a typed one. */
export function serialsFrom(v: unknown): string[] {
  if (typeof v === 'string') return v.trim() ? [v] : [];
  return Array.isArray(v) ? (v as { s?: unknown; unread?: boolean }[]).filter((x) => x && typeof x.s === 'string' && !x.unread).map((x) => String(x.s)) : [];
}

/** "O'Brien-Smith " → "obriensmith": letters only, any case, accents dropped. */
export const surnameKey = (s: string | null | undefined) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** The customer's surname: the last word of the name on the enquiry, or the last two ("van Dyke"). Never a first name. */
export function surnameMatches(fullName: string | null | undefined, typed: string): boolean {
  const want = surnameKey(typed);
  if (want.length < 2) return false;
  const words = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return surnameKey(words[words.length - 1]) === want || surnameKey(words.slice(-2).join('')) === want;
}

/** "hx 113", "HX-0113" and "0113" are all HX-0113 (the number compared without its leading zeros). */
export function projectRefMatches(ref: string | null | undefined, typed: string): boolean {
  const num = (s: string) => /^(?:HX)?-?0*(\d{1,6})$/i.exec(s.replace(/\s+/g, ''))?.[1] ?? null;
  const want = num(typed);
  return !!want && !!ref && num(ref) === want;
}

/** What they typed is something to look for: 2 or more letters or digits. */
export const looksLikeIdentifier = (s: string) => serialKey(s).length >= 2;

/** Does what they typed match this job: its project number, the customer's surname, or its inverter serial's last 6? */
export function identifierMatches(job: { ref: string | null; name: string | null; serials: string[] }, typed: string): boolean {
  return projectRefMatches(job.ref, typed) || surnameMatches(job.name, typed) || serialEndMatches(job.serials, typed);
}

export const LOGIN_FAILED = 'We couldn’t find a project with those details. Check them, or use the link we sent you. If you’re still stuck, call us on 01633 965205.';
