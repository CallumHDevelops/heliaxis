/**
 * Server-only: a way to find a place on the map when OS Places refuses the key (its plan has no Places).
 * Uses Heliaxis's own address lookup (Ideal Postcodes, as the solar estimator does), which gives coordinates.
 * This only moves the map. Counting the homes in a drawn area still needs OS Places.
 */
import 'server-only';
import { place, suggest } from '@/lib/estimator/address-lookup';
import type { PlaceHit } from './osPlaces';

export async function searchViaAddressLookup(query: string): Promise<PlaceHit[]> {
  const found = await suggest(query);
  const full = await Promise.all(found.slice(0, 3).map((s) => place(s.id)));
  const out: PlaceHit[] = [];
  full.forEach((p, i) => {
    if (p && p.lat !== null && p.lng !== null) out.push({ uprn: found[i]!.id, address: p.address, lat: p.lat, lng: p.lng });
  });
  return out;
}
