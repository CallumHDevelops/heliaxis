import { describe, expect, it } from 'vitest';
import { libraryFields } from '@/lib/handover/library';
import { isUniversal, libraryDocs, UNIVERSAL } from '@/lib/proposal/library';
import { proposalStates } from '@/lib/proposal/slots';

const row = (code: string | null, over = {}) => ({ id: `lib-${code}`, name: `File for ${code}`, proposal_slot: code, created_at: '2026-11-07T10:00:00Z', ...over });
const stateOf = (views: ReturnType<typeof proposalStates>, code: string) => views.find((v) => v.code === code)!;

describe('universal Proposal documents', () => {
  it('are the four that are the same on every job', () => {
    expect(UNIVERSAL.map((u) => u.code)).toEqual(['HX-PP-05', 'HX-PP-06', 'HX-PP-07', 'HX-PP-08']);
    expect(isUniversal('HX-PP-05')).toBe(true);
    expect(isUniversal('HX-PP-02')).toBe(false);
  });

  it('tick on a job from the library alone: the Customer Commitment, and the complaints procedure we would otherwise make', () => {
    const lib = libraryDocs([row('HX-PP-05'), row('HX-PP-08')]);
    const views = proposalStates({ products: ['heatpump'], docs: lib.docs, marks: {}, gen: lib.gen, libraryGaps: [] });
    expect(stateOf(views, 'HX-PP-05').state).toBe('complete');
    expect(stateOf(views, 'HX-PP-08').state).toBe('complete');
    expect(stateOf(views, 'HX-PP-05').docs[0]).toMatchObject({ id: 'lib-HX-PP-05', source: 'library' });
    // Nothing else is touched: the job's own documents are still to be made.
    expect(stateOf(views, 'HX-PP-01').state).toBe('missing');
  });

  it('are still needed until the file is in the library', () => {
    const lib = libraryDocs([]);
    const views = proposalStates({ products: ['heatpump'], docs: lib.docs, marks: {}, gen: lib.gen, libraryGaps: [] });
    expect(stateOf(views, 'HX-PP-05')).toMatchObject({ state: 'missing', fix: 'library' });
  });

  it('leave out an archived file and one tagged to something that is not universal', () => {
    const lib = libraryDocs([row('HX-PP-06', { archived_at: '2026-11-08T10:00:00Z' }), row('HX-PP-02'), row(null)]);
    expect(lib.docs).toEqual([]);
    expect(lib.gen).toEqual({});
  });
});

describe('the library file’s Proposal item', () => {
  it('is kept only when it is a universal item, and cleared otherwise', () => {
    expect(libraryFields({ proposal_slot: 'HX-PP-06' })).toEqual({ proposal_slot: 'HX-PP-06' });
    expect(libraryFields({ proposal_slot: 'HX-PP-02' })).toEqual({ proposal_slot: null });
    expect(libraryFields({ proposal_slot: '' })).toEqual({ proposal_slot: null });
    // Not named: left alone.
    expect(libraryFields({ kind: 'guide' })).not.toHaveProperty('proposal_slot');
  });
});
