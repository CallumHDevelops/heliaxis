import { describe, expect, it } from 'vitest';
import { findCallAsk, findCallRequest, newPart, plainText, quickReplies, suggestedReply } from '@/lib/email/call-request';
import { freeStarts, listTimes } from '@/lib/email/slots';

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

describe('a call asked for with no time', () => {
  it('finds the ask and the part of the day', () => {
    expect(findCallAsk('Hi, can you give me a call this morning?', now)?.part).toBe('this morning');
    expect(findCallAsk('Please ring me tomorrow afternoon', now)?.part).toBe('tomorrow afternoon');
    expect(findCallAsk('Could you call me on Friday', now)?.part).toBe('on Friday');
    expect(findCallAsk('Can you call me back', now)?.part).toBeNull();
    // 10:33: "morning" means this morning; in the afternoon it means tomorrow
    expect(findCallAsk('Call me in the morning', now)?.part).toBe('this morning');
    expect(findCallAsk('Call me in the morning', new Date('2026-11-18T15:00:00Z'))?.part).toBe('tomorrow morning');
  });
  it('says nothing for refusals or ordinary messages', () => {
    expect(findCallAsk("Please don't call me, email is better", now)).toBeNull();
    expect(findCallAsk('Thanks for the quote, looks good', now)).toBeNull();
    expect(findCallAsk('Thanks.\n\nOn Tue Callum wrote:\n> shall I call you?', now)).toBeNull();
  });
});

describe('suggested replies', () => {
  it('confirms a time', () => {
    expect(suggestedReply({ kind: 'time', first: 'Brandon', label: 'today at 12:00', me: 'Callum', channel: 'whatsapp' })).toBe("Hi Brandon, thanks. I'd be happy to give you a call today at 12:00. Speak to you then. Callum");
    expect(suggestedReply({ kind: 'time', first: 'Brandon', label: 'today at 12:00', me: 'Callum', channel: 'email' })).toBe("Hi Brandon,\n\nThanks. I'd be happy to give you a call today at 12:00. Speak to you then.\n\nKind regards,\nCallum\nHeliaxis");
  });
  it('asks what time works', () => {
    expect(suggestedReply({ kind: 'ask', first: 'Sam', part: 'this morning', me: 'Callum', channel: 'whatsapp' })).toBe("Hi Sam, thanks. I'd love to give you a call this morning. What time works best for you? Callum");
    expect(suggestedReply({ kind: 'ask', first: 'Sam', part: null, me: 'Callum', channel: 'email' })).toContain("I'd love to give you a call. What time works best for you?");
  });
});

describe('free times and quick replies', () => {
  const day = '2026-11-18';
  const t = (hm: string) => new Date(`${day}T${hm}:00Z`).getTime();
  it('picks up to three free half hours, spaced apart, in the part of the day', () => {
    const busy = [{ start: t('09:30'), end: t('10:30') }];
    const slots = freeStarts(busy, day, ['09:00', '12:00'], t('08:00'));
    expect(slots.map((x) => new Date(x).toISOString().slice(11, 16))).toEqual(['09:00', '11:00']);
    expect(freeStarts([], day, ['09:00', '12:00'], t('09:45')).map((x) => new Date(x).toISOString().slice(11, 16))).toEqual(['10:00', '11:00']);
    expect(freeStarts([], day, ['09:00', '12:00'], t('11:50'))).toEqual([]);
  });
  it('words the times', () => {
    expect(listTimes(['10:00', '11:30', '12:00'])).toBe('10:00, 11:30 or 12:00');
  });
  it('offers times when none was given, and the nearest free ones when there is a clash', () => {
    const ask = quickReplies({ kind: 'ask', first: 'Sam', part: 'this morning', me: 'Callum', channel: 'whatsapp', times: ['10:00', '11:30'], clash: false });
    expect(ask[0].text).toBe("Hi Sam, thanks, I'd love to give you a call this morning. Does 10:00 or 11:30 suit you? If not, just tell me a time that does. Callum");
    expect(ask[1].label).toBe('Ask what time suits');
    const clash = quickReplies({ kind: 'time', first: 'Brandon', label: 'today at 12:00', me: 'Callum', channel: 'whatsapp', times: ['12:30', '14:00'], clash: true });
    expect(clash.map((q) => q.label)).toEqual(['Offer 12:30 · 14:00', 'Ask what suits', 'Confirm the time']);
    expect(quickReplies({ kind: 'time', first: 'B', label: 'today at 12:00', me: 'C', channel: 'whatsapp', times: [], clash: false })).toHaveLength(1);
  });
});
