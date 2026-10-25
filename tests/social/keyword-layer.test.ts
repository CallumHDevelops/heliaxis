import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKeywordLayer, keywordLayer, type KeywordConfig } from '@/lib/social/rules/keywordLayer';
import { basic, deleet, despace, squeeze, variants } from '@/lib/social/rules/normalise';
import { sevRank, type Severity } from '@/lib/social/rules/types';
import keywordsJson from '@/lib/social/config/keywords.json';

type Case = {
  id: string;
  platform: string;
  text: string;
  expected_severity: Severity;
  must_keyword_hit: boolean;
};
const cases: Case[] = readFileSync(path.join(__dirname, 'classifier-testset.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));

describe('normalisation', () => {
  it('lower-cases, straightens quotes and collapses space', () => {
    expect(basic('  It’s   SO  hot ')).toBe("it's so hot");
  });
  it('strips zero-width characters', () => {
    expect(basic('fi​re')).toBe('fire');
  });
  it('squeezes repeated letters', () => {
    expect(squeeze('fiiiire hazaaard')).toBe('fire hazard');
  });
  it('de-leets inside words only', () => {
    expect(deleet('c4tch f1re')).toBe('catch fire');
    expect(deleet('call 999')).toBe('cal 999');
  });
  it('joins spaced-out letters', () => {
    expect(despace('f i r e risk')).toBe('fire risk');
    expect(despace('f.i.r.e')).toBe('fire');
    expect(despace('we are here')).toBe('we are here');
  });
  it('keeps Welsh diacritics', () => {
    expect(variants('Ar DÂN').basic).toBe('ar dân');
  });
});

describe('keyword layer: the brief\'s MUST list is always Critical', () => {
  const must = [
    'The battery could catch fire',
    'is it going to burn',
    'will it explode',
    'it keeps overheating',
    'thermal runaway is scary',
    'I saw smoke',
    'does it leak gas',
    'this seems dangerous',
    'it looks unsafe',
    'someone got an injury',
    'what about my insurance',
    'the fire brigade came',
  ];
  it.each(must)('%s', (text) => {
    expect(keywordLayer.match(text).severity).toBe('critical');
  });

  it('has no exclusion list: a gas boiler comment is Critical', () => {
    const r = keywordLayer.match('We are switching from a gas boiler to a heat pump');
    expect(r.severity).toBe('critical');
    expect(r.safetyRelated).toBe(true);
  });

  it('GoodWe reference case is Critical, safety-related, with a "catch fire" hit', () => {
    const r = keywordLayer.match('Bit worrying that the salesman said the battery could catch fire 😬');
    expect(r.severity).toBe('critical');
    expect(r.safetyRelated).toBe(true);
    expect(r.hits.some((h) => h.term === 'catch fire')).toBe(true);
  });

  it('catches spelling tricks', () => {
    for (const t of ['can these catch fier?', 'c4tch f1re', 'f i r e risk', 'fiiiire hazard much', 'overheet', 'f.i.r.e']) {
      expect(keywordLayer.match(t).severity, t).toBe('critical');
    }
  });

  it('catches Welsh safety words', () => {
    expect(keywordLayer.match("Ydy'r batri yn gallu mynd ar dân?").severity).toBe('critical');
    expect(keywordLayer.match('Mae e yn rhy boeth').severity).toBe('critical');
  });

  it('treats the fire emoji as Critical', () => {
    expect(keywordLayer.match('🔥🔥🔥').severity).toBe('critical');
    expect(keywordLayer.match('🔥️').severity).toBe('critical');
  });

  it('does not fire on harmless words that merely contain a keyword', () => {
    for (const t of ['Would cost a bomb', 'a fireside chat? no: a warm welcome', 'no complaints at all', 'Couldn’t fault them', 'great price and no hard sell']) {
      const r = keywordLayer.match(t);
      expect(r.severity, t).not.toBe('critical');
    }
  });

  it('reports High-only categories as not safety-related', () => {
    const r = keywordLayer.match('I want a refund');
    expect(r.severity).toBe('high');
    expect(r.safetyRelated).toBe(false);
  });

  it('returns nothing for an ordinary question', () => {
    const r = keywordLayer.match('Do you cover Merthyr?');
    expect(r.severity).toBeNull();
    expect(r.hits).toEqual([]);
  });

  it('records the rules version', () => {
    expect(keywordLayer.rulesVersion).toBe((keywordsJson as KeywordConfig).version);
  });
});

describe('AT-CL-01: the labelled test set (keyword layer only)', () => {
  it('has the expected size', () => {
    expect(cases.length).toBeGreaterThanOrEqual(200);
  });

  it('includes the GoodWe reference case', () => {
    expect(cases.some((c) => c.id === 'goodwe-reference')).toBe(true);
  });

  for (const c of cases.filter((x) => x.must_keyword_hit)) {
    it(`must hit: ${c.id}`, () => {
      expect(keywordLayer.match(c.text).severity).toBe(c.expected_severity);
    });
  }

  for (const c of cases.filter((x) => !x.must_keyword_hit)) {
    it(`never above expected: ${c.id}`, () => {
      expect(sevRank(keywordLayer.match(c.text).severity)).toBeLessThanOrEqual(sevRank(c.expected_severity));
    });
  }
});

describe('performance', () => {
  it('matches a 2,000-character comment in under 5 ms on average', () => {
    const text = ('We had the panels fitted last spring and the team were polite, tidy and on time. ' as string).repeat(25).slice(0, 2000);
    keywordLayer.match(text);
    const runs = 100;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) keywordLayer.match(text);
    const avg = (performance.now() - t0) / runs;
    expect(avg).toBeLessThan(5);
  });
});

describe('config integrity', () => {
  const cfg = keywordsJson as KeywordConfig;
  it('only uses High and Critical, never anything lower', () => {
    for (const c of cfg.categories) expect(['high', 'critical']).toContain(c.severity);
  });
  it('marks every Critical safety category safety-related', () => {
    for (const c of cfg.categories.filter((x) => x.id.startsWith('safety_') || x.id === 'welsh_safety')) {
      expect(c.safety, c.id).toBe(true);
      expect(c.severity, c.id).toBe('critical');
    }
  });
  it('compiles every pattern without error', () => {
    expect(() => buildKeywordLayer(cfg)).not.toThrow();
    const layer = buildKeywordLayer(cfg);
    expect(layer.match('hello').hits).toEqual([]);
  });
});
