import 'server-only';

/**
 * getAddress.io: the visitor types part of their address, picks it from a list, and we get that property's exact coordinates
 * (so there is no guessing the building from free text). Needs GETADDRESS_API_KEY.
 */
export const addressPickerOn = () => !!process.env.GETADDRESS_API_KEY;

export type Suggestion = { id: string; address: string };
export type Place = { lat: number; lng: number; address: string; postcode: string };

const base = 'https://api.getaddress.io';
const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i;

export async function suggest(term: string): Promise<Suggestion[]> {
  const key = process.env.GETADDRESS_API_KEY;
  if (!key || term.trim().length < 3) return [];
  const r = await fetch(`${base}/autocomplete/${encodeURIComponent(term.trim())}?api-key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!r || !r.ok) return [];
  const d = (await r.json().catch(() => null)) as { suggestions?: { address?: string; id?: string }[] } | null;
  // UK addresses only: anything without a UK postcode is dropped, whatever the service sends back.
  return (d?.suggestions ?? []).filter((s) => s.id && s.address && UK_POSTCODE.test(String(s.address))).slice(0, 8).map((s) => ({ id: String(s.id), address: String(s.address) }));
}

/** One picked address to a point on the building. Null if getAddress does not know it or gives no coordinates. */
export async function place(id: string): Promise<Place | null> {
  const key = process.env.GETADDRESS_API_KEY;
  if (!key || !/^[\w-]{4,200}$/.test(id)) return null;
  const r = await fetch(`${base}/get/${encodeURIComponent(id)}?api-key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!r || !r.ok) return null;
  const d = (await r.json().catch(() => null)) as { latitude?: number; longitude?: number; postcode?: string; formatted_address?: string[] } | null;
  if (!d || typeof d.latitude !== 'number' || typeof d.longitude !== 'number') return null;
  const postcode = String(d.postcode || '').toUpperCase();
  if (!UK_POSTCODE.test(postcode)) return null;
  const lines = (d.formatted_address ?? []).map((l) => l.trim()).filter(Boolean);
  return { lat: d.latitude, lng: d.longitude, postcode, address: [...lines, postcode].filter(Boolean).join(', ') };
}
