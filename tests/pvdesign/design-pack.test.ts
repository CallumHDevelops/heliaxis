import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkDesign } from '@/lib/pvdesign/check';
import { renderDesignPack } from '@/lib/pvdesign/design-pdf';
import { layoutPanels } from '@/lib/pvdesign/layout';
import { anchors, buildSld, sldSvg } from '@/lib/pvdesign/sld';
import { buildHouse } from '@/lib/pvdesign/house3d';

const PANEL = { wp: 400, voc: 37.4, vmp: 31.3, isc: 13.6, imp: 12.8, tempCoeffVocPct: -0.27 };
const INV = { acKw: 6, maxDcV: 600, mpptMinV: 90, mpptMaxV: 520, mpptCount: 2, maxInputCurrentA: 16, maxIscA: 20, batteryMinV: 40, batteryMaxV: 60, offGridCapable: true, generatorInput: true };
const BAT = { usableKwh: 16, nominalV: 51.2, maxChargeKw: 6, maxDischargeKw: 6 };

const sldFor = (o: Partial<Parameters<typeof buildSld>[0]> = {}) => buildSld({ systemType: 'off-grid', panelCount: 10, panelLabel: 'Test 400 W', kwp: 4, panelsPerString: [10], inverterLabel: 'Test 6 kW Hybrid', batteryLabel: 'Test 16 kWh', batteryCount: 1, generator: false, ...o });

describe('single-line diagram', () => {
  it('off-grid has no grid supply; generator and battery appear only when asked for', () => {
    const ids = (s: ReturnType<typeof sldFor>) => s.nodes.map((n) => n.id);
    expect(ids(sldFor())).not.toContain('grid');
    expect(ids(sldFor())).not.toContain('gen');
    expect(ids(sldFor({ generator: true }))).toContain('gen');
    expect(ids(sldFor({ batteryLabel: null }))).not.toContain('bat');
    expect(ids(sldFor({ systemType: 'grid-tied' }))).toContain('grid');
  });
  it('always has array, DC isolation, inverter, AC isolation, consumer unit and earthing', () => {
    expect(sldFor().nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['array', 'dcIso', 'inv', 'acIso', 'cu', 'earth']));
  });
  it('says no grid and not MCS when off-grid, and DNO when grid-tied', () => {
    expect(sldFor().notes.join(' ')).toMatch(/no connection to the grid/);
    expect(sldFor({ systemType: 'grid-tied' }).notes.join(' ')).toMatch(/distribution network operator/);
  });
  it('every link joins two real boxes, and none of the boxes overlap', () => {
    const s = sldFor({ generator: true, systemType: 'grid-tied' });
    const ids = new Set(s.nodes.map((n) => n.id));
    for (const l of s.links) expect(ids.has(l.from) && ids.has(l.to)).toBe(true);
    for (let a = 0; a < s.nodes.length; a++)
      for (let b = a + 1; b < s.nodes.length; b++) {
        const p = s.nodes[a];
        const q = s.nodes[b];
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        expect(overlap, `${p.id} / ${q.id}`).toBe(false);
      }
  });
  it('joins side to side and top to bottom', () => {
    const s = sldFor({ generator: true });
    const n = (id: string) => s.nodes.find((x) => x.id === id)!;
    const [a, b] = anchors(n('array'), n('dcIso'));
    expect(a.x).toBe(n('array').x + n('array').w);
    expect(b.x).toBe(n('dcIso').x);
    const [g1, g2] = anchors(n('gen'), n('inv'));
    expect(g1.y).toBe(n('gen').y + n('gen').h);
    expect(g2.y).toBe(n('inv').y);
  });
  it('the SVG is marked indicative and escapes text', () => {
    const svg = sldSvg(sldFor({ inverterLabel: 'A<b>&' }));
    expect(svg).toContain('Indicative — subject to site survey');
    expect(svg).not.toContain('<b>');
  });
});

describe('design pack PDF', () => {
  it('renders a real PDF with several pages', async () => {
    const layout = layoutPanels({ roofWidthMm: 8000, roofHeightMm: 3500, panel: { widthMm: 1134, heightMm: 1722 } }).best;
    const check = checkDesign({ panel: PANEL, panelCount: layout.count, inverter: INV, battery: BAT, systemType: 'off-grid', dailyLoadKwh: 8, generatorBackup: true });
    const bytes = await renderDesignPack({
      jobRef: 'HX-0001',
      customerName: 'Henry Price',
      address: '1 Example Road, Cardiff, CF10 1AA',
      issued: '2026-11-25',
      systemType: 'off-grid',
      layout,
      roofWidthMm: 8000,
      roofHeightMm: 3500,
      panelLabel: 'Test 400 W panel',
      kwp: 4,
      check,
      sld: sldFor({ generator: true, panelsPerString: check.plan?.panelsPerString ?? [] }),
      spec: [['Panels', '10 × Test 400 W'], ['Inverter', 'Test 6 kW Hybrid'], ['Battery', 'Test 16 kWh']],
      surveyLinked: false,
      house: { model: buildHouse({ lengthM: 8, slopeLengthM: 3.5, pitchDeg: 35, storeys: 2, panels: layout.panels }), faceAzimuthDeg: 180, assumptions: ['Gable roof assumed.', 'Pitch assumed at 35°.'] },
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5000);
    if (process.env.METIS_PDF_OUT) writeFileSync(process.env.METIS_PDF_OUT, bytes);
  }, 60000);
});
