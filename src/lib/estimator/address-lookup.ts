import 'server-only';

/**
 * Ideal Postcodes (UK, Royal Mail data): the visitor types part of their address, picks it from a list, and we get that
 * property's postcode and, where the service gives them, its coordinates. Needs IDEAL_POSTCODES_API_KEY.
 * (getAddress.io, used first, closed down in February 2026.)
 */
export const addressPickerOn = () => !!process.env.IDEAL_POSTCODES_API_KEY;

export type Suggestion = { id: string; address: string };
/** Coordinates are missing when the service does not give them: the caller then finds the point from the address text. */
export type Place = { lat: number | null; lng: number | null; address: string; postcode: string };

const base = 'https://api.ideal-postcodes.co.uk/v1';
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i;

export async function suggest(term: string): Promise<Suggestion[]> {
  const key = process.env.IDEAL_POSTCODES_API_KEY;
  if (!key || term.trim().length < 3) return [];
  const r = await fetch(`${base}/autocomplete/addresses?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(term.trim())}&limit=8`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!r || !r.ok) return [];
  const d = (await r.json().catch(() => null)) as { result?: { hits?: { id?: string; suggestion?: string }[] } } | null;
  // UK addresses only: anything without a UK postcode is dropped, whatever the service sends back.
  return (d?.result?.hits ?? []).filter((h) => h.id && h.suggestion && UK_POSTCODE.test(String(h.suggestion))).slice(0, 8).map((h) => ({ id: String(h.id), address: String(h.suggestion) }));
}

/** One picked address in full. Null if the service does not know it. */
export async function place(id: string): Promise<Place | null> {
  const key = process.env.IDEAL_POSTCODES_API_KEY;
  if (!key || !/^[\w-]{4,200}$/.test(id)) return null;
  const r = await fetch(`${base}/autocomplete/addresses/${encodeURIComponent(id)}/gbr?api_key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!r || !r.ok) return null;
  const d = (await r.json().catch(() => null)) as { result?: Record<string, unknown> } | null;
  const a = d?.result;
  if (!a) return null;
  const postcode = String(a.postcode || '').toUpperCase();
  if (!UK_POSTCODE.test(postcode)) return null;
  const parts = [a.line_1, a.line_2, a.line_3, a.post_town].map((x) => String(x ?? '').trim()).filter(Boolean);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { lat: num(a.latitude), lng: num(a.longitude), address: [...parts, postcode].join(', '), postcode };
}
