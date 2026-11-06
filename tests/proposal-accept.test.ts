import { describe, expect, it } from 'vitest';
import { acceptIntent, proposalPackOn } from '@/lib/proposal/accept';
import { taskAssignee, taskRecipients } from '@/lib/proposal/people';
import { proposalStates, type ProposalDoc, type StateCtx } from '@/lib/proposal/slots';

const empty: StateCtx = { products: ['solar', 'battery'], docs: [], marks: {}, gen: {}, libraryGaps: [] };
const incomplete = proposalStates(empty);
// Every item that applies, made and filed.
const doc = (slot: string): ProposalDoc => ({ id: slot, slot, name: slot, source: 'library', key: null, visible: true, at: '2026-11-02T09:00:00Z', version: 1, hash: null });
const gen = { ready: true as const, hash: 'h' };
const done = proposalStates({
  products: ['solar', 'battery'],
  docs: ['HX-PP-05', 'HX-PP-06', 'HX-PP-07', 'HX-PP-09'].map(doc).concat(['HX-PP-01', 'HX-PP-02', 'HX-PP-03', 'HX-PP-04', 'HX-PP-08'].map((s) => ({ ...doc(s), source: 'generated', hash: 'h' }))),
  marks: {},
  gen: { 'HX-PP-01': gen, 'HX-PP-02': gen, 'HX-PP-03': gen, 'HX-PP-04': gen, 'HX-PP-08': gen },
  libraryGaps: [],
});
const base = { on: true, ready: true, signed: false, pendingAt: null, views: incomplete };

describe('the PROPOSAL_PACK switch', () => {
  it('is off unless it says on', () => {
    expect(proposalPackOn({})).toBe(false);
    expect(proposalPackOn({ PROPOSAL_PACK: '' })).toBe(false);
    expect(proposalPackOn({ PROPOSAL_PACK: 'off' })).toBe(false);
    expect(proposalPackOn({ PROPOSAL_PACK: '1' })).toBe(false);
    expect(proposalPackOn({ PROPOSAL_PACK: 'on' })).toBe(true);
    expect(proposalPackOn({ PROPOSAL_PACK: ' ON ' })).toBe(true);
  });
});

describe('pressing Accept', () => {
  it('opens the signature sheet as it always has while the switch is off', () => {
    expect(acceptIntent({ ...base, on: false })).toEqual({ kind: 'sign' });
  });

  it('opens the signature sheet before proposal-pack.sql has been run, even with the switch on', () => {
    expect(acceptIntent({ ...base, ready: false })).toEqual({ kind: 'sign' });
  });

  it('opens the signature sheet when the pack is complete', () => {
    expect(acceptIntent({ ...base, views: done })).toEqual({ kind: 'sign' });
  });

  it('holds the customer when the pack is unfinished, and says it is the first time', () => {
    const r = acceptIntent(base);
    expect(r.kind).toBe('hold');
    expect(r.kind === 'hold' && r.already).toBe(false);
    expect(r.kind === 'hold' && r.open.length).toBeGreaterThan(0);
  });

  it('holds again without telling the team twice when they press it a second time', () => {
    const r = acceptIntent({ ...base, pendingAt: '2026-11-02T10:00:00Z' });
    expect(r.kind === 'hold' && r.already).toBe(true);
  });

  it('lets a held customer sign once the pack has been finished', () => {
    expect(acceptIntent({ ...base, views: done, pendingAt: '2026-11-02T10:00:00Z' })).toEqual({ kind: 'sign' });
  });

  it('does nothing for a customer who has already signed, whatever else is true', () => {
    expect(acceptIntent({ ...base, signed: true })).toEqual({ kind: 'signed' });
    expect(acceptIntent({ ...base, signed: true, on: false })).toEqual({ kind: 'signed' });
  });
});

describe('who is told', () => {
  const people = [
    { id: 'owner', status: 'approved', role: 'member' },
    { id: 'boss', status: 'approved', role: 'admin' },
    { id: 'pa1', status: 'approved', role: 'member', project_admin: true },
    { id: 'pa2', status: 'approved', role: 'member', project_admin: true },
    { id: 'gone', status: 'rejected', role: 'admin', project_admin: true },
    { id: 'new', status: 'pending', role: 'member', project_admin: true },
  ];

  it('is the approved Project Admins when anyone is ticked', () => {
    expect(taskRecipients(people, 'owner')).toEqual(['pa1', 'pa2']);
  });

  it('falls back to the job’s owner and the admins when nobody is ticked', () => {
    expect(taskRecipients(people.map((p) => ({ ...p, project_admin: false })), 'owner')).toEqual(['owner', 'boss']);
  });

  it('falls back the same way before the column exists', () => {
    const before = people.map((p) => {
      const q: Record<string, unknown> = { ...p };
      delete q.project_admin;
      return q as (typeof people)[number];
    });
    expect(taskRecipients(before, 'owner')).toEqual(['owner', 'boss']);
  });

  it('does not list an owner who is not approved, or twice', () => {
    expect(taskRecipients(people.map((p) => ({ ...p, project_admin: false })), 'gone')).toEqual(['boss']);
    expect(taskRecipients(people.map((p) => ({ ...p, project_admin: false })), 'boss')).toEqual(['boss']);
    expect(taskRecipients([], null)).toEqual([]);
  });

  it('assigns the task to the owner if they are a recipient, else the first', () => {
    expect(taskAssignee(['pa1', 'owner'], 'owner')).toBe('owner');
    expect(taskAssignee(['pa1', 'pa2'], 'owner')).toBe('pa1');
    expect(taskAssignee([], 'owner')).toBeNull();
  });
});
