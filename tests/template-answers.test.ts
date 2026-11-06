import { describe, expect, it } from 'vitest';
import { applyAnswers, checkAnswer, emptyForm, fromSimpliHeat, outstanding, progress, toSimpliHeat, type FormState } from '@/lib/templates/answers';
import { allFields } from '@/lib/templates/rules';
import { CYLINDER_COMMISSIONING, HEAT_PUMP_COMMISSIONING } from '@/lib/templates/seed/heat-pump';
import type { DocTemplate, TemplateField } from '@/lib/templates/types';

const NOW = '2026-11-06T10:00:00.000Z';
const field = (over: Partial<TemplateField>): TemplateField => ({ key: 'k', label: 'K', kind: 'text', ...over });

describe('checking an answer against its question', () => {
  it('trims text and clears an empty one', () => {
    expect(checkAnswer(field({}), '  hello ')).toEqual({ ok: true, value: 'hello' });
    expect(checkAnswer(field({}), '   ')).toEqual({ ok: true, value: null });
    expect(checkAnswer(field({}), null)).toEqual({ ok: true, value: null });
    expect(checkAnswer(field({}), 'x'.repeat(301)).ok).toBe(false);
    expect(checkAnswer(field({ kind: 'long' }), 'x'.repeat(301)).ok).toBe(true);
  });
  it('wants a number for a number, and keeps it as one', () => {
    expect(checkAnswer(field({ kind: 'number', unit: '°C' }), '45.5')).toEqual({ ok: true, value: 45.5 });
    expect(checkAnswer(field({ kind: 'number' }), 12)).toEqual({ ok: true, value: 12 });
    expect(checkAnswer(field({ kind: 'number' }), '-3')).toEqual({ ok: true, value: -3 });
    for (const bad of ['abc', '1,5', '4 bar', NaN, Infinity]) expect(checkAnswer(field({ kind: 'number' }), bad).ok, String(bad)).toBe(false);
  });
  it('accepts yes, no and n/a, and booleans, but no n/a where the question has none', () => {
    const yn = field({ kind: 'yesno' });
    expect(checkAnswer(yn, 'na')).toEqual({ ok: true, value: 'na' });
    expect(checkAnswer(yn, true)).toEqual({ ok: true, value: 'yes' });
    expect(checkAnswer(yn, false)).toEqual({ ok: true, value: 'no' });
    expect(checkAnswer(yn, 'maybe').ok).toBe(false);
    expect(checkAnswer(field({ kind: 'yesno', noNa: true }), 'na').ok).toBe(false);
    expect(checkAnswer(field({ kind: 'yesno', noNa: true }), 'yes').ok).toBe(true);
  });
  it('wants one of the options for a choice', () => {
    const c = field({ kind: 'choice', options: ['Sealed', 'Open vented'] });
    expect(checkAnswer(c, 'Sealed').ok).toBe(true);
    expect(checkAnswer(c, 'Other').ok).toBe(false);
  });
  it('wants a real date as YYYY-MM-DD', () => {
    const d = field({ kind: 'date' });
    expect(checkAnswer(d, '2026-11-06').ok).toBe(true);
    for (const bad of ['06/11/2026', '2026-13-01', '2026-02-30', 'today']) expect(checkAnswer(d, bad).ok, bad).toBe(false);
  });
});

describe('applying answers', () => {
  const tpl = HEAT_PUMP_COMMISSIONING;
  const by = { name: 'Sam Patel' };

  it('keeps who entered each answer, when, and from where', () => {
    const r = applyAnswers(tpl, emptyForm(), { hpModel: 'EH-8', flow_nope: 1 }, by, 'hap', NOW);
    expect(r.state.answers.hpModel).toBe('EH-8');
    expect(r.state.provenance.hpModel).toEqual({ by: 'Sam Patel', at: NOW, source: 'hap' });
    expect(r.changed).toEqual(['hpModel']);
    expect(r.unknown).toEqual(['flow_nope']);
  });
  it('does not touch who entered an answer that has not changed', () => {
    const a = applyAnswers(tpl, emptyForm(), { hpModel: 'EH-8' }, by, 'simpliheat', NOW).state;
    const b = applyAnswers(tpl, a, { hpModel: 'EH-8' }, { name: 'Someone else' }, 'hap', '2026-11-07T09:00:00.000Z');
    expect(b.changed).toEqual([]);
    expect(b.state.provenance.hpModel.source).toBe('simpliheat');
  });
  it('replaces an answer, and records the new source', () => {
    const a = applyAnswers(tpl, emptyForm(), { hpModel: 'EH-8' }, by, 'simpliheat', NOW).state;
    const b = applyAnswers(tpl, a, { hpModel: 'EH-10' }, by, 'hap', '2026-11-07T09:00:00.000Z');
    expect(b.state.answers.hpModel).toBe('EH-10');
    expect(b.state.provenance.hpModel).toEqual({ by: 'Sam Patel', at: '2026-11-07T09:00:00.000Z', source: 'hap' });
  });
  it('clears an answer, and who entered it, when sent empty', () => {
    const a = applyAnswers(tpl, emptyForm(), { hpModel: 'EH-8' }, by, 'hap', NOW).state;
    const b = applyAnswers(tpl, a, { hpModel: '' }, by, 'hap', NOW);
    expect(b.state.answers.hpModel).toBeUndefined();
    expect(b.state.provenance.hpModel).toBeUndefined();
    expect(b.changed).toEqual(['hpModel']);
  });
  it('refuses an answer that does not suit its question but takes the rest', () => {
    const r = applyAnswers(tpl, emptyForm(), { flowMax: 'hot', maxFlowTemp: 'hot', hpModel: 'EH-8', hpType: 'Steam' }, by, 'hap', NOW);
    expect(r.state.answers.hpModel).toBe('EH-8');
    expect(r.problems.length).toBe(2);
    expect(r.problems.join(' ')).toContain('needs a number');
    expect(r.problems.join(' ')).toContain('isn’t one of the options');
  });
  it('does not change the form it was given', () => {
    const before: FormState = emptyForm();
    applyAnswers(tpl, before, { hpModel: 'EH-8' }, by, 'hap', NOW);
    expect(before).toEqual(emptyForm());
  });
});

describe('what is left', () => {
  const tpl = HEAT_PUMP_COMMISSIONING;
  const key = (list: TemplateField[]) => list.map((f) => f.key);

  it('counts only the questions that are asked', () => {
    const asked = (a: Record<string, string>) => progress(tpl, a).asked;
    const single = asked({ hpType: 'Air source (ASHP)', supplyPhase: 'Single phase' });
    const three = asked({ hpType: 'Air source (ASHP)', supplyPhase: 'Three phase' });
    expect(three - single).toBe(7);
    // Air source and ground source each add 15 questions (SimpliHeat's Absorber and Collector sections), but not the same ones.
    expect(asked({ hpType: 'Ground source (GSHP)', supplyPhase: 'Single phase' })).toBe(single);
    const air = key(outstanding(tpl, { hpType: 'Air source (ASHP)' }));
    const ground = key(outstanding(tpl, { hpType: 'Ground source (GSHP)' }));
    expect(air).toContain('antifreezeType');
    expect(air).not.toContain('collectorType');
    expect(ground).toContain('collectorType');
    expect(ground).not.toContain('antifreezeType');
    // Until the type is chosen both show, and water source and exhaust air keep both, as in SimpliHeat.
    const unchosen = key(outstanding(tpl, {}));
    expect(unchosen).toContain('antifreezeType');
    expect(unchosen).toContain('collectorType');
    const water = key(outstanding(tpl, { hpType: 'Water source' }));
    expect(water).toContain('antifreezeType');
    expect(water).toContain('collectorType');
  });
  it('goes down as questions are answered, and reaches nothing left', () => {
    const answers: Record<string, string | number> = { hpType: 'Air source (ASHP)', supplyPhase: 'Single phase' };
    const start = progress(tpl, answers);
    expect(start.answered).toBe(2);
    expect(start.left).toBe(start.asked - 2);
    for (const f of outstanding(tpl, answers)) answers[f.key] = f.kind === 'number' ? 1 : f.kind === 'yesno' ? 'yes' : f.kind === 'choice' ? f.options![0] : f.kind === 'date' ? '2026-11-06' : 'x';
    // Answering the rest can bring more questions into view (a choice that opens a follow-up): go round again.
    for (const f of outstanding(tpl, answers)) answers[f.key] = f.kind === 'number' ? 1 : f.kind === 'yesno' ? 'yes' : f.kind === 'choice' ? f.options![0] : 'x';
    expect(progress(tpl, answers).left).toBe(0);
    expect(outstanding(tpl, answers)).toEqual([]);
  });
});

describe('the cylinder record', () => {
  it('shows the unvented part only for an unvented cylinder', () => {
    const left = (type: string) => key(outstanding(CYLINDER_COMMISSIONING, { cylinder_type: type }));
    const key = (list: TemplateField[]) => list.map((f) => f.key);
    expect(left('Unvented')).toContain('prv_setting');
    expect(left('Vented')).not.toContain('prv_setting');
  });
});

describe('SimpliHeat, both ways', () => {
  const tpl: DocTemplate = HEAT_PUMP_COMMISSIONING;
  const rec = {
    answers: { hpType: 'Air source (ASHP)', hpModel: 'EH-8', perInstructions: true, antiVibration: false, maxFlowTemp: 45, notAQuestion: 'x', runningMode: 'Turbo', docsProvided: null },
    technicianName: 'A. Engineer',
    technicianSignedAt: '2026-11-06T10:15:00Z',
    technicianSignature: { image: 'data:image/png;base64,AAAA', name: 'A. Engineer', signedAt: '2026-11-06T10:15:00Z', source: 'device' as const },
    customerName: 'A. Customer',
    customerSignedAt: '2026-11-06T10:20:00Z',
  };

  it('reads its answers as ours: true and false as Yes and No, from SimpliHeat', () => {
    const { state } = fromSimpliHeat(tpl, rec, NOW);
    expect(state.answers.perInstructions).toBe('yes');
    expect(state.answers.antiVibration).toBe('no');
    expect(state.answers.maxFlowTemp).toBe(45);
    expect(state.provenance.hpModel.source).toBe('simpliheat');
    expect(state.answers.docsProvided).toBeUndefined();
  });
  it('lists what it could not take: an unknown question and an answer that does not suit', () => {
    const { skipped } = fromSimpliHeat(tpl, rec, NOW);
    expect(skipped.join(' ')).toContain('notAQuestion');
    expect(skipped.join(' ')).toContain('isn’t one of the options');
  });
  it('reads its two signatures onto the technician and customer lines', () => {
    const { state } = fromSimpliHeat(tpl, rec, NOW);
    expect(state.signed.technician).toEqual({ name: 'A. Engineer', at: '2026-11-06T10:15:00Z', source: 'device', image: 'data:image/png;base64,AAAA' });
    expect(state.signed.customer).toEqual({ name: 'A. Customer', at: '2026-11-06T10:20:00Z', source: 'device' });
  });
  it('sends ours back as it holds them: Yes and No as true and false, and no N/A', () => {
    const answers = { hpModel: 'EH-8', perInstructions: 'yes', antiVibration: 'no', condensateDrain: 'na', maxFlowTemp: 45 };
    expect(toSimpliHeat(tpl, answers)).toEqual({ hpModel: 'EH-8', perInstructions: true, antiVibration: false, maxFlowTemp: 45 });
  });
  it('comes back the same after a round trip', () => {
    const { state } = fromSimpliHeat(tpl, { answers: { hpModel: 'EH-8', perInstructions: true, antiVibration: false, maxFlowTemp: 45, hpType: 'Ground source (GSHP)' } }, NOW);
    expect(toSimpliHeat(tpl, state.answers)).toEqual({ hpModel: 'EH-8', perInstructions: true, antiVibration: false, maxFlowTemp: 45, hpType: 'Ground source (GSHP)' });
  });
  it('has every yes/no of the commissioning record as Yes or No only, so nothing is lost on the way back', () => {
    for (const f of allFields(tpl).filter((x) => x.kind === 'yesno')) expect(f.noNa, f.key).toBe(true);
  });
});

describe('pre-filled questions', () => {
  const t: DocTemplate = {
    schema: 1,
    code: 'HX-TST-01',
    title: 'Test',
    tech: [],
    sections: [{ type: 'fields', title: 'Site', fields: [{ key: 'client', label: 'Client', kind: 'text', prefill: '{{customer}}' }, { key: 'note', label: 'Note', kind: 'text' }] }],
  };
  it('are not left to answer, because they print the job’s own value', () => {
    expect(progress(t, {})).toEqual({ asked: 2, answered: 1, left: 1 });
    expect(outstanding(t, {}).map((f) => f.key)).toEqual(['note']);
  });
});
