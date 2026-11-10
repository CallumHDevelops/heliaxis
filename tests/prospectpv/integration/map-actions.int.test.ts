/**
 * Integration: the Map screen's server actions against the real migrations, with
 * a stand-in for OS Places (a fixture, never the live service).
 *   PVTEST_DATABASE_URL=postgres://… npm run test:int      (database needs the migrations applied)
 */
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/lib/prospectpv/fixtures/os/places-polygon-count.json';

const url = process.env.PVTEST_DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url }) : (null as unknown as pg.Pool);

const USER = '00000000-0000-0000-0000-0000000000c1';
let roles: string[] = ['prospectpv_staff'];
let signedIn = true;

/** A Supabase-like client that runs each rpc as the `authenticated` role with a JWT, so RLS and pv_is_staff() apply. */
const asUser = {
  async rpc(fn: string, args: Record<string, unknown>) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query('set local role authenticated');
      await c.query('select set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify({ sub: USER, app_metadata: { roles } })]);
      const keys = Object.keys(args);
      const { rows } = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`,
        keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])));
      await c.query('commit');
      return { data: rows[0]?.r ?? null, error: null };
    } catch (e) {
      await c.query('rollback');
      return { data: null, error: { message: (e as Error).message, code: (e as { code?: string }).code } };
    } finally { c.release(); }
  },
};
const asService = {
  async rpc(fn: string) {
    const { rows } = await pool.query(`select public.${fn}() as r`);
    return { data: rows[0]?.r ?? null, error: null };
  },
  from: () => ({ insert: async (row: Record<string, unknown>) => {
    await pool.query('insert into pv_api_log (provider, endpoint, status_code, est_cost) values ($1,$2,$3,$4)', [row.provider, row.endpoint, row.status_code, row.est_cost]);
    return {};
  } }),
};

vi.mock('@/lib/prospectpv/server/supabaseAdmin', () => ({ supabaseAdmin: () => asService }));
vi.mock('@/lib/prospectpv/server/auth', () => ({ staffOrNull: async () => (signedIn ? { db: asUser, user: { id: USER }, role: 'staff' } : null) }));
vi.mock('@/lib/prospectpv/server/data', () => ({
  loadRawSettings: async () => Object.fromEntries((await pool.query('select key, value from pv_settings')).rows.map((r) => [r.key, r.value])),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const square = (w = 0.0014286, h = 0.0008983) => ({ type: 'Polygon', coordinates: [[[-3.18, 51.48], [-3.18 + w, 51.48], [-3.18 + w, 51.48 + h], [-3.18, 51.48 + h], [-3.18, 51.48]]] });

let osReply: () => Response;
const osCalls: { url: string; body: string }[] = [];

beforeEach(async () => {
  process.env.PROSPECTPV_OS_API_KEY = 'int-test-key';
  roles = ['prospectpv_staff']; signedIn = true;
  osCalls.length = 0;
  osReply = () => new Response(JSON.stringify(fixture), { status: 200 });
  vi.stubGlobal('fetch', async (u: URL, init?: RequestInit) => { osCalls.push({ url: String(u), body: String(init?.body ?? '') }); return osReply(); });
  await pool.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [USER]);
  await pool.query(`delete from pv_api_log; delete from pv_campaigns;`);
  await pool.query(`update pv_settings set value = jsonb_set(jsonb_set(value, '{monthly_cap_gbp}', 'null'::jsonb), '{require_confirmation}', 'true') where key = 'spend'`);
  await pool.query(`update pv_settings set value = value || '{"max_area_ha": 50, "max_homes_per_scan": 2000}' where key = 'map'`);
  await pool.query(`update pv_settings set value = value || '{"cost_per_call_gbp": null, "free_calls_per_month": 10000}' where key = 'solar'`);
});
afterAll(async () => { if (url) await pool.end(); });

describe.skipIf(!url)('map actions', () => {
  it('counts the homes and builds an estimate without spending on roofs', async () => {
    const { estimateArea } = await import('@/lib/prospectpv/server/mapActions');
    const r = await estimateArea(square());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estimate.homesFound).toBe(38);
    expect(r.estimate.solarCallsAtMost).toBe(38);
    expect(r.estimate.freeCallsLeft).toBe(10000);
    expect(r.estimate.costAtMostGbp).toBe(0);
    expect(r.estimate.canConfirm).toBe(true);
    expect(r.areaHa).toBeGreaterThan(0.9);
    // One cheap OS call, WGS84 in, residential filter, one result asked for. The key is only ever on the server request.
    expect(osCalls).toHaveLength(1);
    expect(osCalls[0]!.url).toContain('maxresults=1');
    expect(osCalls[0]!.url).toContain('srs=EPSG%3A4326');
    expect(JSON.parse(osCalls[0]!.body).geometry.type).toBe('MultiPolygon');
    const log = await pool.query(`select provider, endpoint, est_cost from pv_api_log`);
    expect(log.rows).toEqual([{ provider: 'os_places', endpoint: 'polygon:count', est_cost: '0.0000' }]);
  });

  it('says how many Google checks are left after some have been made this month', async () => {
    await pool.query(`insert into pv_api_log (provider, endpoint) select 'google_solar', 'x' from generate_series(1, 9990)`);
    const { estimateArea } = await import('@/lib/prospectpv/server/mapActions');
    const r = await estimateArea(square());
    expect(r.ok && r.estimate.freeCallsLeft).toBe(10);
    expect(r.ok && r.estimate.billableCallsAtMost).toBe(28);
    expect(r.ok && r.estimate.costAtMostGbp).toBeNull(); // the rate is [TBC]: no figure is invented
  });

  it('refuses an area over the limit before calling OS at all', async () => {
    const { estimateArea } = await import('@/lib/prospectpv/server/mapActions');
    const r = await estimateArea(square(0.03, 0.02));
    expect(r).toMatchObject({ ok: false });
    expect(osCalls).toHaveLength(0);
  });

  it('refuses a scan with too many homes and will not save it', async () => {
    osReply = () => new Response(JSON.stringify({ header: { totalresults: 2500 }, results: [{}] }));
    const { saveArea } = await import('@/lib/prospectpv/server/mapActions');
    const r = await saveArea({ name: 'Big', area: square() });
    expect(r).toMatchObject({ ok: false });
    expect((await pool.query('select count(*) from pv_campaigns')).rows[0].count).toBe('0');
  });

  it('shows a plain message when OS refuses the key, and logs the call', async () => {
    osReply = () => new Response('{}', { status: 401 });
    const { estimateArea } = await import('@/lib/prospectpv/server/mapActions');
    const r = await estimateArea(square());
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.message).toMatch(/key was refused/);
    expect(JSON.stringify(r)).not.toContain('int-test-key');
    expect((await pool.query(`select status_code from pv_api_log`)).rows[0].status_code).toBe(401);
  });

  it('reports a missing key without calling out', async () => {
    delete process.env.PROSPECTPV_OS_API_KEY; delete process.env.OS_DATA_HUB_KEY;
    const { estimateArea } = await import('@/lib/prospectpv/server/mapActions');
    const r = await estimateArea(square());
    expect(!r.ok && r.message).toMatch(/key isn’t set/);
    expect(osCalls).toHaveLength(0);
  });

  it('saves the area as a campaign waiting for confirmation', async () => {
    const { saveArea } = await import('@/lib/prospectpv/server/mapActions');
    const r = await saveArea({ name: 'Rhiwbina test', area: square() });
    expect(r.ok).toBe(true);
    const c = (await pool.query(`select name, search_type, status, extensions.ST_SRID(boundary) srid, est_api_cost, created_by from pv_campaigns`)).rows;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ name: 'Rhiwbina test', search_type: 'polygon', status: 'awaiting_confirmation', srid: 27700, created_by: USER });
  });

  it('needs a name, and a signed-in member of staff', async () => {
    const { saveArea, estimateArea } = await import('@/lib/prospectpv/server/mapActions');
    expect(await saveArea({ name: '  ', area: square() })).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    signedIn = false;
    expect(await estimateArea(square())).toMatchObject({ ok: false });
    expect(await saveArea({ name: 'x', area: square() })).toMatchObject({ ok: false });
    expect(osCalls).toHaveLength(0);
    signedIn = true; roles = [];
    expect(await saveArea({ name: 'x', area: square() })).toMatchObject({ ok: false });
    expect((await pool.query('select count(*) from pv_campaigns')).rows[0].count).toBe('0');
  });
});
