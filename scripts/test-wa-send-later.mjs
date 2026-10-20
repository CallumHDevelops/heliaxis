// "Send later" and the late-night rule (src/lib/whatsapp/schedule.ts, settings-shared.ts): a message
// typed after 20:30, or in the small hours, goes at 07:00 (on both sides of the clocks changing,
// Sunday 29 March and Sunday 25 October 2026); the quick choices (07:00, 08:45, 09:30 the next
// morning, Monday instead of Sunday); the date/time box read as UK time; the free 24h window checked
// against when it goes; chasers counted from when it goes; and the outbox never holding a message a
// person scheduled.
// Usage: node --experimental-strip-types scripts/test-wa-send-later.mjs
import { readFileSync } from 'node:fs';
import {
  atWords,
  chaseView,
  chaseWhen,
  freeAt,
  fromUkInput,
  holdUntil,
  lastFreeAt,
  laterChoices,
  lateSendAt,
  shortAt,
  ukInput,
  windowClosesAt,
  windowShutWords,
} from '../src/lib/whatsapp/schedule.ts';
import { cleanSettings, DEFAULT_SETTINGS, hhmm } from '../src/lib/whatsapp/settings-shared.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
/** "Wed 21 Oct 07:00", UK time. */
const uk = (d) => (d ? fmt.format(d).replace(',', '').replace(' at ', ' ') : null);
const at = (iso) => new Date(iso);
const S = DEFAULT_SETTINGS;
const late = (iso, s = S) => uk(lateSendAt(at(iso), s));

// The setting: on by default, 20:30 → 07:00, kept as saved.
const rule = (s) => [s.lateRule, hhmm(s.lateFromMin), hhmm(s.lateSendAtMin)];
eq('on by default: after 20:30 → 07:00', rule(cleanSettings({})), [true, '20:30', '07:00']);
eq('on for settings saved before it existed', rule(cleanSettings({ quietFrom: 21, quietTo: 8, chaseAfterHours: 12 })), [true, '20:30', '07:00']);
eq('kept off once turned off', rule(cleanSettings({ lateRule: false, lateFromMin: 1320, lateSendAtMin: 450 })), [false, '22:00', '07:30']);
eq('rubbish times → the defaults', rule(cleanSettings({ lateFromMin: 'late', lateSendAtMin: null })), [true, '20:30', '07:00']);
eq('cleaning twice changes nothing', cleanSettings(cleanSettings({ lateFromMin: 1290 })), cleanSettings({ lateFromMin: 1290 }));
eq('the chat gets the rule with the chase times', (({ lateRule, lateFromMin, lateSendAtMin }) => [lateRule, lateFromMin, lateSendAtMin])(chaseView(S)), [true, 1230, 420]);

// The late-night rule, to the minute.
eq('20:29 goes straight away', late('2026-10-20T20:29:00+01:00'), null);
eq('20:29:59 goes straight away', late('2026-10-20T20:29:59+01:00'), null);
eq('20:30 waits for 07:00 tomorrow', late('2026-10-20T20:30:00+01:00'), 'Wed 21 Oct 07:00');
eq('23:49 (the owner, tonight) → 07:00 the next day', late('2026-10-20T23:49:00+01:00'), 'Wed 21 Oct 07:00');
eq('23:49 → exactly 07:00:00', lateSendAt(at('2026-10-20T23:49:00+01:00'), S).toISOString(), '2026-10-21T06:00:00.000Z');
eq('midnight → 07:00 that morning', late('2026-10-21T00:00:00+01:00'), 'Wed 21 Oct 07:00');
eq('02:00 → 07:00 the same day', late('2026-10-21T02:00:00+01:00'), 'Wed 21 Oct 07:00');
eq('06:59 → 07:00, a minute later', late('2026-10-21T06:59:00+01:00'), 'Wed 21 Oct 07:00');
eq('07:00 goes straight away', late('2026-10-21T07:00:00+01:00'), null);
eq('midday goes straight away', late('2026-10-21T12:00:00+01:00'), null);
eq('Saturday night 23:49 → 07:00 on Sunday (the next morning, as asked)', late('2026-10-17T23:49:00+01:00'), 'Sun 18 Oct 07:00');
eq('rule off: goes straight away', late('2026-10-20T23:49:00+01:00', { ...S, lateRule: false }), null);
eq('same two times: never', late('2026-10-20T23:49:00+01:00', { ...S, lateFromMin: 420, lateSendAtMin: 420 }), null);
eq('after 22:00 → 07:30: 21:59 goes', late('2026-10-20T21:59:00+01:00', { ...S, lateFromMin: 1320, lateSendAtMin: 450 }), null);
eq('after 22:00 → 07:30: 22:00 waits for 07:30', late('2026-10-20T22:00:00+01:00', { ...S, lateFromMin: 1320, lateSendAtMin: 450 }), 'Wed 21 Oct 07:30');
// Clocks go back at 02:00 BST on Sunday 25 October: the next 07:00 is GMT.
eq('clocks go back: Sat 23:49 BST → Sun 07:00 GMT', lateSendAt(at('2026-10-24T23:49:00+01:00'), S).toISOString(), '2026-10-25T07:00:00.000Z');
eq('…from the first 01:30 (BST)', lateSendAt(at('2026-10-25T00:30:00Z'), S).toISOString(), '2026-10-25T07:00:00.000Z');
eq('…from the second 01:30 (GMT)', lateSendAt(at('2026-10-25T01:30:00Z'), S).toISOString(), '2026-10-25T07:00:00.000Z');
// Clocks go forward at 01:00 GMT on Sunday 29 March: the next 07:00 is BST.
eq('clocks go forward: Sat 23:49 GMT → Sun 07:00 BST', lateSendAt(at('2026-03-28T23:49:00Z'), S).toISOString(), '2026-03-29T06:00:00.000Z');
eq('…from 03:00 BST, after the jump', lateSendAt(at('2026-03-29T02:00:00Z'), S).toISOString(), '2026-03-29T06:00:00.000Z');
eq('20:30 in winter (GMT)', late('2026-11-03T20:30:00Z'), 'Wed 4 Nov 07:00');
eq('20:29 in winter (GMT)', late('2026-11-03T20:29:00Z'), null);

// The quick choices.
const choices = (iso) => laterChoices(at(iso)).map((c) => [c.label, uk(c.at)]);
eq('Tuesday 23:49: tomorrow 07:00, 08:45, 09:30', choices('2026-10-20T23:49:00+01:00'), [
  ['Tomorrow 07:00', 'Wed 21 Oct 07:00'],
  ['Tomorrow 08:45', 'Wed 21 Oct 08:45'],
  ['Tomorrow 09:30', 'Wed 21 Oct 09:30'],
]);
eq('Tuesday 14:00: tomorrow too', choices('2026-10-20T14:00:00+01:00')[0], ['Tomorrow 07:00', 'Wed 21 Oct 07:00']);
eq('Wednesday 02:00: this morning', choices('2026-10-21T02:00:00+01:00'), [
  ['This morning 07:00', 'Wed 21 Oct 07:00'],
  ['This morning 08:45', 'Wed 21 Oct 08:45'],
  ['This morning 09:30', 'Wed 21 Oct 09:30'],
]);
eq('Wednesday 07:00: tomorrow (07:00 has come)', choices('2026-10-21T07:00:00+01:00')[0], ['Tomorrow 07:00', 'Thu 22 Oct 07:00']);
eq('Saturday 23:49: Monday, not Sunday', choices('2026-10-17T23:49:00+01:00'), [
  ['Monday 07:00', 'Mon 19 Oct 07:00'],
  ['Monday 08:45', 'Mon 19 Oct 08:45'],
  ['Monday 09:30', 'Mon 19 Oct 09:30'],
]);
eq('Saturday 10:00: Monday', choices('2026-10-17T10:00:00+01:00')[0], ['Monday 07:00', 'Mon 19 Oct 07:00']);
eq('Saturday 03:00: this morning (Saturday)', choices('2026-10-17T03:00:00+01:00')[0], ['This morning 07:00', 'Sat 17 Oct 07:00']);
eq('Sunday 02:00: tomorrow, which is Monday', choices('2026-10-18T02:00:00+01:00')[0], ['Tomorrow 07:00', 'Mon 19 Oct 07:00']);
eq('Sunday 20:00: tomorrow', choices('2026-10-18T20:00:00+01:00')[0], ['Tomorrow 07:00', 'Mon 19 Oct 07:00']);
eq('Friday 23:49: Saturday', choices('2026-10-16T23:49:00+01:00')[0], ['Tomorrow 07:00', 'Sat 17 Oct 07:00']);
eq(
  'clocks go back: Sat 24 Oct → Monday, in GMT',
  laterChoices(at('2026-10-24T23:49:00+01:00')).map((c) => c.at.toISOString()),
  ['2026-10-26T07:00:00.000Z', '2026-10-26T08:45:00.000Z', '2026-10-26T09:30:00.000Z']
);
eq(
  'clocks go back: Sun 25 Oct 01:30 (the second one) → Monday in GMT',
  laterChoices(at('2026-10-25T01:30:00Z')).map((c) => [c.label, c.at.toISOString()])[0],
  ['Tomorrow 07:00', '2026-10-26T07:00:00.000Z']
);
eq(
  'clocks go forward: Fri 27 Mar → Saturday in GMT',
  laterChoices(at('2026-03-27T23:49:00Z')).map((c) => c.at.toISOString())[0],
  '2026-03-28T07:00:00.000Z'
);
eq(
  'clocks go forward: Sat 28 Mar → Monday in BST',
  laterChoices(at('2026-03-28T23:49:00Z')).map((c) => c.at.toISOString()),
  ['2026-03-30T06:00:00.000Z', '2026-03-30T07:45:00.000Z', '2026-03-30T08:30:00.000Z']
);
eq('Saturday 31 Oct: Monday 2 Nov, over the month end', choices('2026-10-31T23:30:00Z')[0], ['Monday 07:00', 'Mon 2 Nov 07:00']);

// The date and time box: read as UK time, whatever the computer's own clock says.
eq('box → BST', fromUkInput('2026-10-21T07:00').toISOString(), '2026-10-21T06:00:00.000Z');
eq('box → GMT', fromUkInput('2026-11-04T07:00').toISOString(), '2026-11-04T07:00:00.000Z');
eq('box on the day the clocks go back', fromUkInput('2026-10-25T07:00').toISOString(), '2026-10-25T07:00:00.000Z');
eq('box on the day the clocks go forward', fromUkInput('2026-03-29T07:00').toISOString(), '2026-03-29T06:00:00.000Z');
eq('a time the clocks skip (01:30, 29 Mar) is just after the jump', uk(fromUkInput('2026-03-29T01:30')), 'Sun 29 Mar 02:30');
eq('seconds are fine', fromUkInput('2026-10-21T07:00:00').toISOString(), '2026-10-21T06:00:00.000Z');
eq('not a date', [fromUkInput(''), fromUkInput('tomorrow'), fromUkInput('2026-02-30T07:00'), fromUkInput('2026-10-21T24:00'), fromUkInput('2026-13-01T07:00')], [null, null, null, null, null]);
eq('time → box (BST)', ukInput(at('2026-10-21T06:00:00Z')), '2026-10-21T07:00');
eq('time → box (GMT)', ukInput(at('2026-11-04T07:00:00Z')), '2026-11-04T07:00');
eq('round trip', ukInput(fromUkInput('2026-10-25T00:45')), '2026-10-25T00:45');

// In words, for the chat ("Scheduled for 07:00 tomorrow") and the chat lists ("Scheduled 07:00").
const now = at('2026-10-20T23:49:00+01:00');
eq('07:00 tomorrow', atWords(at('2026-10-21T07:00:00+01:00'), now), '07:00 tomorrow');
eq('the small hours, seen from the evening: tonight', atWords(at('2026-10-21T01:00:00+01:00'), now), '01:00 tonight');
eq('the small hours, seen from the morning: tomorrow', atWords(at('2026-10-21T01:00:00+01:00'), at('2026-10-20T09:00:00+01:00')), '01:00 tomorrow');
eq('later today', atWords(at('2026-10-21T07:00:00+01:00'), at('2026-10-21T02:00:00+01:00')), '07:00 today');
eq('this week: the day', atWords(at('2026-10-23T09:30:00+01:00'), now), '09:30 on Friday');
eq('further off: the date', atWords(at('2026-10-29T09:30:00Z'), now), '09:30 on Thu 29 Oct');
eq('over the clock change', atWords(at('2026-10-25T07:00:00Z'), at('2026-10-24T23:49:00+01:00')), '07:00 tomorrow');
eq('list: within a day, just the time', shortAt(at('2026-10-21T07:00:00+01:00'), now), '07:00');
eq('list: a day or more, the weekday', shortAt(at('2026-10-22T07:00:00+01:00'), now), 'Thu 07:00');
eq('list: next week, the date', shortAt(at('2026-10-29T07:00:00Z'), now), '29 Oct 07:00');

// The free 24h window, checked against when it goes.
const inbound = '2026-10-20T01:00:00+01:00'; // David last wrote at 01:00: free until 01:00 tonight
eq('window closes 24h after their last message', new Date(windowClosesAt(inbound)).toISOString(), '2026-10-21T00:00:00.000Z');
eq('never messaged: no window', windowClosesAt(null), null);
eq('07:00 is past it: not free', freeAt(at('2026-10-21T07:00:00+01:00'), inbound), false);
eq('00:30 is inside it: free', freeAt(at('2026-10-21T00:30:00+01:00'), inbound), true);
eq('00:58 is inside, with the outbox’s minute to spare', freeAt(at('2026-10-21T00:58:00+01:00'), inbound), true);
eq('00:59 could miss it: not free', freeAt(at('2026-10-21T00:59:00+01:00'), inbound), false);
eq('never messaged: never free', freeAt(at('2026-10-21T07:00:00+01:00'), null), false);
eq('they wrote at 20:01 tonight: 07:00 is free', freeAt(at('2026-10-21T07:00:00+01:00'), '2026-10-20T20:01:00+01:00'), true);
eq('the last time worth offering: 00:55', uk(lastFreeAt(inbound, now)), 'Wed 21 Oct 00:55');
eq('…on a 5-minute mark (window closes 00:58)', uk(lastFreeAt('2026-10-20T00:58:00+01:00', now)), 'Wed 21 Oct 00:50');
eq('…none when it has nearly gone', lastFreeAt('2026-10-19T23:55:00+01:00', now), null);
eq('…none for someone who never wrote', lastFreeAt(null, now), null);
const seven = at('2026-10-21T07:00:00+01:00');
eq(
  'said plainly',
  windowShutWords('David Clement', inbound, seven, now),
  'David’s free 24-hour window closes at 01:00 tonight, before 07:00 tomorrow. After that WhatsApp only takes an approved template, until David messages again.'
);
eq(
  'without a name',
  windowShutWords('', inbound, seven, now),
  'Their free 24-hour window closes at 01:00 tonight, before 07:00 tomorrow. After that WhatsApp only takes an approved template, until they message again.'
);
eq('already closed', windowShutWords('David', '2026-10-19T09:00:00+01:00', seven, now), 'David’s free 24-hour window has closed, so WhatsApp only takes an approved template until David messages again.');
eq('never messaged', windowShutWords('David', null, seven, now), 'David hasn’t messaged this number yet, so WhatsApp only takes an approved template.');

// The database allows the new kind, and running whatsapp-chasers.sql again keeps it.
const kinds = (file) => /whatsapp_outbox_kind_check check \(kind in \(([^)]*)\)\)/.exec(readFileSync(new URL(`../supabase/${file}`, import.meta.url), 'utf8'))?.[1];
eq('whatsapp-scheduled.sql adds “scheduled”', kinds('whatsapp-scheduled.sql'), "'reply','intro','chase','scheduled'");
eq('whatsapp-chasers.sql keeps it', kinds('whatsapp-chasers.sql'), "'reply','intro','chase','scheduled'");

// A chaser picked with a message that goes later counts from when it goes.
const V = chaseView(S);
eq(
  'typed 23:49, goes 07:00, chase 12h: tomorrow about 19:00, not 11:49',
  chaseWhen({ now, hours: 12, lastInboundAt: '2026-10-20T20:01:00+01:00', view: V, sendAt: at('2026-10-21T07:00:00+01:00') }),
  'tomorrow about 19:00'
);
eq(
  '…the same sent now: 12h after 23:49',
  chaseWhen({ now, hours: 12, lastInboundAt: '2026-10-20T20:01:00+01:00', view: V }),
  'tomorrow about 11:49'
);
eq(
  'goes 07:00, chase 4h: 11:00',
  chaseWhen({ now, hours: 4, lastInboundAt: '2026-10-20T20:01:00+01:00', view: V, sendAt: at('2026-10-21T07:00:00+01:00') }),
  'tomorrow about 11:00'
);
eq(
  'a send time already gone counts from now',
  chaseWhen({ now, hours: 12, lastInboundAt: '2026-10-20T20:01:00+01:00', view: V, sendAt: at('2026-10-20T20:00:00+01:00') }),
  'tomorrow about 11:49'
);

// The outbox never holds a message a person scheduled: their time, quiet hours or not.
const hold = (kind, iso, lastOut = null) => {
  const w = holdUntil({ kind, now: at(iso), settings: S, lastOutAt: lastOut ? at(lastOut) : null, rand: () => 0 });
  return w ? uk(w) : 'send';
};
eq('scheduled for 07:00 (quiet hours until 08:45): goes at 07:00', hold('scheduled', '2026-10-21T07:00:00+01:00', '2026-10-20T20:34:00+01:00'), 'send');
eq('scheduled for 02:00: goes', hold('scheduled', '2026-10-21T02:00:00+01:00'), 'send');
eq('scheduled for 23:00, after an evening message: goes', hold('scheduled', '2026-10-20T23:00:00+01:00', '2026-10-20T20:00:00+01:00'), 'send');
eq('…while a chaser at 07:00 still waits for 10:00', hold('chase', '2026-10-21T07:00:00+01:00', '2026-10-20T20:34:00+01:00'), 'Wed 21 Oct 10:00');
eq('…and a smart reply at 07:00 for 08:45', hold('reply', '2026-10-21T07:00:00+01:00'), 'Wed 21 Oct 08:45');

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
