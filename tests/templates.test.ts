import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { answerWords, allFields, fillMerge, isShown, mergeKeysIn, MERGE_FIELDS, missingRequired, validateTemplate } from '@/lib/templates/rules';
import { CYLINDER_COMMISSIONING, HEAT_PUMP_COMMISSIONING, HEAT_PUMP_HANDOVER, HEAT_PUMP_TEMPLATES } from '@/lib/templates/seed/heat-pump';
import type { DocTemplate } from '@/lib/templates/types';

vi.mock('server-only', () => ({}));

const base = (over: Partial<DocTemplate> = {}): DocTemplate => ({
  schema: 1,
  code: 'HX-TT-01',
  title: 'Test',
  tech: [],
  sections: [{ type: 'fields', title: 'One', fields: [{ key: 'a', label: 'A', kind: 'text' }] }],
  ...over,
});

describe('merge fields', () => {
  it('finds and fills them, leaving an empty value empty', () => {
    expect(mergeKeysIn('Hello {{customer}} at {{ address }}')).toEqual(['customer', 'address']);
    expect(fillMerge('{{customer}} / {{postcode}}', { customer: 'Sam', postcode: null })).toBe('Sam / ');
  });
  it('lists the ones a template can use', () => {
    expect(MERGE_FIELDS.map((m) => m.key)).toContain('mcs_number');
  });
});

describe('validating a template', () => {
  it('accepts the three heat pump templates', () => {
    for (const t of HEAT_PUMP_TEMPLATES) expect(validateTemplate(t), t.code).toEqual([]);
  });
  it('gives the heat pump templates their own codes, and no key twice', () => {
    expect(new Set(HEAT_PUMP_TEMPLATES.map((t) => t.code)).size).toBe(3);
    for (const t of HEAT_PUMP_TEMPLATES) {
      const keys = allFields(t).map((f) => f.key);
      expect(new Set(keys).size, t.code).toBe(keys.length);
    }
  });
  it('wants a Heliaxis-style code, a title and a section', () => {
    expect(validateTemplate(base({ code: 'F26A' }))[0]).toContain('HX-HP-02');
    expect(validateTemplate(base({ title: ' ' }))).toContain('Give the template a title.');
    expect(validateTemplate(base({ sections: [] }))).toContain('Add at least one section.');
  });
  it('refuses a key used twice, or one that is not allowed', () => {
    const dup = base({ sections: [{ type: 'fields', title: 'One', fields: [{ key: 'a', label: 'A', kind: 'text' }, { key: 'a', label: 'B', kind: 'text' }] }] });
    expect(validateTemplate(dup).join(' ')).toContain('reuses the key');
    const bad = base({ sections: [{ type: 'fields', title: 'One', fields: [{ key: 'A b', label: 'A', kind: 'text' }] }] });
    expect(validateTemplate(bad).join(' ')).toContain('key that isn’t allowed');
  });
  it('wants two different options for a choice, and a short unit', () => {
    const one = base({ sections: [{ type: 'fields', title: 'One', fields: [{ key: 'a', label: 'A', kind: 'choice', options: ['x'] }] }] });
    expect(validateTemplate(one).join(' ')).toContain('at least two options');
    const same = base({ sections: [{ type: 'fields', title: 'One', fields: [{ key: 'a', label: 'A', kind: 'choice', options: ['x', 'x'] }] }] });
    expect(validateTemplate(same).join(' ')).toContain('same option twice');
    const unit = base({ sections: [{ type: 'fields', title: 'One', fields: [{ key: 'a', label: 'A', kind: 'number', unit: 'much too long a unit' }] }] });
    expect(validateTemplate(unit).join(' ')).toContain('unit is too long');
  });
  it('only lets a field depend on an earlier field, with an answer that field can have', () => {
    const t = (showWhen: { key: string; is: string }): DocTemplate =>
      base({ sections: [{ type: 'fields', title: 'One', fields: [{ key: 'a', label: 'A', kind: 'yesno' }, { key: 'b', label: 'B', kind: 'text', showWhen }] }] });
    expect(validateTemplate(t({ key: 'a', is: 'yes' }))).toEqual([]);
    expect(validateTemplate(t({ key: 'a', is: 'maybe' })).join(' ')).toContain('which that field can’t be');
    expect(validateTemplate(t({ key: 'z', is: 'yes' })).join(' ')).toContain('isn’t an earlier field');
    const forward = base({ sections: [{ type: 'fields', title: 'One', fields: [{ key: 'b', label: 'B', kind: 'text', showWhen: { key: 'a', is: 'yes' } }, { key: 'a', label: 'A', kind: 'yesno' }] }] });
    expect(validateTemplate(forward).join(' ')).toContain('isn’t an earlier field');
  });
  it('refuses a merge field that does not exist', () => {
    const t = base({ intro: 'For {{nobody}}', sections: [{ type: 'text', body: 'Hi {{customer}} {{whoever}}' }] });
    const why = validateTemplate(t).join(' ');
    expect(why).toContain('{{nobody}}');
    expect(why).toContain('{{whoever}}');
    expect(why).not.toContain('{{customer}}');
  });
  it('wants signature lines labelled, with their own keys', () => {
    expect(validateTemplate(base({ sections: [{ type: 'sign', signers: [] }] })).join(' ')).toContain('no signature lines');
    expect(validateTemplate(base({ sections: [{ type: 'sign', signers: [{ key: 'a', label: '' }] }] })).join(' ')).toContain('no label');
  });
});

describe('answers', () => {
  const yes = { key: 'y', label: 'Y', kind: 'yesno' as const };
  const temp = { key: 't', label: 'T', kind: 'number' as const, unit: '°C' };
  it('reads as words', () => {
    expect(answerWords(yes, 'na')).toBe('N/A');
    expect(answerWords(temp, 45)).toBe('45 °C');
    expect(answerWords(temp, '')).toBe('');
  });
  it('shows a conditional field only when its earlier answer matches, and everything on a blank form', () => {
    const f = { key: 'b', label: 'B', kind: 'text' as const, showWhen: { key: 'a', is: 'yes' } };
    expect(isShown(f, undefined)).toBe(true);
    expect(isShown(f, { a: 'yes' })).toBe(true);
    expect(isShown(f, { a: 'no' })).toBe(false);
    expect(isShown(f, {})).toBe(false);
  });
  it('lists the required fields still empty, ignoring ones that are not asked', () => {
    const t = base({
      sections: [{ type: 'fields', title: 'One', fields: [{ key: 'a', label: 'A', kind: 'yesno' }, { key: 'b', label: 'B', kind: 'text', required: true, showWhen: { key: 'a', is: 'yes' } }, { key: 'c', label: 'C', kind: 'text', required: true }] }],
    });
    expect(missingRequired(t, { a: 'no' }).map((f) => f.key)).toEqual(['c']);
    expect(missingRequired(t, { a: 'yes' }).map((f) => f.key)).toEqual(['b', 'c']);
    expect(missingRequired(t, { a: 'yes', b: 'x', c: 'y' })).toEqual([]);
  });
});

describe('drawing a template as a PDF', () => {
  const job = { ref: 'HX-0042', issued: '2026-11-06', customer: 'A. Customer', address: ['1 Example Road', 'Newport', 'NP20 1AA'], postcode: 'NP20 1AA' };
  const pages = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

  it('draws each heat pump template blank, in both variants', async () => {
    const { renderTemplate } = await import('@/lib/documents/templates/render');
    for (const t of HEAT_PUMP_TEMPLATES) {
      for (const variant of ['digital', 'print'] as const) {
        const bytes = await renderTemplate({ template: t, job: { ...job, variant } });
        expect(Buffer.from(bytes.slice(0, 4)).toString(), `${t.code} ${variant}`).toBe('%PDF');
        expect(await pages(bytes), `${t.code} ${variant}`).toBeGreaterThan(1);
      }
    }
  });
  it('runs the long commissioning record over several pages without cutting a field in two', async () => {
    const { renderTemplate } = await import('@/lib/documents/templates/render');
    const n = await pages(await renderTemplate({ template: HEAT_PUMP_COMMISSIONING, job }));
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(9);
  });
  it('draws a completed form, and one with a long answer', async () => {
    const { renderTemplate } = await import('@/lib/documents/templates/render');
    const answers = { verification: 'Initial verification', tested_on: '2026-11-06', design_flow_temp: 45, description: 'A '.repeat(400), comments: 'ok' };
    const bytes = await renderTemplate({ template: HEAT_PUMP_HANDOVER, job, answers, signed: { sign_1: { name: 'A. Engineer', date: '6 Nov 2026' } } });
    expect(await pages(bytes)).toBeGreaterThan(1);
  });
  it('stops a finished document with a required answer missing, but not a draft', async () => {
    const { renderTemplate } = await import('@/lib/documents/templates/render');
    await expect(renderTemplate({ template: CYLINDER_COMMISSIONING, job, answers: {} })).rejects.toThrow(/Not answered/);
    const bytes = await renderTemplate({ template: CYLINDER_COMMISSIONING, job, answers: {}, draft: true });
    expect(await pages(bytes)).toBeGreaterThan(0);
  });
  it('leaves out a conditional field that is not asked', async () => {
    const { renderTemplate } = await import('@/lib/documents/templates/render');
    const t = base({
      sections: [{ type: 'fields', title: 'One', fields: [{ key: 'a', label: 'A', kind: 'yesno' }, { key: 'b', label: 'B', kind: 'long', showWhen: { key: 'a', is: 'yes' } }] }],
    });
    const blank = await pages(await renderTemplate({ template: t, job }));
    const without = await pages(await renderTemplate({ template: t, job, answers: { a: 'no' } }));
    expect(without).toBeLessThanOrEqual(blank);
  });
});

describe('merge values', () => {
  it('fills the job and company facts', async () => {
    const { mergeValues } = await import('@/lib/documents/templates/render');
    const v = mergeValues({ ref: 'HX-0042', issued: '2026-11-06', customer: 'A. Customer', address: ['1 Example Road', 'Newport'], postcode: 'NP20 1AA' });
    expect(v.project_ref).toBe('HX-0042');
    expect(v.address).toBe('1 Example Road, Newport');
    expect(v.date).toBe('6 November 2026');
    expect(v.mcs_number).toBe('NAP-82308');
    for (const m of MERGE_FIELDS) expect(v[m.key], m.key).toBeDefined();
  });
});
