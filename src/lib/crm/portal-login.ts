/**
 * Customers find their portal at /my with the last 6 characters of their inverter's serial number
 * and their postcode, as well as by the private link we send. The serial is the one the office typed
 * on Job details or the one the electrician scanned on site. Pure matching rules here (the route does
 * the lookups and the rate limit), so tests/portal-login.test.ts reads the same rules.
 */

/** "np19 7az" → "NP197AZ". */
export const postcodeKey = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A UK postcode's shape, so nonsense isn't looked up. */
export const looksLikePostcode = (s: string) => /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(postcodeKey(s));

/** A serial with spaces, dashes and case taken out. */
export const serialKey = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** What the customer types: exactly 6 letters or digits (spaces and dashes ignored). */
export const looksLikeSerialEnd = (s: string) => serialKey(s).length === 6;

/** Does any of these serials end with what was typed? */
export const serialEndMatches = (serials: (string | null | undefined)[], typed: string) => {
  const want = serialKey(typed);
  return want.length === 6 && serials.some((s) => serialKey(s).length >= 6 && serialKey(s).endsWith(want));
};

/** The serials a site capture holds ([{ s, unread? }]), or a typed one. */
export function serialsFrom(v: unknown): string[] {
  if (typeof v === 'string') return v.trim() ? [v] : [];
  return Array.isArray(v) ? (v as { s?: unknown; unread?: boolean }[]).filter((x) => x && typeof x.s === 'string' && !x.unread).map((x) => String(x.s)) : [];
}

export const LOGIN_FAILED = 'We couldn’t find a project with that serial number and postcode. Check both, or use the link we sent you. If you’re still stuck, call us on 01633 965205.';
