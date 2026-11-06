import { describe, expect, it } from 'vitest';
import {
  acceptPath,
  contentsGroups,
  customerState,
  gapsTask,
  GAPS_TASK_KEY,
  headline,
  HOLD_MESSAGE,
  openItems,
  proposalStates,
  SLOTS,
  type GenNeed,
  type ProposalCode,
  type ProposalDoc,
  type StateCtx,
} from '@/lib/proposal/slots';

const doc = (slot: ProposalCode, over: Partial<ProposalDoc> = {}): ProposalDoc => ({ id: `d-${slot}`, slot, name: `${slot}.pdf`, source: 'generated', key: slot, visible: true, at: '2026-11-02T09:00:00Z', version: 1, hash: 'h1', ...over });
const ready: GenNeed = { ready: true, hash: 'h1' };

/** A solar and battery job with everything made, uploaded and in the library. */
function complete(over: Partial<StateCtx> = {}): StateCtx {
  const gen: StateCtx['gen'] = { 'HX-PP-01': ready, 'HX-PP-02': ready, 'HX-PP-03': ready, 'HX-PP-04': ready, 'HX-PP-08': ready };
  const docs = (['HX-PP-01', 'HX-PP-02', 'HX-PP-03', 'HX-PP-04', 'HX-PP-05', 'HX-PP-06', 'HX-PP-07', 'HX-PP-08', 'HX-PP-09'] as ProposalCode[]).map((s) =>
    doc(s, s === 'HX-PP-05' || s === 'HX-PP-06' || s === 'HX-PP-09' ? { source: 'library', key: null, hash: null } : s === 'HX-PP-07' ? { source: 'upload', key: null, hash: null } : {})
  );
  return { products: ['solar', 'battery'], docs, marks: {}, gen, libraryGaps: [], ...over };
}
const by = (c: StateCtx, code: ProposalCode) => proposalStates(c).find((v) => v.code === code)!;

describe('the catalogue', () => {
  it('has unique codes, in pack order, and only the contract is signed', () => {
    expect(new Set(SLOTS.map((s) => s.code)).size).toBe(SLOTS.length);
    expect(SLOTS.map((s) => s.order)).toEqual([...SLOTS.map((s) => s.order)].sort((a, b) => a - b));
    expect(SLOTS.filter((s) => s.role === 'sign').map((s) => s.code)).toEqual(['HX-PP-04']);
    expect(SLOTS.filter((s) => s.optional).map((s) => s.code)).toEqual(['HX-PP-10']);
  });
});

describe('states on a job', () => {
  it('is all Complete when everything is made and filed', () => {
    const views = proposalStates(complete());
    expect(views.filter((v) => v.state !== 'complete' && v.state !== 'na')).toEqual([]);
    // The optional extras are not counted, so they are not "not needed" either.
    expect(headline(views).words).toBe('9 of 9 complete');
  });

  it('is Missing for a document we make when its inputs are not there, saying why', () => {
    const v = by(complete({ gen: { ...complete().gen, 'HX-PP-04': { ready: false, why: 'Deposit protection provider is not set.', fix: 'settings' } } }), 'HX-PP-04');
    expect(v.state).toBe('missing');
    expect(v.why).toBe('Deposit protection provider is not set.');
    expect(v.fix).toBe('settings');
  });

  it('is Missing for a document we make that nothing has made yet', () => {
    expect(by(complete({ docs: [] }), 'HX-PP-02').state).toBe('missing');
    expect(by(complete({ gen: {} }), 'HX-PP-02').state).toBe('missing');
  });

  it('is Out of date when the job changed after a document was made', () => {
    const c = complete({ gen: { ...complete().gen, 'HX-PP-02': { ready: true, hash: 'h2' } } });
    expect(by(c, 'HX-PP-02').state).toBe('stale');
  });

  it('treats the newest version as the one that counts', () => {
    const c = complete({ docs: [...complete().docs, doc('HX-PP-02', { version: 2, hash: 'h1' }), doc('HX-PP-02', { id: 'old', version: 0, hash: 'old' })] });
    expect(by(c, 'HX-PP-02').state).toBe('complete');
  });

  it('is Missing for a library or collected item with nothing in it, and Complete once there is', () => {
    const without = complete({ docs: complete().docs.filter((d) => d.slot !== 'HX-PP-05') });
    expect(by(without, 'HX-PP-05')).toMatchObject({ state: 'missing', fix: 'library' });
    expect(by(complete({ docs: complete().docs.filter((d) => d.slot !== 'HX-PP-07') }), 'HX-PP-07')).toMatchObject({ state: 'missing', fix: 'upload' });
  });

  it('names the product models that have no data sheet', () => {
    const v = by(complete({ libraryGaps: ['GIV-AIO 13.5', 'Aiko 440'] }), 'HX-PP-09');
    expect(v.state).toBe('missing');
    expect(v.why).toBe('No data sheet in the library for GIV-AIO 13.5, Aiko 440.');
  });

  it('leaves the optional extras out of the counts and never Missing', () => {
    const v = by(complete(), 'HX-PP-10');
    expect(v).toMatchObject({ state: 'na', counted: false });
  });

  it('folds away what is not for the job’s technologies', () => {
    const c = complete({ products: ['ev'] });
    expect(by(c, 'HX-PP-03')).toMatchObject({ state: 'na', hidden: true });
    expect(by(c, 'HX-PP-05')).toMatchObject({ state: 'na', hidden: true });
    // The Consumer Code covers EV charge points, so its leaflet still applies.
    expect(by(c, 'HX-PP-06')).toMatchObject({ state: 'complete', hidden: false });
    expect(by(complete({ products: ['solar'] }), 'HX-PP-03').state).toBe('complete');
  });

  it('honours a Not needed mark from the office, with its reason', () => {
    const c = complete({ docs: complete().docs.filter((d) => d.slot !== 'HX-PP-07'), marks: { 'HX-PP-07': { na: true, reason: 'No deposit on this job', by: 'u1', at: '2026-11-02T09:00:00Z' } } });
    expect(by(c, 'HX-PP-07')).toMatchObject({ state: 'na', why: 'No deposit on this job' });
    expect(acceptPath(proposalStates(c)).path).toBe('sign');
  });
});

describe('what happens when the customer presses Accept', () => {
  it('lets them review and sign when the pack is complete', () => {
    expect(acceptPath(proposalStates(complete()))).toEqual({ path: 'sign' });
  });

  it('holds them on the thank-you page when anything is missing, and lists what', () => {
    const c = complete({ docs: complete().docs.filter((d) => d.slot !== 'HX-PP-05' && d.slot !== 'HX-PP-07') });
    const r = acceptPath(proposalStates(c));
    expect(r.path).toBe('hold');
    expect(r.path === 'hold' && r.open.map((v) => v.code)).toEqual(['HX-PP-05', 'HX-PP-07']);
  });

  it('holds them when a document is out of date, not just missing', () => {
    const c = complete({ gen: { ...complete().gen, 'HX-PP-03': { ready: true, hash: 'changed' } } });
    expect(acceptPath(proposalStates(c)).path).toBe('hold');
  });

  it('holds them when nothing has been set up at all', () => {
    const r = acceptPath(proposalStates({ products: ['solar', 'battery'], docs: [], marks: {}, gen: {}, libraryGaps: [] }));
    expect(r.path).toBe('hold');
  });

  it('says what the user asked it to say', () => {
    expect(HOLD_MESSAGE).toBe(
      'Thank you for accepting the quote, we look forward to working with you. We’ll shortly be sending you the contract for signing along with the relevant documentation as required by MCS.'
    );
  });
});

describe('the Project Admins’ task', () => {
  it('is null when nothing is open', () => {
    expect(gapsTask(proposalStates(complete()), 'Craig Preece')).toBeNull();
  });

  it('lists each open item and why, under one key so a job never has two', () => {
    const c = complete({ docs: complete().docs.filter((d) => d.slot !== 'HX-PP-05'), libraryGaps: ['Aiko 440'] });
    const t = gapsTask(proposalStates(c), 'Craig Preece')!;
    expect(t.key).toBe(GAPS_TASK_KEY);
    expect(t.title).toBe('Finish the proposal pack for Craig Preece: 2 items open');
    expect(t.notes.split('\n')).toEqual(['MCS Customer Commitment: Add the current MCS Customer Commitment to the library.', 'Manufacturers’ data sheets: No data sheet in the library for Aiko 440.']);
  });

  it('copes with a customer with no name and a single item', () => {
    const c = complete({ docs: complete().docs.filter((d) => d.slot !== 'HX-PP-07') });
    expect(gapsTask(proposalStates(c), '  ')!.title).toBe('Finish the proposal pack for the customer: 1 item open');
  });
});

describe('what the customer sees', () => {
  it('shows ready items, "on its way" for the rest and nothing for what is not needed', () => {
    const c = complete({ docs: complete().docs.filter((d) => d.slot !== 'HX-PP-05') });
    const views = proposalStates(c);
    expect(customerState(by(c, 'HX-PP-02'))).toBe('ready');
    expect(customerState(by(c, 'HX-PP-05'))).toBe('coming');
    expect(customerState(by(c, 'HX-PP-10'))).toBeNull();
    expect(openItems(views).map((v) => v.code)).toEqual(['HX-PP-05']);
  });

  it('does not show an out-of-date document as ready', () => {
    const c = complete({ gen: { ...complete().gen, 'HX-PP-02': { ready: true, hash: 'changed' } } });
    expect(customerState(by(c, 'HX-PP-02'))).toBe('coming');
  });

  it('groups the contents in pack order', () => {
    const g = contentsGroups(proposalStates(complete()).filter((v) => !v.hidden));
    expect(g.map((x) => x.title)).toEqual(['Start here', 'Your quotation', 'Your contract', 'Your protection', 'Your equipment', 'Other']);
    expect(g[3].items.map((i) => i.code)).toEqual(['HX-PP-05', 'HX-PP-06', 'HX-PP-07', 'HX-PP-08']);
  });
});
