/** The pin on a customer's site: pure helpers, safe for the server, the browser and tests. */

/** Great-circle distance in metres between two points. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A coordinate in the United Kingdom's box (and so plausible as a customer's site). */
export const inUk = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= 49.5 && lat <= 61 && lng >= -8.7 && lng <= 2.1;

/** A Google Maps link to a point, or to the address when there is no point. Opens the app on a phone. */
export function mapsUrl(p: { lat?: number | null; lng?: number | null; address?: string | null; postcode?: string | null }): string | null {
  if (typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  }
  const text = [p.address, p.postcode].filter(Boolean).join(', ');
  return text ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}` : null;
}

/** "35 m" or "1.2 km". */
export const metresWords = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
