import { describe, expect, it } from 'vitest';
import { appointmentIntent } from '@/lib/crm/appointment-reply';

describe('appointmentIntent', () => {
  it.each([
    ['Yes that’s fine, see you then', 'confirm'],
    ['Perfect thanks', 'confirm'],
    ['ok', 'confirm'],
    ['Sorry I need to cancel tomorrow', 'cancel'],
    ['We no longer need the survey', 'cancel'],
    ['Can we move it to Monday?', 'move'],
    ['I can’t make Friday, something has come up', 'move'],
    ['Could we do another day please', 'move'],
    ['Can you reschedule?', 'move'],
  ])('%s', (text, want) => expect(appointmentIntent(text)).toBe(want));
  it('leaves other messages alone', () => {
    expect(appointmentIntent('What panels are you going to use?')).toBeNull();
    expect(appointmentIntent('')).toBeNull();
    expect(appointmentIntent('Yes please, and can you also quote for a battery? Our usage is about 12kWh a day')).toBeNull();
  });
});
