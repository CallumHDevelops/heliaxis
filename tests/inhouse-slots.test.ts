import { describe, expect, it } from 'vitest';
import {
  contentsGroups,
  headline,
  isSlot,
  nameList,
  NO_RAMS,
  ramsSignedOff,
  slotStates,
  SLOTS,
  type RamsFacts,
  type SlotDoc,
  type StateCtx,
} from '@/lib/inhouse/slots';

const doc = (slot: string, over: Partial<SlotDoc> = {}): SlotDoc => ({
  id: `d-${slot}`, slot, name: 'file.pdf', source: 'upload', key: null, visible: false, release: 'office', at: '2026-11-01', version: 1, mime: 'application/pdf', size: 10, hash: null, ...over,
});

const ctx = (over: Partial<StateCtx> = {}): StateCtx => ({
  products: ['solar', 'battery'], docs: [], marks: {}, rams: NO_RAMS, surveyed: true, orders: 1, photos: 4, ...over,
});

const view = (c: StateCtx, code: string) => slotStates(c).find((v) => v.code === code)!;

const rams = (status: RamsFacts['documents'][number]['status'], extra: Partial<RamsFacts> = {}): RamsFacts => ({
  documents: [{ id: 'r1', reference: 'HX-0130/RAMS-01', title: 'RAMS', status, version: 1, reviewer: 'Sam Patel' }],
  trades: [],
  ...extra,
});

describe('In-House catalogue', () => {
  it('uses Heliaxis codes, each once, in pack order', () => {
    const codes = SLOTS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((c) => /^HX-IH-\d{2}$/.test(c))).toBe(true);
    const orders = SLOTS.map((s) => s.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(isSlot('HX-IH-07')).toBe(true);
    expect(isSlot('F70A')).toBe(false);
  });

  it('keeps only the cover outside the contents groups', () => {
    const groups = contentsGroups(SLOTS);
    expect(groups.flatMap((g) => g.items).some((i) => i.group === 'cover')).toBe(false);
    expect(groups[0].title).toBe('Project record');
  });
});

describe('applying to a job', () => {
  it('folds away the solar and survey items on a job with no solar or battery', () => {
    const c = ctx({ products: ['heatpump'] });
    const structural = view(c, 'HX-IH-04');
    expect(structural.state).toBe('na');
    expect(structural.hidden).toBe(true);
    expect(view(c, 'HX-IH-03').hidden).toBe(true);
  });

  it('lets the office mark something not needed, with a reason', () => {
    const c = ctx({ marks: { 'HX-IH-06': { na: true, reason: 'Customer supplied everything', by: 'Cal', at: '2026-11-01' } } });
    const v = view(c, 'HX-IH-06');
    expect(v.state).toBe('na');
    expect(v.why).toBe('Customer supplied everything');
    expect(v.office?.by).toBe('Cal');
  });
});

describe('collected documents', () => {
  it('is missing until uploaded, then complete', () => {
    expect(view(ctx(), 'HX-IH-04').state).toBe('missing');
    expect(view(ctx(), 'HX-IH-04').fix).toBe('upload');
    expect(view(ctx({ docs: [doc('HX-IH-04')] }), 'HX-IH-04').state).toBe('complete');
  });

  it('never calls an only-if-needed form missing, and counts none of them', () => {
    const forms = slotStates(ctx()).filter((v) => v.group === 'forms');
    expect(forms.length).toBe(5);
    expect(forms.every((v) => v.state === 'na' && !v.counted)).toBe(true);
    expect(view(ctx({ docs: [doc('HX-IH-10')] }), 'HX-IH-10').state).toBe('complete');
  });
});

describe('the RAMS (HX-IH-07)', () => {
  it('is missing when the project has none', () => {
    const v = view(ctx(), 'HX-IH-07');
    expect(v.state).toBe('missing');
    expect(v.fix).toBe('rams');
  });
  it('waits while it is being written', () => {
    const v = view(ctx({ rams: rams('draft') }), 'HX-IH-07');
    expect(v.state).toBe('waiting');
    expect(v.why).toContain('HX-0130/RAMS-01');
  });
  it('waits on the named project admin while in review', () => {
    const v = view(ctx({ rams: rams('in_review') }), 'HX-IH-07');
    expect(v.state).toBe('waiting');
    expect(v.why).toBe('Waiting for Sam Patel to review and sign it off.');
  });
  it('falls back to "a project admin" when nobody is named', () => {
    const r = rams('in_review');
    r.documents[0].reviewer = null;
    expect(view(ctx({ rams: r }), 'HX-IH-07').why).toBe('Waiting for a project admin to review and sign it off.');
  });
  it('is complete once approved or issued', () => {
    expect(view(ctx({ rams: rams('approved') }), 'HX-IH-07').state).toBe('complete');
    expect(view(ctx({ rams: rams('issued') }), 'HX-IH-07').state).toBe('complete');
  });
  it('is not complete while any one of several RAMS is still a draft', () => {
    const r = rams('issued');
    r.documents.push({ id: 'r2', reference: 'HX-0130/RAMS-02', title: 'Battery', status: 'draft', version: 1 });
    expect(ramsSignedOff(r)).toBe(false);
    expect(view(ctx({ rams: r }), 'HX-IH-07').state).toBe('waiting');
  });
});

describe('trade sign-off (HX-IH-08)', () => {
  const trades = (list: [string, boolean, boolean][]) => list.map(([name, sent, signed]) => ({ name, sent, signed }));

  it('is not needed until a trade is added', () => {
    expect(view(ctx({ rams: rams('issued') }), 'HX-IH-08').state).toBe('na');
  });
  it('waits for the admin to sign off the RAMS before anything goes to a trade', () => {
    const v = view(ctx({ rams: rams('in_review', { trades: trades([['Acme Roofing', false, false]]) }) }), 'HX-IH-08');
    expect(v.state).toBe('waiting');
    expect(v.why).toBe('After a project admin signs off the RAMS.');
  });
  it('is the office to send once signed off, then the trade to sign', () => {
    const unsent = view(ctx({ rams: rams('approved', { trades: trades([['Acme Roofing', false, false]]) }) }), 'HX-IH-08');
    expect(unsent.state).toBe('missing');
    expect(unsent.why).toBe('Not sent to Acme Roofing yet.');
    const sent = view(ctx({ rams: rams('approved', { trades: trades([['Acme Roofing', true, false]]) }) }), 'HX-IH-08');
    expect(sent.state).toBe('waiting');
    expect(sent.why).toBe('Waiting for Acme Roofing to sign.');
  });
  it('picks up trades added after sign-off', () => {
    const mixed = view(ctx({ rams: rams('issued', { trades: trades([['Acme Roofing', true, true], ['Bolt Electrical', false, false]]) }) }), 'HX-IH-08');
    expect(mixed.state).toBe('missing');
    expect(mixed.why).toBe('Not sent to Bolt Electrical yet.');
  });
  it('is complete when every trade has signed', () => {
    const done = view(ctx({ rams: rams('issued', { trades: trades([['Acme Roofing', true, true], ['Bolt Electrical', true, true]]) }) }), 'HX-IH-08');
    expect(done.state).toBe('complete');
  });
});

describe('headline', () => {
  it('counts what applies, lists not needed after, and ignores forms', () => {
    const views = slotStates(ctx({ docs: [doc('HX-IH-04'), doc('HX-IH-06')], rams: rams('in_review') }));
    const h = headline(views);
    // 01 02 03 04 05 06 09 complete; 07 waiting; 08 not needed (no trades); forms uncounted.
    expect(h.complete).toBe(7);
    expect(h.waiting).toBe(1);
    expect(h.missing).toBe(0);
    expect(h.na).toBe(1);
    expect(h.total).toBe(8);
    expect(h.words).toBe('7 of 8 complete · 1 waiting · 1 not needed');
  });
});

describe('nameList', () => {
  it('reads naturally', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['A'])).toBe('A');
    expect(nameList(['A', 'B'])).toBe('A and B');
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(nameList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
  });
});
