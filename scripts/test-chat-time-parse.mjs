// A call-back reminder from a WhatsApp message (src/lib/whatsapp/chat-time.ts): the time it asks for,
// read the UK way, both sides of the clocks going back on Sunday 25 October 2026 (and forward on
// 29 March), whether it asks for a call, and the default when it names no time.
// Usage: node --experimental-strip-types scripts/test-chat-time-parse.mjs
import { asksForCall, defaultCallTime, parseCallTime, quoteMessage, suggestReminder, ukIso, whenWords } from '../src/lib/whatsapp/chat-time.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/** A UK day and time as a moment. */
const at = (day, time) => Date.parse(ukIso(day, time));
/** The day and time a message gives (or null), sent at `sent` and read at `now` (the same unless given). */
const when = (text, sent, now = sent) => {
  const p = parseCallTime(text, sent, now);
  return p && { day: p.day, time: p.time, ...(p.past ? { past: true } : {}) };
};

// The owner's screenshot: David Clement (HX-0108), Tuesday 20 October 2026, BST.
const DAI = 'Good morning Callum, I will be free around 1pm today if you could give us a call then that would be great. Thanks Dai.';
const tue0847 = at('2026-10-20', '08:47');
eq('the owner’s message: today 13:00', when(DAI, tue0847, at('2026-10-20', '09:15')), { day: '2026-10-20', time: '13:00' });
eq('… and the words it came from', parseCallTime(DAI, tue0847, tue0847).phrase, 'around 1pm today');
eq('… is 12:00 UTC (BST)', suggestReminder({ body: DAI, direction: 'in', sentAt: tue0847 }, 'David Clement', at('2026-10-20', '09:15')).at, '2026-10-20T12:00:00.000Z');
eq('… asks for a call', asksForCall(DAI), true);
eq('… "Good morning" isn’t a time', when('Good morning Callum, thanks for the quote', tue0847), null);
const s = suggestReminder({ body: DAI, direction: 'in', sentAt: tue0847 }, 'David Clement', at('2026-10-20', '09:15'));
eq('… titles', [s.callTitle, s.taskTitle], ['Call David', 'Call back David Clement']);
eq('… the quote', s.quote, `David on WhatsApp, Tue 20 Oct 08:47:\n“${DAI}”`);
eq('… confirmation words', whenWords(s, at('2026-10-20', '09:15')), 'today 13:00');
eq('… opened after 1pm: still today, flagged as gone (not moved to tomorrow)', when(DAI, tue0847, at('2026-10-20', '14:05')), { day: '2026-10-20', time: '13:00', past: true });

// UK phrasing (sent Tue 20 Oct at 09:00 unless said).
const tue0900 = at('2026-10-20', '09:00');
eq('at 13:30', when('Could you ring at 13:30?', tue0900), { day: '2026-10-20', time: '13:30' });
eq('1.30pm', when('Free from 1.30pm', tue0900), { day: '2026-10-20', time: '13:30' });
eq('after 5', when('Any chance you could call after 5', tue0900), { day: '2026-10-20', time: '17:00' });
eq('after 5 would be great', when('after 5 would be great thanks', tue0900), { day: '2026-10-20', time: '17:00' });
eq('tomorrow morning → 09:30', when('Can you call tomorrow morning?', tue0900), { day: '2026-10-21', time: '09:30' });
eq('this afternoon → 14:00', when('Ring me this afternoon please', tue0900), { day: '2026-10-20', time: '14:00' });
eq('Monday at 10', when('Monday at 10 suits me', tue0900), { day: '2026-10-26', time: '10:00' });
eq('half 2', when('Give us a ring about half 2', tue0900), { day: '2026-10-20', time: '14:30' });
eq('half past two', when('half past two is fine', tue0900), { day: '2026-10-20', time: '14:30' });
eq('quarter to 4', when('quarter to 4?', tue0900), { day: '2026-10-20', time: '15:45' });
eq('quarter past 11', when('quarter past 11 ok', tue0900), { day: '2026-10-20', time: '11:15' });
eq('10am', when('10am tomorrow', tue0900), { day: '2026-10-21', time: '10:00' });
eq('3 o’clock', when('3 o’clock?', tue0900), { day: '2026-10-20', time: '15:00' });
eq('2ish', when('2ish today', tue0900), { day: '2026-10-20', time: '14:00' });
eq('1-2pm', when('Between 1-2pm is best', tue0900), { day: '2026-10-20', time: '13:00' });
eq('between 2 and 3', when('between 2 and 3 tomorrow', tue0900), { day: '2026-10-21', time: '14:00' });
eq('midday', when('Call at midday', tue0900), { day: '2026-10-20', time: '12:00' });
eq('lunchtime tomorrow', when('lunchtime tomorrow works', tue0900), { day: '2026-10-21', time: '12:30' });
eq('tonight → 18:00', when('Can you ring tonight?', tue0900), { day: '2026-10-20', time: '18:00' });
eq('tonight at 7 → 19:00', when('tonight at 7', tue0900), { day: '2026-10-20', time: '19:00' });
eq('this evening at 8 → 20:00', when('this evening at 8', tue0900), { day: '2026-10-20', time: '20:00' });
eq('at 7 in the morning → 07:00', when('tomorrow at 7 in the morning', tue0900), { day: '2026-10-21', time: '07:00' });
eq('before 3 → 14:30', when('Please call before 3', tue0900), { day: '2026-10-20', time: '14:30' });
eq('Friday, no time → 09:30', when('Call me Friday', tue0900), { day: '2026-10-23', time: '09:30' });
eq('next Thursday', when('next thursday at 11', tue0900), { day: '2026-10-22', time: '11:00' });
eq('Weds afternoon', when('weds afternoon?', tue0900), { day: '2026-10-21', time: '14:00' });
eq('day after tomorrow', when('the day after tomorrow at 4', tue0900), { day: '2026-10-22', time: '16:00' });
eq('busy until 2, free after 3: after 3', when("I'm busy until 2 but free after 3", tue0900), { day: '2026-10-20', time: '15:00' });
eq('any time after 3 tmrw', when('Any time after 3 tmrw', tue0900), { day: '2026-10-21', time: '15:00' });
eq('sat morning → Saturday', when('sat morning?', tue0900), { day: '2026-10-24', time: '09:30' });
eq('in 20 minutes', when('Call me in 20 minutes', at('2026-10-20', '09:02')), { day: '2026-10-20', time: '09:25' });
eq('in half an hour', when("I'll be free in half an hour", tue0900), { day: '2026-10-20', time: '09:30' });
eq('in an hour, read 2 hours later: gone', when('ring in an hour', tue0900, at('2026-10-20', '11:00')), { day: '2026-10-20', time: '10:00', past: true });
eq('today, no time → an hour on', when('Can you call me today?', tue0900), { day: '2026-10-20', time: '10:00' });

// Past times: moved on only when that's what they'd mean.
const tue1500 = at('2026-10-20', '15:00');
eq('"at 13:30" sent at 3pm → tomorrow', when('at 13:30', tue1500), { day: '2026-10-21', time: '13:30' });
eq('"after 5" sent at 6.30pm → tomorrow', when('after 5', at('2026-10-20', '18:30')), { day: '2026-10-21', time: '17:00' });
eq('"after 8" sent at 10am → this evening', when('after 8', at('2026-10-20', '10:00')), { day: '2026-10-20', time: '20:00' });
eq('"at 11" sent at noon → tomorrow (not 11pm)', when('at 11', at('2026-10-20', '12:00')), { day: '2026-10-21', time: '11:00' });
eq('"this afternoon" sent at 15:10 → 15:45', when('this afternoon please', at('2026-10-20', '15:10')), { day: '2026-10-20', time: '15:45' });
eq('"today at 1" sent at 2pm → today, gone', when('today at 1', tue1500), { day: '2026-10-20', time: '13:00', past: true });
eq('"Monday at 10" sent Monday 09:00 → today', when('Monday at 10', at('2026-10-26', '09:00')), { day: '2026-10-26', time: '10:00' });
eq('"Monday at 10" sent Monday 11:00 → next Monday', when('Monday at 10', at('2026-10-26', '11:00')), { day: '2026-11-02', time: '10:00' });
eq('"after 5" sent yesterday, read this morning → today', when('after 5', at('2026-10-19', '10:00'), at('2026-10-20', '09:00')), { day: '2026-10-20', time: '17:00' });
eq('"tomorrow at 10" sent last week → that day, gone', when('tomorrow at 10', at('2026-10-13', '10:00'), tue0900), { day: '2026-10-14', time: '10:00', past: true });

// The clocks going back (Sun 25 Oct 2026, 02:00 BST → 01:00 GMT) and forward (Sun 29 Mar 2026).
eq('Sat 22:00 BST "tomorrow at 10" → Sun 25 Oct 10:00 GMT', ukIso(...Object.values(when('tomorrow at 10', at('2026-10-24', '22:00')))), '2026-10-25T10:00:00.000Z');
eq('sent 00:30 BST on the 25th (Sat 23:30 UTC): "today" is the 25th', when('today at 3', Date.parse('2026-10-24T23:30:00Z')), { day: '2026-10-25', time: '15:00' });
eq('Fri "Monday morning" → Mon 26 Oct 09:30 GMT', ukIso('2026-10-26', when('Monday morning', at('2026-10-23', '16:00')).time), '2026-10-26T09:30:00.000Z');
eq('Sat 28 Mar "tomorrow morning" → Sun 29 Mar 09:30 BST', ukIso(...Object.values(when('tomorrow morning', at('2026-03-28', '12:00')))), '2026-03-29T08:30:00.000Z');
eq('on the 25th itself, "after 5" → 17:00 GMT', ukIso(...Object.values(when('after 5', at('2026-10-25', '09:00')))), '2026-10-25T17:00:00.000Z');

// Not times.
eq('quantities', when('We have 10 panels and a 5kw battery', tue0900), null);
eq('a price', when('It came to £1.50 a day', tue0900), null);
eq('a phone number', when('My number is 07700 900123', tue0900), null);
eq('"from 2 suppliers"', when('I have quotes from 2 suppliers', tue0900), null);
eq('"about 4 years"', when('The roof was done about 4 years ago', tue0900), null);
eq('"Morning!" as a greeting', when('Morning! Just checking in', tue0900), null);
eq('"the sun"', when('Is the sun strong enough on a north roof?', tue0900), null);
eq('nothing', when('Thanks for the quote', tue0900), null);

// Asking for a call.
for (const [text, want] of [
  ['Can you ring me?', true],
  ['give me a bell when you can', true],
  ['Please phone me back', true],
  ['Could someone call?', true],
  ['Happy to chat on the phone', true],
  ['Can we talk tomorrow?', true],
  ['I’ll give you a ring', true],
  ['Thanks for the quote', false],
  ['What does the battery cost?', false],
  ['My phone number is 07700 900123', false],
  ['I called in earlier', false],
]) eq(`asks for a call: ${text}`, asksForCall(text), want);

// Nothing in the message: an hour on, rounded up to the quarter; past 17:00 the next working morning.
eq('09:12 → 10:15', defaultCallTime(at('2026-10-20', '09:12')), { day: '2026-10-20', time: '10:15' });
eq('16:00 → 17:00', defaultCallTime(at('2026-10-20', '16:00')), { day: '2026-10-20', time: '17:00' });
eq('16:30 → tomorrow 09:30', defaultCallTime(at('2026-10-20', '16:30')), { day: '2026-10-21', time: '09:30' });
eq('Fri 18:00 → Mon 09:30 (after the clocks go back)', defaultCallTime(at('2026-10-23', '18:00')), { day: '2026-10-26', time: '09:30' });
eq('Sat 21:00 → Mon 09:30', defaultCallTime(at('2026-10-24', '21:00')), { day: '2026-10-26', time: '09:30' });
eq('06:40 → 09:30 today', defaultCallTime(at('2026-10-20', '06:40')), { day: '2026-10-20', time: '09:30' });
const none = suggestReminder({ body: 'Thanks for the quote', direction: 'in', sentAt: tue0900 }, 'Jane Smith', at('2026-10-20', '09:12'));
eq('no time, no call: follow up, an hour on', [none.callTitle, none.taskTitle, none.day, none.time, none.phrase], ['Follow up with Jane', 'Follow up with Jane Smith', '2026-10-20', '10:15', '']);
eq('no message at all', suggestReminder(null, 'Jane Smith', at('2026-10-20', '17:30')).time, '09:30');

// Quotes.
eq('our own message', quoteMessage({ body: 'I’ll ring you Monday at 10', direction: 'out', sentAt: tue0900 }, 'Jane'), 'Our WhatsApp, Tue 20 Oct 09:00:\n“I’ll ring you Monday at 10”');
eq('a long one is cut short', quoteMessage({ body: 'x'.repeat(700), direction: 'in', sentAt: tue0900 }, 'Jane').length, 'Jane on WhatsApp, Tue 20 Oct 09:00:\n“'.length + 599 + 1);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
