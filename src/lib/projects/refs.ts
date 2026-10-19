/**
 * Customer and job references (HX-0042 for the customer and their first job, HX-0042-2 for the next):
 * which one a screen shows, and how a search finds them. The references come from
 * supabase/customer-refs.sql; before that has run they're missing and nothing here finds anything.
 *
 * Pure (no imports), so scripts/test-projects.mjs loads it straight into node. The WhatsApp dock has
 * its own copy of the two matchers (dock-shared.ts) with the same rules.
 */

/** "HX-0042", "hx42", "hx 42", "hx-0042-2", or a number starting with 0 ("0042", up to 6 digits). */
const REF_QUERY = /^(?:hx[\s-]?(\d{1,6})|(0\d{0,5}))(?:-(\d{1,3}))?$/i;
const REF = /^hx-(\d+)(?:-(\d+))?$/i;

/** A search that should look at references. "42" on its own isn't one (it could be a house number). */
export function looksLikeRef(q: string): boolean {
  return REF_QUERY.test(q.trim());
}

/** Typed with "HX" in front, so it's only ever a reference (a bare "0042" could be part of a phone number too). */
export function refOnly(q: string): boolean {
  return /^hx/i.test(q.trim()) && looksLikeRef(q);
}

/**
 * Does the search `q` find `ref`? Either what was typed is the start of the ref ("HX-004" while typing
 * HX-0042), or the numbers match ("hx42" finds HX-0042 and HX-0042-2; "hx-0042-2" only HX-0042-2).
 */
export function refMatches(q: string, ref: string | null | undefined): boolean {
  const m = REF_QUERY.exec(q.trim());
  const r = REF.exec((ref ?? '').trim());
  if (!m || !r) return false;
  const digits = m[1] ?? m[2];
  const suffix = m[3];
  const typed = `HX-${digits}${suffix ? `-${suffix}` : ''}`;
  if (ref!.trim().toUpperCase().startsWith(typed.toUpperCase())) return true;
  if (Number(r[1]) !== Number(digits)) return false;
  return !suffix || Number(r[2] ?? 0) === Number(suffix);
}

/**
 * `ilike` patterns that find in the database what refMatches finds: the start of what was typed, and the
 * reference with that number (42 → HX-0042 and HX-0042-…). Empty when `q` isn't a reference search. Only
 * letters, digits, "-" and "%" in them, so they're safe inside a filter.
 */
export function refPatterns(q: string): string[] {
  const m = REF_QUERY.exec(q.trim());
  if (!m) return [];
  const digits = m[1] ?? m[2];
  const suffix = m[3];
  const canonical = `HX-${String(Number(digits)).padStart(4, '0')}`;
  const typed = `HX-${digits}${suffix ? `-${suffix}` : ''}`;
  const exact = suffix ? `${canonical}-${Number(suffix)}` : canonical;
  // Typed in full ("HX-0042"): its start already covers the ref and its later jobs.
  return exact.toUpperCase() === typed.toUpperCase() ? [`${typed}%`] : [`${typed}%`, exact, ...(suffix ? [] : [`${canonical}-%`])];
}

/** What a card or row shows to tell jobs apart: the job's ref, else the customer's, else the postcode. */
export function shownRef(p: { project_ref?: string | null; customer_ref?: string | null; postcode?: string | null }): string | null {
  return p.project_ref || p.customer_ref || p.postcode || null;
}
