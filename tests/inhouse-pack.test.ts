import { describe, expect, it } from 'vitest';
import { packHeadline } from '@/lib/inhouse/pack';
import type { SlotView } from '@/lib/inhouse/slots';

const v = (state: SlotView['state'], over: Partial<SlotView> = {}) => ({ code: 'HX-IH-00', title: 'x', state, hidden: false, counted: true, ...over }) as unknown as SlotView;

describe('packHeadline', () => {
  it('counts In-House items and forms together', () => {
    const h = packHeadline([v('complete'), v('complete'), v('waiting'), v('missing'), v('na')], [{ status: 'signed' }, { status: 'draft' }, { status: 'none' }]);
    expect(h).toMatchObject({ complete: 3, waiting: 2, missing: 2, na: 1, total: 7 });
    expect(h.words).toBe('3 of 7 complete · 2 waiting · 2 missing · 1 not needed');
  });
  it('leaves out hidden and uncounted items, and says nothing for zero', () => {
    const h = packHeadline([v('complete'), v('missing', { hidden: true }), v('missing', { counted: false })], []);
    expect(h.words).toBe('1 of 1 complete');
  });
  it('treats a superseded revision as not started', () => {
    expect(packHeadline([], [{ status: 'superseded' }]).missing).toBe(1);
  });
});
