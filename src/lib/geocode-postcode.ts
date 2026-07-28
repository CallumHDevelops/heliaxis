/** UK postcode / outcode → coordinates via postcodes.io (no API key). */

export type GeoResult = {
  lat: number;
  lng: number;
  town: string;
  postcode: string;
};

const cache = new Map<string, GeoResult | null>();

function normPc(pc: string) {
  return pc.trim().toUpperCase().replace(/\s+/g, ' ');
}

function cacheKey(pc: string) {
  return pc.replace(/\s+/g, '');
}

/** Full postcode (e.g. CF24 3AA) or outward code (e.g. CF24). */
function looksLikeUkPostcode(pc: string) {
  const k = cacheKey(pc);
  return k.length >= 2 && /[A-Z]/i.test(k) && /\d/.test(k);
}

function fromResult(res: Record<string, unknown>, fallbackPc: string): GeoResult | null {
  const lat = res.latitude;
  const lng = res.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const district = res.admin_district;
  let town = '';
  if (typeof district === 'string') town = district;
  else if (Array.isArray(district) && district[0]) town = String(district[0]);
  else if (typeof res.parish === 'string') town = res.parish;
  else if (Array.isArray(res.parish) && res.parish[0]) town = String(res.parish[0]);
  else if (typeof res.region === 'string') town = res.region;

  return {
    lat,
    lng,
    town,
    postcode: String(res.postcode || res.outcode || fallbackPc),
  };
}

async function lookupOutcode(outcode: string): Promise<GeoResult | null> {
  const r = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(outcode)}`, {
    next: { revalidate: 86400 },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.result ? fromResult(d.result, outcode) : null;
}

async function lookupOne(pc: string): Promise<GeoResult | null> {
  const key = cacheKey(pc);
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    // Prefer full postcode
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
      next: { revalidate: 86400 },
    });
    if (r.ok) {
      const d = await r.json();
      const geo = d?.result ? fromResult(d.result, pc) : null;
      if (geo) {
        cache.set(key, geo);
        return geo;
      }
    }

    // Fall back to outward code (e.g. CF24) — area centroid
    const m = key.match(/^([A-Z]{1,2}\d[A-Z\d]?)/i);
    const oc = m ? m[1].toUpperCase() : key;
    const geo = await lookupOutcode(oc);
    cache.set(key, geo);
    return geo;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/** Bulk lookup; falls back to single / outcode lookup for misses. */
export async function geocodePostcodes(
  postcodes: string[]
): Promise<Map<string, GeoResult>> {
  const out = new Map<string, GeoResult>();
  const unique = Array.from(new Set(postcodes.map(normPc).filter(looksLikeUkPostcode)));

  const missing: string[] = [];
  for (const pc of unique) {
    const hit = cache.get(cacheKey(pc));
    if (hit) out.set(cacheKey(pc), hit);
    else if (hit === null) continue;
    else missing.push(pc);
  }

  // Split: likely full postcodes (have space or length >= 5) vs outcodes
  const full: string[] = [];
  const outs: string[] = [];
  for (const pc of missing) {
    const k = cacheKey(pc);
    if (pc.includes(' ') || k.length >= 5) full.push(pc);
    else outs.push(pc);
  }

  for (let i = 0; i < full.length; i += 100) {
    const chunk = full.slice(i, i + 100);
    try {
      const r = await fetch('https://api.postcodes.io/postcodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes: chunk }),
      });
      if (!r.ok) {
        await Promise.all(
          chunk.map(async (pc) => {
            const g = await lookupOne(pc);
            if (g) out.set(cacheKey(pc), g);
          })
        );
        continue;
      }
      const d = await r.json();
      const results = Array.isArray(d?.result) ? d.result : [];
      const stillNeed: string[] = [];
      for (const row of results) {
        const query = String(row?.query || '');
        if (!query) continue;
        const geo = row?.result ? fromResult(row.result, query) : null;
        if (geo) {
          cache.set(cacheKey(query), geo);
          out.set(cacheKey(query), geo);
        } else {
          stillNeed.push(query);
        }
      }
      await Promise.all(
        stillNeed.map(async (pc) => {
          const g = await lookupOne(pc);
          if (g) out.set(cacheKey(pc), g);
        })
      );
    } catch {
      await Promise.all(
        chunk.map(async (pc) => {
          const g = await lookupOne(pc);
          if (g) out.set(cacheKey(pc), g);
        })
      );
    }
  }

  await Promise.all(
    outs.map(async (pc) => {
      const g = await lookupOne(pc);
      if (g) out.set(cacheKey(pc), g);
    })
  );

  return out;
}

export function geoKey(postcode: string) {
  return cacheKey(normPc(postcode));
}

export function osmEmbedUrl(lat: number, lng: number, delta = 0.04) {
  const left = lng - delta;
  const right = lng + delta;
  const top = lat + delta * 0.7;
  const bottom = lat - delta * 0.7;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`;
}
