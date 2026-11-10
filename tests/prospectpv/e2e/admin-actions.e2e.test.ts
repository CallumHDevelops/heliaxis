/**
 * End to end: the real server actions and the PDF route, through supabase-js and
 * PostgREST, into Postgres with the real migrations and row level security.
 *
 * Setup (see README): a disposable database with the migrations applied and
 * PostgREST pointed at it.
 *   PVE2E_REST_URL=http://localhost:3001  PVE2E_JWT_SECRET=...  PVE2E_DB_URL=postgres://...
 *   CHROME_PATH=/path/to/chromium   (for the PDF test)
 */
import { createHmac } from 'node:crypto';
import http from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const REST = process.env.PVE2E_REST_URL;
const SECRET = process.env.PVE2E_JWT_SECRET ?? '';
const DB = process.env.PVE2E_DB_URL;
const on = !!(REST && DB && SECRET);

const USER = '00000000-0000-0000-0000-0000000000a1';
const b64 = (x: Buffer | string) => Buffer.from(x).toString('base64url');
function jwt(roles: string[]) {
  const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64(JSON.stringify({ role: 'authenticated', sub: USER, app_metadata: { roles }, exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `${h}.${p}.${createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
function client(roles: string[]): SupabaseClient {
  return createClient(REST ?? 'http://x', 'anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt(roles)}` }, fetch: (u, i) => fetch(String(u).replace('/rest/v1/', '/'), i) },
  });
}

let who: 'admin' | 'staff' | 'none' = 'admin';
vi.mock('@/lib/prospectpv/server/auth', () => ({
  staffOrNull: async () => {
    if (who === 'none') return null;
    const roles = who === 'admin' ? ['prospectpv_admin'] : ['prospectpv_staff'];
    return { db: client(roles), user: { id: USER, app_metadata: { roles } }, role: who };
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const pool = on ? new pg.Pool({ connectionString: DB }) : (null as unknown as pg.Pool);
let assetServer: http.Server;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const complete = { name: 'Home', minPanels: 10, maxPanels: 12, panelModel: 'Aiko Neostar 2P', panelWatts: 450, panelWarrantyYrs: 25, inverterModel: 'GW5K-ESA', batteryKwh: 10, batteryWarrantyYrs: 10, monitoringApp: 'SEMS+', price: 9000, claims: ['ai_tariff', 'safety'], active: true };
const company = { 'company::phone': '01633 965205', 'company::website': 'heliaxis.co.uk', 'company::registered_details': 'registered in England and Wales, company no. 00000000', 'company::business_address': '', 'company::opt_out_url': 'heliaxis.co.uk/optout', 'company::privacy_url': 'https://heliaxis.co.uk/privacy', 'sender::name': 'Sam Example', 'sender::role': 'Director' };
const letterForm = { batchName: '', line1: '12 Transton Road', line2: '', town: 'Newport', postcode: 'np197ab', uprn: '', panelCount: 12, packageId: '', templateKey: 5, aspect: 'S', roofShape: 'Pitched', widthM: 9.4, depthM: 7.6, rotationDeg: 0, storeys: 2, annualKwh: 4800, usableAreaM2: '' };

async function reset() {
  await pool.query(`delete from pv_responses; delete from pv_letters; delete from pv_roof_assessments; delete from pv_campaigns; delete from pv_properties; delete from pv_suppression; delete from pv_packages;
    update pv_extras set price = null, active = false;
    update pv_letter_assets set storage_path = null;
    update pv_settings set value = '{"phone":"01633 965205","website":"heliaxis.co.uk","registered_details":null,"business_address":null,"opt_out_url":null,"privacy_url":null}' where key = 'company';
    update pv_settings set value = '{"name":null,"role":"Director"}' where key = 'sender';
    update pv_settings set value = '{"rate_per_m2_gbp":null,"fixed_fee_gbp":null,"min_charge_gbp":null,"end_return_m":1,"storey_height_m":2.6,"top_lift_m":1}' where key = 'scaffolding';
    update pv_settings set value = '{"seg_rate_gbp_per_kwh":null,"off_peak_spread_gbp_per_kwh":null,"standing_charge_gbp_per_year":null}' where key = 'calc.assumptions';
    update pv_settings set value = '{"enabled":false,"lender_name":null,"fca_wording":null}' where key = 'finance';`);
}

describe.skipIf(!on)('admin server actions (real database, real RLS)', () => {
  let actions: typeof import('@/lib/prospectpv/server/actions');
  let data: typeof import('@/lib/prospectpv/server/data');

  beforeAll(async () => {
    process.env.PROSPECTPV_PUBLIC_BASE_URL = 'https://heliaxis.co.uk';
    await new Promise<void>((res) => {
      assetServer = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'image/png' }); r.end(PNG); }).listen(3002, res);
    });
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:3002';
    actions = await import('@/lib/prospectpv/server/actions');
    data = await import('@/lib/prospectpv/server/data');
  });
  afterAll(async () => { assetServer?.close(); await pool?.end(); });
  beforeEach(async () => { who = 'admin'; await reset(); });

  const makePackage = async (over: Record<string, unknown> = {}) => {
    expect(await actions.savePackage({ ...complete, ...over })).toEqual({ ok: true });
    return (await pool.query(`select id from pv_packages where name = $1`, [over.name ?? complete.name])).rows[0].id as string;
  };
  const readyToPrint = async () => {
    expect(await actions.saveSettingsSection('company', company)).toEqual({ ok: true });
    await pool.query(`update pv_letter_assets set storage_path = 'accreditations/test.png' where slot = 'accreditations'`);
  };

  describe('packages', () => {
    it('lets only admins change packages', async () => {
      who = 'staff';
      const r = await actions.savePackage(complete);
      expect(r).toMatchObject({ ok: false });
      expect((await pool.query('select count(*) from pv_packages')).rows[0].count).toBe('0');
      who = 'none';
      expect(await actions.savePackage(complete)).toMatchObject({ ok: false });
    });
    it('saves an incomplete package switched off, and refuses to switch it on', async () => {
      expect(await actions.savePackage({ name: 'Max', minPanels: 17 })).toEqual({ ok: true });
      const r = await actions.savePackage({ name: 'Max 2', minPanels: 17, active: 'on' });
      expect(r).toMatchObject({ ok: false });
      expect((r as { errors: Record<string, string> }).errors.active).toMatch(/Panel model.*Inverter.*Battery storage/);
    });
    it('stores the fields the team asked for and goes live', async () => {
      const id = await makePackage();
      const row = (await pool.query('select * from pv_packages where id = $1', [id])).rows[0];
      expect(row).toMatchObject({ min_panels: 10, max_panels: 12, panel_model: 'Aiko Neostar 2P', warranty_panel_yrs: 25, esa_inverter_model: 'GW5K-ESA', active: true });
      expect(Number(row.usable_kwh)).toBe(10);
      expect(Number(row.price_inc_vat)).toBe(9000);
    });
    it('edits in place, rejects a duplicate name, duplicates and deletes', async () => {
      const id = await makePackage();
      expect(await actions.savePackage({ ...complete, id, price: '9,500' })).toEqual({ ok: true });
      expect(Number((await pool.query('select price_inc_vat from pv_packages where id=$1', [id])).rows[0].price_inc_vat)).toBe(9500);
      expect(await actions.savePackage({ ...complete })).toMatchObject({ ok: false, message: expect.stringMatching(/already used/) });
      expect(await actions.duplicatePackage(id)).toEqual({ ok: true });
      const copy = (await pool.query(`select id, active from pv_packages where name = 'Home (copy)'`)).rows[0];
      expect(copy.active).toBe(false);
      expect(await actions.deletePackage(copy.id)).toEqual({ ok: true });
    });
    it('refuses to delete a package that letters use', async () => {
      await readyToPrint();
      const id = await makePackage();
      const made = await actions.createManualLetter({ ...letterForm, packageId: id });
      expect(made).toMatchObject({ ok: true });
      const r = await actions.deletePackage(id);
      expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/1 letter uses this package/) });
    });
    it('needs a price before an extra is switched on', async () => {
      const { id } = (await pool.query(`select id from pv_extras where key = 'diverter'`)).rows[0];
      expect(await actions.saveExtra({ id, name: 'Hot water diverter', description: '', price: '', active: true })).toMatchObject({ ok: false });
      expect(await actions.saveExtra({ id, name: 'Hot water diverter', description: 'x', price: '£450', active: true })).toEqual({ ok: true });
      expect(Number((await pool.query('select price from pv_extras where id=$1', [id])).rows[0].price)).toBe(450);
    });
  });

  describe('settings', () => {
    it('stores pence as pounds, keeps what it was not asked to change, and is admin only', async () => {
      const raw = { 'calc.assumptions::seg_rate_gbp_per_kwh': '15', 'calc.assumptions::off_peak_spread_gbp_per_kwh': '12.5', 'calc.assumptions::standing_charge_gbp_per_year': '200', 'generation::yield_kwh_per_kwp': '890' };
      who = 'staff';
      expect(await actions.saveSettingsSection('savings', raw)).toMatchObject({ ok: false });
      who = 'admin';
      expect(await actions.saveSettingsSection('savings', raw)).toEqual({ ok: true });
      const a = (await pool.query(`select value from pv_settings where key='calc.assumptions'`)).rows[0].value;
      expect(a).toEqual({ seg_rate_gbp_per_kwh: 0.15, off_peak_spread_gbp_per_kwh: 0.125, standing_charge_gbp_per_year: 200 });
      const s = await data.loadSettings(client(['prospectpv_admin']));
      expect(s.assumptions.seg_rate_gbp_per_kwh).toBe(0.15);
      expect(s.generation.yield_kwh_per_kwp).toBe(890);
    });
    it('keeps finance off until the lender and FCA wording exist', async () => {
      const r = await actions.saveSettingsSection('finance', { 'finance::enabled': true, 'finance::lender_name': '', 'finance::fca_wording': '' });
      expect(r).toMatchObject({ ok: false });
      expect((await pool.query(`select value->>'enabled' as e from pv_settings where key='finance'`)).rows[0].e).toBe('false');
      expect(await actions.saveSettingsSection('finance', { 'finance::enabled': true, 'finance::lender_name': 'Lender', 'finance::fca_wording': 'FCA wording' })).toEqual({ ok: true });
    });
    it('rejects bad values with a message per field', async () => {
      const r = await actions.saveSettingsSection('scaffolding', { 'scaffolding::rate_per_m2_gbp': 'lots', 'scaffolding::fixed_fee_gbp': '', 'scaffolding::min_charge_gbp': '', 'scaffolding::storey_height_m': '9', 'scaffolding::top_lift_m': '1', 'scaffolding::end_return_m': '1' });
      expect(r).toMatchObject({ ok: false });
      expect((r as { errors: Record<string, string> }).errors['scaffolding::rate_per_m2_gbp']).toMatch(/number/);
      expect((r as { errors: Record<string, string> }).errors['scaffolding::storey_height_m']).toMatch(/4 or less/);
    });
  });

  describe('creating letters', () => {
    it('lists what is missing instead of printing a letter with gaps', async () => {
      const id = await makePackage();
      const r = await actions.createManualLetter({ ...letterForm, packageId: id });
      expect(r).toMatchObject({ ok: false });
      const labels = (r as { blocking: { label: string }[] }).blocking.map((b) => b.label);
      expect(labels).toContain('Registered company details (footer)');
      expect(labels).toContain('Accreditation logos image (MCS, RECC, NAPIT)');
      expect((await pool.query('select count(*) from pv_letters')).rows[0].count).toBe('0');
    });

    it('creates a letter once set up, with its code, estimate and scaffolding', async () => {
      await readyToPrint();
      expect(await actions.saveSettingsSection('scaffolding', { 'scaffolding::rate_per_m2_gbp': '12', 'scaffolding::fixed_fee_gbp': '150', 'scaffolding::min_charge_gbp': '400', 'scaffolding::storey_height_m': '2.6', 'scaffolding::top_lift_m': '1', 'scaffolding::end_return_m': '1' })).toEqual({ ok: true });
      const id = await makePackage();
      const r = await actions.createManualLetter({ ...letterForm, packageId: id });
      expect(r).toMatchObject({ ok: true, code: expect.stringMatching(/^[2-9A-HJ-NP-Z]{8}$/) });
      const row = (await pool.query(`select l.*, a.scaffold_est, a.storeys, p.postcode, p.uprn as puprn from pv_letters l join pv_roof_assessments a on a.uprn = l.uprn join pv_properties p on p.uprn = l.uprn`)).rows[0];
      expect(row).toMatchObject({ source: 'manual', created_by: USER, template_key: 5, postcode: 'NP19 7AB', storeys: 2 });
      expect(Number(row.uprn)).toBeLessThan(0);
      // 9.4 m wall + 1 m each end = 11.4 m; 2 storeys × 2.6 m + 1 m = 6.2 m; × £12 + £150 fixed
      expect(Number(row.scaffold_est)).toBeCloseTo(11.4 * 6.2 * 12 + 150, 2);
      expect(row.printed_values).toMatchObject({ source: 'manual', letterCode: row.short_code, qrUrl: `https://heliaxis.co.uk/r/${row.short_code}`, estimate: { panelCount: 12, kwp: 5.4, annualKwh: 4800, batteryKwh: 10 }, package: { name: 'Home', priceIncVat: 9000 } });
      expect(row.printed_values.company.registeredDetails).toMatch(/00000000/);
      expect(row.printed_values.images.accreditations).toBe('http://localhost:3002/storage/v1/object/public/prospectpv-assets/accreditations/test.png');
    });

    it('will not write to the same address twice, however it is typed', async () => {
      await readyToPrint();
      const id = await makePackage();
      expect(await actions.createManualLetter({ ...letterForm, packageId: id })).toMatchObject({ ok: true });
      const again = await actions.createManualLetter({ ...letterForm, packageId: id, line1: ' 12 TRANSTON road ', postcode: 'NP19 7AB' });
      expect(again).toMatchObject({ ok: false, message: expect.stringMatching(/already created for this address.*once every 6 months/) });
      expect((await pool.query('select count(*) from pv_letters')).rows[0].count).toBe('1');
    });

    it('blocks an address that has opted out', async () => {
      await readyToPrint();
      const id = await makePackage();
      await pool.query(`insert into pv_suppression (address, reason) values ('9 Opt Out Close, Newport, NP20 1XX', 'test')`);
      const r = await actions.createManualLetter({ ...letterForm, packageId: id, line1: '9 Opt Out Close', postcode: 'NP20 1XX' });
      expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/do-not-contact/) });
    });

    it('stops a letter promising more panels than the roof can show, or fewer than the package covers', async () => {
      await readyToPrint();
      const id = await makePackage();
      const big = await actions.createManualLetter({ ...letterForm, packageId: id, panelCount: 40, widthM: 6, depthM: 5 });
      expect((big as { errors: Record<string, string> }).errors.panelCount).toMatch(/only fits about \d+ panels/);
      const small = await actions.createManualLetter({ ...letterForm, packageId: id, panelCount: 6 });
      expect((small as { errors: Record<string, string> }).errors.panelCount).toMatch(/Home starts at 10 panels/);
    });

    it('refuses staff without ProspectPV access, and inactive packages', async () => {
      await readyToPrint();
      const id = await makePackage({ active: false });
      expect(await actions.createManualLetter({ ...letterForm, packageId: id })).toMatchObject({ ok: false, errors: { packageId: expect.any(String) } });
      who = 'none';
      expect(await actions.createManualLetter({ ...letterForm, packageId: id })).toMatchObject({ ok: false });
    });

    it('previews with [TBC] markers before everything is set up, and never claims aerial data', async () => {
      const id = await makePackage();
      const r = await actions.previewManualLetter({ ...letterForm, packageId: id });
      expect(r).toMatchObject({ ok: true });
      const { html, missing } = r as { html: string; missing: unknown[] };
      expect(html).toContain('NP19 7AB');
      expect(html).toContain('[TBC: registered details]');
      expect(html).not.toMatch(/aerial|Ordnance Survey/i);
      expect(missing.length).toBeGreaterThan(0);
      expect((await pool.query('select count(*) from pv_letters')).rows[0].count).toBe('0');
    });
  });

  describe('the letters list', () => {
    async function three() {
      await readyToPrint();
      const id = await makePackage();
      const rows = [['12 Transton Road', 'NP19 7AB', 5], ['3 Moy Road', 'CF24 4HA', 2], ['88 Alpha Street', 'NP20 4DD', 5]] as const;
      const out: { id: string; code: string }[] = [];
      for (const [line1, postcode, templateKey] of rows) {
        const r = await actions.createManualLetter({ ...letterForm, packageId: id, line1, postcode, templateKey });
        expect(r).toMatchObject({ ok: true });
        out.push(r as { id: string; code: string });
      }
      return out;
    }

    it('finds letters by address, postcode, code, template and what the customer did', async () => {
      const [a, b] = await three();
      const db = client(['prospectpv_staff']);
      expect((await data.listLetters(db, {})).total).toBe(3);
      expect((await data.listLetters(db, { q: 'moy' })).rows.map((r) => r.address.line1)).toEqual(['3 Moy Road']);
      expect((await data.listLetters(db, { q: 'np19' })).rows.map((r) => r.address.postcode)).toEqual(['NP19 7AB']);
      expect((await data.listLetters(db, { q: a!.code.toLowerCase() })).rows.map((r) => r.id)).toEqual([a!.id]);
      expect((await data.listLetters(db, { template: 2 })).rows.map((r) => r.id)).toEqual([b!.id]);
      expect((await data.listLetters(db, { source: 'scan' })).total).toBe(0);
      expect((await data.listLetters(db, { show: 'unviewed' })).total).toBe(3);
      await pool.query(`update pv_letters set view_count = 2 where id = $1`, [a!.id]);
      await pool.query(`insert into pv_responses (letter_id, uprn, type, payload) select id, uprn, 'booking', '{"name":"Alex"}' from pv_letters where id = $1`, [a!.id]);
      expect((await data.listLetters(db, { show: 'viewed' })).rows.map((r) => r.id)).toEqual([a!.id]);
      const booked = await data.listLetters(db, { show: 'booked' });
      expect(booked.rows.map((r) => r.id)).toEqual([a!.id]);
      expect(booked.rows[0]).toMatchObject({ booked: true, views: 2, packageName: 'Home', panels: 12, source: 'manual' });
    });

    it('treats odd search text as text, not as filter syntax', async () => {
      await three();
      const db = client(['prospectpv_staff']);
      for (const q of ['a,b)', '%', "'; drop table pv_letters; --", '*,or=(id.neq.0)']) {
        await expect(data.listLetters(db, { q })).resolves.toBeDefined();
      }
      expect((await pool.query('select count(*) from pv_letters')).rows[0].count).toBe('3');
    });

    it('opens one letter with its estimate and activity', async () => {
      const [a] = await three();
      await pool.query(`insert into pv_responses (letter_id, uprn, type, payload) select id, uprn, 'booking', '{"name":"Alex"}' from pv_letters where id = $1`, [a!.id]);
      const d = await data.getLetter(client(['prospectpv_staff']), a!.id);
      expect(d).toMatchObject({ code: a!.code, source: 'manual', packageName: 'Home', campaignName: 'Manual letters' });
      expect(d!.data.address.line1).toBe('12 Transton Road');
      expect(d!.assessment).toMatchObject({ storeys: 2 });
      expect(d!.responses).toHaveLength(1);
      expect(await data.getLetter(client(['prospectpv_staff']), '00000000-0000-0000-0000-000000000000')).toBeNull();
      expect(await data.getLetter(client(['prospectpv_staff']), 'nope')).toBeNull();
    });

    it('shows nothing to someone without ProspectPV access', async () => {
      await three();
      expect((await data.listLetters(client([]), {})).total).toBe(0);
    });
  });

  describe('PDF download', () => {
    it('makes a print-ready PDF for a letter, and refuses without sign-in', async () => {
      await readyToPrint();
      const id = await makePackage();
      const made = (await actions.createManualLetter({ ...letterForm, packageId: id })) as { id: string };
      const { GET } = await import('@/app/api/prospectpv/letters/[id]/pdf/route');
      const req = (q = '') => ({ nextUrl: new URL(`http://x/api/prospectpv/letters/${made.id}/pdf${q}`) }) as never;

      const res = await GET(req(), { params: Promise.resolve({ id: made.id }) });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toMatch(/^inline; filename="manual-letters_M\d+\.pdf"$/);
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      const text = buf.toString('latin1');
      expect((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(2); // front and back
      expect(/\/MediaBox\s*\[\s*0\s+0\s+59[45](\.\d+)?\s+84[12](\.\d+)?\s*\]/.test(text)).toBe(true); // A4 (594.96 × 841.92 pt)

      const other = await GET(req('?template=2'), { params: Promise.resolve({ id: made.id }) });
      expect(other.status).toBe(200);

      who = 'none';
      expect((await GET(req(), { params: Promise.resolve({ id: made.id }) })).status).toBe(401);
      who = 'admin';
      expect((await GET(req(), { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) })).status).toBe(404);
    });
  });
});
