import { describe, expect, it } from 'vitest';
import { cleanContent, lineProfit, money, pct, profitOf, sellUnit, penceFromText, starterContent, totalsOf, type QuoteContent } from '@/lib/quotes/types';

const content: QuoteContent = {
  intro: '',
  terms: '',
  blocks: [
    { id: 'a', type: 'items', heading: 'Solar', lines: [
      { id: '1', description: 'Panels', qty: 12, unit_pence: 25000, vat_rate: 0, cost_pence: 0, mode: 'manual', markup: 0 },
      { id: '2', description: 'Scaffold', qty: 1, unit_pence: 45000, vat_rate: 20, cost_pence: 0, mode: 'manual', markup: 0 },
    ] },
    { id: 'b', type: 'items', heading: 'Extras', lines: [{ id: '3', description: 'Discount', qty: 1, unit_pence: -10000, vat_rate: 20, cost_pence: 0, mode: 'manual', markup: 0 }] },
  ],
};

describe('quote money', () => {
  it('adds lines across blocks, VAT per rate', () => {
    const t = totalsOf(content);
    expect(t.net).toBe(300000 + 45000 - 10000);
    expect(t.vat).toBe(9000 - 2000);
    expect(t.gross).toBe(t.net + t.vat);
    expect(t.byRate.map((r) => r.rate)).toEqual([0, 20]);
  });
  it('formats and parses pounds', () => {
    expect(money(123456)).toBe('£1,234.56');
    expect(money(-500)).toBe('−£5.00');
    expect(penceFromText('£1,250.5')).toBe(125050);
    expect(penceFromText('abc')).toBe(0);
  });
  it('cleans unknown or unsafe content', () => {
    const c = cleanContent({ blocks: [{ type: 'images', images: [{ path: 'quotes/x/a.jpg' }, { path: '../etc' }] }, { type: 'evil' }, { type: 'items', lines: [{ qty: 'x', vat_rate: 7 }] }] });
    expect(c.blocks).toHaveLength(2);
    const img = c.blocks[0];
    expect(img.type === 'images' && img.images).toHaveLength(1);
    const items = c.blocks[1];
    expect(items.type === 'items' && items.lines[0]).toMatchObject({ qty: 0, vat_rate: 0 });
  });
  it('moves an old Terms text section to the terms field, at the bottom', () => {
    const c = cleanContent({ blocks: [{ type: 'text', heading: 'Terms', body: 'Pay in 14 days.' }, { type: 'text', heading: 'Included', body: 'Panels' }] });
    expect(c.terms).toBe('Pay in 14 days.');
    expect(c.blocks).toHaveLength(1);
  });
  it('works the sell price out from the cost: markup %, markup £ or manual', () => {
    expect(sellUnit({ mode: 'pct', cost_pence: 10000, markup: 30, unit_pence: 0 })).toBe(13000);
    expect(sellUnit({ mode: 'gbp', cost_pence: 10000, markup: 2500, unit_pence: 0 })).toBe(12500);
    expect(sellUnit({ mode: 'manual', cost_pence: 10000, markup: 99, unit_pence: 11111 })).toBe(11111);
  });
  it('recomputes the sell price when content is cleaned, so it can never disagree with cost and markup', () => {
    const c = cleanContent({ blocks: [{ type: 'items', lines: [{ qty: 2, cost_pence: 10000, mode: 'pct', markup: 25, unit_pence: 1 }] }] });
    const l = c.blocks[0].type === 'items' ? c.blocks[0].lines[0] : null;
    expect(l?.unit_pence).toBe(12500);
    expect(l && lineProfit(l)).toBe(5000);
  });
  it('totals the profit and margin, leaving out VAT, and counts lines with no cost', () => {
    const c = cleanContent({ blocks: [{ type: 'items', lines: [
      { description: 'Panels', qty: 10, cost_pence: 10000, mode: 'pct', markup: 50, vat_rate: 0 },
      { description: 'Scaffold', qty: 1, cost_pence: 0, mode: 'manual', unit_pence: 60000, vat_rate: 20 },
      { description: 'Our labour', qty: 1, cost_pence: 20000, mode: 'manual', unit_pence: 0, internal: true },
    ] }] });
    const p = profitOf(c);
    expect(p.sell).toBe(150000 + 60000);
    expect(p.cost).toBe(100000 + 0 + 20000);
    expect(p.profit).toBe(90000);
    expect(p.uncosted).toBe(1);
    expect(pct(p.marginPct)).toBe('42.9%');
    expect(pct(p.markupPct)).toBe('75%');
    expect(profitOf({ intro: '', blocks: [], terms: '' }).marginPct).toBeNull();
  });
  it('starts with items, included and terms', () => {
    expect(starterContent('Sam').blocks.map((b) => b.type)).toEqual(['items', 'text']);
    expect(starterContent('Sam').terms).toMatch(/valid until/);
  });
});

describe('text lines', () => {
  it('stay text lines with no money, and never change the totals', () => {
    const c = cleanContent({
      blocks: [
        {
          id: 'a',
          type: 'items',
          heading: 'Price',
          lines: [
            { id: 'l1', description: 'Panels', qty: 2, unit_pence: 10000, vat_rate: 20, cost_pence: 5000, mode: 'manual', markup: 0 },
            { id: 'l2', description: 'Battery storage', text: true, qty: 5, unit_pence: 999, vat_rate: 20, cost_pence: 100, mode: 'pct', markup: 10, internal: true },
          ],
        },
      ],
    });
    const b = c.blocks[0];
    if (b.type !== 'items') throw new Error('items block');
    expect(b.lines[1]).toMatchObject({ text: true, qty: 0, unit_pence: 0, cost_pence: 0, vat_rate: 0, description: 'Battery storage' });
    expect(totalsOf(c).net).toBe(20000);
  });
});
