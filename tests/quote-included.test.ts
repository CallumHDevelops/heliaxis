import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { DEFAULT_OPTIONS, includedByRule, itemsOf, standardClauses, writeIncluded } from '@/lib/quotes/included';
import { cleanContent, emptyText, starterContent } from '@/lib/quotes/types';

function quote() {
  const c = starterContent('Sam');
  const b = c.blocks[0];
  if (b.type !== 'items') throw new Error('items');
  b.lines = [
    { id: '1', description: 'Trina Vertex S 500W Solar PV', detail: 'All-black panels', qty: 12, unit_pence: 7680, vat_rate: 0, cost_pence: 6400, mode: 'manual', markup: 0 },
    { ...emptyText(), description: 'Battery storage' },
    { id: '2', description: 'GoodWe ES Uniq 12kW', qty: 1, unit_pence: 168000, vat_rate: 0, cost_pence: 140000, mode: 'manual', markup: 0 },
    { id: '3', description: 'Internal labour', qty: 1, unit_pence: 0, vat_rate: 0, cost_pence: 50000, mode: 'manual', markup: 0, internal: true },
  ];
  return cleanContent(c);
}

describe('what is included', () => {
  it('reads only the customer-facing lines, with no money in them', () => {
    const items = itemsOf(quote());
    expect(items.map((i) => i.description)).toEqual(['Trina Vertex S 500W Solar PV', 'Battery storage', 'GoodWe ES Uniq 12kW']);
    expect(JSON.stringify(items)).not.toMatch(/6400|7680|168000|140000|50000/);
  });
  it('makes a readable draft by rule: a sentence per item, in order, and no prices', () => {
    const t = includedByRule(quote());
    expect(t).toContain('This quote includes the supply and installation of 12 × Trina Vertex S 500W Solar PV: All-black panels.');
    expect(t).toContain('This quote includes the supply and installation of GoodWe ES Uniq 12kW.');
    expect(t).not.toContain('Battery storage');
    expect(t).not.toContain('£');
  });
  it('adds the standard inclusions in fixed wording, only the ones ticked', () => {
    const all = standardClauses(DEFAULT_OPTIONS);
    expect(all).toEqual([
      'This quote includes the supply and installation of all electrical ancillaries, and provision for any access equipment required to complete the works.',
      'This quote includes all documentation required for handover.',
      'All works comply with BS 7671 (the IET Wiring Regulations) and any other applicable standards.',
    ]);
    expect(standardClauses({ ...DEFAULT_OPTIONS, ancillaries: false, access: false, handover: false })).toEqual(['All works comply with BS 7671 (the IET Wiring Regulations) and any other applicable standards.']);
    const t = includedByRule(quote(), { ...DEFAULT_OPTIONS, keyPoints: '10-year warranty' });
    expect(t).toContain('Key points: 10-year warranty.');
    expect(t.endsWith('any other applicable standards.')).toBe(true);
  });
  it('falls back to the rule draft with no model key, and says nothing for an empty quote', async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect((await writeIncluded(quote())).via).toBe('rules');
    expect((await writeIncluded(starterContent('Sam'))).text).toBe('');
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });
});
