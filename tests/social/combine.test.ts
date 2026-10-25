import { describe, expect, it } from 'vitest';
import { combine, type CombineInput } from '@/lib/social/rules/combine';

const base: CombineInput = {
  keywordSeverity: null,
  keywordSafetyRelated: false,
  model: { severity: 'medium', confidence: 0.9, sentiment: 'neutral', safetyRelated: false, injectionSuspected: false },
  modelFailed: false,
  rating: null,
  author: { negativeMentions30d: 0, hasOpenCritical: false },
  thread: { parentOrRootOpenSeverity: null },
  escalatingThread: false,
  floor: null,
};
const run = (over: Partial<CombineInput>) => combine({ ...base, ...over });
const model = (o: Partial<NonNullable<CombineInput['model']>>) => ({ ...base.model!, ...o });

describe('C1: the higher of keyword and model wins', () => {
  it('keyword Critical beats a model Positive', () => {
    expect(run({ keywordSeverity: 'critical', model: model({ severity: 'positive' }) }).severity).toBe('critical');
  });
  it('model Critical beats a keyword High', () => {
    expect(run({ keywordSeverity: 'high', model: model({ severity: 'critical' }) }).severity).toBe('critical');
  });
  it('the AI can never lower the keyword result', () => {
    for (const sev of ['ignore', 'positive', 'low', 'medium'] as const) {
      const r = run({ keywordSeverity: 'critical', model: model({ severity: sev, confidence: 0.99 }) });
      expect(r.severity).toBe('critical');
    }
  });
  it('records the keyword and model severities', () => {
    const r = run({ keywordSeverity: 'high', model: model({ severity: 'low' }) });
    expect(r.keywordSeverity).toBe('high');
    expect(r.modelSeverity).toBe('low');
  });
});

describe('S1: a safety-related model result is Critical', () => {
  it('raises a model Medium to Critical', () => {
    const r = run({ model: model({ severity: 'medium', safetyRelated: true }) });
    expect(r.severity).toBe('critical');
    expect(r.safetyRelated).toBe(true);
    expect(r.adjustments).toContain('S1');
  });
});

describe('C2: ratings', () => {
  it('1 and 2 stars are at least High', () => {
    expect(run({ rating: 1, model: model({ severity: 'low' }) }).severity).toBe('high');
    expect(run({ rating: 2, model: model({ severity: 'positive' }) }).severity).toBe('high');
  });
  it('3 stars is at least Medium', () => {
    expect(run({ rating: 3, model: model({ severity: 'low' }) }).severity).toBe('medium');
  });
  it('5 stars does not lower anything', () => {
    expect(run({ rating: 5, keywordSeverity: 'critical', model: model({ severity: 'positive' }) }).severity).toBe('critical');
  });
});

describe('C3: low confidence on anything negative goes up a level', () => {
  it('Medium, negative, 0.5 confidence becomes High', () => {
    const r = run({ model: model({ severity: 'medium', sentiment: 'negative', confidence: 0.5 }) });
    expect(r.severity).toBe('high');
    expect(r.adjustments).toContain('C3');
  });
  it('High becomes Critical', () => {
    expect(run({ model: model({ severity: 'high', sentiment: 'mixed', confidence: 0.6 }) }).severity).toBe('critical');
  });
  it('0.70 exactly does not escalate', () => {
    expect(run({ model: model({ severity: 'medium', sentiment: 'negative', confidence: 0.7 }) }).severity).toBe('medium');
  });
  it('a neutral low-confidence comment does not escalate', () => {
    expect(run({ model: model({ severity: 'low', sentiment: 'neutral', confidence: 0.3 }) }).severity).toBe('low');
  });
  it('Critical stays Critical', () => {
    expect(run({ model: model({ severity: 'critical', sentiment: 'negative', confidence: 0.1 }) }).severity).toBe('critical');
  });
});

describe('C4: suspected injection', () => {
  it('is at least Medium and notes it', () => {
    const r = run({ model: model({ severity: 'positive', injectionSuspected: true }) });
    expect(r.severity).toBe('medium');
    expect(r.injectionSuspected).toBe(true);
    expect(r.adjustments).toContain('C4');
  });
  it('never lowers a higher severity', () => {
    expect(run({ keywordSeverity: 'critical', model: model({ injectionSuspected: true }) }).severity).toBe('critical');
  });
});

describe('C5: Ignore needs both layers to agree and high confidence', () => {
  it('Ignore stands with no keyword hit and 0.85+ confidence', () => {
    expect(run({ model: model({ severity: 'ignore', confidence: 0.85 }) }).severity).toBe('ignore');
  });
  it('Ignore with 0.84 confidence becomes Low', () => {
    const r = run({ model: model({ severity: 'ignore', confidence: 0.84 }) });
    expect(r.severity).toBe('low');
    expect(r.adjustments).toContain('C5');
  });
  it('Ignore never survives a keyword hit', () => {
    expect(run({ keywordSeverity: 'high', model: model({ severity: 'ignore', confidence: 1 }) }).severity).toBe('high');
  });
});

describe('R1: repeat commenters', () => {
  it('two earlier negative mentions raise one level', () => {
    const r = run({ model: model({ severity: 'medium' }), author: { negativeMentions30d: 2, hasOpenCritical: false } });
    expect(r.severity).toBe('high');
    expect(r.tags).toContain('repeat_commenter');
  });
  it('one earlier negative mention does not', () => {
    expect(run({ author: { negativeMentions30d: 1, hasOpenCritical: false } }).severity).toBe('medium');
  });
  it('Critical stays Critical, not higher', () => {
    expect(run({ keywordSeverity: 'critical', author: { negativeMentions30d: 5, hasOpenCritical: false } }).severity).toBe('critical');
  });
  it('spam stays Ignore', () => {
    expect(run({ model: model({ severity: 'ignore', confidence: 0.95 }), author: { negativeMentions30d: 3, hasOpenCritical: false } }).severity).toBe('ignore');
  });
});

describe('R2: an author with an open Critical', () => {
  it('is at least High', () => {
    const r = run({ model: model({ severity: 'low' }), author: { negativeMentions30d: 0, hasOpenCritical: true } });
    expect(r.severity).toBe('high');
    expect(r.adjustments).toContain('R2');
  });
});

describe('T1: thread inheritance', () => {
  it('a reply under an open Critical is at least High', () => {
    expect(run({ model: model({ severity: 'positive' }), thread: { parentOrRootOpenSeverity: 'critical' } }).severity).toBe('high');
  });
  it('a reply under an open High is at least Medium', () => {
    expect(run({ model: model({ severity: 'low' }), thread: { parentOrRootOpenSeverity: 'high' } }).severity).toBe('medium');
  });
  it('a reply under a Low parent is unchanged', () => {
    expect(run({ model: model({ severity: 'low' }), thread: { parentOrRootOpenSeverity: 'low' } }).severity).toBe('low');
  });
});

describe('T3: an escalating thread', () => {
  it('is at least High and tagged', () => {
    const r = run({ model: model({ severity: 'low' }), escalatingThread: true });
    expect(r.severity).toBe('high');
    expect(r.tags).toContain('escalating_thread');
  });
});

describe('F1: model failure (docs 03 §6)', () => {
  it('is at least High with no keyword hit', () => {
    const r = run({ model: null, modelFailed: true });
    expect(r.severity).toBe('high');
    expect(r.adjustments).toContain('F1');
    expect(r.modelStatus).toBe('failed');
  });
  it('keeps Critical from the keyword layer', () => {
    expect(run({ keywordSeverity: 'critical', model: null, modelFailed: true }).severity).toBe('critical');
  });
  it('keeps the keyword layer\'s safety flag when the AI is down', () => {
    expect(run({ keywordSeverity: 'critical', keywordSafetyRelated: true, model: null, modelFailed: true }).safetyRelated).toBe(true);
  });
});

describe('floor: a later result never lowers an earlier one', () => {
  it('holds the earlier Critical after an edit lowers the text severity', () => {
    const r = run({ model: model({ severity: 'low' }), floor: 'critical' });
    expect(r.severity).toBe('critical');
    expect(r.adjustments).toContain('FLOOR');
  });
  it('lets a higher new result through', () => {
    expect(run({ keywordSeverity: 'critical', floor: 'medium' }).severity).toBe('critical');
  });
});

describe('model missing and no failure flag (not yet classified by AI)', () => {
  it('uses the keyword result alone', () => {
    const r = run({ keywordSeverity: 'high', model: null });
    expect(r.severity).toBe('high');
    expect(r.modelStatus).toBe('pending');
  });
  it('with nothing at all falls back to Low', () => {
    expect(run({ keywordSeverity: null, model: null }).severity).toBe('low');
  });
});
