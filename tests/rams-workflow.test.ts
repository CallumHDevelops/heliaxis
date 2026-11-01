import { describe, expect, it } from 'vitest';
import {
  canMove,
  isSignedOff,
  ramsAtCreation,
  reviewersFor,
  revision,
  summarise,
  technologiesFor,
  tradesToSend,
  type Actor,
  type Person,
  type RamsStatus,
  type TradeRequest,
} from '@/lib/rams/workflow';
import { slotStates, NO_RAMS, type StateCtx } from '@/lib/inhouse/slots';

const admin: Actor = { id: 'a1', role: 'admin' };
const member: Actor = { id: 'm1', role: 'member' };
const people: Person[] = [
  { id: 'a1', name: 'Sam Patel', role: 'admin' },
  { id: 'a2', name: 'Cal Hiscott', role: 'admin' },
  { id: 'm1', name: 'Jo Brown', role: 'member' },
];

describe('writing it when the project is created', () => {
  it('maps the project’s products to RAMS technologies, once each, in order', () => {
    expect(technologiesFor(['battery', 'solar', 'solar'])).toEqual(['battery_storage', 'solar_pv']);
    expect(technologiesFor(['heatpump', 'led'])).toEqual(['ashp', 'led_lighting']);
  });
  it('has no template for EV, infrared or other, so writes nothing for them', () => {
    expect(technologiesFor(['ev', 'infrared', 'other'])).toEqual([]);
    expect(ramsAtCreation({ products: ['ev'], existing: [] }).create).toEqual([]);
  });
  it('asks for one RAMS per technology that has none', () => {
    expect(ramsAtCreation({ products: ['solar', 'battery'], existing: [] }).create).toEqual(['solar_pv', 'battery_storage']);
  });
  it('never writes a second one, however often it is asked', () => {
    const existing = [{ technology: 'solar_pv' }];
    expect(ramsAtCreation({ products: ['solar'], existing }).create).toEqual([]);
    expect(ramsAtCreation({ products: ['solar'], existing }).why).toBe('Already written.');
  });
  it('finishes the job if a retry finds only some of them written, without repeating any', () => {
    expect(ramsAtCreation({ products: ['solar', 'battery'], existing: [{ technology: 'solar_pv' }] }).create).toEqual(['battery_storage']);
  });
  it('writes none for a project created without a product that has a template, and says where to write one', () => {
    const r = ramsAtCreation({ products: [], existing: [] });
    expect(r.create).toEqual([]);
    expect(r.why).toContain('Write one on the RAMS tab');
  });
  it('writes nothing for a lost job', () => {
    expect(ramsAtCreation({ products: ['solar'], lost: true, existing: [] }).create).toEqual([]);
  });
});

describe('moving it along', () => {
  const doc = (status: RamsStatus, authorId: string | null = null) => ({ status, authorId });

  it('lets anyone send a draft for review, and anyone send it back from review', () => {
    expect(canMove(doc('draft'), 'in_review', member).ok).toBe(true);
    expect(canMove(doc('in_review'), 'draft', member).ok).toBe(true);
  });
  it('lets only an admin sign it off', () => {
    expect(canMove(doc('in_review'), 'approved', admin).ok).toBe(true);
    const r = canMove(doc('in_review'), 'approved', member);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toBe('Only a project admin can sign off a RAMS.');
  });
  it('never lets the author sign off their own', () => {
    const r = canMove(doc('in_review', 'a1'), 'approved', admin);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toContain('someone else');
  });
  it('lets the owner sign off an automatically written one (no author)', () => {
    expect(canMove(doc('in_review', null), 'approved', admin).ok).toBe(true);
  });
  it('only issues what is signed off, and only for an admin', () => {
    expect(canMove(doc('approved'), 'issued', admin).ok).toBe(true);
    expect(canMove(doc('approved'), 'issued', member).ok).toBe(false);
    expect(canMove(doc('draft'), 'issued', admin).ok).toBe(false);
  });
  it('does not let a draft skip review', () => {
    expect(canMove(doc('draft'), 'approved', admin).ok).toBe(false);
  });
  it('only lets an admin take back a signed-off one', () => {
    expect(canMove(doc('approved'), 'draft', admin).ok).toBe(true);
    expect(canMove(doc('issued'), 'draft', member).ok).toBe(false);
  });
  it('treats a superseded version as finished and archiving as only ever a revision', () => {
    expect(canMove(doc('archived'), 'draft', admin).ok).toBe(false);
    expect(canMove(doc('issued'), 'archived', admin).ok).toBe(false);
  });
});

describe('who reviews it', () => {
  it('asks the project’s owner when they are an admin', () => {
    const r = reviewersFor('a2', people);
    expect(r.asked.map((p) => p.name)).toEqual(['Cal Hiscott']);
    expect(r.fallback).toBe(false);
  });
  it('asks every admin when the owner is not an admin', () => {
    const r = reviewersFor('m1', people);
    expect(r.asked.map((p) => p.name)).toEqual(['Sam Patel', 'Cal Hiscott']);
    expect(r.fallback).toBe(true);
    expect(r.why).toContain('isn’t an admin');
  });
  it('asks every admin when there is no owner', () => {
    const r = reviewersFor(null, people);
    expect(r.asked).toHaveLength(2);
    expect(r.why).toContain('no owner');
  });
  it('never asks the author to review their own', () => {
    expect(reviewersFor('a1', people, 'a1').asked.map((p) => p.id)).toEqual(['a2']);
  });
  it('says so when there is nobody to ask', () => {
    const r = reviewersFor(null, [{ id: 'm1', name: 'Jo', role: 'member' }]);
    expect(r.asked).toEqual([]);
    expect(r.why).toBe('No admin is available to review it.');
  });
});

describe('sending it to the trades', () => {
  const trades = [
    { id: 't1', name: 'Acme Roofing', docIds: ['d1'] },
    { id: 't2', name: 'Bolt Electrical', docIds: ['d1'] },
  ];
  const sent = (tradeId: string, docId: string, over: Partial<TradeRequest> = {}): TradeRequest => ({ tradeId, docId, sentAt: '2026-11-01', signedAt: null, revokedAt: null, ...over });

  it('sends nothing before a project admin has signed it off', () => {
    for (const status of ['draft', 'in_review'] as const) expect(tradesToSend([{ id: 'd1', status }], trades, [])).toEqual([]);
  });
  it('sends to everyone on it once signed off', () => {
    expect(tradesToSend([{ id: 'd1', status: 'approved' }], trades, [])).toEqual([
      { tradeId: 't1', docId: 'd1' },
      { tradeId: 't2', docId: 'd1' },
    ]);
  });
  it('picks up a trade added afterwards without sending to the others again', () => {
    const later = [...trades, { id: 't3', name: 'Cole Scaffolding', docIds: ['d1'] }];
    expect(tradesToSend([{ id: 'd1', status: 'issued' }], later, [sent('t1', 'd1'), sent('t2', 'd1')])).toEqual([{ tradeId: 't3', docId: 'd1' }]);
  });
  it('sends again when a request was withdrawn', () => {
    expect(tradesToSend([{ id: 'd1', status: 'issued' }], trades, [sent('t1', 'd1', { revokedAt: '2026-11-02' }), sent('t2', 'd1')])).toEqual([{ tradeId: 't1', docId: 'd1' }]);
  });
  it('does not send a trade a RAMS they are not on', () => {
    const docs = [{ id: 'd1', status: 'issued' as const }, { id: 'd2', status: 'issued' as const }];
    expect(tradesToSend(docs, [{ id: 't1', name: 'Acme', docIds: ['d2'] }], [])).toEqual([{ tradeId: 't1', docId: 'd2' }]);
  });
});

describe('revisions', () => {
  it('makes an alteration to an issued RAMS the next version', () => {
    const r = revision({ status: 'issued', version: 1 }, admin);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.version).toBe(2);
      expect(r.carriesOver).toContain('trades');
      expect(r.revokes).toEqual(['share_links', 'signature_requests']);
    }
    const r2 = revision({ status: 'issued', version: 4 }, admin);
    expect(r2.ok && r2.version).toBe(5);
  });
  it('edits a draft or one in review in place: no new version', () => {
    for (const status of ['draft', 'in_review', 'approved'] as const) {
      const r = revision({ status, version: 1 }, admin);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.why).toContain('Only an issued RAMS');
    }
  });
  it('is for admins only, and never from a superseded version', () => {
    expect(revision({ status: 'issued', version: 1 }, member).ok).toBe(false);
    const r = revision({ status: 'archived', version: 1 }, admin);
    expect(!r.ok && r.why).toContain('superseded');
  });
});

describe('what the In-House pack reads', () => {
  const doc = (id: string, status: RamsStatus, version = 1) => ({ id, reference: `HX-0130/RAMS-0${id.slice(1)}`, title: 'RAMS', status, version });
  const req = (tradeId: string, docId: string, over: Partial<TradeRequest> = {}): TradeRequest => ({ tradeId, docId, sentAt: '2026-11-01', signedAt: null, revokedAt: null, ...over });

  it('leaves superseded versions out', () => {
    const s = summarise([doc('d1', 'archived'), doc('d2', 'issued', 2)], [], []);
    expect(s.documents.map((d) => d.id)).toEqual(['d2']);
  });
  it('shows a trade that signed version 1 as not yet sent version 2', () => {
    // The revision carried the trade over to d2; its d1 signature stays on d1.
    const trades = [{ id: 't1', name: 'Acme Roofing', docIds: ['d1', 'd2'] }];
    const requests = [req('t1', 'd1', { signedAt: '2026-11-02' })];
    const s = summarise([doc('d1', 'archived'), doc('d2', 'issued', 2)], trades, requests);
    expect(s.trades).toEqual([{ name: 'Acme Roofing', sent: false, signed: false }]);
  });
  it('needs a trade to have signed every current RAMS it is on', () => {
    const trades = [{ id: 't1', name: 'Acme Roofing', docIds: ['d1', 'd2'] }];
    const requests = [req('t1', 'd1', { signedAt: '2026-11-02' }), req('t1', 'd2')];
    const s = summarise([doc('d1', 'issued'), doc('d2', 'issued')], trades, requests);
    expect(s.trades).toEqual([{ name: 'Acme Roofing', sent: true, signed: false }]);
  });
  it('drives the pack end to end, from draft to every trade signed', () => {
    const ctx = (rams: ReturnType<typeof summarise>): StateCtx => ({ products: ['solar'], docs: [], marks: {}, rams, surveyed: true, orders: 1, photos: 1 });
    const at = (c: StateCtx, code: string) => slotStates(c).find((v) => v.code === code)!;
    const trades = [{ id: 't1', name: 'Acme Roofing', docIds: ['d1'] }];

    expect(at(ctx(NO_RAMS), 'HX-IH-07').state).toBe('missing');
    expect(at(ctx(summarise([doc('d1', 'draft')], trades, [])), 'HX-IH-07').state).toBe('waiting');
    const inReview = summarise([{ ...doc('d1', 'in_review'), reviewer: 'Sam Patel' }], trades, []);
    expect(at(ctx(inReview), 'HX-IH-07').why).toBe('Waiting for Sam Patel to review and sign it off.');
    expect(at(ctx(inReview), 'HX-IH-08').why).toBe('After a project admin signs off the RAMS.');

    const signedOff = summarise([doc('d1', 'issued')], trades, []);
    expect(at(ctx(signedOff), 'HX-IH-07').state).toBe('complete');
    expect(at(ctx(signedOff), 'HX-IH-08').why).toBe('Not sent to Acme Roofing yet.');

    const out = summarise([doc('d1', 'issued')], trades, [req('t1', 'd1')]);
    expect(at(ctx(out), 'HX-IH-08').why).toBe('Waiting for Acme Roofing to sign.');

    const signed = summarise([doc('d1', 'issued')], trades, [req('t1', 'd1', { signedAt: '2026-11-03' })]);
    expect(at(ctx(signed), 'HX-IH-08').state).toBe('complete');
    expect(isSignedOff('issued')).toBe(true);
  });
});
