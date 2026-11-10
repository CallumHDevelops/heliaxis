import { describe, expect, it } from 'vitest';
import { SAMPLE_PACKAGE } from '@/lib/prospectpv/fixtures/sample';
import { makeCopy } from '@/components/prospectpv/letters/copy';
import { renderLettersHtml } from '@/components/prospectpv/letters/render.server';
import { estimateSavings, generationFromYield, typicalHome } from './estimates';
import { buildLetterData } from './letterData';
import { bandLabel, bandWarnings, EMPTY_PACKAGE, formToRow, missingForActive, parsePackageForm, rowToForm } from './packageForm';
import { manualLetterInputs, maxPanelsOnRoof, normalisePostcode, parseManualLetter, roofCapacity, scaffoldInputFor } from './manualLetter';
import { readiness } from './readiness';
import { footprintDimensions } from './roofSvg';
import { elevationWidthForAspect, estimateScaffolding, SCAFFOLD_GEOMETRY_DEFAULTS, type ScaffoldRates } from './scaffolding';
import { parseAdminSettings } from './settings';

const rates: ScaffoldRates = { rate_per_m2_gbp: 12, fixed_fee_gbp: 150, min_charge_gbp: 400, ...SCAFFOLD_GEOMETRY_DEFAULTS };

describe('scaffolding estimate', () => {
  it('works through length, height, area and cost', () => {
    const e = estimateScaffolding({ storeys: 2, elevationWidthM: 8, elevations: 1 }, rates);
    expect(e.lengthM).toBe(10); // 8 + 2 × 1
    expect(e.heightM).toBeCloseTo(6.2, 10); // 2 × 2.6 + 1
    expect(e.totalAreaM2).toBeCloseTo(62, 10);
    expect(e.areaCost).toBeCloseTo(744, 10);
    expect(e.cost).toBeCloseTo(894, 10); // + £150 fixed
    expect(e.rough).toBe(890);
    expect(e.minApplied).toBe(false);
  });
  it('applies the minimum charge', () => {
    const e = estimateScaffolding({ storeys: 1, elevationWidthM: 3, elevations: 1 }, { ...rates, rate_per_m2_gbp: 5, min_charge_gbp: 600 });
    expect(e.minApplied).toBe(true);
    expect(e.cost).toBe(600);
  });
  it('multiplies by elevations', () => {
    const one = estimateScaffolding({ storeys: 2, elevationWidthM: 8, elevations: 1 }, { ...rates, fixed_fee_gbp: null, min_charge_gbp: null });
    const two = estimateScaffolding({ storeys: 2, elevationWidthM: 8, elevations: 2 }, { ...rates, fixed_fee_gbp: null, min_charge_gbp: null });
    expect(two.cost).toBeCloseTo(one.cost! * 2, 6);
  });
  it('gives no figure while the rate is missing, and says what is needed', () => {
    const e = estimateScaffolding({ storeys: 2, elevationWidthM: 8, elevations: 1 }, { ...rates, rate_per_m2_gbp: null });
    expect(e.cost).toBeNull();
    expect(e.missing).toEqual(['rate per m²']);
    expect(e.totalAreaM2).toBeGreaterThan(0); // geometry still shown
  });
  it('clamps storeys and elevations and survives junk', () => {
    const e = estimateScaffolding({ storeys: 99, elevationWidthM: Number.NaN, elevations: -2 }, rates);
    expect(e.storeys).toBe(4);
    expect(e.elevations).toBe(1);
    expect(e.cost).toBeNull();
    expect(e.missing).toContain('roof width');
  });
  it('picks the elevation that faces the roof', () => {
    expect(elevationWidthForAspect('S', 9, 6)).toBe(9);
    expect(elevationWidthForAspect('W', 9, 6)).toBe(6);
    expect(elevationWidthForAspect('SE', 9, 6)).toBe(9);
  });
  it('measures a footprint from its polygon', () => {
    const d = footprintDimensions([[[0, 0], [9, 0], [9, 6], [0, 6], [0, 0]]], 'EPSG:27700');
    expect(d.lengthM).toBeCloseTo(9, 6);
    expect(d.depthM).toBeCloseTo(6, 6);
    expect(d.areaM2).toBeCloseTo(54, 6);
  });
});

describe('package form', () => {
  const good = {
    name: 'Home', minPanels: '10', maxPanels: '12', panelModel: 'Aiko Neostar 2P', panelWatts: '450', panelWarrantyYrs: '25',
    inverterModel: 'GW5K-ESA', batteryKwh: '10', batteryWarrantyYrs: '10', monitoringApp: 'SEMS+', price: '£9,000',
    claims: ['safety', 'ai_tariff'], active: 'on',
  };
  it('parses the fields the team asked for, from form strings', () => {
    const r = parsePackageForm(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({ minPanels: 10, maxPanels: 12, panelWatts: 450, panelWarrantyYrs: 25, batteryKwh: 10, price: 9000, active: true });
      expect(r.value.claims).toEqual(['ai_tariff', 'safety']); // canonical order
    }
  });
  it('lists exactly what is missing before a package can go live', () => {
    const r = parsePackageForm({ name: 'Max', minPanels: 17, active: 'on' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.active).toBe('Can’t switch on yet. Still needed: Panel model, Panel watts, Panel warranty (years), Inverter, Battery storage (kWh), Battery warranty (years), Monitoring app, Price.');
  });
  it('lets an incomplete package be saved switched off', () => {
    expect(parsePackageForm({ name: 'Max', minPanels: 17 }).ok).toBe(true);
  });
  it('validates ranges and numbers', () => {
    const r = parsePackageForm({ ...good, maxPanels: '8', panelWatts: 'lots', panelWarrantyYrs: '2.5', price: '-5' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.maxPanels).toMatch(/lower than the minimum/);
      expect(r.errors.panelWatts).toMatch(/number/);
      expect(r.errors.panelWarrantyYrs).toMatch(/whole number/);
      expect(r.errors.price).toMatch(/at least 0/);
    }
  });
  it('maps to the database columns and back', () => {
    const r = parsePackageForm(good);
    if (!r.ok) throw new Error('should parse');
    const row = formToRow(r.value);
    expect(row).toMatchObject({ min_panels: 10, max_panels: 12, panel_model: 'Aiko Neostar 2P', warranty_panel_yrs: 25, esa_inverter_model: 'GW5K-ESA', usable_kwh: 10, price_inc_vat: 9000, active: true });
    const back = rowToForm({ ...SAMPLE_PACKAGE, ...row, id: 'x' } as never);
    expect(back.panelModel).toBe('Aiko Neostar 2P');
    expect(back.price).toBe(9000);
  });
  it('flags overlapping bands on live packages', () => {
    const p = (name: string, min: number, max: number | null) => ({ ...EMPTY_PACKAGE, name, minPanels: min, maxPanels: max, active: true });
    expect(bandWarnings([p('Essential', 8, 9), p('Home', 10, 12), p('Plus', 13, 16)])).toEqual([]);
    expect(bandWarnings([p('Home', 10, 12), p('Plus', 12, 16)])[0]).toMatch(/overlaps/);
    expect(bandWarnings([p('A', 10, null), p('B', 10, null)])[0]).toMatch(/both start at 10/);
    expect(bandLabel(p('x', 10, 12))).toBe('10–12 panels');
    expect(bandLabel(p('x', 17, null))).toBe('17+ panels');
    expect(missingForActive(EMPTY_PACKAGE)).toHaveLength(8);
  });
});

describe('manual letters', () => {
  const settings = parseAdminSettings({ company: { phone: '01633 965205', registered_details: 'Reg', opt_out_url: 'x.co/optout', privacy_url: 'x.co/privacy' }, sender: { name: 'Sam Example' } });
  const form = {
    batchName: '', line1: '12 Transton Road', line2: '', town: 'Newport', postcode: 'np197ab', uprn: '', panelCount: '12',
    packageId: 'p1', templateKey: '5', aspect: 'S', roofShape: 'Pitched', widthM: '9.4', depthM: '7.6', rotationDeg: '0',
    storeys: '2', annualKwh: '4800', usableAreaM2: '',
  };
  const opts = { packageIds: ['p1'], templateKeys: [1, 2, 3, 4, 5] };

  it('parses and tidies a form', () => {
    const r = parseManualLetter(form, opts);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ postcode: 'NP19 7AB', batchName: 'Manual letters', panelCount: 12, widthM: 9.4, templateKey: 5, usableAreaM2: null });
  });
  it('explains every problem at once', () => {
    const r = parseManualLetter({ ...form, line1: '1', town: '', postcode: 'ZZZ', panelCount: '0', widthM: '1', uprn: '12', packageId: 'nope', aspect: 'up' }, opts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['aspect', 'line1', 'packageId', 'panelCount', 'postcode', 'town', 'uprn', 'widthM']);
  });
  it('normalises UK postcodes', () => {
    expect(normalisePostcode('cf10 1aa')).toBe('CF10 1AA');
    expect(normalisePostcode('M11AE')).toBe('M1 1AE');
    expect(normalisePostcode('hello')).toBeNull();
  });
  it('stops a letter promising more panels than the roof can show', () => {
    const base = { widthM: 9.4, depthM: 7.6, rotationDeg: 0, aspect: 'S' as const, roofShape: 'Pitched' as const };
    expect(roofCapacity({ ...base, panelCount: 12 }).fits).toBe(true);
    const small = { widthM: 5, depthM: 4.5, rotationDeg: 0, aspect: 'S' as const, roofShape: 'Pitched' as const };
    expect(roofCapacity({ ...small, panelCount: 20 }).fits).toBe(false);
    const max = maxPanelsOnRoof(small);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThan(10);
    expect(roofCapacity({ ...small, panelCount: max }).fits).toBe(true);
    expect(roofCapacity({ ...small, panelCount: max + 1 }).fits).toBe(false);
  });
  it('builds a printable letter that never claims aerial or OS data', () => {
    const r = parseManualLetter(form, opts);
    if (!r.ok) throw new Error('should parse');
    const { data } = buildLetterData(
      manualLetterInputs(r.value, {
        pkg: SAMPLE_PACKAGE, letterCode: '7KQ4M2XA', baseUrl: 'https://heliaxis.co.uk', now: new Date('2026-11-10T09:00:00Z'), settings,
        assets: { accreditations: 'https://example.com/a.png' }, mode: 'print',
      }),
    );
    expect(data.source).toBe('manual');
    expect(data.address.postcode).toBe('NP19 7AB');
    expect(data.estimate.kwp).toBe(5.4);
    expect(data.estimate.annualKwh).toBe(4800);
    expect(data.roof.usableAreaM2).toBe(0);
    for (const key of [1, 2, 3, 4, 5] as const) {
      const html = renderLettersHtml([{ data, templateKey: key }], { fontCss: '' });
      expect(html, `template ${key}`).not.toMatch(/aerial|Ordnance Survey/i);
      expect(html, `template ${key}`).toContain('the roof details we hold');
      expect(html, `template ${key}`).toContain('NP19 7AB');
    }
    // OS-scanned letters keep their original wording.
    const os = renderLettersHtml([{ data: { ...data, source: 'os' }, templateKey: 5 }], { fontCss: '' });
    expect(os).toContain('aerial roof data');
    expect(makeCopy(4, { ...data, source: 'os' })('frontFooter')).toContain('Ordnance Survey');
  });
  it('estimates scaffolding from the elevation the panels sit above', () => {
    const r = parseManualLetter({ ...form, aspect: 'W' }, opts);
    if (!r.ok) throw new Error('should parse');
    expect(scaffoldInputFor(r.value).elevationWidthM).toBe(7.6);
    expect(scaffoldInputFor({ ...r.value, aspect: 'S' }).elevationWidthM).toBe(9.4);
  });
});

describe('estimates and readiness', () => {
  const full = parseAdminSettings({
    'calc.assumptions': { seg_rate_gbp_per_kwh: 0.15, off_peak_spread_gbp_per_kwh: 0.15, standing_charge_gbp_per_year: 200 },
    generation: { yield_kwh_per_kwp: 890 },
    scaffolding: { rate_per_m2_gbp: 12 },
  });
  const empty = parseAdminSettings({});

  it('works yearly generation out from a yield', () => {
    expect(generationFromYield(5.4, 890)).toBe(4810);
    expect(generationFromYield(5.4, null)).toBeNull();
    expect(generationFromYield(0, 890)).toBeNull();
  });
  it('estimates a typical home, and says nothing while assumptions are missing', () => {
    const sys = { generationKwh: 4800, batteryKwh: 10, price: 9000 };
    const r = estimateSavings(typicalHome(full.inputs), sys, full);
    expect(r?.annualSaving).toBeCloseTo(1406.5, 1);
    expect(r?.paybackYears).toBeCloseTo(6.4, 1);
    expect(estimateSavings(typicalHome(empty.inputs), sys, empty)).toBeNull();
  });
  it('lists what blocks printing and what only hides a feature', () => {
    const r = readiness({ settings: empty, hasAccreditations: false });
    expect(r.blocking.map((b) => b.label)).toEqual(expect.arrayContaining([
      'Registered company details (footer)', 'Opt-out web address', 'Privacy notice web address',
      'Name of the person who signs the letters', 'Accreditation logos image (MCS, RECC, NAPIT)',
    ]));
    expect(r.advisory).toHaveLength(3);
    const ok = readiness({ settings: parseAdminSettings({ ...{ company: { phone: '1', registered_details: 'r', opt_out_url: 'o', privacy_url: 'p' }, sender: { name: 'S' } }, 'calc.assumptions': { seg_rate_gbp_per_kwh: 1, off_peak_spread_gbp_per_kwh: 1, standing_charge_gbp_per_year: 1 }, generation: { yield_kwh_per_kwp: 1 }, scaffolding: { rate_per_m2_gbp: 1 } }), hasAccreditations: true });
    expect(ok.blocking).toEqual([]);
    expect(ok.advisory).toEqual([]);
  });
});
