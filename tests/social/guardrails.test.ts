import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import settings from '@/lib/social/config/settings.defaults.json';
import guardrailsConfig from '@/lib/social/config/guardrails.json';
import { runGuardrails } from '@/lib/social/rules/guardrails';
import { allFixedTexts, deriveFirstName, renderDraft, renderBooking, RenderError, type DraftChoice, type RenderContext, type Script } from '@/lib/social/rules/template';
import { lightRewordOk, similarity, longestSharedRun } from '@/lib/social/rules/similarity';
import type { Platform, Severity } from '@/lib/social/rules/types';

const seed = parse(readFileSync(path.join(__dirname, '../../src/lib/social/config/scripts.seed.yaml'), 'utf8')) as { scripts: Script[] };
const scripts = seed.scripts;
const byId = (id: string) => scripts.find((s) => s.id === id)!;

const OFFICE = settings.office_phone;
const baseCtx = (firstName: string | null): Omit<RenderContext, 'platform'> => ({
  firstName,
  signoff: settings.signoff_default,
  officePhone: OFFICE,
  bookingUrls: settings['booking.links'] as RenderContext['bookingUrls'],
  factSheetActive: false,
  claims: [],
  properNouns: guardrailsConfig.G6_allowlist_proper_nouns.filter((w) => !['I', "I'm", "I'd", "I'll", 'Hi', 'Hello', 'Thanks', 'Thank', 'Diolch'].includes(w)),
});
const greetingName = (text: string) => text.match(/^(?:Hi|Hello) ([A-Z][a-z]+),/)?.[1] ?? null;

type Case = {
  id: string;
  context: { safety: boolean; severity: Severity; platform: Platform; script?: string; comment?: string; commenter_first_name?: string };
  text: string;
  expected_pass: boolean;
  expected_rules: string[];
  expected_warnings?: string[];
};
const cases: Case[] = readFileSync(path.join(__dirname, 'guardrail-cases.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

function check(text: string, o: { safety: boolean; severity: Severity; platform: Platform; script?: Script[]; comment?: string; name?: string | null }) {
  const name = o.name === undefined ? greetingName(text) : o.name;
  const pool = o.script ?? (o.safety ? [byId('safety-concern')] : scripts.filter((s) => !s.safety));
  return runGuardrails({
    text,
    isSafety: o.safety,
    severity: o.severity,
    platform: o.platform,
    officePhone: OFFICE,
    scriptBannedPhrases: o.script?.flatMap((s) => s.banned_phrases ?? []) ?? (o.safety ? byId('safety-concern').banned_phrases : []),
    commenterFirstName: name,
    signoff: settings.signoff_default,
    comment: o.comment,
    fixedTexts: pool.flatMap((s) => allFixedTexts(s, baseCtx(name))),
  });
}

describe('AT-GR-01: the guardrail test set', () => {
  expect(cases.length).toBeGreaterThanOrEqual(40);
  for (const c of cases) {
    it(c.id, () => {
      const r = check(c.text, {
        safety: c.context.safety,
        severity: c.context.severity,
        platform: c.context.platform,
        script: c.context.script ? [byId(c.context.script)] : undefined,
        comment: c.context.comment,
        name: c.context.commenter_first_name ?? undefined,
      });
      expect(r.pass, JSON.stringify(r.failures)).toBe(c.expected_pass);
      const fired = new Set(r.failures.map((f) => f.rule));
      for (const rule of c.expected_rules) expect(fired.has(rule), `${rule} should fire; got ${[...fired]}`).toBe(true);
      for (const w of c.expected_warnings ?? []) expect(r.warnings.some((x) => x.rule === w)).toBe(true);
    });
  }
});

describe('AT-GR-02: every seeded script passes its own guardrails', () => {
  it('has the ten required scripts', () => {
    const ids = scripts.map((s) => s.id);
    for (const id of ['safety-concern', 'price-objection', 'installation-complaint', 'delayed-installation', 'warranty-question', 'competitor-comparison', 'one-star-review', 'five-star-thanks', 'general-enquiry']) {
      expect(ids).toContain(id);
    }
    expect(scripts.some((s) => s.id.includes('abusive'))).toBe(true);
  });

  for (const s of scripts) {
    s.examples.forEach((ex, i) => {
      it(`${s.id} example ${i + 1}`, () => {
        const sev = (s.severities[0] ?? 'medium') as Severity;
        const r = check(ex, { safety: !!s.safety, severity: s.severities.length === 1 ? sev : 'medium', platform: 'facebook', script: [s] });
        expect(r.failures, JSON.stringify(r.failures)).toEqual([]);
      });
    });
    it(`${s.id}: no single variant breaks a content rule`, () => {
      const ctx = baseCtx('Sam');
      for (const seg of s.segments) {
        for (const v of [...(seg.variants ?? []), ...(seg.variants_no_name ?? [])]) {
          if (v.includes('{{')) continue; // slots are checked in the examples and render tests
          const r = check(`${v} Get in touch?`, { safety: !!s.safety, severity: 'medium', platform: 'facebook', script: [s], name: 'Sam' });
          const bad = r.failures.filter((f) => ['G1', 'G2', 'G4', 'G5', 'G7', 'G9'].includes(f.rule));
          expect(bad, `${s.id}/${seg.id}: ${v}`).toEqual([]);
        }
      }
      expect(ctx.firstName).toBe('Sam');
    });
  }

  it('the safety script has no Fact Sheet claims allowed at launch', () => {
    expect(byId('safety-concern').allowed_claims ?? []).toEqual([]);
  });
});

describe('the reference GoodWe reply from the brief fails', () => {
  it('the improvised reply is blocked (defensive and an unapproved safety claim)', () => {
    const r = check(
      "To clarify, I wasn't suggesting the battery is likely to catch fire. GoodWe have added extra safety features.",
      { safety: true, severity: 'critical', platform: 'facebook' }
    );
    expect(r.pass).toBe(false);
    expect(new Set(r.failures.map((f) => f.rule))).toContain('G9');
    expect(new Set(r.failures.map((f) => f.rule))).toContain('G3');
  });
});

describe('a reviewer edit gets the full check', () => {
  const draft = 'Hi Sarah, thank you for raising this. It\'s a fair question, and battery safety is something we take seriously. We\'d much rather talk it through with you properly than in a comment. You can book a call with our team here: https://heliaxis.co.uk/book-a-call?utm_source=facebook&utm_medium=social-reply\nThe Heliaxis team';
  const opts = { safety: true, severity: 'critical' as const, platform: 'facebook' as const, name: 'Sarah' };
  it('passes unchanged', () => {
    expect(check(draft, opts).pass).toBe(true);
  });
  it('fails when a safety claim is added to a fixed sentence', () => {
    const edited = draft.replace('is something we take seriously.', 'is something we take seriously, and ours is designed to shut down automatically.');
    const r = check(edited, opts);
    expect(r.pass).toBe(false);
  });
  it('fails when a new reassuring sentence is added', () => {
    const edited = draft.replace('We\'d much rather', 'The battery is very unlikely to be a problem. We\'d much rather');
    expect(check(edited, opts).pass).toBe(false);
  });
  it('fails on an edited sentence that becomes absolute', () => {
    const edited = draft.replace("It's a fair question", "It's a completely fair question");
    expect(check(edited, opts).failures.map((f) => f.rule)).toContain('G2');
  });
});

describe('rendering', () => {
  const ctx: RenderContext = { ...baseCtx('Sarah'), platform: 'facebook' };
  const safety = byId('safety-concern');
  const choice: DraftChoice = {
    script_id: 'safety-concern',
    segments: [
      { segment_id: 'greeting', variant_index: 0, reworded_text: null },
      { segment_id: 'thanks', variant_index: 0, reworded_text: null },
      { segment_id: 'acknowledge', variant_index: 0, reworded_text: null },
      { segment_id: 'facts', variant_index: 0, reworded_text: null },
      { segment_id: 'offer', variant_index: 0, reworded_text: null },
      { segment_id: 'booking', variant_index: 0, reworded_text: null },
      { segment_id: 'signoff', variant_index: 0, reworded_text: null },
    ],
    slots: { concern_phrase: 'battery safety' },
    booking_type: 'call',
    reviewer_note: '',
  };

  it('reproduces the first safety example exactly', () => {
    const r = renderDraft(safety, choice, ctx);
    expect(r.text).toBe(safety.examples[0]);
    expect(r.claimIds).toEqual([]);
  });
  it('the rendered safety reply passes every guardrail', () => {
    const r = renderDraft(safety, choice, ctx);
    const g = runGuardrails({
      text: r.text, isSafety: true, severity: 'critical', platform: 'facebook', officePhone: OFFICE,
      scriptBannedPhrases: safety.banned_phrases, commenterFirstName: 'Sarah', signoff: settings.signoff_default,
      fixedTexts: r.parts.filter((p) => p.fixed).map((p) => p.text),
    });
    expect(g.failures).toEqual([]);
  });
  it('uses the no-name greeting when there is no usable first name', () => {
    const r = renderDraft(safety, choice, { ...ctx, firstName: null });
    expect(r.text.startsWith('Hi there, thank you')).toBe(true);
  });
  it('makes no facts segment at launch (no Fact Sheet)', () => {
    expect(renderDraft(safety, choice, ctx).parts.map((p) => p.segmentId)).not.toContain('facts');
  });
  it('says the Fact Sheet does not cover it when one exists but has no matching claim', () => {
    const r = renderDraft(safety, choice, { ...ctx, factSheetActive: true });
    expect(r.text).toContain("we'd rather answer it properly than guess here");
  });
  it('only uses approved claims the script allows, verbatim', () => {
    const withClaims = { ...safety, allowed_claims: ['clm_1'] };
    const r = renderDraft(withClaims, choice, { ...ctx, factSheetActive: true, claims: [{ id: 'clm_1', wording: 'Exactly this wording.' }, { id: 'clm_2', wording: 'Not allowed here.' }] });
    expect(r.text).toContain('Exactly this wording.');
    expect(r.text).not.toContain('Not allowed here.');
    expect(r.claimIds).toEqual(['clm_1']);
  });
  it('rejects rewording where the script allows none', () => {
    const bad = structuredClone(choice);
    bad.segments[1].reworded_text = 'Thanks a lot.';
    expect(() => renderDraft(safety, bad, ctx)).toThrow(RenderError);
  });
  it('rejects a slot value outside the allowed list', () => {
    expect(() => renderDraft(safety, { ...choice, slots: { concern_phrase: 'anything I like' } }, ctx)).toThrow(RenderError);
  });
  it('rejects an out-of-range variant', () => {
    const bad = structuredClone(choice);
    bad.segments[0].variant_index = 9;
    expect(() => renderDraft(safety, bad, ctx)).toThrow(RenderError);
  });
  it('rejects a booking type the script does not allow', () => {
    expect(() => renderDraft(safety, { ...choice, booking_type: 'quote' }, ctx)).toThrow(RenderError);
  });
  it('keeps a light rewording that stays close, and drops one that adds a price', () => {
    const price = byId('price-objection');
    const c: DraftChoice = {
      script_id: 'price-objection',
      segments: price.segments.map((s) => ({ segment_id: s.id, variant_index: 0, reworded_text: null })),
      slots: {},
      booking_type: 'survey',
      reviewer_note: '',
    };
    c.segments[1].reworded_text = 'Thanks again for asking about price.';
    const kept = renderDraft(price, c, { ...ctx, firstName: 'Emma' });
    expect(kept.text).toContain('Hi Emma, thanks again for asking about price.');
    c.segments[1].reworded_text = 'Thanks for asking about price, it starts from £4,995.';
    const dropped = renderDraft(price, c, { ...ctx, firstName: 'Emma' });
    expect(dropped.text).not.toContain('£4,995');
    expect(dropped.text).toContain('Hi Emma, thanks for asking about price.');
  });
  it('renders the booking sentence per platform', () => {
    const urls = ctx.bookingUrls;
    expect(renderBooking('facebook', 'quote', { bookingUrls: urls, officePhone: OFFICE })).toBe(
      'You can book a quote consultation here: https://heliaxis.co.uk/book-a-call?reason=quote&utm_source=facebook&utm_medium=social-reply'
    );
    expect(renderBooking('instagram', 'survey', { bookingUrls: urls, officePhone: OFFICE })).toContain('link in our bio');
    expect(renderBooking('google', 'call', { bookingUrls: urls, officePhone: OFFICE })).toBe(
      `You can book a call with our team at heliaxis.co.uk/book or call us on ${OFFICE}.`
    );
  });
});

describe('first names', () => {
  it.each([
    ['Sarah Jones', 'Sarah'],
    ['EMMA', 'Emma'],
    ["O'Neil Fitness", "O'Neil"],
    ['Rhŷs', null],
    ['J. Smith', null],
    ['Admin', null],
    ['The Solar Page', null],
    ['', null],
  ])('%s', (input, expected) => {
    expect(deriveFirstName(input)).toBe(expected);
  });
});

describe('similarity', () => {
  it('is 1 for identical wording and lower for different', () => {
    expect(similarity('Thank you for raising this.', 'Thank you for raising this.')).toBe(1);
    expect(similarity('Thank you for raising this.', 'Completely different words here today')).toBeLessThan(0.3);
  });
  it('finds the longest copied run', () => {
    expect(longestSharedRun('the panels would pay for themselves in two years', 'you said the panels would pay for themselves')).toBe(6);
  });
  it('lightRewordOk blocks new numbers, links and names', () => {
    expect(lightRewordOk('Thanks for asking.', 'Thanks for asking!')).toBe(true);
    expect(lightRewordOk('Thanks for asking.', 'Thanks for asking, call 07700 900123.')).toBe(false);
    expect(lightRewordOk('Thanks for asking.', 'Thanks for asking, says Gareth.')).toBe(false);
  });
});
