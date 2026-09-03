import 'server-only';

/**
 * UK postcode → coordinates via postcodes.io. Free, no API key, and already
 * proven in the main Heliaxis site. This is the fallback source of truth for
 * coordinates whenever the address provider does not return them.
 */

export type PostcodeResult = {
  postcode: string;
  lat: number;
  lng: number;
  town: string;
  county: string | null;
  country: string | null;
};

export function looksLikePostcode(value: string): boolean {
  // Deliberately loose: the API is the real validator, this just avoids
  // firing a request at obvious non-postcodes.
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d?[A-Z]{0,2}$/i.test(value.trim());
}

function normalise(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

function shape(result: Record<string, unknown>, fallback: string): PostcodeResult | null {
  const lat = result.latitude;
  const lng = result.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

  return {
    postcode: str(result.postcode) ?? str(result.outcode) ?? fallback,
    lat,
    lng,
    town: str(result.admin_ward) ?? str(result.admin_district) ?? str(result.region) ?? '',
    county: str(result.admin_county) ?? str(result.admin_district),
    country: str(result.country),
  };
}

export async function geocodePostcode(postcode: string): Promise<PostcodeResult | null> {
  const pc = normalise(postcode);
  if (!pc) return null;

  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
      // Postcode centroids essentially never move; cache hard.
      next: { revalidate: 604800 },
    });
    if (res.ok) {
      const body = await res.json();
      const hit = body?.result ? shape(body.result, pc) : null;
      if (hit) return hit;
    }

    // Fall back to the outward code so a partially-typed postcode still gives
    // a usable area centroid for the hospital search.
    const outcode = pc.replace(/\s+/g, '').match(/^([A-Z]{1,2}\d[A-Z\d]?)/i)?.[1];
    if (!outcode) return null;

    const outRes = await fetch(
      `https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`,
      { next: { revalidate: 604800 } }
    );
    if (!outRes.ok) return null;
    const outBody = await outRes.json();
    return outBody?.result ? shape(outBody.result, outcode) : null;
  } catch {
    return null;
  }
}
