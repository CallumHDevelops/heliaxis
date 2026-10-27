import { describe, expect, it } from 'vitest';
import { appointmentEmail, appointmentIcs, surveyTitle } from '@/lib/booking/appointment-email';

// Tuesday 3 November 2026, 10:45 to 11:45 UK time (GMT).
const base = { name: 'Sam Williams', title: surveyTitle('solar'), startMs: Date.UTC(2026, 10, 3, 10, 45), endMs: Date.UTC(2026, 10, 3, 11, 45), address: '2 Marine Terrace, Sudbrook', postcode: 'NP26 5ST', who: 'Callum', uid: 'abc-123' };

describe('appointment email', () => {
  it('says when, where, who and what, and promises a calendar file', () => {
    const m = appointmentEmail(base);
    expect(m.subject).toBe('Your Heliaxis survey: Tuesday 3 November, 10:45');
    expect(m.html).toContain('HELIAXIS');
    expect(m.html).toContain('Hi Sam,');
    expect(m.html).toContain('Tuesday 3 November, 10:45 to 11:45');
    expect(m.html).toContain('2 Marine Terrace, Sudbrook, NP26 5ST');
    expect(m.html).toContain('Callum from Heliaxis');
    expect(m.html).toContain('calendar file');
    expect(m.text).toContain('When: Tuesday 3 November, 10:45 to 11:45');
  });
  it('is a valid calendar file in UTC with a reminder', () => {
    const ics = appointmentIcs(base, 'hello@heliaxis.co.uk');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20261103T104500Z');
    expect(ics).toContain('DTEND:20261103T114500Z');
    expect(ics).toContain('UID:abc-123@heliaxis.co.uk');
    expect(ics).toContain('LOCATION:2 Marine Terrace\\, Sudbrook\\, NP26 5ST');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const line of ics.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
  });
  it('escapes what staff typed', () => {
    const m = appointmentEmail({ ...base, name: '<b>Sam</b>', notes: '<i>Bring a ladder</i>' });
    expect(m.html).not.toContain('<b>Sam</b>');
    expect(m.html).toContain('&lt;i&gt;Bring a ladder&lt;/i&gt;');
  });
});
