// When automatic WhatsApps go (src/lib/whatsapp/schedule.ts) and the chaser settings
// (settings-shared.ts): quiet hours to the minute (nothing before 08:45), on both sides of the clocks
// changing (Sunday 29 March and Sunday 25 October 2026), the evening rule (a message after 18:00
// isn't chased before 10:00 the next morning), keeping chasers free, the final nudge, the outbox's
// check just before it sends, chasers kept clear of the minute before quiet hours (the outbox runs
// once a minute), jitter never changing free or paid, what the "Chase if no reply" choices say, and
// settings saved before quiet hours had minutes.
// Usage: node --experimental-strip-types scripts/test-wa-schedule.mjs
import {
  chaseView,
  chaseWhen,
  eveningFloor,
  holdUntil,
  isQuiet,
  lastAwake,
  londonHour,
  londonMinute,
  nextAwake,
  nextClock,
  planChase,
  whenWords,
} from '../src/lib/whatsapp/schedule.ts';
import { cleanSettings, DEFAULT_SETTINGS, fromHhmm, hhmm } from '../src/lib/whatsapp/settings-shared.ts';

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
/** "Wed 21 Oct 10:00", UK time. */
const uk = (d) => fmt.format(d).replace(',', '').replace(' at ', ' ');
const at = (iso) => new Date(iso);
const none = () => 0; // no jitter
const most = () => 1; // the most jitter (20 min)
const S = DEFAULT_SETTINGS;

// The clock, to the minute.
eq('08:45 BST is minute 525', londonMinute(at('2026-10-20T08:45:00+01:00')), 525);
eq('08:45 GMT is minute 525', londonMinute(at('2026-10-26T08:45:00Z')), 525);
eq('midnight is 0', londonMinute(at('2026-10-20T00:00:00+01:00')), 0);
eq('23:59 is 1439', londonMinute(at('2026-10-20T23:59:30+01:00')), 1439);
eq('hour still works', londonHour(at('2026-10-20T20:34:00+01:00')), 20);

// Quiet hours: 21:00 → 08:45 by default.
eq('defaults are 21:00 → 08:45', [hhmm(S.quietFromMin), hhmm(S.quietToMin)], ['21:00', '08:45']);
eq('08:35 is quiet', isQuiet(at('2026-10-21T08:35:00+01:00'), S), true);
eq('08:44 is quiet', isQuiet(at('2026-10-21T08:44:59+01:00'), S), true);
eq('08:45 is not', isQuiet(at('2026-10-21T08:45:00+01:00'), S), false);
eq('20:59 is not', isQuiet(at('2026-10-20T20:59:00+01:00'), S), false);
eq('21:00 is quiet', isQuiet(at('2026-10-20T21:00:00+01:00'), S), true);
eq('midnight is quiet', isQuiet(at('2026-10-21T00:00:00+01:00'), S), true);
eq('equal times = never quiet', isQuiet(at('2026-10-21T03:00:00+01:00'), { quietFromMin: 0, quietToMin: 0 }), false);
const day = { quietFromMin: 13 * 60, quietToMin: 14 * 60 + 30 }; // not over midnight
eq('13:00–14:30: 13:59 quiet', isQuiet(at('2026-10-21T13:59:00+01:00'), day), true);
eq('13:00–14:30: 14:30 not', isQuiet(at('2026-10-21T14:30:00+01:00'), day), false);
eq('13:00–14:30: 03:00 not', isQuiet(at('2026-10-21T03:00:00+01:00'), day), false);
eq('in GMT too: 08:40 quiet', isQuiet(at('2026-11-02T08:40:00Z'), S), true);
eq('in GMT too: 08:50 not', isQuiet(at('2026-11-02T08:50:00Z'), S), false);

// The next time the clock shows a given time, across midnight and the clock changes.
eq('next 10:00 from 20:34', uk(nextClock(at('2026-10-20T20:34:00+01:00'), 600)), 'Wed 21 Oct 10:00');
eq('next 10:00 from 09:00 is today', uk(nextClock(at('2026-10-21T09:00:00+01:00'), 600)), 'Wed 21 Oct 10:00');
eq('at 10:00 already', nextClock(at('2026-10-21T10:00:30+01:00'), 600).toISOString(), '2026-10-21T09:00:30.000Z');
eq('clocks go back (Sun 25 Oct): 10:00 GMT', nextClock(at('2026-10-24T20:34:00+01:00'), 600).toISOString(), '2026-10-25T10:00:00.000Z');
eq('clocks go forward (Sun 29 Mar): 10:00 BST', nextClock(at('2026-03-28T20:34:00Z'), 600).toISOString(), '2026-03-29T09:00:00.000Z');
eq('clocks go back: 08:45 GMT', nextClock(at('2026-10-24T22:00:00+01:00'), 525).toISOString(), '2026-10-25T08:45:00.000Z');
eq('clocks go forward: 08:45 BST', nextClock(at('2026-03-28T22:00:00Z'), 525).toISOString(), '2026-03-29T07:45:00.000Z');
eq('from the repeated hour (01:30 BST, 25 Oct)', nextClock(at('2026-10-25T00:30:00Z'), 525).toISOString(), '2026-10-25T08:45:00.000Z');
eq('a time the clocks skip (01:30, 29 Mar) is just after the jump', uk(nextClock(at('2026-03-28T22:00:00Z'), 90)), 'Sun 29 Mar 02:30');

// Out of quiet hours: a 07:00 target moves to 08:45 (+ 0–20 min), never 08:00 or 08:35.
eq('07:00 → 08:45', uk(nextAwake(at('2026-10-21T07:00:00+01:00'), S, { rand: none })), 'Wed 21 Oct 08:45');
eq('07:00 → at most 09:05', uk(nextAwake(at('2026-10-21T07:00:00+01:00'), S, { rand: most })), 'Wed 21 Oct 09:05');
eq('08:35 → 08:45', uk(nextAwake(at('2026-10-21T08:35:00+01:00'), S, { rand: none })), 'Wed 21 Oct 08:45');
eq('23:10 → 08:45 the next day', uk(nextAwake(at('2026-10-20T23:10:00+01:00'), S, { rand: none })), 'Wed 21 Oct 08:45');
eq('outside quiet hours: unchanged', nextAwake(at('2026-10-21T12:34:00+01:00'), S, { rand: most }).toISOString(), '2026-10-21T11:34:00.000Z');
eq('clocks go back overnight: 08:45 GMT', nextAwake(at('2026-10-24T23:30:00+01:00'), S, { rand: none }).toISOString(), '2026-10-25T08:45:00.000Z');
eq('clocks go forward overnight: 08:45 BST', nextAwake(at('2026-03-28T23:30:00Z'), S, { rand: none }).toISOString(), '2026-03-29T07:45:00.000Z');
eq('the last time before quiet hours', uk(lastAwake(at('2026-10-20T22:30:00+01:00'), S)), 'Tue 20 Oct 20:55');
eq('awake already: unchanged', uk(lastAwake(at('2026-10-20T19:00:00+01:00'), S)), 'Tue 20 Oct 19:00');

// Chasers: 12h after our message, out of quiet hours, free while the 24h window is open.
{
  const p = planChase({ sentAt: at('2026-10-20T17:00:00+01:00'), hours: 12, lastInboundAt: '2026-10-20T16:00:00+01:00', settings: S, keepFree: true, rand: none });
  eq('17:00 + 12h = 05:00 → 08:45, free', [uk(p.at), p.free], ['Wed 21 Oct 08:45', true]);
}
{
  const p = planChase({ sentAt: at('2026-10-20T14:00:00+01:00'), hours: 12, lastInboundAt: '2026-10-20T09:00:00+01:00', settings: S, keepFree: true, rand: none });
  eq('window closes 09:00: kept free the evening before', [uk(p.at), p.free], ['Tue 20 Oct 20:55', true]);
}
{
  const p = planChase({ sentAt: at('2026-10-20T14:00:00+01:00'), hours: 12, lastInboundAt: '2026-10-20T09:00:00+01:00', settings: S, keepFree: false, rand: none });
  eq('keep-free off: paid in the morning', [uk(p.at), p.free], ['Wed 21 Oct 08:45', false]);
}
{
  const p = planChase({ sentAt: at('2026-10-20T14:00:00+01:00'), hours: 4, lastInboundAt: null, settings: S, keepFree: true, rand: none });
  eq('never messaged us: paid, on time', [uk(p.at), p.free], ['Tue 20 Oct 18:00', false]);
}

// The outbox runs once a minute: a chaser planned for 20:59 would be picked up at 21:00, held for the
// morning and miss the free window. Plans keep 2 minutes clear of quiet hours.
eq('just before quiet hours, kept clear', uk(lastAwake(at('2026-10-20T22:34:30+01:00'), S, 2 * 60_000)), 'Tue 20 Oct 20:54');
{
  const sentAt = at('2026-10-20T09:00:00+01:00');
  const p = planChase({ sentAt, hours: 12, lastInboundAt: '2026-10-19T23:34:30+01:00', settings: S, keepFree: true, rand: none });
  eq('kept-free chaser clear of 21:00', [uk(p.at), p.free], ['Tue 20 Oct 20:54', true]);
  const run = new Date(Math.ceil(p.at.getTime() / 60_000) * 60_000);
  eq('the next run sends it', holdUntil({ kind: 'chase', now: run, settings: S, lastOutAt: sentAt }), null);
  eq('…a minute late too', holdUntil({ kind: 'chase', now: new Date(run.getTime() + 60_000), settings: S, lastOutAt: sentAt }), null);
}
{
  const p = planChase({ sentAt: at('2026-10-20T08:59:30+01:00'), hours: 12, lastInboundAt: null, settings: S, keepFree: true, rand: none });
  eq('due 20:59:30: planned for the morning up front', [uk(p.at), p.free], ['Wed 21 Oct 08:45', false]);
  const q = planChase({ sentAt: at('2026-10-20T08:57:30+01:00'), hours: 12, lastInboundAt: null, settings: S, keepFree: true, rand: none });
  eq('due 20:57:30: goes that evening', uk(q.at), 'Tue 20 Oct 20:57');
}
eq('the send-time check itself has no gap: 20:58 goes', holdUntil({ kind: 'chase', now: at('2026-10-20T20:58:00+01:00'), settings: S, lastOutAt: at('2026-10-20T08:58:00+01:00') }), null);

// Free or paid is decided without the jitter, so the chat's label and the real plan agree: window
// closes Wed 09:15, question at 14:00, 12h → the morning, whatever the jitter (never 20:55 the night before).
{
  const ask = { sentAt: at('2026-10-20T14:00:00+01:00'), hours: 12, lastInboundAt: '2026-10-20T09:15:00+01:00', settings: S, keepFree: true };
  const plans = [0, 0.25, 0.5, 0.75, 1].map((r) => {
    const p = planChase({ ...ask, rand: () => r });
    return [uk(p.at), p.free];
  });
  eq('jitter keeps it in the morning, free', plans, [
    ['Wed 21 Oct 08:45', true],
    ['Wed 21 Oct 08:50', true],
    ['Wed 21 Oct 08:45', true],
    ['Wed 21 Oct 08:45', true],
    ['Wed 21 Oct 08:45', true],
  ]);
}

// The owner's case: Nikki wrote at 20:01 ("in bed ill"), Callum replied at 20:34 asking about a call
// tomorrow. The chaser went at 08:35. Now: not before 10:00 the next day, still free.
{
  const nikki = { sentAt: at('2026-10-20T20:34:00+01:00'), hours: 12, lastInboundAt: '2026-10-20T20:01:00+01:00', settings: S, keepFree: true };
  const early = planChase({ ...nikki, rand: none });
  const late = planChase({ ...nikki, rand: most });
  eq('Nikki: 20:34 → chase at 10:00 the next day, free', [uk(early.at), early.free], ['Wed 21 Oct 10:00', true]);
  eq('Nikki: with the most jitter, 10:20', [uk(late.at), late.free], ['Wed 21 Oct 10:20', true]);
  const off = planChase({ ...nikki, settings: { ...S, eveningRule: false }, rand: none });
  eq('Nikki, evening rule off: 08:45 (never 08:35)', uk(off.at), 'Wed 21 Oct 08:45');
  const old = planChase({ ...nikki, settings: { ...S, quietToMin: 480, eveningRule: false }, rand: none });
  eq('what used to happen (quiet until 08:00, no evening rule): 08:34', uk(old.at), 'Wed 21 Oct 08:34');
}

// When the evening rule applies, and the floor it sets.
const floor = (iso, s = S) => {
  const f = eveningFloor(at(iso), s);
  return f ? uk(f) : null;
};
eq('17:59: no floor', floor('2026-10-20T17:59:00+01:00'), null);
eq('18:00: 10:00 tomorrow', floor('2026-10-20T18:00:00+01:00'), 'Wed 21 Oct 10:00');
eq('23:30: 10:00 tomorrow', floor('2026-10-20T23:30:00+01:00'), 'Wed 21 Oct 10:00');
eq('02:00 (small hours): 10:00 that morning', floor('2026-10-21T02:00:00+01:00'), 'Wed 21 Oct 10:00');
eq('08:44 (still quiet): 10:00 that morning', floor('2026-10-21T08:44:00+01:00'), 'Wed 21 Oct 10:00');
eq('08:45: no floor', floor('2026-10-21T08:45:00+01:00'), null);
eq('midday: no floor', floor('2026-10-21T12:00:00+01:00'), null);
eq('rule off: no floor', floor('2026-10-20T20:34:00+01:00', { ...S, eveningRule: false }), null);
eq('after 19:30 → not before 11:15', floor('2026-10-20T19:45:00+01:00', { ...S, eveningFromMin: 1170, eveningNotBeforeMin: 675 }), 'Wed 21 Oct 11:15');
eq('after 19:30: 19:00 has no floor', floor('2026-10-20T19:00:00+01:00', { ...S, eveningFromMin: 1170 }), null);
eq('clocks go back: 10:00 GMT on Sun 25 Oct', eveningFloor(at('2026-10-24T20:34:00+01:00'), S).toISOString(), '2026-10-25T10:00:00.000Z');
eq('clocks go forward: 10:00 BST on Sun 29 Mar', eveningFloor(at('2026-03-28T20:34:00Z'), S).toISOString(), '2026-03-29T09:00:00.000Z');

const plan = (iso, hours, inbound, extra = {}) => {
  const p = planChase({ sentAt: at(iso), hours, lastInboundAt: inbound, settings: S, keepFree: true, rand: none, ...extra });
  return [uk(p.at), p.free];
};
eq('18:30 + 1h: not 19:30, 10:00 tomorrow', plan('2026-10-20T18:30:00+01:00', 1, '2026-10-20T18:00:00+01:00'), ['Wed 21 Oct 10:00', true]);
eq('17:00 + 1h: 18:00 as before', plan('2026-10-20T17:00:00+01:00', 1, '2026-10-20T16:50:00+01:00'), ['Tue 20 Oct 18:00', true]);
eq('02:00 + 4h: 10:00 that morning', plan('2026-10-21T02:00:00+01:00', 4, '2026-10-21T01:50:00+01:00'), ['Wed 21 Oct 10:00', true]);
eq('20:00 + 24h: 20:00 the next day, past the floor', plan('2026-10-20T20:00:00+01:00', 24, null), ['Wed 21 Oct 20:00', false]);
eq('clocks go back: Sat 20:34 → Sun 10:00 GMT', plan('2026-10-24T20:34:00+01:00', 12, '2026-10-24T20:01:00+01:00'), ['Sun 25 Oct 10:00', true]);
eq('clocks go forward: Sat 20:34 → Sun 10:00 BST', plan('2026-03-28T20:34:00Z', 12, '2026-03-28T20:01:00Z'), ['Sun 29 Mar 10:00', true]);

// Keeping it free never beats the evening rule.
eq(
  '16h after 18:00, window closes 10:00: not 09:00 to keep it free; paid at 10:00',
  plan('2026-10-19T18:00:00+01:00', 16, '2026-10-19T10:00:00+01:00'),
  ['Tue 20 Oct 10:00', false]
);
eq(
  '…the same without the evening rule: free at 09:00',
  plan('2026-10-19T18:00:00+01:00', 16, '2026-10-19T10:00:00+01:00', { settings: { ...S, eveningRule: false } }),
  ['Tue 20 Oct 09:00', true]
);
eq(
  'window closes 10:30, jitter would miss it: free at 10:00 sharp',
  plan('2026-10-19T18:00:00+01:00', 12, '2026-10-19T10:30:00+01:00', { rand: most }),
  ['Tue 20 Oct 10:00', true]
);
eq(
  'window closes 09:00: paid at 10:00, never earlier',
  plan('2026-10-19T19:00:00+01:00', 12, '2026-10-19T09:00:00+01:00'),
  ['Tue 20 Oct 10:00', false]
);
eq(
  '24h chase after 20:30, window closes 20:00: free at 19:00',
  plan('2026-10-19T20:30:00+01:00', 24, '2026-10-19T20:00:00+01:00'),
  ['Tue 20 Oct 19:00', true]
);

// The final nudge (step 2): planned from the chaser, never moved to keep it free, never before 08:45.
const nudge = (iso, hours, s = S) => uk(planChase({ sentAt: at(iso), hours, lastInboundAt: null, settings: s, keepFree: false, rand: none }).at);
eq('nudge 20h after an 11:00 chaser: 07:00 → 08:45', nudge('2026-10-21T11:00:00+01:00', 20), 'Thu 22 Oct 08:45');
eq('nudge 12h after a 20:30 chaser: 10:00', nudge('2026-10-21T20:30:00+01:00', 12), 'Thu 22 Oct 10:00');
eq('nudge 24h after a 10:05 chaser: on time', nudge('2026-10-21T10:05:00+01:00', 24), 'Thu 22 Oct 10:05');

// The outbox's check just before sending: chasers already queued under the old rules wait too.
const hold = (kind, nowIso, lastOutIso, extra = {}) => {
  const w = holdUntil({ kind, now: at(nowIso), settings: S, lastOutAt: lastOutIso ? at(lastOutIso) : null, rand: none, ...extra });
  return w ? uk(w) : 'send';
};
eq('Nikki’s chaser queued for 08:35 before this change: waits until 10:00', hold('chase', '2026-10-21T08:35:00+01:00', '2026-10-20T20:34:00+01:00'), 'Wed 21 Oct 10:00');
eq('a chaser due at 08:10 after a 14:00 message: 08:45', hold('chase', '2026-10-21T08:10:00+01:00', '2026-10-20T14:00:00+01:00'), 'Wed 21 Oct 08:45');
eq('a chaser due at 09:30 after a 19:00 message: 10:00', hold('chase', '2026-10-21T09:30:00+01:00', '2026-10-20T19:00:00+01:00'), 'Wed 21 Oct 10:00');
eq('…with the evening rule off: goes', hold('chase', '2026-10-21T09:30:00+01:00', '2026-10-20T19:00:00+01:00', { settings: { ...S, eveningRule: false } }), 'send');
eq('a chaser due at 10:07 after an evening message: goes', hold('chase', '2026-10-21T10:07:00+01:00', '2026-10-20T20:34:00+01:00'), 'send');
eq('a chaser due at 12:00 after a midday message: goes', hold('chase', '2026-10-21T12:00:00+01:00', '2026-10-21T11:00:00+01:00'), 'send');
eq('a chaser due at 21:30 after a 09:30 message: 08:45', hold('chase', '2026-10-21T21:30:00+01:00', '2026-10-21T09:30:00+01:00'), 'Thu 22 Oct 08:45');
eq('a chaser with no message found: quiet hours only', hold('chase', '2026-10-21T09:00:00+01:00', null), 'send');
eq('a final nudge at 08:00: 08:45', hold('chase', '2026-10-22T08:00:00+01:00', '2026-10-21T11:00:00+01:00'), 'Thu 22 Oct 08:45');
eq('clocks go back: a chaser at 08:00 GMT waits for 10:00 GMT', holdUntil({ kind: 'chase', now: at('2026-10-25T08:00:00Z'), settings: S, lastOutAt: at('2026-10-24T20:34:00+01:00'), rand: none }).toISOString(), '2026-10-25T10:00:00.000Z');
eq('"Send now" pressed in quiet hours: goes', hold('chase', '2026-10-21T08:35:00+01:00', '2026-10-20T20:34:00+01:00', { sendNow: true }), 'send');
eq('smart reply in quiet hours, hold off: goes', hold('reply', '2026-10-21T03:00:00+01:00', null, { settings: { ...S, smartRepliesQuietHours: false } }), 'send');
eq('smart reply in quiet hours, by default: 08:45', hold('reply', '2026-10-21T03:00:00+01:00', null), 'Wed 21 Oct 08:45');
eq('smart reply at 07:10, by default: 08:45', hold('reply', '2026-10-21T07:10:00+01:00', null), 'Wed 21 Oct 08:45');
eq('smart replies never wait for the evening rule', hold('reply', '2026-10-21T09:00:00+01:00', '2026-10-20T20:34:00+01:00', { settings: { ...S, smartRepliesQuietHours: true } }), 'send');
eq('intro to a new lead at 06:33, by default: 08:45', hold('intro', '2026-10-21T06:33:00+01:00', null), 'Wed 21 Oct 08:45');
eq('intro at 23:00 with the hold off: goes', hold('intro', '2026-10-20T23:00:00+01:00', null, { settings: { ...S, firstContactQuietHours: false } }), 'send');
eq('intro at 11:00 with the hold on: goes', hold('intro', '2026-10-21T11:00:00+01:00', null, { settings: { ...S, firstContactQuietHours: true } }), 'send');
eq('held times keep a little jitter', uk(holdUntil({ kind: 'chase', now: at('2026-10-21T08:35:00+01:00'), settings: S, lastOutAt: at('2026-10-20T20:34:00+01:00'), rand: most })), 'Wed 21 Oct 10:20');
{
  // Held once, then due at the held time: it goes (no endless re-holding).
  const first = holdUntil({ kind: 'chase', now: at('2026-10-21T08:35:00+01:00'), settings: S, lastOutAt: at('2026-10-20T20:34:00+01:00'), rand: () => 0.4 });
  eq('held once, then it goes', holdUntil({ kind: 'chase', now: first, settings: S, lastOutAt: at('2026-10-20T20:34:00+01:00') }), null);
}

// What the reply box says ("Chase if no reply: tomorrow about 10:00").
const V = chaseView(S);
eq('the view the browser gets', V, { quietFromMin: 1260, quietToMin: 525, eveningRule: true, eveningFromMin: 1080, eveningNotBeforeMin: 600, keepFree: true });
eq('in words: later today', whenWords(at('2026-10-20T15:30:00+01:00'), at('2026-10-20T09:00:00+01:00')), 'today about 15:30');
eq('in words: tomorrow', whenWords(at('2026-10-21T10:00:00+01:00'), at('2026-10-20T20:34:00+01:00')), 'tomorrow about 10:00');
eq('in words: a weekday', whenWords(at('2026-10-23T10:00:00+01:00'), at('2026-10-20T20:34:00+01:00')), 'Fri about 10:00');
eq('in words: a date', whenWords(at('2026-10-29T10:00:00Z'), at('2026-10-20T20:34:00+01:00')), 'Thu 29 Oct about 10:00');
eq('in words: over the clock change', whenWords(at('2026-10-25T10:00:00Z'), at('2026-10-24T23:30:00+01:00')), 'tomorrow about 10:00');
const box = (nowIso, hours, inbound, view = V) => chaseWhen({ now: at(nowIso), hours, lastInboundAt: inbound, view });
eq('Nikki’s chat at 20:34, Auto (12h)', box('2026-10-20T20:34:00+01:00', 12, '2026-10-20T20:01:00+01:00'), 'tomorrow about 10:00');
eq('at 20:34 with the evening rule off', box('2026-10-20T20:34:00+01:00', 12, '2026-10-20T20:01:00+01:00', { ...V, eveningRule: false }), 'tomorrow about 08:45');
eq('at 14:00, 12h', box('2026-10-20T14:00:00+01:00', 12, '2026-10-20T13:30:00+01:00'), 'tomorrow about 08:45');
eq('at 14:00, 12h, window closes 09:15 tomorrow', box('2026-10-20T14:00:00+01:00', 12, '2026-10-20T09:15:00+01:00'), 'tomorrow about 08:45');
eq('at 09:00, 12h, window closes 23:34:30 tonight', box('2026-10-20T09:00:00+01:00', 12, '2026-10-19T23:34:30+01:00'), 'today about 20:54');
eq('at 09:00, 4h', box('2026-10-20T09:00:00+01:00', 4, '2026-10-20T08:30:00+01:00'), 'today about 13:00');
eq('at 14:00, 24h, kept free', box('2026-10-20T14:00:00+01:00', 24, '2026-10-20T13:30:00+01:00'), 'tomorrow about 12:30');
eq('at 20:34, 3 days', box('2026-10-20T20:34:00+01:00', 72, null), 'Fri about 20:34');

// Settings: minutes now; whole hours saved before still read right, and the old 08:00 default is now 08:45.
const both = (s) => [hhmm(s.quietFromMin), hhmm(s.quietToMin)];
eq('nothing saved: 21:00 → 08:45', both(cleanSettings({})), ['21:00', '08:45']);
const evening = (s) => [s.eveningRule, hhmm(s.eveningFromMin), hhmm(s.eveningNotBeforeMin)];
eq('evening rule on by default: after 18:00 → not before 10:00', evening(cleanSettings({})), [true, '18:00', '10:00']);
eq('evening rule on for settings saved before it', evening(cleanSettings({ quietFrom: 21, quietTo: 8, chaseAfterHours: 12 })), [true, '18:00', '10:00']);
eq('quiet-hours holds on by default', [cleanSettings({}).smartRepliesQuietHours, cleanSettings({}).firstContactQuietHours], [true, true]);
eq('holds on for settings saved before the intro hold', cleanSettings({ quietFrom: 21, quietTo: 8, smartRepliesQuietHours: true }).firstContactQuietHours, true);
eq('smart-reply hold kept off', cleanSettings({ smartRepliesQuietHours: false }).smartRepliesQuietHours, false);
eq('intro hold kept off', cleanSettings({ firstContactQuietHours: false }).firstContactQuietHours, false);
eq('evening rule kept off once turned off', evening(cleanSettings({ eveningRule: false, eveningFromMin: 1140, eveningNotBeforeMin: 570 })), [false, '19:00', '09:30']);
eq('saved with the old defaults (21, 8): 21:00 → 08:45', both(cleanSettings({ quietFrom: 21, quietTo: 8 })), ['21:00', '08:45']);
eq('old 8 saved as text', both(cleanSettings({ quietFrom: '21', quietTo: '8' })), ['21:00', '08:45']);
eq('old 8 → 8 (quiet hours off) stays off', both(cleanSettings({ quietFrom: 8, quietTo: 8 })), ['08:00', '08:00']);
eq('…as text too', both(cleanSettings({ quietFrom: '8', quietTo: '8' })), ['08:00', '08:00']);
eq('…and never quiet', isQuiet(at('2026-10-21T08:20:00+01:00'), cleanSettings({ quietFrom: 8, quietTo: 8 })), false);
eq('old 22 → 7 keep their meaning', both(cleanSettings({ quietFrom: 22, quietTo: 7 })), ['22:00', '07:00']);
eq('old 20 → 9 keep their meaning', both(cleanSettings({ quietFrom: 20, quietTo: 9 })), ['20:00', '09:00']);
eq('minutes win over old hours', both(cleanSettings({ quietFrom: 21, quietTo: 8, quietFromMin: 1290, quietToMin: 480 })), ['21:30', '08:00']);
eq('08:00 chosen in minutes stays 08:00', both(cleanSettings(cleanSettings({ quietToMin: 480 }))), ['21:00', '08:00']);
eq('out of range is kept in the day', both(cleanSettings({ quietFromMin: 5000, quietToMin: -3 })), ['23:59', '00:00']);
eq('rubbish → defaults', both(cleanSettings({ quietFromMin: 'soon', quietToMin: null })), ['21:00', '08:45']);
eq('saving drops the old hour fields', Object.keys(cleanSettings({ quietFrom: 21, quietTo: 8 })).filter((k) => /^quiet(From|To)$/.test(k)), []);
eq('cleaning twice changes nothing', cleanSettings(cleanSettings({ quietFrom: 22, quietTo: 8 })), cleanSettings({ quietFrom: 22, quietTo: 8 }));
eq('time boxes', [fromHhmm('08:45'), fromHhmm('8:45'), fromHhmm('24:00'), fromHhmm(''), hhmm(0), hhmm(1439)], [525, 525, null, null, '00:00', '23:59']);

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
