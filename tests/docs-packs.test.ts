import { describe, expect, it } from 'vitest';
import { buttonsFor, docNumber, fileNameFor, headlineOf, itemFrom, shown, type AnySlot } from '@/lib/docs/packs';

const slot = (over: Partial<AnySlot> = {}): AnySlot => ({ code: 'HX-PP-01', title: 'Covering letter', state: 'missing', why: 'Not made yet', group: 'start', hidden: false, counted: true, maker: 'pack', docs: [], ...over });
const doc = (v = 1, source: string = 'generated') => ({ id: `d${v}`, name: 'Covering letter.pdf', at: `2026-11-0${v}T10:00:00Z`, version: v, source });

describe('document numbers', () => {
  it('are the job, the item and the version', () => {
    expect(docNumber('HX-0126', 'HX-PP-01')).toBe('HX-0126-PP-01');
    expect(docNumber('HX-0126', 'HX-PP-01', 2)).toBe('HX-0126-PP-01 v2');
    expect(docNumber(null, 'HX-IH-07')).toBe('HX-IH-07');
  });
  it('show once there is a document (or a form), from its newest version', () => {
    expect(itemFrom(slot(), 'HX-0126').docNo).toBeNull();
    expect(itemFrom(slot({ state: 'complete', docs: [doc(1), doc(3), doc(2)] }), 'HX-0126').docNo).toBe('HX-0126-PP-01 v3');
    expect(itemFrom(slot({ code: 'HX-HP-02' }), 'HX-0126', { form: true }).docNo).toBe('HX-0126-HP-02');
  });
});

describe('the headline', () => {
  it('counts what applies, leaving out other technologies and not-needed items', () => {
    const items = [
      itemFrom(slot({ state: 'complete', docs: [doc()] }), null),
      itemFrom(slot({ code: 'HX-PP-02', state: 'missing' }), null),
      itemFrom(slot({ code: 'HX-PP-03', state: 'waiting' }), null),
      itemFrom(slot({ code: 'HX-PP-04', state: 'na' }), null),
      itemFrom(slot({ code: 'HX-PP-05', hidden: true }), null),
      itemFrom(slot({ code: 'HX-PP-06', counted: false }), null),
    ];
    expect(headlineOf(items)).toEqual({ complete: 1, total: 3, open: 2, words: '1 of 3 complete · 2 still needed' });
    expect(shown(items).map((i) => i.code)).not.toContain('HX-PP-05');
  });
  it('says so when nothing is needed', () => {
    expect(headlineOf([]).words).toBe('Nothing needed yet');
    expect(headlineOf([itemFrom(slot({ state: 'complete', docs: [doc()] }), null)]).words).toBe('1 of 1 complete');
  });
});

describe('buttons', () => {
  it('offer Preview and Download only where there is something to open', () => {
    expect(buttonsFor(itemFrom(slot(), null))).toEqual({ preview: false, download: false, edit: false, upload: true });
    const made = itemFrom(slot({ state: 'complete', docs: [doc()] }), null);
    // A document we make has no editor yet: Edit is for forms.
    expect(buttonsFor(made)).toEqual({ preview: true, download: true, edit: false, upload: true });
    const uploaded = itemFrom(slot({ maker: 'office', state: 'complete', docs: [doc(1, 'upload')] }), null);
    expect(buttonsFor(uploaded)).toMatchObject({ preview: true, download: true, edit: false });
  });
  it('treat a form as always openable, and never as an upload', () => {
    expect(buttonsFor(itemFrom(slot({ code: 'HX-HP-02', maker: 'office' }), null, { form: true }))).toEqual({ preview: true, download: true, edit: true, upload: false });
  });
});

describe('ZIP file names', () => {
  it('are the document number, the title and the file’s own type', () => {
    expect(fileNameFor({ title: 'Covering letter' }, 'HX-0126-PP-01', 'letter.PDF')).toBe('HX-0126-PP-01 Covering letter.PDF');
    expect(fileNameFor({ title: 'Survey' }, null, 'scan')).toBe('Survey');
  });
});

describe('library files', () => {
  it('are marked, so they open from the library on every job', () => {
    const lib = itemFrom(slot({ maker: 'library', state: 'complete', docs: [doc(1, 'library')] }), 'HX-0126');
    expect(lib.docs[0]).toMatchObject({ library: true, generated: false });
    expect(itemFrom(slot({ state: 'complete', docs: [doc(1, 'upload')] }), 'HX-0126').docs[0].library).toBe(false);
  });
});
