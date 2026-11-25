import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpecsJson, skuFrom, toBatterySpec, toInverterSpec, toPanelSize, toPanelSpec } from '@/lib/pvdesign/specs';

describe('specs typed in by a person', () => {
  it('keeps only real figures for the category and reports the rest', () => {
    const r = parseSpecsJson('{"wp":400,"voc":"37.4","width_mm":1134,"colour":"black","off_grid_capable":true}', 'panel');
    expect(r.specs).toEqual({ wp: 400, width_mm: 1134 });
    expect(r.dropped.sort()).toEqual(['colour', 'off_grid_capable', 'voc']);
  });
  it('accepts inverter booleans, rejects bad JSON and non-objects', () => {
    expect(parseSpecsJson('{"off_grid_capable":true,"ac_kw":6}', 'inverter').specs).toEqual({ off_grid_capable: true, ac_kw: 6 });
    expect(parseSpecsJson('{nope', 'inverter').error).toBeTruthy();
    expect(parseSpecsJson('[1]', 'inverter').error).toBeTruthy();
    expect(parseSpecsJson(null, 'inverter').specs).toEqual({});
  });
  it('makes a safe SKU', () => {
    expect(skuFrom('Solis', 'S6-EH1P6K (Plus)')).toBe('SOLIS-S6-EH1P6K-Plus'.toUpperCase());
    expect(skuFrom('A b', 'c/d')).toMatch(/^[A-Z0-9._/-]+$/);
  });
});

describe('datasheet spec mapping', () => {
  it('maps snake_case figures and turns anything missing or non-numeric into null (never a default)', () => {
    const p = toPanelSpec({ wp: 400, voc: '37.4', vmp: 31.3, isc: null, temp_coeff_voc_pct: -0.27, imp: 'abc' });
    expect(p).toMatchObject({ wp: 400, voc: 37.4, vmp: 31.3, isc: null, imp: null, tempCoeffVocPct: -0.27 });
    expect(toPanelSpec({}).wp).toBeNull();
    expect(toPanelSpec(null).voc).toBeNull();
  });
  it('treats off-grid capability as unknown unless it is a real boolean', () => {
    expect(toInverterSpec({}).offGridCapable).toBeNull();
    expect(toInverterSpec({ off_grid_capable: 'yes' }).offGridCapable).toBeNull();
    expect(toInverterSpec({ off_grid_capable: true, generator_input: false })).toMatchObject({ offGridCapable: true, generatorInput: false });
  });
  it('reads the panel size with the long side as the height, whichever way round it was entered', () => {
    expect(toPanelSize({ width_mm: 1722, height_mm: 1134 })).toEqual({ widthMm: 1134, heightMm: 1722 });
    expect(toPanelSize({ width_mm: 1134 })).toBeNull();
    expect(toPanelSize({ width_mm: 0, height_mm: 1722 })).toBeNull();
  });
  it('maps battery figures', () => {
    expect(toBatterySpec({ usable_kwh: 16, nominal_v: 51.2 })).toMatchObject({ usableKwh: 16, nominalV: 51.2, maxDischargeKw: null });
  });
});

describe('the design tools only calculate', () => {
  const root = path.resolve(__dirname, '../..');
  const src = readFileSync(path.join(root, 'src/lib/assistant/design-tools.ts'), 'utf8');
  const loader = readFileSync(path.join(root, 'src/lib/pvdesign/server.ts'), 'utf8');
  it('read only, except save_product, which writes only to the price book and only for admins', () => {
    expect(loader).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    const head = src.slice(0, src.indexOf("case 'save_product'"));
    expect(head).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    const save = src.slice(src.indexOf("case 'save_product'"));
    expect(save).toMatch(/prof\?\.role !== 'admin'/);
    for (const m of save.matchAll(/\.from\('([a-z_]+)'\)/g)) expect(['profiles', 'price_book']).toContain(m[1]);
    expect(src).not.toMatch(/\.delete\(|\.rpc\(/);
  });
  it('never import a sender', () => {
    expect(src).not.toMatch(/resend|ms365|whatsapp\/send|send-quote|send-document/);
  });
  it('have no hardcoded VAT rate', () => {
    for (const f of ['src/lib/pricing/price.ts', 'src/lib/assistant/design-tools.ts', 'src/lib/pvdesign/server.ts']) {
      expect(readFileSync(path.join(root, f), 'utf8'), f).not.toMatch(/\b(0\.2|1\.2|20)\s*\*\s*(net|gross|total)|vat_rate:\s*20\b|vat:\s*20\b/);
    }
  });
});
