// The survey slot engine (src/lib/booking/engine.ts), sunset times (sun.ts) and the settings
// defaults (settings.ts): the worked examples in the build spec (6.6) and the drive-time estimate
// checks, on both sides of the clocks going back on Sunday 25 October 2026.
// Usage: node --experimental-strip-types scripts/test-booking-engine.mjs
import {
  addDays,
  dayRange,
  earliestBookableDay,
  estimateMinutes,
  inRush,
  isRural,
  londonSlot,
  makeDrive,
  mergeBlocks,
  pickTimes,
  placeEstimate,
  severnSide,
  slotsForDay,
  ukDate,
  ukTime,
  weekday,
} from '../src/lib/booking/engine.ts';
import { sunsetMs } from '../src/lib/booking/sun.ts';
import { CALLUM, cleanBookingSettings, DEFAULT_BOOKING_SETTINGS } from '../src/lib/booking/settings.ts';
import { noSurveyNeeded } from '../src/lib/crm/stages.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
function near(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} (${Math.round(got * 10) / 10}, want ${want} ± ${tol})`);
}
function truthy(name, cond, detail = '') {
  if (!cond) failed++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond || !detail ? '' : `\n     ${detail}`}`);
}

const MIN = 60_000;
const S = {
  bufferMins: 15,
  coffeeMins: 15,
  arrivalMins: 0,
  unknownPadMins: 15,
  stepMins: 15,
  maxPerDay: 4,
  maxDriveMinsPerDay: 240,
  maxOneWayMins: 90,
  maxDetourMins: 75,
};

// Places (rough town centres). The drive tables below are by label; unknown places count as home.
const P = (label, lat, lng, extra = {}) => ({ ll: { lat, lng }, label, ...extra });
const home = P('home', 51.5906, -2.7508, { home: true, pc: 'NP265ST', outcode: 'NP26' });
const pontypool = P('Pontypool', 51.7036, -3.0447, { outcode: 'NP4' });
const cwmbran = P('Cwmbran', 51.6537, -3.0213, { outcode: 'NP44' });
const cardiff = P('Cardiff', 51.4816, -3.1791, { outcode: 'CF10' });
const custA = P('custA', 51.62, -2.9, { outcode: 'NP18' });

function table(rows) {
  const t = new Map();
  for (const [a, b, m] of rows) {
    t.set(`${a}|${b}`, m);
    t.set(`${b}|${a}`, m);
  }
  const name = (p) => (p.unknown || p.home ? 'home' : p.label);
  return (a, b) => {
    const k = `${name(a)}|${name(b)}`;
    if (!t.has(k)) throw new Error(`No drive in the test table for ${k}`);
    return t.get(k);
  };
}
function driveFor(C, rows, rushFactor = 1) {
  const raw = table(rows);
  return makeDrive({
    customer: C,
    customerLeg: (other) => raw(other, C),
    estimate: raw,
    ratio: 1,
    rushFactor,
    rushWindows: [
      ['07:30', '09:30'],
      ['16:00', '18:00'],
    ],
  });
}
const win = (day, from = '08:30', to = '18:00', extra = {}) => ({ firstStart: londonSlot(day, from), lastFinish: londonSlot(day, to), ...extra });
const item = (id, day, from, to, place, isSurvey = false) => ({ id, start: londonSlot(day, from), end: londonSlot(day, to), place, isSurvey });
const times = (cands) => cands.map((c) => ukTime(c.start));

const EX1_DRIVES = [
  ['home', 'Pontypool', 30],
  ['home', 'Cwmbran', 25],
  ['home', 'Cardiff', 35],
  ['Cwmbran', 'Pontypool', 15],
  ['Cwmbran', 'Cardiff', 30],
  ['Pontypool', 'Cardiff', 45],
];

// 1. The research example, on a Wednesday either side of the clock change.
for (const day of ['2026-10-21', '2026-10-28']) {
  const items = [item('cwm', day, '10:00', '11:00', cwmbran), item('cdf', day, '14:00', '15:30', cardiff)];
  const base = { C: pontypool, minutes: 60, base: home, items, win: win(day), s: S, earliestAllowed: 0, drive: driveFor(pontypool, EX1_DRIVES) };
  const r = slotsForDay(base);
  eq(`ex1 ${day}: candidates`, times(r.cands), ['11:45', '16:45', '17:00']);
  eq(`ex1 ${day}: 11:45 detour 30, drive in 15 and out 45`, r.cands.slice(0, 1).map((c) => [c.detour, c.driveIn, c.driveOut]), [[30, 15, 45]]);
  eq(`ex1 ${day}: pickTimes(4)`, times(pickTimes(r.cands, 4)), ['11:45', '16:45']);
  eq(`ex1 ${day}: arrival 5`, times(slotsForDay({ ...base, s: { ...S, arrivalMins: 5 } }).cands), ['17:00']);
  eq(`ex1 ${day}: last finish 16:55 (sunset)`, times(slotsForDay({ ...base, win: win(day, '08:30', '16:55') }).cands), ['11:45']);
  const r90 = slotsForDay({ ...base, minutes: 90 });
  eq(`ex1 ${day}: no room for 90 minutes`, [r90.cands.length, r90.reason], [0, 'no_gap']);
  eq(`ex1 ${day}: a day's driving limit of 100 leaves none (90 + 30 > 100)`, times(slotsForDay({ ...base, s: { ...S, maxDriveMinsPerDay: 100 } }).cands), []);
}

// 2. Empty weekday, customer 33 min each way (rounded up to 35).
const D2 = '2026-10-21';
const EX2_DRIVES = [['home', 'custA', 33]];
{
  const base = { C: custA, minutes: 60, base: home, items: [], win: win(D2), s: S, earliestAllowed: 0, drive: driveFor(custA, EX2_DRIVES) };
  const a = times(slotsForDay(base).cands);
  eq('ex2a: 08:30 to 17:00 every 15 min', [a[0], a[a.length - 1], a.length], ['08:30', '17:00', 35]);
  const b = times(slotsForDay({ ...base, win: win(D2, '08:30', '18:00', { homeBy: londonSlot(D2, '18:00') }) }).cands);
  eq('ex2b: home by 18:00 → last 16:00', b[b.length - 1], '16:00');
  const c = times(
    slotsForDay({ ...base, win: win(D2, '08:30', '18:00', { leaveFrom: londonSlot(D2, '08:00') }), drive: driveFor(custA, EX2_DRIVES, 1.2) }).cands
  );
  eq('ex2c: leave from 08:00, rush 1.2 (33 × 1.2 → 40) → first 08:45', c[0], '08:45');
  // The same on the GMT side of the change.
  const D2g = '2026-10-28';
  const cg = times(
    slotsForDay({ ...base, win: win(D2g, '08:30', '18:00', { leaveFrom: londonSlot(D2g, '08:00') }), drive: driveFor(custA, EX2_DRIVES, 1.2) })
      .cands
  );
  eq('ex2c after the clocks change: first 08:45', cg[0], '08:45');
  // Staff searching today: nothing before now, still on the 15-minute grid from 08:30.
  const staff = times(slotsForDay({ ...base, earliestAllowed: londonSlot(D2, '13:07') }).cands);
  eq('staff today at 13:07 → first 13:15', staff[0], '13:15');
}

// 3. DST.
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';
eq("londonSlot('2026-10-23','09:15') = 08:15Z", iso(londonSlot('2026-10-23', '09:15')), '2026-10-23T08:15Z');
eq("londonSlot('2026-10-26','09:15') = 09:15Z", iso(londonSlot('2026-10-26', '09:15')), '2026-10-26T09:15Z');
eq("londonSlot('2026-10-24','23:30') = 22:30Z", iso(londonSlot('2026-10-24', '23:30')), '2026-10-24T22:30Z');
eq("londonSlot('2026-10-25','00:30') = 23:30Z on the 24th", iso(londonSlot('2026-10-25', '00:30')), '2026-10-24T23:30Z');
eq("londonSlot('2026-10-25','23:30') = 23:30Z", iso(londonSlot('2026-10-25', '23:30')), '2026-10-25T23:30Z');
eq("londonSlot('2026-10-26','00:30') = 00:30Z", iso(londonSlot('2026-10-26', '00:30')), '2026-10-26T00:30Z');
eq("londonSlot('2026-03-29','09:00') = 08:00Z (spring)", iso(londonSlot('2026-03-29', '09:00')), '2026-03-29T08:00Z');
for (const d of ['2026-10-24', '2026-10-25', '2026-10-26']) {
  eq(`ukDate(londonSlot('${d}','23:30')) === '${d}'`, ukDate(londonSlot(d, '23:30')), d);
  eq(`ukDate(londonSlot('${d}','00:30')) === '${d}'`, ukDate(londonSlot(d, '00:30')), d);
}
eq("addDays('2026-10-24', 2) === '2026-10-26'", addDays('2026-10-24', 2), '2026-10-26');
eq("addDays('2026-10-31', 1) === '2026-11-01'", addDays('2026-10-31', 1), '2026-11-01');
eq('dayRange over the change', dayRange('2026-10-24', '2026-10-27'), ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
eq('weekday: Sat 24, Sun 25, Mon 26 Oct', [weekday('2026-10-24'), weekday('2026-10-25'), weekday('2026-10-26')], ['6', '7', '1']);
eq('ukTime both sides', [ukTime(Date.parse('2026-10-24T23:30:00Z')), ukTime(Date.parse('2026-10-25T23:30:00Z'))], ['00:30', '23:30']);

// 4. Full, too far, blocked.
{
  const four = ['09:00', '11:00', '13:00', '15:00'].map((t, i) => ({ ...item(`s${i}`, D2, t, t.replace(/^(\d\d)/, (h) => String(+h + 1).padStart(2, '0')), cwmbran, true) }));
  const drives = [...EX2_DRIVES, ['home', 'Cwmbran', 25], ['Cwmbran', 'custA', 20]];
  eq('ex4: 4 surveys already → full', slotsForDay({ C: custA, minutes: 60, base: home, items: four, win: win(D2), s: S, earliestAllowed: 0, drive: driveFor(custA, drives) }).reason, 'full');
  eq('ex4: 100 min from home → too_far', slotsForDay({ C: custA, minutes: 60, base: home, items: [], win: win(D2), s: S, earliestAllowed: 0, drive: driveFor(custA, [['home', 'custA', 100]]) }).reason, 'too_far');
  const ooo = { id: 'ooo', start: londonSlot(D2, '00:00'), end: londonSlot(addDays(D2, 1), '00:00'), place: home, isSurvey: false, allDayBlock: true };
  eq('ex4: all-day out of office → blocked', slotsForDay({ C: custA, minutes: 60, base: home, items: [ooo], win: win(D2), s: S, earliestAllowed: 0, drive: driveFor(custA, EX2_DRIVES) }).reason, 'blocked');
}

// 5. Unknown location: busy 12:00–13:00 with no location, customer 20 min from home.
{
  const unknown = { ...home, label: 'No location', unknown: true, home: false };
  const r = slotsForDay({
    C: custA,
    minutes: 60,
    base: home,
    items: [item('u', D2, '12:00', '13:00', unknown)],
    win: win(D2),
    s: S,
    earliestAllowed: 0,
    drive: driveFor(custA, [['home', 'custA', 20]]),
  });
  const before = r.cands.filter((c) => c.gap === 0).map((c) => ukTime(c.start));
  const after = r.cands.filter((c) => c.gap === 1).map((c) => ukTime(c.start));
  eq('ex5: last start before = 09:45', before[before.length - 1], '09:45');
  eq('ex5: first start after = 14:15', after[0], '14:15');
}

// 6. Both (90) ⊆ solar (60), on example 2's day.
{
  const base = { C: custA, base: home, items: [item('x', D2, '12:00', '13:00', cwmbran)], win: win(D2), s: S, earliestAllowed: 0, drive: driveFor(custA, [...EX2_DRIVES, ['home', 'Cwmbran', 25], ['Cwmbran', 'custA', 20]]) };
  const s60 = new Set(times(slotsForDay({ ...base, minutes: 60 }).cands));
  const s90 = times(slotsForDay({ ...base, minutes: 90 }).cands);
  truthy('ex6: 90-minute times are all 60-minute times', s90.length > 0 && s90.every((t) => s60.has(t)), `${s90}`);
  truthy('ex6: and fewer of them', s90.length < s60.size);
}

// 7. Nested appointments block the whole span.
{
  const items = [item('big', D2, '10:00', '15:00', cwmbran), item('in', D2, '11:00', '11:30', cardiff)];
  const blocks = mergeBlocks(items);
  eq('ex7: one block 10:00–15:00 at Cwmbran (ends last)', blocks.map((b) => [ukTime(b.start), ukTime(b.end), b.place.label, b.ids.length]), [['10:00', '15:00', 'Cwmbran', 2]]);
  const r = slotsForDay({ C: pontypool, minutes: 60, base: home, items, win: win(D2), s: S, earliestAllowed: 0, drive: driveFor(pontypool, EX1_DRIVES) });
  const inside = r.cands.filter((c) => c.start >= londonSlot(D2, '10:00') && c.start < londonSlot(D2, '15:00'));
  eq('ex7: no start between 10:00 and 15:00', times(inside), []);
  // Touching appointments stay two blocks.
  eq('touching appointments are two blocks', mergeBlocks([item('a', D2, '09:00', '10:00', cwmbran), item('b', D2, '10:00', '11:00', cardiff)]).length, 2);
}

// 8. Saturday: 08:30–12:00, only within 30 minutes of home.
{
  const SAT = '2026-10-24';
  const w = win(SAT, '08:30', '12:00', { maxFromBase: 30 });
  eq('ex8: 40 min away → too_far_today', slotsForDay({ C: custA, minutes: 60, base: home, items: [], win: w, s: S, earliestAllowed: 0, drive: driveFor(custA, [['home', 'custA', 40]]) }).reason, 'too_far_today');
  const d25 = driveFor(custA, [['home', 'custA', 25]], 1.2); // no rush hour on Saturdays
  const solar = times(slotsForDay({ C: custA, minutes: 60, base: home, items: [], win: w, s: S, earliestAllowed: 0, drive: d25 }).cands);
  const both = times(slotsForDay({ C: custA, minutes: 90, base: home, items: [], win: w, s: S, earliestAllowed: 0, drive: d25 }).cands);
  eq('ex8: 25 min away, solar 08:30 … 11:00', [solar[0], solar[solar.length - 1]], ['08:30', '11:00']);
  eq('ex8: 25 min away, both 08:30 … 10:30', [both[0], both[both.length - 1]], ['08:30', '10:30']);
  eq('Saturday has no rush hour', inRush(londonSlot(SAT, '08:00'), [['07:30', '09:30']]), false);
  eq('a weekday at 08:00 does', inRush(londonSlot(D2, '08:00'), [['07:30', '09:30']]), true);
}

// 9. pickTimes: never more than perDay, sorted, ≥ 60 min apart apart from gap-first picks.
{
  const sets = [
    slotsForDay({ C: custA, minutes: 60, base: home, items: [], win: win(D2), s: S, earliestAllowed: 0, drive: driveFor(custA, EX2_DRIVES) }).cands,
    slotsForDay({ C: pontypool, minutes: 60, base: home, items: [item('cwm', D2, '10:00', '11:00', cwmbran), item('cdf', D2, '14:00', '15:30', cardiff)], win: win(D2), s: S, earliestAllowed: 0, drive: driveFor(pontypool, EX1_DRIVES) }).cands,
    slotsForDay({ C: custA, minutes: 60, base: home, items: [item('x', D2, '12:00', '13:00', cwmbran)], win: win(D2), s: S, earliestAllowed: 0, drive: driveFor(custA, [...EX2_DRIVES, ['home', 'Cwmbran', 25], ['Cwmbran', 'custA', 20]]) }).cands,
  ];
  for (const [i, cands] of sets.entries()) {
    for (const n of [1, 2, 4, 6]) {
      const picked = pickTimes(cands, n);
      const sorted = picked.every((c, k) => k === 0 || picked[k - 1].start < c.start);
      const firsts = new Set(picked.filter((c) => !cands.some((o) => o.gap === c.gap && o.start < c.start)).map((c) => c.start));
      const spaced = picked.every((c) => firsts.has(c.start) || picked.every((o) => o === c || Math.abs(o.start - c.start) >= 60 * MIN));
      truthy(`ex9: set ${i + 1}, perDay ${n}: ≤ ${n}, sorted, spaced`, picked.length <= n && sorted && spaced, times(picked).join(' '));
    }
  }
  eq('ex9: empty day, 4 times an hour apart', times(pickTimes(sets[0], 4)), ['08:30', '09:30', '10:30', '11:30']);
  eq('ex9: nothing to pick', pickTimes([], 4), []);
}

// 10. The cut-off: Mon–Sat working, Sunday off.
{
  const work = (hols) => (d) => weekday(d) !== '7' && !hols.has(d);
  const none = new Set();
  const at = (d, t) => londonSlot(d, t);
  eq('ex10: Mon 19 Oct 14:59 → Tue 20', earliestBookableDay(at('2026-10-19', '14:59'), '15:00', work(none)), '2026-10-20');
  eq('ex10: Mon 15:00 → Wed 21', earliestBookableDay(at('2026-10-19', '15:00'), '15:00', work(none)), '2026-10-21');
  eq('ex10: Mon 15:01 → Wed 21', earliestBookableDay(at('2026-10-19', '15:01'), '15:00', work(none)), '2026-10-21');
  eq('ex10: Fri 23 Oct 14:59 → Sat 24', earliestBookableDay(at('2026-10-23', '14:59'), '15:00', work(none)), '2026-10-24');
  eq('ex10: Fri 15:01 → Mon 26', earliestBookableDay(at('2026-10-23', '15:01'), '15:00', work(none)), '2026-10-26');
  eq('ex10: Fri 15:01, Mon 26 a bank holiday → Tue 27', earliestBookableDay(at('2026-10-23', '15:01'), '15:00', work(new Set(['2026-10-26']))), '2026-10-27');
  eq('Sat 24 Oct 23:30 (BST) → Mon 26 is closed, so Tue 27', earliestBookableDay(at('2026-10-24', '23:30'), '15:00', work(none)), '2026-10-27');
  eq('Sun 25 Oct 00:30 (BST, after midnight) → Mon 26 is fine', earliestBookableDay(at('2026-10-25', '00:30'), '15:00', work(none)), '2026-10-26');
}

// 11. Sunset in Newport.
{
  const NP = [51.584, -2.998];
  near("ex11: sunset 14 Dec ≈ 16:04 GMT (min)", (sunsetMs('2026-12-14', ...NP) - Date.parse('2026-12-14T16:04:00Z')) / MIN, 0, 3);
  near("ex11: sunset 26 Oct ≈ 16:58 GMT (min)", (sunsetMs('2026-10-26', ...NP) - Date.parse('2026-10-26T16:58:00Z')) / MIN, 0, 3);
  near("ex11: sunset 23 Oct ≈ 18:04 BST (min)", (sunsetMs('2026-10-23', ...NP) - Date.parse('2026-10-23T17:04:00Z')) / MIN, 0, 3);
  near('sunset 21 June ≈ 21:32 BST (min)', (sunsetMs('2026-06-21', ...NP) - Date.parse('2026-06-21T20:32:00Z')) / MIN, 0, 4);
}

// The estimate (no Google key): errs on the long side.
{
  const opts = { roadFactor: 1.3, ruralFactor: 1.4, ruralOutcodes: DEFAULT_BOOKING_SETTINGS.advanced.ruralOutcodes };
  const newport = P('Newport', 51.5842, -2.9977, { outcode: 'NP20' });
  const cdf = P('Cardiff', 51.4816, -3.1791, { outcode: 'CF10' });
  const aber = P('Abergavenny', 51.824, -3.0167, { outcode: 'NP7' });
  const bristol = P('Bristol', 51.4545, -2.5879, { outcode: 'BS1' });
  const brecon = P('Brecon', 51.9467, -3.3914, { outcode: 'LD3' });
  const wsm = P('Weston-super-Mare', 51.3461, -2.977, { outcode: 'BS23' });
  near('estimate Newport → Cardiff ≈ 33', placeEstimate(newport, cdf, opts), 33, 8);
  near('estimate Newport → Abergavenny ≈ 42', placeEstimate(newport, aber, opts), 42, 8);
  near('estimate Newport → Bristol (bridge) ≈ 52', placeEstimate(newport, bristol, opts), 52, 8);
  near('estimate Newport → Brecon ≈ 65', placeEstimate(newport, brecon, opts), 65, 8);
  truthy('estimate Cardiff → Weston-super-Mare (bridge) > 70', placeEstimate(cdf, wsm, opts) > 70, String(placeEstimate(cdf, wsm, opts)));
  truthy('the same either way round', Math.abs(placeEstimate(bristol, newport, opts) - placeEstimate(newport, bristol, opts)) < 1e-9);
  const direct = estimateMinutes(newport.ll, bristol.ll, { roadFactor: 1.3, ruralFactor: 1.4, ruralA: false, ruralB: false, severnA: null, severnB: null });
  truthy('without postcode areas there is no crossing (shorter)', direct < placeEstimate(newport, bristol, opts));
  eq('Severn sides', [severnSide('NP26'), severnSide('BS1'), severnSide('GL1'), severnSide(undefined)], ['wales', 'england', null, null]);
  eq('rural: NP4 yes, NP44 no, LD3 yes (area), CF10 no', [isRural('NP4', opts.ruralOutcodes), isRural('NP44', opts.ruralOutcodes), isRural('LD3', opts.ruralOutcodes), isRural('CF10', opts.ruralOutcodes)], [true, false, true, false]);
}

// Legs: rounding, minimums, same place, online.
{
  const est = () => 12.1;
  const drive = makeDrive({ customer: custA, estimate: est, ratio: 1, rushFactor: 1, rushWindows: [] });
  const t = londonSlot(D2, '12:00');
  eq('12.1 min rounds up to 15', drive(cwmbran, cardiff, t), 15);
  eq('the same place is 0', drive(cwmbran, cwmbran, t), 0);
  eq('online is 0', drive(cwmbran, { ll: null, label: 'Teams', online: true }, t), 0);
  eq('home to an unknown place (at home) is 0', drive(home, { ...home, unknown: true, home: false }, t), 0);
  const tiny = makeDrive({ customer: custA, estimate: () => 2, ratio: 1, rushFactor: 1, rushWindows: [] });
  eq('at least 10 minutes between places', tiny(cwmbran, cardiff, t), 10);
  eq('at least 5 in the same postcode', tiny({ ...cwmbran, pc: 'NP443AB' }, { ...cardiff, pc: 'NP443AB' }, t), 5);
  const ratio = makeDrive({ customer: custA, customerLeg: () => 40, estimate: () => 20, ratio: 1.25, rushFactor: 1, rushWindows: [] });
  eq('customer legs come from the provider', ratio(home, custA, t), 40);
  eq('other legs are estimate × ratio (20 × 1.25 = 25)', ratio(cwmbran, cardiff, t), 25);
  const noRoute = makeDrive({ customer: custA, customerLeg: () => null, estimate: () => 20, ratio: 1.25, rushFactor: 1, rushWindows: [] });
  eq('no route from the provider → estimate × ratio', noRoute(home, custA, t), 25);
}

// Settings: the owner's answers are the defaults; rubbish falls back to them.
{
  eq('defaults from nothing', cleanBookingSettings({}), DEFAULT_BOOKING_SETTINGS);
  eq('defaults from rubbish', cleanBookingSettings('rubbish'), DEFAULT_BOOKING_SETTINGS);
  eq('defaults survive a round trip', cleanBookingSettings(JSON.parse(JSON.stringify(DEFAULT_BOOKING_SETTINGS))), DEFAULT_BOOKING_SETTINGS);
  const d = DEFAULT_BOOKING_SETTINGS;
  eq('Callum from NP26 5ST, 08:30–18:00 weekdays', [d.surveyors[0].basePostcode, d.surveyors[0].hours['1'], d.surveyors[0].hours['7']], ['NP26 5ST', { start: '08:30', end: '18:00' }, null]);
  eq('Saturday 08:30–12:00 within 30 min', CALLUM.hours['6'], { start: '08:30', end: '12:00', maxFromBaseMins: 30 });
  eq('off, ask me to confirm, 15 + 15, 4 a day, 15:00', [d.enabled, d.mode, d.bufferMins, d.coffeeMins, d.maxPerDay, d.cutoffTime], [false, 'request', 15, 15, 4, '15:00']);
  eq('solar 60, heat pump 60, both 90', d.durations, { solar: 60, ashp: 60, solar_ashp: 90 });
  const c = cleanBookingSettings({
    enabled: true,
    mode: 'instant',
    bufferMins: 'x',
    maxPerDay: 99,
    cutoffTime: '25:00',
    closedDates: ['2026-12-24', 'nope', '2026-12-24'],
    surveyors: [{ key: 'Callum@Heliaxis.co.uk', name: 'Callum Smith', basePostcode: 'np26 5st', hours: { 6: null, 1: { start: '09:00', end: '08:00' } } }],
    advanced: { rushWindows: [['07:00', '09:00'], ['bad']], stepMins: 7, travelProvider: 'magic' },
  });
  eq('cleaned values', [c.enabled, c.mode, c.bufferMins, c.maxPerDay, c.cutoffTime, c.closedDates], [true, 'instant', 15, 12, '15:00', ['2026-12-24']]);
  eq('cleaned surveyor', [c.surveyors[0].key, c.surveyors[0].name, c.surveyors[0].basePostcode, c.surveyors[0].hours['6'], c.surveyors[0].hours['1']], ['callum@heliaxis.co.uk', 'Callum', 'NP26 5ST', null, { start: '08:30', end: '18:00' }]);
  eq('cleaned advanced', [c.advanced.rushWindows, c.advanced.stepMins, c.advanced.travelProvider], [[['07:00', '09:00']], 15, 'auto']);
  eq('no surveyors stays no surveyors', cleanBookingSettings({ surveyors: [] }).surveyors, []);
}

// Infrared, EV or LED only: a home visit, never a survey slot (the owner's answer, 19 Oct 2026).
{
  const no = (products, survey_type = null) => noSurveyNeeded({ products, survey_type });
  eq('infrared only needs no survey', no(['infrared']), true);
  eq('EV, LED or Other only need no survey', [no(['ev']), no(['led']), no(['other']), no(['ev', 'infrared'])], [true, true, true, true]);
  eq('solar, battery or heat pump with infrared still needs one', [no(['solar', 'infrared']), no(['battery', 'infrared']), no(['heatpump', 'infrared'])], [false, false, false]);
  eq('no products yet: unknown, so still bookable', [no([]), no(null)], [false, false]);
  eq('a survey type set on the job wins', no(['infrared'], 'solar'), false);
}

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
