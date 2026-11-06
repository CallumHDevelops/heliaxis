import { describe, expect, it } from 'vitest';
import { contextFrom, type InhouseRaw } from '@/lib/inhouse/context';
import { headline, slotStates } from '@/lib/inhouse/slots';

const raw = (over: Partial<InhouseRaw> = {}): InhouseRaw => ({ products: ['solar', 'battery'], postcode: 'NP20 1AA', stage: 'won', docs: [], orders: 0, photos: 0, ...over });
const doc = (slot: string | null, id = 'd1') => ({ id, inhouse_slot: slot, name: 'file.pdf', created_at: '2026-11-06T10:00:00Z', mime: 'application/pdf', size: 100 });
const view = (r: InhouseRaw, code: string) => slotStates(contextFrom(r)).find((v) => v.code === code)!;

describe('the In-House pack on a project', () => {
  it('counts a job as surveyed once it is past the survey stage', () => {
    expect(contextFrom(raw({ stage: 'lead' })).surveyed).toBe(false);
    expect(contextFrom(raw({ stage: 'survey_booked' })).surveyed).toBe(false);
    for (const stage of ['surveyed', 'quote_sent', 'won', 'installing', 'complete']) expect(contextFrom(raw({ stage })).surveyed, stage).toBe(true);
  });
  it('files a document to its item, and never as visible to a customer', () => {
    const ctx = contextFrom(raw({ docs: [doc('HX-IH-04')] }));
    expect(ctx.docs).toHaveLength(1);
    expect(ctx.docs[0]).toMatchObject({ slot: 'HX-IH-04', visible: false, release: 'office' });
    expect(view(raw({ docs: [doc('HX-IH-04')] }), 'HX-IH-04').state).toBe('complete');
    expect(view(raw(), 'HX-IH-04').state).toBe('missing');
  });
  it('ignores a document that is not filed to an item', () => {
    expect(contextFrom(raw({ docs: [doc(null)] })).docs).toEqual([]);
  });
  it('reads orders and photos as done', () => {
    expect(view(raw(), 'HX-IH-05').state).toBe('missing');
    expect(view(raw({ orders: 2 }), 'HX-IH-05').state).toBe('complete');
    expect(view(raw(), 'HX-IH-09').state).toBe('missing');
    expect(view(raw({ photos: 3 }), 'HX-IH-09').state).toBe('complete');
  });
  it('gives a heat pump job its own items, with the noise calculation for its nation', () => {
    const hp = (postcode: string) => slotStates(contextFrom(raw({ products: ['heatpump'], postcode }))).filter((v) => !v.hidden && v.state !== 'na').map((v) => v.code);
    expect(hp('SW1A 1AA')).toContain('HX-IH-18');
    expect(hp('SW1A 1AA')).not.toContain('HX-IH-19');
    expect(hp('EH1 1AA')).toContain('HX-IH-19');
  });
  it('makes a headline out of a new job: nothing yet done is not complete', () => {
    const h = headline(slotStates(contextFrom(raw())));
    expect(h.total).toBeGreaterThan(5);
    expect(h.words).toMatch(/^\d+ of \d+ complete/);
  });
});
