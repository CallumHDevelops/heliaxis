import { describe, expect, it } from 'vitest';
import { installCalendar, INSTALL_CAPACITY, WINDOW_DAYS } from '@/lib/install-dates';

const TODAY = '2026-10-29'; // a Thursday: the earliest install day is 14 days on, Thursday 12 Nov

describe('install calendar', () => {
  it('shows three weeks, starting on a Monday, never before the earliest date', () => {
    const c = installCalendar(TODAY, null, new Set(), new Set(), new Map());
    expect(c.days).toHaveLength(WINDOW_DAYS);
    expect(c.from).toBe('2026-11-09');
    expect(new Date(`${c.from}T12:00:00Z`).getUTCDay()).toBe(1);
    // Monday 9 and Tuesday 10 are too soon; Thursday 12 is the first bookable day.
    expect(c.days.find((d) => d.day === '2026-11-10')?.state).toBe('closed');
    expect(c.days.find((d) => d.day === '2026-11-12')?.state).toBe('free');
    expect(c.prev).toBeNull();
    expect(c.next).toBe('2026-11-30');
  });
  it('greys weekends, bank holidays and closed dates, and marks busy days', () => {
    const load = new Map([['2026-11-16', INSTALL_CAPACITY - 1], ['2026-11-17', INSTALL_CAPACITY]]);
    const c = installCalendar(TODAY, null, new Set(['2026-11-18']), new Set(['2026-11-19']), load);
    const state = (d: string) => c.days.find((x) => x.day === d)?.state;
    expect(state('2026-11-14')).toBe('closed');
    expect(state('2026-11-18')).toBe('closed');
    expect(state('2026-11-19')).toBe('closed');
    expect(state('2026-11-16')).toBe('few');
    expect(state('2026-11-17')).toBe('full');
  });
  it('can move on to the next three weeks and back', () => {
    const c = installCalendar(TODAY, '2026-11-30', new Set(), new Set(), new Map());
    expect(c.from).toBe('2026-11-30');
    expect(c.prev).toBe('2026-11-12');
    expect(installCalendar(TODAY, c.prev, new Set(), new Set(), new Map()).from).toBe('2026-11-09');
    expect(c.days.every((d) => d.state !== 'closed' || d.weekend)).toBe(true);
  });
});
