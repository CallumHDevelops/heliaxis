import { describe, expect, it } from 'vitest';
import { examplesBlock, factKeysUsed, isGeneral, namesFrom, pickExamples, similarity, suggestDiagnosis, tokens } from '@/lib/hestia/learning';

const Q = 'How does a solar battery work?';
const A = 'A battery stores spare solar power so you can use it in the evening. In general it charges when the panels make more than the home needs.';

describe('personal-data filter', () => {
  it('lets a plain general question and answer through', () => {
    expect(isGeneral(Q, A)).toEqual({ ok: true });
  });

  it.each([
    ['an email', 'You can write to jo.bloggs@example.com about it, and the team will help you with that.'],
    ['a phone number', 'Ring the team on 01792 123456 and they will explain how the process works for you.'],
    ['a postcode', 'Panels on a roof facing SA1 4AB usually generate well across the whole year.'],
    ['a price', 'That would normally cost £6,450 for a typical home with a battery included.'],
    ['a date', 'Your install is on 14 March so the scaffold goes up the day before that.'],
    ['a numeric date', 'The engineer is booked for 14/03/2027 and will arrive in the morning.'],
    ['a weekday', 'The team will be with you on Tuesday to start the work on the roof.'],
    ['a year', 'The scheme changed in 2024 so the rules are different for newer homes.'],
    ['a serial number', 'The inverter serial SN4482911X is on the label on the side of the unit.'],
    ['a reference', 'Quote ref HX-20418 covers everything that was agreed for the work.'],
    ['a long number', 'The MPAN is 1200012345678 and it is printed on your electricity bill.'],
  ])('rejects %s', (_what, answer) => {
    expect(isGeneral(Q, answer).ok).toBe(false);
  });

  it('rejects a question about their own project even if the answer looks bland', () => {
    expect(isGeneral('When is my installation date?', 'That is not on the portal yet, so please ask the team in Messages.').ok).toBe(false);
    expect(isGeneral('How much have I paid so far?', 'That is on the Payments tab of the portal, where you can see what has been taken.').ok).toBe(false);
  });

  it('rejects the customer’s own name or address words, but not other words', () => {
    const names = namesFrom(['Gwen', '12 Cwmdonkin Terrace']);
    expect(isGeneral(Q, 'Gwen, a battery stores spare solar power so you can use it later in the evening.', names).ok).toBe(false);
    expect(isGeneral(Q, 'Batteries near Cwmdonkin are no different, they store spare solar power for the evening.', names).ok).toBe(false);
    expect(isGeneral(Q, A, names).ok).toBe(true);
  });

  it('rejects answers that speak about their own system', () => {
    expect(isGeneral('What does the inverter do?', 'Your inverter turns the panels’ power into power the house can use.').ok).toBe(false);
  });

  it('rejects text too short to teach anything', () => {
    expect(isGeneral('Hi there', 'Hello!').ok).toBe(false);
  });
});

describe('retrieval', () => {
  const pool = [
    { id: 'a', q: 'How does a solar battery work?', a: 'It stores spare power.' },
    { id: 'b', q: 'What is the Smart Export Guarantee?', a: 'SEG pays you for exported power.' },
    { id: 'c', q: 'Can I charge an electric car from my solar panels?', a: 'Yes, with a suitable charger.' },
    { id: 'd', q: 'Do panels generate when it is cloudy?', a: 'Yes, at lower output.' },
  ];

  it('ignores stop words and plurals', () => {
    expect(tokens('How do the batteries work?')).toEqual(['battery']);
    expect(tokens('The a and of')).toEqual([]);
  });

  it('scores a close paraphrase high and an unrelated question at zero', () => {
    expect(similarity('How does a battery work', pool[0].q)).toBeGreaterThanOrEqual(0.5);
    expect(similarity('Where is my parcel', pool[0].q)).toBe(0);
    expect(similarity('', pool[0].q)).toBe(0);
  });

  it('returns only the best few above the floor, best first', () => {
    const got = pickExamples('Does a solar battery work in a power cut?', pool, 2);
    expect(got.map((e) => e.id)).toEqual(['a']);
    expect(pickExamples('what is the SEG export guarantee', pool).map((e) => e.id)).toEqual(['b']);
  });

  it('returns nothing when nothing is relevant, and respects the limit', () => {
    expect(pickExamples('Where can I park the van', pool)).toEqual([]);
    const many = Array.from({ length: 6 }, (_, i) => ({ id: String(i), q: 'cloudy day output generation', a: 'x' }));
    expect(pickExamples('cloudy day generation output', many, 3)).toHaveLength(3);
  });

  it('builds a small prompt block that says the rules still win, or nothing at all', () => {
    expect(examplesBlock([])).toBe('');
    const block = examplesBlock(pool.slice(0, 1));
    expect(block).toContain('never override the rules');
    expect(block).toContain('Customer: How does a solar battery work?');
    expect(block).toContain('only the PROJECT FACTS');
  });
});

describe('diagnosis', () => {
  const facts = JSON.stringify({ installAt: '2026-12-01', money: { paid: 1500 } });

  it('spots a figure that is not in the facts as invented', () => {
    expect(suggestDiagnosis('How much is left?', 'You still owe £4,200 on the system.', facts).diagnosis).toBe('invented');
  });

  it('does not call a figure invented when the facts hold it', () => {
    expect(suggestDiagnosis('How much have I paid?', 'You have paid so far £1500.', facts).diagnosis).not.toBe('invented');
  });

  it('flags a complaint that was not pointed at the team', () => {
    expect(suggestDiagnosis('I want to make a complaint', 'I am sorry to hear that. Tell me more.', facts).diagnosis).toBe('should_hand_off');
    expect(suggestDiagnosis('I want to make a complaint', 'Please use Log a complaint, or message the team.', facts).diagnosis).not.toBe('should_hand_off');
  });

  it('flags a missing fact and a stiff, long answer', () => {
    expect(suggestDiagnosis('Who is my engineer?', 'That is not on the portal yet.', facts).diagnosis).toBe('missing_fact');
    expect(suggestDiagnosis('Tell me about batteries', 'Kindly note the following. '.repeat(50), facts).diagnosis).toBe('tone');
  });
});

describe('factKeysUsed', () => {
  it('lists only the fact groups that hold something', () => {
    expect(factKeysUsed({ a: null, b: [], c: ['x'], d: { e: null }, f: { g: 1 }, h: '', i: false, j: 'yes' })).toEqual(['c', 'f', 'j']);
  });
});
