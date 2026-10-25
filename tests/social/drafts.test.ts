import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import seedJson from '@/lib/social/config/scripts.seed.json';
import { baseContext, defaultChoice, eligibleScripts, SCRIPTS } from '@/lib/social/drafts';
import { runGuardrails } from '@/lib/social/rules/guardrails';
import { allFixedTexts, renderDraft } from '@/lib/social/rules/template';
import settings from '@/lib/social/config/settings.defaults.json';

describe('scripts.seed.json', () => {
  it('matches the YAML the reviewers read', () => {
    const yaml = parse(readFileSync(path.join(__dirname, '../../src/lib/social/config/scripts.seed.yaml'), 'utf8'));
    expect(seedJson).toEqual(JSON.parse(JSON.stringify(yaml)));
  });
});

describe('script eligibility', () => {
  it('a safety comment only gets the safety scripts', () => {
    const l = eligibleScripts({ severity: 'critical', platform: 'facebook', topics: ['safety'], safety: true });
    expect(l.length).toBeGreaterThan(0);
    expect(l.every((s) => s.safety)).toBe(true);
    expect(l[0].id).toBe('safety-concern');
  });
  it('a non-safety comment never gets a safety script', () => {
    const l = eligibleScripts({ severity: 'medium', platform: 'facebook', topics: ['pricing'], safety: false });
    expect(l.some((s) => s.safety)).toBe(false);
    expect(l.map((s) => s.id)).toContain('price-objection');
  });
  it('a one-star review on Trustpilot gets the review script', () => {
    expect(eligibleScripts({ severity: 'high', platform: 'trustpilot', topics: ['service'], safety: false })[0].id).toBe('one-star-review');
  });
});

describe('the no-AI fallback draft', () => {
  for (const s of SCRIPTS) {
    for (const name of ['Sam', null]) {
      it(`${s.id} renders and passes guardrails (${name ?? 'no name'})`, () => {
        const ctx = { ...baseContext(), firstName: name };
        const text = renderDraft(s, defaultChoice(s, ctx), { ...ctx, platform: 'facebook' }).text;
        const r = runGuardrails({
          text,
          isSafety: !!s.safety,
          severity: (s.severities[0] ?? 'medium') as 'medium',
          platform: 'facebook',
          officePhone: settings.office_phone,
          scriptBannedPhrases: s.banned_phrases ?? [],
          commenterFirstName: name,
          signoff: settings.signoff_default,
          fixedTexts: allFixedTexts(s, ctx),
        });
        expect(r.failures, text).toEqual([]);
      });
    }
  }
});
