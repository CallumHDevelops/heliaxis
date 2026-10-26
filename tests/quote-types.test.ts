import { describe, expect, it } from 'vitest';
import { cleanContent, money, penceFromText, starterContent, totalsOf, type QuoteContent } from '@/lib/quotes/types';

const content: QuoteContent = {
  intro: '',
  terms: '',
  blocks: [
    { id: 'a', type: 'items', heading: 'Solar', lines: [
      { id: '1', description: 'Panels', qty: 12, unit_pence: 25000, vat_rate: 0 },
      { id: '2', description: 'Scaffold', qty: 1, unit_pence: 45000, vat_rate: 20 },
    ] },
    { id: 'b', type: 'items', heading: 'Extras', lines: [{ id: '3', description: 'Discount', qty: 1, unit_pence: -10000, vat_rate: 20 }] },
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
  it('starts with items, included and terms', () => {
    expect(starterContent('Sam').blocks.map((b) => b.type)).toEqual(['items', 'text']);
    expect(starterContent('Sam').terms).toMatch(/valid until/);
  });
});
