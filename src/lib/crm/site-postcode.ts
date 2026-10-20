/**
 * A job's site postcode (crm_projects.postcode) and the customer's (enquiries.postcode): whether a
 * postcode is UK-shaped, which jobs follow when the customer's is corrected, and which have a site
 * postcode of their own.
 *
 * Pure (no imports), so scripts/test-postcode-follows.mjs loads it straight into node and the record
 * page can use it in the browser. The shapes are booking/geo.ts's (normPostcode, POSTCODE_IN_TEXT),
 * which is server-only.
 */

/** A whole UK postcode with the spaces taken out ("CF398YY"). */
const FULL = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
/** A postcode written inside an address. */
const IN_TEXT = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi;

/** "cf39 8yy" → "CF398YY", for comparing (spaces and case aside). "88888" stays "88888". */
export const postcodeKey = (pc: string | null | undefined): string => String(pc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Shaped like a UK postcode ("CF39 8YY", "cf398yy"). A lead form's "88888" isn't. */
export const ukPostcode = (pc: string | null | undefined): boolean => FULL.test(postcodeKey(pc));

/** The postcodes written in an address, as keys. */
function postcodesIn(address: string | null | undefined): string[] {
  return [...String(address || '').matchAll(IN_TEXT)].map((m) => postcodeKey(m[1] + m[2]));
}

/**
 * The customer's postcode is changing from `was` to `now`: does this job's site postcode go with it?
 * Only when the job was just carrying a copy: no postcode of its own, or the customer's old one. A job
 * with a different postcode (another property) keeps it, and so does one whose address has another
 * postcode written in it: address text is never rewritten, so a person changes that in Job details.
 * Nothing follows a postcode that's been cleared or hasn't really changed ("cf39 8yy" → "CF39 8YY").
 */
export function followsCustomerPostcode(
  job: { address?: string | null; postcode?: string | null },
  was: string | null | undefined,
  now: string | null | undefined
): boolean {
  const from = postcodeKey(was);
  const to = postcodeKey(now);
  if (!to || to === from) return false;
  const own = postcodeKey(job.postcode);
  if (own && own !== from) return false;
  return postcodesIn(job.address).every((k) => k === to);
}

/** The job's site names a postcode other than `pc`: its own, or one written in its address. */
export function siteHasOtherPostcode(job: { address?: string | null; postcode?: string | null }, pc: string | null | undefined): boolean {
  const k = postcodeKey(pc);
  const own = postcodeKey(job.postcode);
  return (!!own && own !== k) || postcodesIn(job.address).some((x) => x !== k);
}
