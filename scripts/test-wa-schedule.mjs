// When automatic WhatsApps go (src/lib/whatsapp/schedule.ts) and the chaser settings
// (settings-shared.ts): quiet hours to the minute (nothing before 08:45), on both sides of the clocks
// changing (Sunday 29 March and Sunday 25 October 2026), keeping chasers free, and settings saved
// before quiet hours had minutes.
// Usage: node --experimental-strip-types scripts/test-wa-schedule.mjs
import { isQuiet, lastAwake, londonHour, londonMinute, nextAwake, nextClock, planChase } from '../src/lib/whatsapp/schedule.ts';
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

// Settings: minutes now; whole hours saved before still read right, and the old 08:00 default is now 08:45.
const both = (s) => [hhmm(s.quietFromMin), hhmm(s.quietToMin)];
eq('nothing saved: 21:00 → 08:45', both(cleanSettings({})), ['21:00', '08:45']);
eq('saved with the old defaults (21, 8): 21:00 → 08:45', both(cleanSettings({ quietFrom: 21, quietTo: 8 })), ['21:00', '08:45']);
eq('old 8 saved as text', both(cleanSettings({ quietFrom: '21', quietTo: '8' })), ['21:00', '08:45']);
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
