import { describe, expect, it } from 'vitest';
import { fit, layoutIsValid, layoutPanels } from '@/lib/pvdesign/layout';
import { layoutSvg } from '@/lib/pvdesign/layout-svg';

// A typical 400 W module: 1722 x 1134 mm.
const PANEL = { widthMm: 1134, heightMm: 1722 };

describe('fit', () => {
  it('counts items along a length with gaps', () => {
    expect(fit(7420 - 20, 1134, 20)).toBe(6);
    expect(fit(1000, 1134, 20)).toBe(0);
    expect(fit(1134, 1134, 20)).toBe(1);
    expect(fit(1134 + 20 + 1134, 1134, 20)).toBe(2);
  });
});

describe('layoutPanels: known roofs give known panel counts', () => {
  it('8 x 3.5 m roof, 300 mm edges, 20 mm gaps: 10 panels, with one portrait row and one landscape row', () => {
    const r = layoutPanels({ roofWidthMm: 8000, roofHeightMm: 3500, panel: PANEL });
    expect(r.best.count).toBe(10);
    expect(r.best.kind).toBe('mixed');
    expect(layoutIsValid(r.best)).toBe(true);
    const by = Object.fromEntries(r.options.map((o) => [o.kind, o.count]));
    expect(by.portrait).toBe(6);
    expect(by.landscape).toBe(8);
    expect(by.mixed).toBe(10);
  });

  it('a roof that suits one orientation returns it', () => {
    // Usable 4.2 x 3.4 m: two portrait rows of... portrait cols 3, rows 1 = 3; landscape cols 2, rows 2 = 4.
    const r = layoutPanels({ roofWidthMm: 4800, roofHeightMm: 4000, panel: PANEL, edgeMm: 300 });
    expect(r.best.count).toBeGreaterThanOrEqual(4);
    expect(layoutIsValid(r.best)).toBe(true);
  });

  it('exactly one panel fits a roof just big enough, none a hair smaller', () => {
    const exact = layoutPanels({ roofWidthMm: 1134 + 600, roofHeightMm: 1722 + 600, panel: PANEL });
    expect(exact.best.count).toBe(1);
    const tight = layoutPanels({ roofWidthMm: 1134 + 600 - 1, roofHeightMm: 1722 + 600 - 1, panel: PANEL });
    expect(tight.best.count).toBe(0);
  });

  it('returns zero for a roof smaller than its clearances, and for a bad panel', () => {
    expect(layoutPanels({ roofWidthMm: 500, roofHeightMm: 500, panel: PANEL }).best.count).toBe(0);
    expect(layoutPanels({ roofWidthMm: 8000, roofHeightMm: 3500, panel: { widthMm: 0, heightMm: 1722 } }).best.count).toBe(0);
  });

  it('smaller clearances never reduce the count, bigger ones never increase it', () => {
    const base = layoutPanels({ roofWidthMm: 8000, roofHeightMm: 3500, panel: PANEL }).best.count;
    expect(layoutPanels({ roofWidthMm: 8000, roofHeightMm: 3500, panel: PANEL, edgeMm: 150 }).best.count).toBeGreaterThanOrEqual(base);
    expect(layoutPanels({ roofWidthMm: 8000, roofHeightMm: 3500, panel: PANEL, edgeMm: 600 }).best.count).toBeLessThanOrEqual(base);
  });

  it('is deterministic and always valid across many roof sizes', () => {
    for (let w = 3000; w <= 12000; w += 700) {
      for (let h = 2000; h <= 6000; h += 650) {
        const a = layoutPanels({ roofWidthMm: w, roofHeightMm: h, panel: PANEL });
        const b = layoutPanels({ roofWidthMm: w, roofHeightMm: h, panel: PANEL });
        expect(a.best.count).toBe(b.best.count);
        expect(layoutIsValid(a.best), `${w}x${h}`).toBe(true);
        // The best layout is never worse than either single orientation.
        for (const o of a.options.filter((x) => x.kind !== 'mixed')) expect(a.best.count).toBeGreaterThanOrEqual(o.count);
      }
    }
  });
});

describe('layoutSvg', () => {
  it('carries the indicative warning, the dimensions and one rect per panel', () => {
    const r = layoutPanels({ roofWidthMm: 8000, roofHeightMm: 3500, panel: PANEL });
    const svg = layoutSvg(r.best, 8000, 3500, { panelLabel: 'Test 400 W', kwp: 4 });
    expect(svg).toContain('Indicative — subject to site survey');
    expect(svg).toContain('8 m (eaves)');
    expect(svg).toContain('3.5 m (up the slope)');
    expect(svg).toContain('4.00 kWp');
    expect((svg.match(/<title>/g) ?? []).length).toBe(10);
  });
  it('escapes text', () => {
    const r = layoutPanels({ roofWidthMm: 8000, roofHeightMm: 3500, panel: PANEL });
    expect(layoutSvg(r.best, 8000, 3500, { title: '<script>' })).not.toContain('<script>');
  });
});
