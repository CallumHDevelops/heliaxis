import { describe, expect, it } from 'vitest';
import { findCallRequest, newPart, plainText } from '@/lib/email/call-request';

// Wednesday 18 November 2026, 10:33 in the UK (GMT).
const now = new Date('2026-11-18T10:33:00Z');
const at = (m: ReturnType<typeof findCallRequest>) => m && `${m.at.toISOString()} ${m.label}`;

describe('call requests in a message', () => {
  it('Brandon: "I\'m available at 12 if you are"', () => {
    const body = `<div>Hi Callum,<br>I'm available at 12 if you are.</div><div>Sent from Outlook for Android&lt;https://aka.ms/AAb9ysg&gt;</div><hr>From: Hello &lt;hello@heliaxis.co.uk&gt;<br>Sent: Wednesday, 18 November 2026 10:13:27<br>Subject: Solar PV Quotation<br>We can call at 3 pm tomorrow if you like`;
    const r = findCallRequest(body, now);
    expect(at(r)).toBe('2026-11-18T12:00:00.000Z today at 12:00');
    expect(r?.assumedDay).toBe(true);
  });
  it('reads days and am/pm', () => {
    expect(at(findCallRequest('Can you call me tomorrow at 9am please', now))).toBe('2026-11-19T09:00:00.000Z tomorrow at 09:00');
    expect(at(findCallRequest('Free to chat on Friday at 4pm', now))).toBe('2026-11-20T16:00:00.000Z Friday 20 Nov at 16:00');
    expect(at(findCallRequest('ring me at 2.30 this afternoon', now))).toBe('2026-11-18T14:30:00.000Z today at 14:30');
    expect(at(findCallRequest('Give me a ring around noon', now))).toBe('2026-11-18T12:00:00.000Z today at 12:00');
  });
  it('a time that has gone today means tomorrow, unless they named today', () => {
    expect(at(findCallRequest('Happy to talk at 9', now))).toBe('2026-11-19T09:00:00.000Z tomorrow at 09:00');
    expect(findCallRequest('Call me today at 9', now)).toBeNull();
  });
  it('uses UK summer time', () => {
    expect(at(findCallRequest('call me at 12', new Date('2026-07-15T08:00:00Z')))).toBe('2026-07-15T11:00:00.000Z today at 12:00');
  });
  it('is careful: numbers that are not times, and refusals', () => {
    expect(findCallRequest('We have 12 panels and a 5kWh battery, call me when you can', now)).toBeNull();
    expect(findCallRequest('My number is 07545545377, call me', now)).toBeNull();
    expect(findCallRequest("I can't do 12, sorry", now)).toBeNull();
    expect(findCallRequest('The quote was £12,500 at 3.5% over 10 years', now)).toBeNull();
    expect(findCallRequest('Thanks, I will think about it', now)).toBeNull();
  });
  it('ignores what is only in the quoted thread', () => {
    expect(findCallRequest('Thanks, all good.\n\nOn Tue, 17 Nov 2026 at 09:00 Callum wrote:\n> Shall we call at 12?', now)).toBeNull();
  });
});

describe('text helpers', () => {
  it('plainText drops tags and keeps lines', () => {
    expect(plainText('<p>Hi</p><p>a &amp; b<br>c</p>')).toBe('Hi\na & b\nc');
  });
  it('newPart cuts at the thread', () => {
    expect(newPart('Yes 12 is fine\nFrom: Hello <x>\nstuff')).toBe('Yes 12 is fine');
  });
});
