import { describe, expect, it } from 'vitest';
import {
  contentsGroups,
  headline,
  isSlot,
  nameList,
  nationOf,
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

describe('heat pump jobs', () => {
  const hp = (over: Partial<StateCtx> = {}) => ctx({ products: ['heatpump'], postcode: 'SW1A 1AA', ...over });
  const shown = (c: StateCtx) => slotStates(c).filter((v) => !v.hidden).map((v) => v.code);

  it('shows the heat pump items and hides the solar and battery ones', () => {
    const codes = shown(hp());
    for (const c of ['HX-IH-16', 'HX-IH-17', 'HX-IH-18', 'HX-IH-19', 'HX-IH-20']) expect(codes).toContain(c);
    for (const c of ['HX-IH-03', 'HX-IH-04', 'HX-IH-14']) expect(codes).not.toContain(c);
  });
  it('hides the heat pump items on a solar and battery job', () => {
    const codes = shown(ctx({ products: ['solar', 'battery'] }));
    for (const c of ['HX-IH-16', 'HX-IH-17', 'HX-IH-18', 'HX-IH-19', 'HX-IH-20']) expect(codes).not.toContain(c);
    expect(codes).toContain('HX-IH-14');
  });
  it('treats the heat pump survey like the solar one: missing until it is done', () => {
    expect(view(hp({ surveyed: false }), 'HX-IH-16').state).toBe('missing');
    expect(view(hp({ surveyed: false }), 'HX-IH-16').fix).toBe('survey');
    expect(view(hp({ surveyed: true }), 'HX-IH-16').state).toBe('complete');
    expect(view(hp({ surveyed: false, docs: [doc('HX-IH-16')] }), 'HX-IH-16').state).toBe('complete');
  });
  it('needs the England and Wales noise calculation for a site there, and not the Scotland one', () => {
    const c = hp();
    expect(view(c, 'HX-IH-18').state).toBe('missing');
    expect(view(c, 'HX-IH-19').state).toBe('na');
    expect(view(c, 'HX-IH-19').why).toBe('Not in Scotland');
    expect(view(hp({ docs: [doc('HX-IH-18')] }), 'HX-IH-18').state).toBe('complete');
  });
  it('needs the Scotland calculation for a Scottish site, and not the England and Wales one', () => {
    const c = hp({ postcode: 'EH1 1AA' });
    expect(view(c, 'HX-IH-19').state).toBe('missing');
    expect(view(c, 'HX-IH-18').state).toBe('na');
    expect(view(c, 'HX-IH-18').why).toBe('In Scotland: the Scotland calculation applies');
  });
  it('lets the office mark the wrong nation Not needed on a border postcode', () => {
    const c = hp({ postcode: 'TD15 1AA', marks: { 'HX-IH-19': { na: true, reason: 'Site is in England', by: 'Cal', at: '2026-11-06' } } });
    expect(view(c, 'HX-IH-19').state).toBe('na');
    expect(view(c, 'HX-IH-19').office?.reason).toBe('Site is in England');
  });
  it('leaves the room survey and EPVS registration out of the count unless added', () => {
    for (const code of ['HX-IH-17', 'HX-IH-20']) {
      expect(view(hp(), code).state).toBe('na');
      expect(view(hp(), code).counted).toBe(false);
      expect(view(hp({ docs: [doc(code)] }), code).state).toBe('complete');
    }
  });
  it('counts a heat pump job on its own list: survey, noise, RAMS, purchasing and photos', () => {
    const h = headline(slotStates(hp({ docs: [doc('HX-IH-06'), doc('HX-IH-18')], rams: { documents: [{ id: 'r1', reference: 'R/1', title: 'RAMS', status: 'issued', version: 1 }], trades: [] } })));
    // 01 02 05 06 07 09 16 18 complete; 08 (no trades) and 19 (not Scotland) not needed; nothing missing.
    expect(h.missing).toBe(0);
    expect(h.complete).toBe(8);
    expect(h.na).toBe(2);
  });
});

describe('nationOf', () => {
  it('reads the postcode area, not just its first letter', () => {
    expect(nationOf('G1 1AA')).toBe('scotland');
    expect(nationOf('EH12 5BB')).toBe('scotland');
    expect(nationOf('ab10 1xx')).toBe('scotland');
    expect(nationOf('GL1 1AA')).toBe('england_wales');
    expect(nationOf('SW1A 1AA')).toBe('england_wales');
    expect(nationOf('NP19 7AZ')).toBe('england_wales');
  });
  it('assumes England and Wales when there is no postcode', () => {
    expect(nationOf(null)).toBe('england_wales');
    expect(nationOf('')).toBe('england_wales');
  });
});
