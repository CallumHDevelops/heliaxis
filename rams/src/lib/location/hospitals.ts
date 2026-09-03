import 'server-only';

/**
 * Nearest A&E lookup, via the OpenStreetMap Overpass API. Free and keyless.
 *
 * IMPORTANT — why this only ever SUGGESTS:
 * OSM does not cleanly separate a Type 1 A&E from an Urgent Treatment Centre or
 * a Minor Injuries Unit; both are commonly tagged emergency=yes. Directing an
 * operative with a fall injury to a UTC that cannot receive major trauma is
 * exactly the failure this field exists to prevent. So every candidate is
 * classified and ranked, and a human confirms the choice before it is stored.
 */

export type HospitalCandidate = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  /** Straight-line kilometres from the site. */
  distanceKm: number;
  /**
   * full_ae   — tagged as an emergency department and nothing suggests otherwise
   * minor_only — name indicates a UTC / MIU / walk-in centre, NOT a major A&E
   * unknown   — tagged as a hospital but emergency provision is unclear
   */
  classification: 'full_ae' | 'minor_only' | 'unknown';
  phone: string | null;
  osmUrl: string;
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/** Names that mean "not a major A&E", however the site is tagged. */
const MINOR_PATTERNS = [
  /minor\s*injur/i,
  /urgent\s*(treatment|care)/i,
  /\bUTC\b/,
  /\bMIU\b/,
  /walk[-\s]?in/i,
  /out[-\s]?of[-\s]?hours/i,
  /community\s*hospital/i,
];

const FULL_PATTERNS = [
  /accident\s*(and|&)\s*emergency/i,
  /\bA\s*&\s*E\b/i,
  /emergency\s*department/i,
];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function classify(tags: Record<string, string>): HospitalCandidate['classification'] {
  const name = `${tags.name ?? ''} ${tags['name:en'] ?? ''}`;

  if (MINOR_PATTERNS.some((re) => re.test(name))) return 'minor_only';
  if (FULL_PATTERNS.some((re) => re.test(name))) return 'full_ae';

  // emergency=yes on a hospital is the standard OSM marker for an A&E, but it
  // is applied loosely, so it earns "full" only without a minor-unit name.
  if (tags.emergency === 'yes' && tags.amenity === 'hospital') return 'full_ae';
  if (tags['healthcare:speciality']?.includes('emergency')) return 'full_ae';

  return 'unknown';
}

function addressOf(tags: Record<string, string>): string | null {
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:city'] ?? tags['addr:town'],
    tags['addr:postcode'],
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

async function runOverpass(query: string): Promise<Record<string, unknown>[] | null> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        // Hospitals move rarely; a day of caching keeps us well inside the
        // Overpass fair-use policy.
        next: { revalidate: 86400 },
      });
      if (!res.ok) continue;
      const body = await res.json();
      if (Array.isArray(body?.elements)) return body.elements;
    } catch {
      // Try the next mirror.
    }
  }
  return null;
}

/**
 * Turn raw Overpass elements into ranked candidates. Pure — no I/O — so the
 * classification, de-duplication and ordering rules can be tested directly.
 */
export function rankHospitals(
  elements: Record<string, unknown>[],
  lat: number,
  lng: number,
  limit = 8
): HospitalCandidate[] {
  const seen = new Set<string>();
  const candidates: HospitalCandidate[] = [];

  for (const el of elements) {
    const tags = (el.tags ?? {}) as Record<string, string>;
    const name = tags.name ?? tags['name:en'];
    if (!name) continue;

    const centre = el.center as { lat?: number; lon?: number } | undefined;
    const elLat = typeof el.lat === 'number' ? el.lat : centre?.lat;
    const elLng = typeof el.lon === 'number' ? el.lon : centre?.lon;
    if (typeof elLat !== 'number' || typeof elLng !== 'number') continue;

    // A hospital mapped as both a node and a way would otherwise appear twice.
    const dedupeKey = name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    candidates.push({
      id: `${el.type}/${el.id}`,
      name,
      address: addressOf(tags),
      lat: elLat,
      lng: elLng,
      distanceKm: Math.round(haversineKm(lat, lng, elLat, elLng) * 10) / 10,
      classification: classify(tags),
      phone: tags.phone ?? tags['contact:phone'] ?? null,
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    });
  }

  const weight = { full_ae: 0, unknown: 1, minor_only: 2 };
  candidates.sort((a, b) => {
    // A full A&E a few km further away still beats a minor-injuries unit.
    if (weight[a.classification] !== weight[b.classification]) {
      return weight[a.classification] - weight[b.classification];
    }
    return a.distanceKm - b.distanceKm;
  });

  return candidates.slice(0, limit);
}

/**
 * Candidate A&E departments near a point, nearest first, full A&E ranked above
 * minor-injury units at a similar distance.
 */
export async function nearestAandE(
  lat: number,
  lng: number,
  radiusKm = 40
): Promise<HospitalCandidate[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const radius = Math.round(Math.min(80, Math.max(5, radiusKm)) * 1000);
  const around = `(around:${radius},${lat},${lng})`;

  const query = `[out:json][timeout:25];
(
  node["amenity"="hospital"]["emergency"="yes"]${around};
  way["amenity"="hospital"]["emergency"="yes"]${around};
  relation["amenity"="hospital"]["emergency"="yes"]${around};
  node["emergency"="department"]${around};
  way["emergency"="department"]${around};
);
out center tags;`;

  const elements = await runOverpass(query);
  if (!elements) return [];

  return rankHospitals(elements, lat, lng);
}

/** The line written into the project record once a candidate is confirmed. */
export function formatHospital(c: HospitalCandidate): string {
  const bits = [c.name, c.address, c.phone].filter(Boolean);
  return `${bits.join(', ')} — ${c.distanceKm} km`;
}
