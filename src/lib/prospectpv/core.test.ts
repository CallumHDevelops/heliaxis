import { describe, expect, it } from 'vitest';
import { SAMPLE_FOOTPRINT, SAMPLE_INPUTS, SAMPLE_L_FOOTPRINT, SAMPLE_PACKAGE } from '@/lib/prospectpv/fixtures/sample';
import { resolveClaims } from './claims';
import { buildLetterData, LetterDataError } from './letterData';
import { arrayKwp, matchPackage } from './packages';
import { qrMatrix } from './qr';
import { buildRoofPlan, mainAspectFromAreas } from './roofSvg';
import { CODE_ALPHABET, generateShortCode, landingUrl, normaliseShortCode, withUniqueShortCode } from './shortCode';
import { assignTemplate, validateSplits } from './split';
import type { PackageRow } from './types';

describe('short codes', () => {
  it('are 8 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 2000; i++) {
      const c = generateShortCode();
      expect(c).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
      expect(c).not.toMatch(/[01OI]/);
    }
    expect(CODE_ALPHABET).toHaveLength(32);
  });

  it('use every symbol without bias', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 20000; i++) for (const ch of generateShortCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(32);
    const expected = (20000 * 8) / 32;
    for (const n of counts.values()) expect(Math.abs(n - expected) / expected).toBeLessThan(0.08);
  });

  it('normalise from URLs', () => {
    expect(normaliseShortCode(' 7kq4m2xa ')).toBe('7KQ4M2XA');
    expect(normaliseShortCode('7KQ4M2X0')).toBeNull();
    expect(normaliseShortCode('7KQ4M2X')).toBeNull();
    expect(normaliseShortCode(undefined)).toBeNull();
  });

  it('retry on unique violations only', async () => {
    let calls = 0;
    const row = await withUniqueShortCode(async (code) => {
      calls++;
      return calls < 3 ? { data: null, error: { code: '23505' } } : { data: { code }, error: null };
    });
    expect(calls).toBe(3);
    expect(row.code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    await expect(withUniqueShortCode(async () => ({ data: null, error: { code: '42501' } }))).rejects.toBeTruthy();
  });

  it('build landing URLs with nothing personal in them', () => {
    expect(landingUrl('https://heliaxis.co.uk/', '7KQ4M2XA')).toBe('https://heliaxis.co.uk/r/7KQ4M2XA');
  });
});

describe('split testing', () => {
  it('is stable per home and close to the requested split', () => {
    const splits = [{ templateKey: 5 as const, splitPct: 50 }, { templateKey: 2 as const, splitPct: 50 }];
    const counts = { 2: 0, 5: 0 };
    for (let u = 0; u < 4000; u++) {
      const k = assignTemplate('camp-1', 100000000 + u * 7, splits) as 2 | 5;
      expect(assignTemplate('camp-1', 100000000 + u * 7, splits)).toBe(k);
      counts[k]++;
    }
    expect(counts[2] / 4000).toBeGreaterThan(0.46);
    expect(counts[2] / 4000).toBeLessThan(0.54);
  });

  it('validates splits', () => {
    expect(validateSplits([{ templateKey: 5, splitPct: 100 }])).toBeNull();
    expect(validateSplits([{ templateKey: 5, splitPct: 60 }, { templateKey: 1, splitPct: 30 }])).toMatch(/100%/);
    expect(validateSplits([{ templateKey: 5, splitPct: 50 }, { templateKey: 5, splitPct: 50 }])).toMatch(/once/);
    expect(() => assignTemplate('c', 1, [])).toThrow();
  });
});

describe('package matching', () => {
  const pkg = (name: string, min: number, active = true): PackageRow => ({ ...SAMPLE_PACKAGE, id: name, name, min_panels: min, active });
  const all = [pkg('Essential', 8), pkg('Home', 10), pkg('Home Plus', 13), pkg('Max', 17)];

  it('picks the largest active package the roof can take', () => {
    expect(matchPackage(8, all)).toMatchObject({ status: 'matched', package: { name: 'Essential' } });
    expect(matchPackage(12, all)).toMatchObject({ status: 'matched', package: { name: 'Home' } });
    expect(matchPackage(13, all)).toMatchObject({ status: 'matched', package: { name: 'Home Plus' } });
    expect(matchPackage(40, all)).toMatchObject({ status: 'matched', package: { name: 'Max' } });
  });

  it('marks roofs below the smallest package too_small', () => {
    expect(matchPackage(7, all)).toMatchObject({ status: 'too_small', smallestMinPanels: 8 });
  });

  it('ignores inactive packages', () => {
    const r = matchPackage(20, [pkg('Essential', 8), pkg('Max', 17, false)]);
    expect(r).toMatchObject({ status: 'matched', package: { name: 'Essential' } });
    expect(matchPackage(20, [pkg('Max', 17, false)]).status).toBe('too_small');
  });

  it('computes kWp', () => {
    expect(arrayKwp(12, 450)).toBe(5.4);
    expect(arrayKwp(9, 435)).toBe(3.92);
  });
});

describe('benefit claims', () => {
  const all = ['ai_tariff', 'safety', 'heating', 'expandable', 'backup', 'all_in_one'] as const;
  it('only show heating with a heated module and backup with backup included', () => {
    expect(resolveClaims({ claims: [...all], heated_module: false, backup_included: false })).toEqual([
      'ai_tariff', 'safety', 'expandable', 'all_in_one',
    ]);
    expect(resolveClaims({ claims: [...all], heated_module: true, backup_included: true })).toEqual([...all]);
  });
  it('respect the package claims list', () => {
    expect(resolveClaims({ claims: ['safety'], heated_module: true, backup_included: true })).toEqual(['safety']);
  });
});

describe('roof plan', () => {
  const panels = (svg: string) => (svg.match(/pv-roof-panel/g) ?? []).length;
  const coords = (svg: string) => [...svg.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);

  it('draws the requested number of panels inside the 300 × 200 frame', () => {
    const plan = buildRoofPlan({ ...SAMPLE_FOOTPRINT, mainAspect: 'S', panelCount: 12, roofShape: 'Pitched' });
    expect(plan.panelsDrawn).toBe(12);
    expect(panels(plan.panelAreaSvg)).toBe(12);
    expect(plan.panelAreaSvg).toContain('pv-roof-ridge');
    for (const [x, y] of coords(plan.panelAreaSvg)) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(300);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(200);
    }
    expect(plan.footprintSvgPath).toMatch(/^M[\d. L]+Z$/);
  });

  it('puts panels on the south side for a south aspect, north for north', () => {
    const rect = { coordinates: [[[0, 0], [10, 0], [10, 7], [0, 7], [0, 0]]] as [number, number][][], crs: 'EPSG:27700' as const };
    const avgY = (svg: string) => { const c = coords(svg); return c.reduce((s, [, y]) => s + y, 0) / c.length; };
    const south = buildRoofPlan({ ...rect, mainAspect: 'S', panelCount: 6 });
    const north = buildRoofPlan({ ...rect, mainAspect: 'N', panelCount: 6 });
    expect(avgY(south.panelAreaSvg)).toBeGreaterThan(100); // lower half of the drawing (north up)
    expect(avgY(north.panelAreaSvg)).toBeLessThan(100);
  });

  it('handles an L-shaped footprint and flat roofs', () => {
    const l = buildRoofPlan({ ...SAMPLE_L_FOOTPRINT, mainAspect: 'S', panelCount: 10, roofShape: 'Pitched' });
    expect(l.panelsDrawn).toBeGreaterThan(0);
    const flat = buildRoofPlan({ ...SAMPLE_L_FOOTPRINT, mainAspect: 'S', panelCount: 10, roofShape: 'Flat' });
    expect(flat.panelAreaSvg).not.toContain('pv-roof-ridge');
    expect(flat.panelsDrawn).toBe(10);
  });

  it('accepts WGS84 footprints', () => {
    const lonlat = [[[-2.95, 51.59], [-2.94986, 51.59], [-2.94986, 51.59007], [-2.95, 51.59007], [-2.95, 51.59]]] as [number, number][][];
    const plan = buildRoofPlan({ coordinates: lonlat, crs: 'EPSG:4326', mainAspect: 'S', panelCount: 8 });
    expect(plan.panelsDrawn).toBe(8);
  });

  it('reports truncation rather than drawing panels off the roof', () => {
    const tiny = { coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] as [number, number][][], crs: 'EPSG:27700' as const };
    const plan = buildRoofPlan({ ...tiny, mainAspect: 'S', panelCount: 20 });
    expect(plan.truncated).toBe(true);
    expect(plan.panelsDrawn).toBeLessThan(20);
  });

  it('picks the southerly face on symmetrical roofs', () => {
    expect(mainAspectFromAreas({ N: 26, S: 26 })).toBe('S');
    expect(mainAspectFromAreas({ E: 20, W: 20 })).toBe('E');
    expect(mainAspectFromAreas({ N: 40 })).toBeNull();
  });
});

describe('QR', () => {
  it('encodes the landing URL as a square module path', () => {
    const q = qrMatrix('https://heliaxis.co.uk/r/7KQ4M2XA');
    expect(q.size).toBeGreaterThanOrEqual(25);
    expect(q.path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
  });
});

describe('letter data', () => {
  it('builds merge fields from rows', () => {
    const { data, dataDates } = buildLetterData(SAMPLE_INPUTS);
    expect(data.qrUrl).toBe('https://heliaxis.co.uk/r/7KQ4M2XA');
    expect(data.date).toBe('9 November 2026');
    expect(data.address.line1).toBe('12 Transton Road');
    expect(data.estimate).toEqual({ panelCount: 12, kwp: 5.4, batteryKwh: 10, annualKwh: 4812 });
    expect(data.roof.mainAspect).toBe('South');
    expect(data.roof.roofShape).toBe('Pitched');
    expect(data.roof.usableAreaM2).toBe(26);
    expect(data.package.claims).not.toContain('backup'); // backup_included is false
    expect(data.package.claims).toContain('heating');
    expect(dataDates.os_data_date).toBe('2026-09-01');
  });

  it('keeps finance off unless switched on, worded and lender-approved', () => {
    expect(buildLetterData(SAMPLE_INPUTS).data.finance.enabled).toBe(false);
    const wordedNoExample = buildLetterData({
      ...SAMPLE_INPUTS,
      finance: { enabled: true, lender_name: 'Lender', fca_wording: 'FCA' },
    });
    expect(wordedNoExample.data.finance.enabled).toBe(false);
    const on = buildLetterData({
      ...SAMPLE_INPUTS,
      pkg: { ...SAMPLE_PACKAGE, finance_example_text: 'Example' },
      finance: { enabled: true, lender_name: 'Lender', fca_wording: 'FCA' },
    });
    expect(on.data.finance).toEqual({ enabled: true, exampleText: 'Example', lenderName: 'Lender', fcaWording: 'FCA' });
  });

  it('refuses to build a printable letter while [TBC] fields are missing', () => {
    try {
      buildLetterData({ ...SAMPLE_INPUTS, mode: 'print', pkg: { ...SAMPLE_PACKAGE, price_inc_vat: null } });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LetterDataError);
      const missing = (e as LetterDataError).missing;
      expect(missing).toContain('Home price');
      expect(missing).toContain('registered company details');
      expect(missing).toContain('sender name');
      expect(missing).toContain('accreditation logos image');
      expect(missing).toContain('privacy notice URL');
    }
  });

  it('marks gaps visibly in preview mode', () => {
    const { data } = buildLetterData({ ...SAMPLE_INPUTS, company: { ...SAMPLE_INPUTS.company, registered_details: null } });
    expect(data.company.registeredDetails).toBe('[TBC: registered details]');
  });
});
