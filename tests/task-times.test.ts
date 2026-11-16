import { describe, expect, it } from 'vitest';
import { cleanTaskInput, cleanTime, remindMinutes } from '@/lib/tasks';
import { minutesWords } from '@/lib/tasks-timed';
import { remindersOwed } from '@/lib/tasks-timed';

const task = (over: Record<string, unknown> = {}) => ({ due_date: '2026-11-17', due_time: '14:30:00', remind: 'both', remind30_sent_at: null, remind15_sent_at: null, ...over }) as Parameters<typeof remindersOwed>[0];
// 14:30 UK on 17 Nov is 14:30 UTC (winter).
const at = (hm: string) => new Date(`2026-11-17T${hm}:00Z`);

describe('task times', () => {
  it('cleans a time', () => {
    expect(cleanTime('14:30')).toBe('14:30');
    expect(cleanTime('14:30:00')).toBe('14:30');
    expect(cleanTime('25:00')).toBeNull();
    expect(cleanTime('')).toBeNull();
  });
  it('a time needs a day, and a reminder choice is checked', () => {
    expect(cleanTaskInput({ due_date: '2026-11-17', due_time: '09:00', remind: '15' })).toMatchObject({ due_time: '09:00', remind: '15' });
    expect(cleanTaskInput({ due_date: '', due_time: '09:00' }).due_time).toBeNull();
    expect(cleanTaskInput({ remind: 'whenever' }).remind).toBeUndefined();
  });
  it('which minutes each choice means', () => {
    expect(remindMinutes('both')).toEqual([30, 15]);
    expect(remindMinutes('30')).toEqual([30]);
    expect(remindMinutes('none')).toEqual([]);
    expect(remindMinutes(undefined)).toEqual([30, 15]);
  });
  it('reminds 30 and 15 minutes before, not earlier, not after', () => {
    expect(remindersOwed(task(), at('13:50'))).toBeNull();
    expect(remindersOwed(task(), at('14:00'))).toEqual({ offsets: [30], minutesLeft: 30 });
    expect(remindersOwed(task({ remind30_sent_at: 'x' }), at('14:10'))).toBeNull();
    expect(remindersOwed(task({ remind30_sent_at: 'x' }), at('14:15'))).toEqual({ offsets: [15], minutesLeft: 15 });
    expect(remindersOwed(task({ remind30_sent_at: 'x', remind15_sent_at: 'y' }), at('14:20'))).toBeNull();
    expect(remindersOwed(task(), at('14:30'))).toBeNull();
    expect(remindersOwed(task(), at('14:45'))).toBeNull();
  });
  it('a task made late gets one reminder, not two', () => {
    expect(remindersOwed(task(), at('14:20'))).toEqual({ offsets: [30, 15], minutesLeft: 10 });
  });
  it('honours the choice', () => {
    expect(remindersOwed(task({ remind: '15' }), at('14:00'))).toBeNull();
    expect(remindersOwed(task({ remind: '15' }), at('14:15'))?.offsets).toEqual([15]);
    expect(remindersOwed(task({ remind: 'none' }), at('14:15'))).toBeNull();
  });
  it('uses UK time in summer', () => {
    // 14:30 BST is 13:30 UTC.
    const summer = task({ due_date: '2026-07-17' });
    expect(remindersOwed(summer, new Date('2026-07-17T13:00:00Z'))?.minutesLeft).toBe(30);
  });
  it('says the time left in words', () => {
    expect(minutesWords(30)).toBe('30 min');
    expect(minutesWords(90)).toBe('1 hour 30 min');
  });
});
