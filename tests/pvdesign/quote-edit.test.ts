import { describe, expect, it } from 'vitest';
import { applyEdits, diffQuote, findLine, MAX_DISCOUNT_PERCENT, type EditOp } from '@/lib/quotes/edit';
import { DEFAULT_TERMS, totalsOf, type QuoteContent, type QuoteLine } from '@/lib/quotes/types';

const line = (o: Partial<QuoteLine> & { id: string; description: string }): QuoteLine => ({ qty: 1, unit_pence: 0, vat_rate: 0, cost_pence: 0, mode: 'manual', markup: 0, ...o });
const base = (): QuoteContent => ({
  intro: 'Hi',
  terms: DEFAULT_TERMS,
  blocks: [
    { id: 'b1', type: 'text', heading: 'Important', body: 'Indicative' },
    {
      id: 'b2',
      type: 'items',
      heading: 'Your quote',
      lines: [
        line({ id: 'p1', description: 'Acme 400W panel', detail: 'PANEL', qty: 8, unit_pence: 10000, cost_pence: 8000, vat_rate: 0 }),
        line({ id: 'p2', description: 'Acme 6kW Hybrid', detail: 'INV', unit_pence: 120000, cost_pence: 90000, vat_rate: 0 }),
        line({ id: 'p3', description: 'Installation labour', detail: '1 day', qty: 1, unit_pence: 45000, cost_pence: 30000, vat_rate: 20 }),
      ],
    },
  ],
});
const ok = (r: ReturnType<typeof applyEdits>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};
const gross = (c: QuoteContent) => totalsOf(c).gross;

describe('findLine', () => {
  const lines = (base().blocks[1] as { lines: QuoteLine[] }).lines;
  it('finds a line by id, SKU or words, and says when it is ambiguous or missing', () => {
    expect((findLine(lines, 'p2') as QuoteLine).id).toBe('p2');
    expect((findLine(lines, 'panel') as QuoteLine).id).toBe('p1');
    expect((findLine(lines, 'hybrid') as QuoteLine).id).toBe('p2');
    expect(findLine(lines, 'acme')).toMatchObject({ error: expect.stringMatching(/matches 2 lines/) });
    expect(findLine(lines, 'nothing')).toMatchObject({ error: expect.stringMatching(/No line matches/) });
  });
});

describe('applyEdits', () => {
  it('"swap to 10 panels": changes the quantity and the total, and keeps everything else', () => {
    const r = ok(applyEdits(base(), [{ op: 'set_qty', line: 'PANEL', qty: 10 }]));
    expect(gross(r.content)).toBe(gross(base()) + 20000);
    expect(r.content.terms).toBe(DEFAULT_TERMS);
    expect(r.content.blocks[0]).toMatchObject({ type: 'text', heading: 'Important' });
    expect(r.overwrites).toBe(false); // adding panels overwrites nothing
  });
  it('lowering a quantity is an overwrite that needs confirming', () => {
    expect(ok(applyEdits(base(), [{ op: 'set_qty', line: 'PANEL', qty: 6 }])).overwrites).toBe(true);
  });
  it('"add bird mesh": adds a priced line, and an added line is not an overwrite', () => {
    const r = ok(applyEdits(base(), [{ op: 'add_line', description: 'Bird mesh', qty: 1, unitPence: 25000, costPence: 12000, vatRate: 0, sku: 'MESH' }]));
    expect(gross(r.content)).toBe(gross(base()) + 25000);
    expect(r.overwrites).toBe(false);
  });
  it('"make it a 2-day install": changes the labour days and its wording', () => {
    const r = ok(applyEdits(base(), [{ op: 'set_labour_days', days: 2 }]));
    const labour = (r.content.blocks[1] as { lines: QuoteLine[] }).lines.find((l) => /labour/i.test(l.description))!;
    expect(labour.qty).toBe(2);
    expect(labour.detail).toBe('2 days');
    expect(gross(r.content)).toBe(gross(base()) + 54000); // 45000 + 20% VAT
  });
  it('"knock 5% off": adds discount lines that take the VAT off in proportion, and is an overwrite', () => {
    const r = ok(applyEdits(base(), [{ op: 'set_discount_percent', percent: 5 }]));
    const t = totalsOf(r.content);
    const b = totalsOf(base());
    expect(t.net).toBe(b.net - Math.round((b.net - 45000) * 0.05) - Math.round(45000 * 0.05));
    const discounts = (r.content.blocks[1] as { lines: QuoteLine[] }).lines.filter((l) => l.id.startsWith('disc'));
    expect(discounts.map((d) => d.vat_rate)).toEqual([0, 20]); // one per VAT rate
    expect(r.overwrites).toBe(true);
    // VAT falls by 5% of the VAT too.
    expect(t.vat).toBe(b.vat - Math.round(45000 * 0.05 * 0.2));
  });
  it('keeps the discount in proportion when something else changes later', () => {
    const first = ok(applyEdits(base(), [{ op: 'set_discount_percent', percent: 10 }]));
    const then = ok(applyEdits(first.content, [{ op: 'set_qty', line: 'PANEL', qty: 10 }]));
    const direct = ok(applyEdits(base(), [{ op: 'set_qty', line: 'PANEL', qty: 10 }, { op: 'set_discount_percent', percent: 10 }]));
    expect(gross(then.content)).toBe(gross(direct.content));
  });
  it('a discount of 0 removes it, and the total returns to what it was', () => {
    const off = ok(applyEdits(ok(applyEdits(base(), [{ op: 'set_discount_percent', percent: 5 }])).content, [{ op: 'set_discount_percent', percent: 0 }]));
    expect(gross(off.content)).toBe(gross(base()));
    expect((off.content.blocks[1] as { lines: QuoteLine[] }).lines.some((l) => l.id.startsWith('disc'))).toBe(false);
  });
  it('refuses a discount that is too big, or negative', () => {
    expect(applyEdits(base(), [{ op: 'set_discount_percent', percent: MAX_DISCOUNT_PERCENT + 1 }]).ok).toBe(false);
    expect(applyEdits(base(), [{ op: 'set_discount_percent', percent: -5 }]).ok).toBe(false);
  });
  it('removing a line or changing a price is an overwrite', () => {
    expect(ok(applyEdits(base(), [{ op: 'remove_line', line: 'INV' }])).overwrites).toBe(true);
    expect(ok(applyEdits(base(), [{ op: 'set_unit_price', line: 'PANEL', unitPence: 9000 }])).overwrites).toBe(true);
    expect(ok(applyEdits(base(), [{ op: 'set_unit_price', line: 'PANEL', unitPence: 10000 }])).overwrites).toBe(false);
  });
  it('is all or nothing: one bad change stops the lot', () => {
    const r = applyEdits(base(), [{ op: 'set_qty', line: 'PANEL', qty: 10 }, { op: 'set_qty', line: 'nonexistent', qty: 2 }]);
    expect(r.ok).toBe(false);
  });
  it('refuses nonsense: zero quantity, negative prices, no changes, no labour line', () => {
    const bad: EditOp[][] = [[{ op: 'set_qty', line: 'PANEL', qty: 0 }], [{ op: 'set_unit_price', line: 'PANEL', unitPence: -1 }], [], [{ op: 'set_labour_days', days: 0 }]];
    for (const ops of bad) expect(applyEdits(base(), ops).ok, JSON.stringify(ops)).toBe(false);
    const noLabour = base();
    (noLabour.blocks[1] as { lines: QuoteLine[] }).lines.pop();
    expect(applyEdits(noLabour, [{ op: 'set_labour_days', days: 2 }]).ok).toBe(false);
  });
  it('never changes the original', () => {
    const c = base();
    const snap = JSON.stringify(c);
    applyEdits(c, [{ op: 'set_qty', line: 'PANEL', qty: 99 }, { op: 'set_discount_percent', percent: 5 }]);
    expect(JSON.stringify(c)).toBe(snap);
  });
});

describe('diffQuote', () => {
  it('says exactly what changed, with the totals', () => {
    const r = ok(applyEdits(base(), [{ op: 'set_qty', line: 'PANEL', qty: 10 }, { op: 'add_line', description: 'Bird mesh', qty: 1, unitPence: 25000, costPence: null, vatRate: 0 }, { op: 'remove_line', line: 'INV' }]));
    const d = diffQuote(base(), r.content);
    expect(d.changed).toBe(true);
    expect(d.lines).toContain('Acme 400W panel: quantity 8 → 10');
    expect(d.lines.some((l) => /^Added: Bird mesh 1 × £250\.00/.test(l))).toBe(true);
    expect(d.lines.some((l) => /^Removed: Acme 6kW Hybrid/.test(l))).toBe(true);
    expect(d.lines.at(-1)).toMatch(/^Total inc VAT: £/);
    expect(d.totalBefore).toBe(gross(base()));
    expect(d.totalAfter).toBe(gross(r.content));
  });
  it('reports no change when nothing changed', () => {
    expect(diffQuote(base(), base())).toMatchObject({ changed: false, lines: [] });
  });
});

import { parseEditInput } from '@/lib/quotes/edit';
describe('parseEditInput', () => {
  it('turns pounds into pence and keeps what Metis sent', () => {
    const r = parseEditInput([{ op: 'set_unit_price', line: 'PANEL', unit_price_gbp: 90.5 }, { op: 'add_line', description: 'Bird mesh', qty: 1, unit_price_gbp: 250, cost_gbp: 120, vat_percent: 0 }, { op: 'set_discount_percent', percent: 5 }, { op: 'add_product', sku: 'MESH', qty: 2 }]);
    expect(r).toEqual({ ok: true, ops: [{ op: 'set_unit_price', line: 'PANEL', unitPence: 9050 }, { op: 'add_line', description: 'Bird mesh', qty: 1, unitPence: 25000, costPence: 12000, vatRate: 0, sku: null }, { op: 'set_discount_percent', percent: 5 }, { op: 'add_product', sku: 'MESH', qty: 2 }] });
  });
  it('never guesses a missing number', () => {
    for (const bad of [[], 'x', [{ op: 'set_qty', line: 'PANEL' }], [{ op: 'set_unit_price', line: 'PANEL' }], [{ op: 'add_line', description: 'x', qty: 1, unit_price_gbp: 5 }], [{ op: 'set_labour_days' }], [{ op: 'nonsense' }]]) expect(parseEditInput(bad).ok, JSON.stringify(bad)).toBe(false);
  });
});
