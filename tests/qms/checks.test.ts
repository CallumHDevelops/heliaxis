import { describe, expect, it } from 'vitest';
import { addMonths, bumpRevision, canApprove, formSectionOfRef, kindOfRef, runChecks } from '@/lib/qms/checks';
import type { QmsDoc } from '@/lib/qms/types';

const base: QmsDoc = {
  id: 'a', kind: 'procedure', ref: 'P03', section: null, title: 'Corrective and Preventive Action Procedure', revision: '1', revision_date: '2026-01-05',
  status: 'draft', owner: 'Callum', summary: null, source_url: null, file_path: null, review_months: 12, next_review_on: '2027-01-05',
  approved_revision: null, approved_by: null, approved_at: null, created_at: '', updated_at: '',
  body_md: '# Purpose\nWhy.\n# Scope\nWho.\n# Responsibilities\nQuality lead.\n# Procedure\nRaise F03 and record it on R02 follow P05.\n# Records\nF03.',
};
const reg = [{ id: 'a', kind: 'procedure' as const, ref: 'P03', status: 'draft' as const }, { id: 'b', kind: 'form' as const, ref: 'F03', status: 'draft' as const }, { id: 'c', kind: 'procedure' as const, ref: 'P05', status: 'draft' as const }];
const ctx = { docs: reg, comments: [], today: '2026-11-01' };
const get = (cs: ReturnType<typeof runChecks>, id: string) => cs.find((c) => c.id === id)?.status;

describe('qms checker', () => {
  it('passes a complete procedure', () => {
    const cs = runChecks(base, ctx);
    expect(canApprove(cs)).toBe(true);
    expect(get(cs, 'cross_refs')).toBe('pass');
  });
  it('fails a document filed in the wrong register', () => {
    const cs = runChecks({ ...base, kind: 'form', section: 'general' }, { ...ctx, docs: reg });
    expect(get(cs, 'right_place')).toBe('fail');
    expect(canApprove(cs)).toBe(false);
  });
  it('flags an empty document, a future date and placeholders', () => {
    expect(get(runChecks({ ...base, body_md: '' }, ctx), 'content')).toBe('fail');
    expect(get(runChecks({ ...base, revision_date: '2027-01-01' }, ctx), 'revision_date')).toBe('fail');
    expect(get(runChecks({ ...base, body_md: `${base.body_md}\nTBC` }, ctx), 'placeholders')).toBe('fail');
  });
  it('flags duplicate refs among live documents only', () => {
    const dupes = [...reg, { id: 'z', kind: 'procedure' as const, ref: 'p03', status: 'draft' as const }];
    expect(get(runChecks(base, { ...ctx, docs: dupes }), 'unique_ref')).toBe('fail');
    const archived = [...reg, { id: 'z', kind: 'procedure' as const, ref: 'P03', status: 'archived' as const }];
    expect(get(runChecks(base, { ...ctx, docs: archived }), 'unique_ref')).toBe('pass');
  });
  it('warns about documents that are not in the register', () => {
    expect(get(runChecks({ ...base, body_md: `${base.body_md}\nSee P99.` }, ctx), 'cross_refs')).toBe('warn');
  });
  it('blocks on open comments and on edits after approval', () => {
    expect(get(runChecks(base, { ...ctx, comments: [{ status: 'open' }] }), 'comments')).toBe('fail');
    expect(get(runChecks(base, { ...ctx, comments: [{ status: 'addressed' }] }), 'comments')).toBe('warn');
    expect(get(runChecks({ ...base, status: 'approved', approved_revision: '1', revision: '2' }, ctx), 'approved_current')).toBe('fail');
  });
  it('reports an overdue review', () => {
    expect(get(runChecks({ ...base, next_review_on: '2026-10-01' }, ctx), 'review_due')).toBe('fail');
  });
  it('needs a link or a file for an external document', () => {
    const ext = { ...base, kind: 'external' as const, ref: 'EX04A', section: 'standard', body_md: null };
    const r = [{ id: 'a', kind: 'external' as const, ref: 'EX04A', status: 'draft' as const }];
    expect(get(runChecks(ext, { ...ctx, docs: r }), 'content')).toBe('fail');
    expect(get(runChecks({ ...ext, source_url: 'https://mcscertified.com' }, { ...ctx, docs: r }), 'content')).toBe('pass');
  });
  it('knows where refs belong', () => {
    expect(kindOfRef('P26A')).toBe('procedure');
    expect(kindOfRef('EX07A1')).toBe('external');
    expect(kindOfRef('L42A')).toBe('external');
    expect(kindOfRef('D04')).toBe('internal');
    expect(formSectionOfRef('F26B')).toBe('heat_pump');
    expect(formSectionOfRef('F74A')).toBe('battery');
    expect(formSectionOfRef('F47')).toBe('solar_pv');
  });
  it('bumps revisions and dates', () => {
    expect(bumpRevision('3')).toBe('4');
    expect(bumpRevision('1.7')).toBe('1.8');
    expect(bumpRevision('')).toBe('1');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-01', 12)).toBe('2027-11-01');
  });
});
