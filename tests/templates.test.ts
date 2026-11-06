import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { answerWords, allFields, fillMerge, mergeKeysIn, MERGE_FIELDS, missingRequired, validateTemplate, visibility } from '@/lib/templates/rules';
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
  it('checks a section condition the same way as a field one', () => {
    const sec = (showWhen: { key: string; is: string }): DocTemplate =>
      base({ sections: [{ type: 'fields', title: 'One', fields: [{ key: 'kind', label: 'Kind', kind: 'choice', options: ['Air', 'Ground'] }] }, { type: 'text', title: 'Two', body: 'x', showWhen }] });
    expect(validateTemplate(sec({ key: 'kind', is: 'Ground' }))).toEqual([]);
    expect(validateTemplate(sec({ key: 'kind', is: 'Water' })).join(' ')).toContain('which that field can’t be');
    expect(validateTemplate(sec({ key: 'nope', is: 'Ground' })).join(' ')).toContain('isn’t an earlier field');
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
  it('shows a conditional field only when its earlier answer matches, and everything in a preview', () => {
    const tpl = base({ sections: [{ type: 'fields', title: 'One', fields: [{ key: 'a', label: 'A', kind: 'yesno' }, { key: 'b', label: 'B', kind: 'text', showWhen: { key: 'a', is: 'yes' } }] }] });
    expect(visibility(tpl, undefined).fields.has('b')).toBe(true);
    expect(visibility(tpl, { a: 'yes' }).fields.has('b')).toBe(true);
    expect(visibility(tpl, { a: 'no' }).fields.has('b')).toBe(false);
    expect(visibility(tpl, {}).fields.has('b')).toBe(false);
  });
  it('hides a whole section, and what depends on a hidden question', () => {
    const tpl = base({
      sections: [
        { type: 'fields', title: 'One', fields: [{ key: 'kind', label: 'Kind', kind: 'choice', options: ['Air', 'Ground'] }] },
        { type: 'fields', title: 'Ground only', showWhen: { key: 'kind', is: 'Ground' }, fields: [{ key: 'loops', label: 'Loops', kind: 'yesno' }, { key: 'why', label: 'Why', kind: 'text', showWhen: { key: 'loops', is: 'yes' } }] },
        { type: 'text', title: 'Note', body: 'Only for ground', showWhen: { key: 'kind', is: 'Ground' } },
      ],
    });
    const air = visibility(tpl, { kind: 'Air', loops: 'yes' });
    expect(air.sections).toEqual([true, false, false]);
    // "why" asks about "loops", which was answered, but "loops" is in a section that is hidden.
    expect(air.fields.has('why')).toBe(false);
    const ground = visibility(tpl, { kind: 'Ground', loops: 'yes' });
    expect(ground.sections).toEqual([true, true, true]);
    expect(ground.fields.has('why')).toBe(true);
  });
  it('lists the required fields still empty, ignoring ones that are not asked', () => {
    const t = base({
      sections: [{ type: 'fields', title: 'One', fields: [{ key: 'a', label: 'A', kind: 'yesno' }, { key: 'b', label: 'B', kind: 'text', required: true, showWhen: { key: 'a', is: 'yes' } }, { key: 'c', label: 'C', kind: 'text', required: true }] }],
    });
    expect(missingRequired(t, { a: 'no' }).map((f) => f.key)).toEqual(['c']);
    expect(missingRequired(t, { a: 'yes' }).map((f) => f.key)).toEqual(['b', 'c']);
    expect(missingRequired(t, { a: 'yes', b: 'x', c: 'y' })).toEqual([]);
  });
  it('does not ask for a required answer in a section that is not shown', () => {
    const t = base({
      sections: [
        { type: 'fields', title: 'One', fields: [{ key: 'kind', label: 'Kind', kind: 'choice', options: ['Air', 'Ground'] }] },
        { type: 'fields', title: 'Ground', showWhen: { key: 'kind', is: 'Ground' }, fields: [{ key: 'loops', label: 'Loops', kind: 'text', required: true }] },
      ],
    });
    expect(missingRequired(t, { kind: 'Air' })).toEqual([]);
    expect(missingRequired(t, { kind: 'Ground' }).map((f) => f.key)).toEqual(['loops']);
  });
});

describe('drawing a template as a PDF', () => {
  const job = { ref: 'HX-0042', issued: '2026-11-06', customer: 'A. Customer', address: ['1 Example Road', 'Newport', 'NP20 1AA'], postcode: 'NP20 1AA' };
  const pages = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

  it('draws each heat pump template as an empty preview, in both variants', async () => {
    const { renderTemplate } = await import('@/lib/documents/templates/render');
    for (const t of HEAT_PUMP_TEMPLATES) {
      for (const variant of ['digital', 'print'] as const) {
        const bytes = await renderTemplate({ template: t, job: { ...job, variant } });
        expect(Buffer.from(bytes.slice(0, 4)).toString(), `${t.code} ${variant}`).toBe('%PDF');
        expect(await pages(bytes), `${t.code} ${variant}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
  it('runs the long commissioning record over several pages', async () => {
    const { renderTemplate } = await import('@/lib/documents/templates/render');
    const n = await pages(await renderTemplate({ template: HEAT_PUMP_COMMISSIONING, job }));
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(6);
  });
  it('draws a completed form, and one with a long answer', async () => {
    const { renderTemplate } = await import('@/lib/documents/templates/render');
    const answers = { verification: 'Initial verification', tested_on: '2026-11-06', design_flow_temp: 45, description: 'A '.repeat(400), comments: 'ok' };
    const bytes = await renderTemplate({ template: HEAT_PUMP_HANDOVER, job, answers, signed: { sign_1: { name: 'A. Engineer', at: '2026-11-06T10:15:00Z' } } });
    expect(await pages(bytes)).toBeGreaterThanOrEqual(1);
  });
  it('stops a finished document with a required answer missing, but not a draft', async () => {
    const { renderTemplate } = await import('@/lib/documents/templates/render');
    await expect(renderTemplate({ template: CYLINDER_COMMISSIONING, job, answers: {} })).rejects.toThrow(/Not answered/);
    const bytes = await renderTemplate({ template: CYLINDER_COMMISSIONING, job, answers: {}, draft: true });
    expect(await pages(bytes)).toBeGreaterThan(0);
  });
  it('leaves out the parts of the heat pump forms that do not apply', async () => {
    const { renderTemplate } = await import('@/lib/documents/templates/render');
    const preview = await pages(await renderTemplate({ template: HEAT_PUMP_COMMISSIONING, job, draft: true }));
    const airSource = await pages(await renderTemplate({ template: HEAT_PUMP_COMMISSIONING, job, draft: true, answers: { hpType: 'Air source (ASHP)', supplyPhase: 'Single phase' } }));
    const ground = await pages(await renderTemplate({ template: HEAT_PUMP_COMMISSIONING, job, draft: true, answers: { hpType: 'Ground source (GSHP)', supplyPhase: 'Single phase' } }));
    expect(airSource).toBeLessThanOrEqual(preview);
    expect(ground).toBeLessThanOrEqual(preview);
    const unvented = await pages(await renderTemplate({ template: CYLINDER_COMMISSIONING, job, draft: true, answers: { cylinder_type: 'Unvented' } }));
    const vented = await pages(await renderTemplate({ template: CYLINDER_COMMISSIONING, job, draft: true, answers: { cylinder_type: 'Vented' } }));
    expect(vented).toBeLessThanOrEqual(unvented);
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

describe('what a field prints as its answer', () => {
  const merge = { customer: 'A. Customer' };
  const f = (over: Partial<import('@/lib/templates/types').TemplateField>) => ({ key: 'k', label: 'K', kind: 'text' as const, ...over });
  it('puts the unit with a number, words on yes/no, and a date in full', async () => {
    const { valueText } = await import('@/lib/documents/templates/render');
    expect(valueText(f({ kind: 'number', unit: '°C' }), { k: 45 }, merge)).toBe('45 °C');
    expect(valueText(f({ kind: 'yesno' }), { k: 'na' }, merge)).toBe('N/A');
    expect(valueText(f({ kind: 'date' }), { k: '2026-11-06' }, merge)).toBe('6 November 2026');
    expect(valueText(f({ kind: 'date' }), { k: '06/11/2026' }, merge)).toBe('06/11/2026');
    expect(valueText(f({ kind: 'choice', options: ['Sealed', 'Open vented'] }), { k: 'Sealed' }, merge)).toBe('Sealed');
  });
  it('uses the pre-fill from the job when there is no answer, and an answer over it', async () => {
    const { valueText } = await import('@/lib/documents/templates/render');
    const pre = f({ prefill: '{{customer}}' });
    expect(valueText(pre, undefined, merge)).toBe('A. Customer');
    expect(valueText(pre, { k: '' }, merge)).toBe('A. Customer');
    expect(valueText(pre, { k: 'B. Other' }, merge)).toBe('B. Other');
  });
  it('is empty when there is nothing to print', async () => {
    const { valueText } = await import('@/lib/documents/templates/render');
    expect(valueText(f({}), {}, merge)).toBe('');
    expect(valueText(f({}), { k: '  ' }, merge)).toBe('');
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
