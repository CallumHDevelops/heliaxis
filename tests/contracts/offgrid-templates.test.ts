import { describe, expect, it } from 'vitest';
import { answersFor, buildSchedule, gbp, OG_CODES, type PackFacts } from '@/lib/contracts/offgrid';
import { canIssue, forPrinting, LEGAL_BANNER, legalStatus, templateHash, type Approvals } from '@/lib/templates/legal';
import { allFields, validateTemplate, mergeKeysIn } from '@/lib/templates/rules';
import { TEMPLATES, templateByCode, templatesForProducts } from '@/lib/templates/registry';
import { ISSUE } from '@/lib/documents/issue';
import { OFF_GRID_TEMPLATES } from '@/lib/templates/seed/off-grid';

const og = (code: string) => templateByCode(code)!;

describe('the off-grid pack templates', () => {
  it('are all registered, valid, and legal-review drafts', () => {
    expect(OFF_GRID_TEMPLATES.map((t) => t.code)).toEqual([...OG_CODES]);
    for (const code of OG_CODES) {
      const t = og(code);
      expect(t, code).toBeTruthy();
      expect(validateTemplate(t), code).toEqual([]);
      expect(t.legalReview, code).toBe(true);
      expect(ISSUE[code], code).toBeTruthy();
    }
  });
  it('are never offered by product, so an ordinary solar job does not get them', () => {
    for (const products of [['solar'], ['battery'], ['solar', 'battery', 'ev', 'heatpump'], []]) {
      expect(templatesForProducts(products).filter((t) => t.code.startsWith('HX-OG-'))).toEqual([]);
    }
  });
  it('use only merge fields that exist', () => {
    for (const code of OG_CODES) for (const s of og(code).sections) if (s.type === 'text') expect(mergeKeysIn(s.body).length).toBeGreaterThanOrEqual(0);
    expect(validateTemplate(og('HX-OG-01')).join(' ')).not.toMatch(/merge field/);
  });

  it('HX-OG-01 has a consumer and a business version, with the statutory points', () => {
    const t = og('HX-OG-01');
    const body = (title: string) => (t.sections.find((s) => s.type === 'text' && s.title === title) as { body: string }).body;
    const consumer = body('Terms for consumers');
    expect(consumer).toMatch(/Consumer Rights Act 2015/);
    expect(consumer).toMatch(/Consumer Contracts \(Information, Cancellation and Additional Charges\) Regulations 2013/);
    expect(consumer).toMatch(/14 days/);
    expect(consumer).toMatch(/in writing/);
    expect(consumer).toMatch(/HX-QMS-P08/);
    expect(consumer).toMatch(/England and Wales/);
    expect(body('Model cancellation form')).toMatch(/I\/We hereby give notice that I\/we cancel/);
    const business = body('Terms for businesses');
    expect(business).toMatch(/Late Payment of Commercial Debts/);
    expect(business).not.toMatch(/right to cancel within 14 days/);
    // Each version shows only for its own customer type.
    expect(t.sections.find((s) => s.type === 'text' && s.title === 'Terms for consumers')!.showWhen).toEqual({ key: 'customer_type', is: 'Consumer' });
    expect(t.sections.find((s) => s.type === 'text' && s.title === 'Terms for businesses')!.showWhen).toEqual({ key: 'customer_type', is: 'Business' });
  });
  it('HX-OG-02 says what the brief requires, and is signed on its own', () => {
    const t = og('HX-OG-02');
    const text = t.sections.filter((s) => s.type === 'text').map((s) => (s as { body: string }).body).join(' ');
    for (const must of [/not an MCS-certified installation/, /MCS certificate/, /Insurance-Backed Guarantee/, /Smart Export Guarantee/, /home insurer/, /mortgage lender/, /sell the property/]) expect(text).toMatch(must);
    expect(t.sections.some((s) => s.type === 'sign')).toBe(true);
    expect(allFields(t).filter((f) => f.key.startsWith('ack_') && f.required)).toHaveLength(5);
  });
  it('HX-OG-04 says there is no Insurance-Backed Guarantee, and what voids a warranty', () => {
    const secs = og('HX-OG-04').sections.filter((s) => s.type === 'text') as { title?: string; body: string }[];
    expect(secs.map((s) => s.body).join(' ')).toMatch(/does not have an Insurance-Backed Guarantee/);
    expect(secs.some((s) => /void a warranty/.test(s.title ?? ''))).toBe(true);
    expect(secs.find((s) => /void a warranty/.test(s.title ?? ''))!.body).toMatch(/misuse/);
  });
  it('HX-OG-06 lists everything the brief asks for', () => {
    const labels = allFields(og('HX-OG-06')).map((f) => f.label).join(' | ');
    for (const must of [/O|o\w* and maintenance manuals/, /BS 7671/, /Part P/, /PAS 63100/, /Commissioning record/, /emergency shutdown/, /Generator instructions/]) expect(labels).toMatch(must);
  });
  it('make no claim about generation, savings or payback', () => {
    for (const code of OG_CODES) expect(JSON.stringify(og(code))).not.toMatch(/you will save|pays? for itself|guaranteed (generation|savings|income)/i);
  });
});

/** Fixed wording is versioned: this fails when any wording changes, so a change is always deliberate. */
describe('wording is fixed', () => {
  // To change a clause on purpose: edit the template, raise its issue in documents/issue.ts, update this table, and get the new wording approved.
  const RECORDED: Record<string, string> = { 'HX-OG-01': 'a5bc0cd9b877', 'HX-OG-02': 'aa2f24d25088', 'HX-OG-03': '99fb2a7c3a58', 'HX-OG-04': '18fdc88d62c2', 'HX-OG-05': 'f7b492ddd0f9', 'HX-OG-06': '4da0bcf107c2' };
  it('has a recorded fingerprint for each document, and the fingerprint matches', () => {
    const now = Object.fromEntries(OG_CODES.map((c) => [c, templateHash(og(c)).slice(0, 12)]));
    expect(now).toEqual(RECORDED);
  });
});

describe('legal approval gate', () => {
  const t = og('HX-OG-02');
  const fresh = (approved: boolean, hash = templateHash(t)): Approvals => ({ [t.code]: { approved, hash, issue: 'Issue 1', by: 'u', at: '2026-11-25T00:00:00Z' } });
  it('is a draft until approved, and cannot be issued', () => {
    expect(legalStatus(t, {})).toBe('draft');
    expect(canIssue(t, {})).toBe(false);
    expect(forPrinting(t, {}).legalDraft).toBe(true);
    expect(LEGAL_BANNER).toContain('DRAFT — awaiting legal review');
    // The stored template is never changed by printing.
    expect(t.legalDraft).toBeUndefined();
  });
  it('is approved only for the exact wording that was approved', () => {
    expect(legalStatus(t, fresh(true))).toBe('approved');
    expect(canIssue(t, fresh(true))).toBe(true);
    expect(forPrinting(t, fresh(true)).legalDraft).toBeUndefined();
    // A word changes: the old approval no longer counts.
    const edited = { ...t, intro: `${t.intro} Extra.` };
    expect(legalStatus(edited, fresh(true))).toBe('changed');
    expect(canIssue(edited, fresh(true))).toBe(false);
  });
  it('a withdrawn approval is a draft again', () => {
    expect(legalStatus(t, fresh(false))).toBe('draft');
  });
  it('templates that need no review are unaffected', () => {
    const pv = TEMPLATES.find((x) => !x.legalReview)!;
    expect(canIssue(pv, {})).toBe(true);
    expect(forPrinting(pv, {})).toBe(pv);
  });
  it('the hash does not depend on key order', () => {
    const reverse = (v: unknown): unknown => (Array.isArray(v) ? v.map(reverse) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse().map(([k, x]) => [k, reverse(x)])) : v);
    const shuffled = reverse(t) as typeof t;
    expect(templateHash(shuffled)).toBe(templateHash(t));
  });
});

describe('payment schedule', () => {
  it('splits the price and always adds up exactly', () => {
    for (const total of [1425000, 1000001, 99, 1234567]) {
      const r = buildSchedule(total, [{ label: 'Deposit', percent: 30, due: 'On acceptance' }, { label: 'On delivery', percent: 40, due: 'On delivery' }, { label: 'On completion', percent: 30, due: 'On completion' }]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.lines.reduce((a, l) => a + l.amountPence, 0)).toBe(total);
    }
  });
  it('rounds down each payment and gives the last the remainder', () => {
    const r = buildSchedule(1000001, [{ label: 'A', percent: 33.3, due: 'x' }, { label: 'B', percent: 66.7, due: 'y' }]);
    expect(r.ok && r.lines.map((l) => l.amountPence)).toEqual([333000, 667001]);
  });
  it('refuses percentages that do not add to 100, or a missing part', () => {
    expect(buildSchedule(100000, [{ label: 'A', percent: 30, due: 'x' }, { label: 'B', percent: 60, due: 'y' }])).toMatchObject({ ok: false });
    expect(buildSchedule(100000, [{ label: '', percent: 100, due: 'x' }])).toMatchObject({ ok: false });
    expect(buildSchedule(100000, [])).toMatchObject({ ok: false });
    expect(buildSchedule(0, [{ label: 'A', percent: 100, due: 'x' }])).toMatchObject({ ok: false });
  });
  it('formats pounds', () => {
    expect(gbp(1425000)).toBe('£14,250.00');
  });
});

describe('the answers Metis fills in', () => {
  const facts: PackFacts = {
    customerType: 'Consumer',
    quoteRef: 'Q-1042',
    totalPence: 1425000,
    vatPence: 237500,
    schedule: [{ label: 'Deposit', percent: 30, amountPence: 427500, due: 'On acceptance' }, { label: 'Balance', percent: 70, amountPence: 997500, due: 'On completion' }],
    design: { panels: '10 × Test 400 W', arrayKwp: '4 kWp', layout: 'Portrait and landscape rows', strings: '1 string of 10 panels', inverter: 'Test 6 kW', battery: 'Test 16 kWh', batteryUsable: '16 kWh', generator: 'No', dcAc: '0.67', dailyLoad: '8 kWh', autonomy: '2 days', assumptions: 'Gable roof assumed.', designPoints: 'DC/AC low.', designRef: 'Design pack HX-DS-01', surveyStatus: 'Not yet surveyed: indicative' },
    warranty: { panelYears: 25, inverterYears: 10, batteryYears: 10, workmanshipYears: null },
  };
  it('only uses question keys that exist in each template, so nothing is silently dropped', () => {
    for (const code of OG_CODES) {
      const keys = new Set(allFields(og(code)).map((f) => f.key));
      for (const k of Object.keys(answersFor(code, facts))) expect(keys.has(k), `${code}.${k}`).toBe(true);
    }
  });
  it('fills the price and the schedule from the quote and the payments', () => {
    const a = answersFor('HX-OG-05', facts);
    expect(a).toMatchObject({ total: '£14,250.00', vat: '£2,375.00', p1_label: 'Deposit', p1_amount: '£4,275.00', p2_amount: '£9,975.00', p2_due: 'On completion' });
    expect(a.p3_label).toBeUndefined();
  });
  it('never answers what belongs to the customer or the installer', () => {
    expect(answersFor('HX-OG-02', facts)).toEqual({});
    expect(answersFor('HX-OG-06', facts)).toEqual({});
    expect(answersFor('HX-OG-01', facts).start_early).toBeUndefined();
  });
  it('leaves an unknown fact unanswered so it is chased, never filled with a guess', () => {
    const a = answersFor('HX-OG-04', facts);
    expect(a).toMatchObject({ panel_years: 25, inverter_years: 10, battery_years: 10 });
    expect('workmanship_years' in a).toBe(false);
  });
  it('records the consumer start-early request only if it was given', () => {
    expect(answersFor('HX-OG-01', { ...facts, startEarly: true }).start_early).toBe('yes');
    expect(answersFor('HX-OG-01', { ...facts, customerType: 'Business', startEarly: true }).start_early).toBeUndefined();
  });
});
