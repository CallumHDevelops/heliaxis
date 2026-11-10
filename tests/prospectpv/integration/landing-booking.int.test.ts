/**
 * Integration: booking route + landing page against the real migrations.
 * Needs a disposable database with the migrations applied:
 *   PVTEST_DATABASE_URL=postgres://… npm run test:int
 * Skipped when PVTEST_DATABASE_URL is not set.
 */
import pg from 'pg';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_LETTER } from '@/lib/prospectpv/fixtures/sample';
import { makeShim } from './pgSupabaseShim';

const url = process.env.PVTEST_DATABASE_URL;
const pool = url ? new pg.Pool({ connectionString: url }) : (null as unknown as pg.Pool);

vi.mock('@/lib/prospectpv/server/supabaseAdmin', () => ({ supabaseAdmin: () => makeShim(pool) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-real-ip': '203.0.113.9' }) }));
const notified: unknown[] = [];
vi.mock('@/lib/prospectpv/server/notify', () => ({ notifyTeam: async (n: unknown) => void notified.push(n) }));

const CODE = 'H7KQ4M2X';
const UPRN = 10099999001;

async function reset() {
  await pool.query(`delete from pv_responses; delete from pv_rate_limits; delete from pv_suppression; delete from pv_letters;
    delete from pv_campaigns; delete from pv_properties; delete from pv_buildings;`);
  await pool.query(`insert into pv_properties (uprn, address_line1, town, postcode) values ($1, '12 Transton Road', 'Newport', 'NP19 7AB')`, [UPRN]);
  await pool.query(`insert into pv_campaigns (id, name, search_type, search_value) values ('22222222-2222-2222-2222-222222222222', 'int', 'postcode', 'NP19 7AB')`);
  await pool.query(
    `insert into pv_letters (campaign_id, uprn, template_key, template_version, short_code, expires_at, printed_values)
     values ('22222222-2222-2222-2222-222222222222', $1, 5, 1, $2, now() + interval '1 year', $3)`,
    [UPRN, CODE, JSON.stringify({ ...SAMPLE_LETTER, letterCode: CODE })],
  );
  // Sample prices for the test only.
  await pool.query(`update pv_extras set price = case key when 'ev_charger' then 1000 when 'diverter' then 450 when 'backup' then 600 else 400 end, active = true`);
  await pool.query(`update pv_settings set value = value || '{"module_price_gbp": 2000, "max_kwh": 30}' where key = 'battery'`);
  await pool.query(`update pv_settings set value = value || '{"booking_rate_limit_per_hour": 5}' where key = 'landing'`);
  await pool.query(`update pv_settings set value = '{"seg_rate_gbp_per_kwh":0.15,"off_peak_spread_gbp_per_kwh":0.15,"standing_charge_gbp_per_year":200}' where key = 'calc.assumptions'`);
  notified.length = 0;
}

afterAll(async () => { if (url) await pool.end(); });

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/prospectpv/book/route');
  const req = new Request('http://localhost/api/prospectpv/book', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.9' },
    body: JSON.stringify(body),
  });
  const res = await POST(req as never);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

const booking = {
  code: CODE, name: 'Alex Jones', phone: '07700 900123', email: 'alex@example.com', bestTime: 'Morning', consent: true,
  usageKwh: 4200, monthlyBill: 140, homePattern: 'all', extraModules: 1, extras: ['diverter'],
};
const bookings = async () =>
  (await pool.query(`select payload from pv_responses where type = 'booking'`)).rows.map((r) => r.payload);

describe.skipIf(!url)('booking route (real database)', () => {
  beforeEach(reset);

  it('stores the booking with calculator inputs and a server-computed total', async () => {
    const r = await post(booking);
    expect(r.status).toBe(200);
    const [b] = await bookings();
    expect(b).toMatchObject({
      name: 'Alex Jones', phone: '07700900123', usage_kwh: 4200, monthly_bill: 140, home_pattern: 'all',
      battery_kwh: 15, extra_modules: 1, quoted_total: 9000 + 2000 + 450, letter_code: CODE, consent: true,
    });
    expect(b.consent_text).toMatch(/I own this property/);
    expect(b.extras).toEqual([{ key: 'diverter', name: 'Hot water diverter', price: 450 }]);
    expect(notified).toHaveLength(1);
  });

  it('ignores a tampered total: unknown extras dropped, modules capped', async () => {
    await post({ ...booking, extraModules: 99, extras: ['made_up'], quotedTotal: 1 });
    const [b] = await bookings();
    expect(b.quoted_total).toBe(9000 + 4 * 2000);
    expect(b.battery_kwh).toBe(30);
    expect(b.extras).toEqual([]);
  });

  it('refuses without consent and stores nothing', async () => {
    const r = await post({ ...booking, consent: false });
    expect(r.status).toBe(422);
    expect((r.json.errors as Record<string, string>).consent).toBeTruthy();
    expect(await bookings()).toHaveLength(0);
  });

  it('quietly drops honeypot submissions', async () => {
    const r = await post({ ...booking, company: 'Spam Ltd' });
    expect(r.status).toBe(200);
    expect(await bookings()).toHaveLength(0);
  });

  it('returns 404 for unknown and expired codes', async () => {
    expect((await post({ ...booking, code: 'ZZZZZZZZ' })).status).toBe(404);
    await pool.query(`update pv_letters set expires_at = now() - interval '1 day'`);
    expect((await post(booking)).status).toBe(404);
  });

  it('rate limits bookings per connection', async () => {
    await pool.query(`update pv_settings set value = value || '{"booking_rate_limit_per_hour": 2}' where key = 'landing'`);
    expect((await post(booking)).status).toBe(200);
    expect((await post(booking)).status).toBe(200);
    expect((await post(booking)).status).toBe(429);
    expect(await bookings()).toHaveLength(2);
  });

  it('clamps calculator inputs to the configured slider ranges', async () => {
    await post({ ...booking, usageKwh: 50000 });
    expect((await bookings())[0].usage_kwh).toBe(10000);
  });
});

describe.skipIf(!url)('landing page (real database)', () => {
  beforeEach(reset);

  it('greets the address, shows printed figures and counts the view', async () => {
    const { default: LandingPage } = await import('@/app/r/[code]/page');
    const html = renderToStaticMarkup(await LandingPage({ params: Promise.resolve({ code: CODE.toLowerCase() }) }));
    expect(html).toContain('Hey <span>12 Transton Road</span>!');
    expect(html).toContain('Room for 12 panels');
    expect(html).toContain('5.4 kWp');
    expect(html).toContain('Book my free survey · £9,000');
    expect(html).toContain('Saving per year');
    expect(html).toContain(`/r/${CODE}/optout`);
    expect(html).not.toContain('Warm Homes'); // finance is off
    const { rows } = await pool.query(`select view_count from pv_letters`);
    expect(rows[0].view_count).toBe(1);
  });

  it('hides the calculator while assumptions are [TBC]', async () => {
    await pool.query(`update pv_settings set value = '{"seg_rate_gbp_per_kwh":null,"off_peak_spread_gbp_per_kwh":null,"standing_charge_gbp_per_year":null}' where key = 'calc.assumptions'`);
    const { default: LandingPage } = await import('@/app/r/[code]/page');
    const html = renderToStaticMarkup(await LandingPage({ params: Promise.resolve({ code: CODE }) }));
    expect(html).not.toContain('Saving per year');
    expect(html).toContain('Your survey includes a full MCS performance estimate');
  });

  it('shows the generic not-found page for unknown codes without revealing anything', async () => {
    const { default: LandingPage } = await import('@/app/r/[code]/page');
    const html = renderToStaticMarkup(await LandingPage({ params: Promise.resolve({ code: 'ZZZZZZZZ' }) }));
    expect(html).toContain('This link isn’t working');
    expect(html).toContain('01633 965205');
  });
});
