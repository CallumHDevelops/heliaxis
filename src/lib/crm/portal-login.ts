/**
 * Customers find their portal at /my with their surname and postcode, as well as by the private
 * link we send. Pure matching rules here (the route does the lookups and the rate limit), so
 * tests/portal-login.test.ts reads the same rules.
 */

/** "O'Brien-Smith " → "obriensmith": letters only, any case, accents dropped. */
export const surnameKey = (s: string | null | undefined) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** "np19 7az" → "NP197AZ". */
export const postcodeKey = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** A UK postcode's shape, so nonsense isn't looked up. */
export const looksLikePostcode = (s: string) => /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(postcodeKey(s));

/** The customer's surname: the last word of the name on the enquiry ("Mrs Jane van Dyke" matches "Dyke" and "van Dyke"). */
export function surnameMatches(fullName: string | null | undefined, typed: string): boolean {
  const want = surnameKey(typed);
  if (want.length < 2) return false;
  const words = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return surnameKey(words[0]) === want;
  // The last word, or the last two together ("van Dyke", "De Souza").
  return surnameKey(words[words.length - 1]) === want || surnameKey(words.slice(-2).join('')) === want;
}

export const LOGIN_FAILED = 'We couldn’t find a project with that surname and postcode. Check both, or use the link we sent you. If you’re still stuck, call us on 01633 965205.';
