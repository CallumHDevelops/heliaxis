'use server';
/**
 * Server actions behind the Map screen: estimate a drawn area, save it as a
 * campaign. Nothing here calls Google Solar; Phase M1 spends nothing beyond one
 * cheap OS Places count.
 */
import { revalidatePath } from 'next/cache';
import { limitsFromSettings, validateDrawnArea } from '../mapArea';
import { buildEstimate, type Estimate } from '../mapEstimate';
import type { ActionResult } from './actionTypes';
import { staffOrNull } from './auth';
import { loadRawSettings } from './data';
import { countHomesInArea, logOsCall, OsError } from './osPlaces';
import { supabaseAdmin } from './supabaseAdmin';

const STAFF_DENIED = { ok: false, message: 'You need to be signed in with ProspectPV access to do that.' } as const;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export type AreaEstimate = { estimate: Estimate; areaHa: number; shapes: number };

const osMessage = (e: unknown) => {
  if (e instanceof OsError) return e.message;
  console.error('[prospectpv] estimate failed', e instanceof Error ? e.message : e);
  return 'Couldn’t check that area. Try again.';
};

async function estimateFor(area: unknown): Promise<ActionResult<AreaEstimate & { geometry: unknown }>> {
  const s = await staffOrNull();
  if (!s) return STAFF_DENIED;
  const settings = await loadRawSettings(s.db);
  const map = (settings.map ?? {}) as Record<string, unknown>;
  const checked = validateDrawnArea(area, limitsFromSettings(map));
  if (!checked.ok) return { ok: false, message: checked.message };

  let homes: number;
  try {
    homes = await countHomesInArea(checked.geometry);
    await logOsCall('polygon:count', 200);
  } catch (e) {
    await logOsCall('polygon:count', e instanceof OsError ? (e.status ?? null) : null);
    return { ok: false, message: osMessage(e) };
  }

  const solar = (settings.solar ?? {}) as Record<string, unknown>;
  const spend = (settings.spend ?? {}) as Record<string, unknown>;
  const [{ data: calls }, { data: spent }] = await Promise.all([
    s.db.rpc('pv_month_api_calls', { p_provider: 'google_solar' }),
    supabaseAdmin().rpc('pv_month_api_spend'),
  ]);
  const estimate = buildEstimate({
    homesFound: homes,
    solarCallsThisMonth: Number(calls ?? 0),
    freeCallsPerMonth: num(solar.free_calls_per_month),
    costPerCallGbp: num(solar.cost_per_call_gbp),
    monthlyCapGbp: num(spend.monthly_cap_gbp),
    spentThisMonthGbp: Number(spent ?? 0),
    maxHomesPerScan: num(map.max_homes_per_scan),
  });
  return { ok: true, estimate, areaHa: checked.areaHa, shapes: checked.shapes, geometry: checked.geometry };
}

/** Counts the homes in a drawn area and works out what a scan would cost. Spends nothing. */
export async function estimateArea(area: unknown): Promise<ActionResult<AreaEstimate>> {
  const r = await estimateFor(area);
  if (!r.ok) return r;
  const { geometry: _g, ...rest } = r;
  return rest;
}

/** Saves the area as a draft campaign waiting for confirmation. The count is redone here, not trusted from the browser. */
export async function saveArea(raw: { name?: unknown; area: unknown }): Promise<ActionResult<{ campaignId: string; areaHa: number }>> {
  const s = await staffOrNull();
  if (!s) return STAFF_DENIED;
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
  if (!name) return { ok: false, errors: { name: 'Give this area a name, for example the street or estate.' } };

  const r = await estimateFor(raw.area);
  if (!r.ok) return r;
  if (!r.estimate.canConfirm) return { ok: false, message: r.estimate.blockers[0] ?? 'This area can’t be saved as it is.' };

  const { data, error } = await s.db.rpc('pv_save_drawn_area', {
    p_name: name,
    p_geojson: r.geometry,
    p_est_cost: r.estimate.costAtMostGbp,
  });
  if (error) {
    if (error.code === '42501') return STAFF_DENIED;
    if (error.code === '22023') return { ok: false, message: error.message };
    console.error('[prospectpv] save area failed', error.message);
    return { ok: false, message: 'Couldn’t save the area. Try again.' };
  }
  const out = data as { campaign_id: string; area_ha: number };
  revalidatePath('/admin/sales/prospectpv/map');
  return { ok: true, campaignId: out.campaign_id, areaHa: Number(out.area_ha) };
}
