// Working days, install day lists and UK dates (src/lib/bank-holidays.ts), both sides of the clocks
// going back on Sunday 25 October 2026.
// Usage: node --experimental-strip-types scripts/test-dates.mjs
import { addWorkingDays, dayListWords, dayRuns, installDayList, isWorkingDay, ukDay } from '../src/lib/bank-holidays.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const none = new Set();
const nov9 = new Set(['2026-11-09']);
const xmas = new Set(['2026-12-25', '2026-12-28']); // Boxing Day falls on a Saturday, so the Monday is the holiday

// Install days: day 1 is the start, then the next working days.
eq('3 days from Fri 6 Nov', installDayList('2026-11-06', 3, none), ['2026-11-06', '2026-11-09', '2026-11-10']);
eq('3 days from Fri 6 Nov, 9 Nov a holiday', installDayList('2026-11-06', 3, nov9), ['2026-11-06', '2026-11-10', '2026-11-11']);
eq('1 day', installDayList('2026-11-06', 1, none), ['2026-11-06']);
eq('0 or nonsense days count as 1', installDayList('2026-11-06', 0, none), ['2026-11-06']);
eq('a Saturday start keeps the Saturday', installDayList('2026-10-24', 2, none), ['2026-10-24', '2026-10-26']);
eq('across the clock change', installDayList('2026-10-23', 3, none), ['2026-10-23', '2026-10-26', '2026-10-27']);
eq('over Christmas', installDayList('2026-12-24', 3, xmas), ['2026-12-24', '2026-12-29', '2026-12-30']);

// Runs of consecutive days (one Outlook all-day event each).
eq('Fri 6; Mon 9–Tue 10 → two runs', dayRuns(['2026-11-06', '2026-11-09', '2026-11-10']), [
  { from: '2026-11-06', toExclusive: '2026-11-07' },
  { from: '2026-11-09', toExclusive: '2026-11-11' },
]);
eq('with 9 Nov a holiday → two runs', dayRuns(installDayList('2026-11-06', 3, nov9)), [
  { from: '2026-11-06', toExclusive: '2026-11-07' },
  { from: '2026-11-10', toExclusive: '2026-11-12' },
]);
eq('unsorted and repeated days', dayRuns(['2026-11-10', '2026-11-09', '2026-11-09']), [{ from: '2026-11-09', toExclusive: '2026-11-11' }]);
eq('a run over the month end', dayRuns(['2026-10-30', '2026-10-31', '2026-11-01']), [{ from: '2026-10-30', toExclusive: '2026-11-02' }]);
eq('a run over the clock change', dayRuns(['2026-10-24', '2026-10-25', '2026-10-26']), [{ from: '2026-10-24', toExclusive: '2026-10-27' }]);
eq('no days', dayRuns([]), []);

// Working days.
eq('Fri + 1 working day = Mon', addWorkingDays('2026-11-06', 1, none), '2026-11-09');
eq('Fri + 1, Mon a holiday = Tue', addWorkingDays('2026-11-06', 1, nov9), '2026-11-10');
eq('+10 working days (MCS deadline)', addWorkingDays('2026-10-19', 10, none), '2026-11-02');
eq('+0 is the same day', addWorkingDays('2026-10-24', 0, none), '2026-10-24');
eq('Mon − 2 working days = Thu', addWorkingDays('2026-11-09', -2, none), '2026-11-05');
eq('Fri 23 Oct + 1 = Mon 26 Oct (clocks go back)', addWorkingDays('2026-10-23', 1, none), '2026-10-26');
eq('weekends are not working days', [isWorkingDay('2026-10-24', none), isWorkingDay('2026-10-25', none), isWorkingDay('2026-10-26', none)], [false, false, true]);
eq('bank holidays are not working days', isWorkingDay('2026-12-28', xmas), false);

// UK dates of moments (Europe/London).
eq('23:30Z on 24 Oct is 00:30 BST on the 25th', ukDay('2026-10-24T23:30:00Z'), '2026-10-25');
eq('23:30Z on 25 Oct is 23:30 GMT on the 25th', ukDay('2026-10-25T23:30:00Z'), '2026-10-25');
eq('00:30Z on 26 Oct', ukDay('2026-10-26T00:30:00Z'), '2026-10-26');
eq('23:30Z on 28 Mar (GMT)', ukDay('2026-03-28T23:30:00Z'), '2026-03-28');
eq('23:30Z on 29 Mar is 00:30 BST on the 30th', ukDay('2026-03-29T23:30:00Z'), '2026-03-30');
eq('from a number', ukDay(Date.UTC(2026, 9, 24, 23, 30)), '2026-10-25');

// Words for the portal and the record page.
eq('Fri 6, Mon 9 and Tue 10 November', dayListWords(['2026-11-06', '2026-11-09', '2026-11-10']), 'Fri 6, Mon 9 and Tue 10 November');
eq('one day', dayListWords(['2026-11-06']), 'Fri 6 November');
eq('two months', dayListWords(['2026-10-30', '2026-11-02', '2026-11-03']), 'Fri 30 October, Mon 2 and Tue 3 November');
eq('none', dayListWords([]), '');

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
