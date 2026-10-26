import { describe, expect, it } from 'vitest';
import { cleanPref, dateProblem } from '@/lib/install-dates';

const today = '2026-10-26'; // a Monday
const none = new Set<string>();

describe('install date requests', () => {
  it('needs two weeks notice, a weekday, no bank holiday, within six months', () => {
    expect(dateProblem('2026-11-02', today, none)).toMatch(/at least 14 days/);
    expect(dateProblem('2026-11-14', today, none)).toMatch(/Monday to Friday/); // Saturday
    expect(dateProblem('2026-11-25', today, new Set(['2026-11-25']))).toMatch(/bank holiday/);
    expect(dateProblem('2027-06-01', today, none)).toMatch(/six months/);
    expect(dateProblem('2026-11-18', today, none)).toBeNull();
    expect(dateProblem('nope', today, none)).toMatch(/isn’t a date/);
  });
  it('cleans a request: unique, sorted, max three, flexible and notes kept', () => {
    const r = cleanPref({ dates: ['2026-12-02', '2026-11-18', '2026-11-18', '2026-12-03', '2026-12-04'], flexible: true, notes: ' away  ' }, today, none);
    expect(r).toEqual({ ok: true, pref: { dates: ['2026-11-18', '2026-12-02', '2026-12-03'], flexible: true, notes: 'away' } });
  });
  it('refuses an empty or bad request', () => {
    expect(cleanPref({ dates: [] }, today, none)).toMatchObject({ ok: false });
    expect(cleanPref({ dates: ['2026-11-01'] }, today, none)).toMatchObject({ ok: false });
  });
});
