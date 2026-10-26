import 'server-only';

/** PVGIS (the EU's free solar yield service), as SimpliPV uses it: peakpower 1 so the year's energy is the yield per kWp. */
const ENDPOINT = 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc';

export type PvgisYield = { kwhPerKwp: number; monthly: number[] | null };

/** Yield for a roof: `angle` is the pitch in degrees, `aspect` degrees from south (west positive). Null if PVGIS can't answer. */
export async function pvgisYield(lat: number, lon: number, angle: number, aspect: number): Promise<PvgisYield | null> {
  const q = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    peakpower: '1',
    loss: '14',
    angle: String(Math.round(angle)),
    aspect: String(Math.round(aspect)),
    pvtechchoice: 'crystSi',
    mountingplace: 'building',
    raddatabase: 'PVGIS-SARAH3',
    usehorizon: '1',
    outputformat: 'json',
  });
  try {
    const r = await fetch(`${ENDPOINT}?${q}`, { signal: AbortSignal.timeout(7000), next: { revalidate: 60 * 60 * 24 * 30 } });
    if (!r.ok) return null;
    const d = (await r.json()) as { outputs?: { totals?: { fixed?: { E_y?: number } }; monthly?: { fixed?: { E_m?: number }[] } } };
    const year = Number(d.outputs?.totals?.fixed?.E_y);
    if (!(year > 300 && year < 1500)) return null;
    const months = (d.outputs?.monthly?.fixed ?? []).map((m) => Number(m.E_m));
    return { kwhPerKwp: Math.round(year), monthly: months.length === 12 && months.every((m) => m >= 0) ? months : null };
  } catch {
    return null;
  }
}
