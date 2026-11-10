import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultiPolygonGeometry } from '../mapArea';
import { countHomesInArea, findPlaces, OsError, RESIDENTIAL_FQ } from './osPlaces';

vi.mock('./supabaseAdmin', () => ({ supabaseAdmin: () => ({ from: () => ({ insert: async () => ({}) }) }) }));

const area: MultiPolygonGeometry = { type: 'MultiPolygon', coordinates: [[[[-3.18, 51.48], [-3.17, 51.48], [-3.17, 51.49], [-3.18, 51.48]]]] };
const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

beforeEach(() => { process.env.PROSPECTPV_OS_API_KEY = 'secret-test-key'; });
afterEach(() => { delete process.env.PROSPECTPV_OS_API_KEY; });

describe('countHomesInArea', () => {
  it('reads totalresults and asks for one result only, residential only, in WGS84', async () => {
    const f = vi.fn(reply({ header: { totalresults: 412 }, results: [{}] }));
    expect(await countHomesInArea(area, f as unknown as typeof fetch)).toBe(412);
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toMatch(/\/polygon$/);
    expect(url.searchParams.get('maxresults')).toBe('1');
    expect(url.searchParams.get('srs')).toBe('EPSG:4326');
    expect(url.searchParams.get('fq')).toBe(RESIDENTIAL_FQ);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string).geometry.type).toBe('MultiPolygon');
  });
  it('treats an empty answer as zero homes', async () => {
    expect(await countHomesInArea(area, reply({ header: {}, results: [] }))).toBe(0);
  });
  it('refuses a count it cannot trust', async () => {
    await expect(countHomesInArea(area, reply({ header: { totalresults: 'lots' } }))).rejects.toMatchObject({ kind: 'bad_response' });
    await expect(countHomesInArea(area, reply({ header: {}, results: [{}] }))).rejects.toMatchObject({ kind: 'bad_response' });
  });
  it.each([[401, 'auth'], [403, 'auth'], [429, 'rate_limited'], [400, 'bad_request'], [500, 'unavailable']])('maps HTTP %i to %s', async (status, kind) => {
    await expect(countHomesInArea(area, reply({}, status))).rejects.toMatchObject({ kind });
  });
  it('reports a network failure plainly', async () => {
    const f = (async () => { throw new Error('boom'); }) as unknown as typeof fetch;
    await expect(countHomesInArea(area, f)).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('never puts the key in an error message', async () => {
    const err = await countHomesInArea(area, reply({}, 401)).catch((e: OsError) => e);
    expect(String((err as Error).message)).not.toContain('secret-test-key');
  });
  it('needs a key', async () => {
    delete process.env.PROSPECTPV_OS_API_KEY; delete process.env.OS_DATA_HUB_KEY;
    await expect(countHomesInArea(area, reply({}))).rejects.toMatchObject({ kind: 'no_key' });
  });
});

describe('findPlaces', () => {
  it('returns addresses with coordinates and skips rows without them', async () => {
    const f = reply({ results: [
      { DPA: { UPRN: '1', ADDRESS: '1 HIGH ST, CARDIFF, CF10 1AA', LAT: 51.48, LNG: -3.18 } },
      { DPA: { UPRN: '2', ADDRESS: 'NO COORDS' } },
    ] });
    expect(await findPlaces('CF10 1AA', f)).toEqual([{ uprn: '1', address: '1 HIGH ST, CARDIFF, CF10 1AA', lat: 51.48, lng: -3.18 }]);
  });
  it('does not call out for a very short query', async () => {
    const f = vi.fn();
    expect(await findPlaces('CF', f as unknown as typeof fetch)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});
