import { describe, expect, it } from 'vitest';
import { callBackWhen, dueDay, taskTitle } from '@/lib/whatsapp/call-back-shared';

describe('call-back requests', () => {
  it('reads the welcome message buttons', () => {
    expect(callBackWhen('Call me tomorrow')).toBe('tomorrow');
    expect(callBackWhen('Call me today')).toBe('today');
  });
  it('reads a short typed version', () => {
    expect(callBackWhen('Please ring me tomorrow')).toBe('tomorrow');
    expect(callBackWhen('can you call me tmrw?')).toBe('tomorrow');
    expect(callBackWhen('Ring me today thanks')).toBe('today');
  });
  it('leaves everything else to a person', () => {
    expect(callBackWhen('Message me instead')).toBeNull();
    expect(callBackWhen('Not right now')).toBeNull();
    expect(callBackWhen("Don't call me tomorrow")).toBeNull();
    expect(callBackWhen('No need to call me today, I will message you')).toBeNull();
    expect(callBackWhen('I can talk tomorrow, could you call me after my kids are in bed and we can go through the quote in detail')).toBeNull();
    expect(callBackWhen('')).toBeNull();
    expect(callBackWhen(null)).toBeNull();
  });
  it('picks the day in the UK, either side of midnight', () => {
    expect(dueDay('today', new Date('2026-11-04T10:00:00Z'))).toBe('2026-11-04');
    expect(dueDay('tomorrow', new Date('2026-11-04T10:00:00Z'))).toBe('2026-11-05');
    // 23:30 UTC in summer is already the next day in the UK.
    expect(dueDay('today', new Date('2026-07-04T23:30:00Z'))).toBe('2026-07-05');
  });
  it('names the task for the person to ring', () => {
    expect(taskTitle('Nicholas Sole', 'tomorrow')).toBe('Ring Nicholas: they asked for a call tomorrow');
    expect(taskTitle(null, 'today')).toBe('Ring the customer: they asked for a call today');
  });
});
