/**
 * The survey slot engine: given a surveyor's day (appointments with places), a customer's place and
 * a drive-time function, which start times genuinely fit. Pure: no runtime imports, only erasable
 * TypeScript, so scripts/test-booking-engine.mjs loads it straight into node.
 *
 * The window is time ON SITE (first start from 08:30, last finish by 18:00). The gap between two
 * appointments is exactly drive + buffer + coffee (+ arrival, 0 by default). Drives from and back
 * to home count towards the day's driving and detour limits but don't shrink the window.
 */
import type { Weekday } from './settings';

export type LatLng = { lat: number; lng: number };
export type Place = {
  ll: LatLng | null;
  label: string;
  /** No location found: treated as home, plus unknownPadMins each side. */
  unknown?: boolean;
  /** Online / phone: carried forward from wherever he was before. */
  online?: boolean;
  outcode?: string;
  /** Full postcode, upper case, no spaces (for "same postcode" legs). */
  pc?: string;
  /** The surveyor's home base. */
  home?: boolean;
};
export type Item = { id: string; start: number; end: number; place: Place; isSurvey: boolean; allDayBlock?: boolean };
export type Block = { start: number; end: number; place: Place; surveys: number; ids: string[] };
/** Epoch ms. */
export type Window = { firstStart: number; lastFinish: number; leaveFrom?: number; homeBy?: number; maxFromBase?: number };
export type EngineSettings = {
  bufferMins: number;
  coffeeMins: number;
  arrivalMins: number;
  unknownPadMins: number;
  stepMins: number;
  maxPerDay: number;
  maxDriveMinsPerDay: number;
  maxOneWayMins: number;
  maxDetourMins: number;
};
/** Minutes, rounded. */
export type Drive = (from: Place, to: Place, departAt: number) => number;
export type Candidate = { start: number; end: number; detour: number; driveIn: number; driveOut: number; gap: number; nearby: boolean };
export type DayReason = 'blocked' | 'full' | 'too_far' | 'too_far_today' | 'no_gap';
export type DayResult = { cands: Candidate[]; reason?: DayReason };

const MIN = 60_000;
const HOUR = 60 * MIN;

/* ── UK wall-clock time ───────────────────────────────────────────────────────── */

let fmt: Intl.DateTimeFormat | null = null;
const offsets = new Map<number, number>();

/**
 * London's offset from UTC (ms) at a moment. The clocks only ever change on the hour (01:00 UTC),
 * so the offset is the same for a whole UTC hour and is worked out once per hour.
 */
function londonOffset(ms: number): number {
  const hour = Math.floor(ms / HOUR);
  const known = offsets.get(hour);
  if (known !== undefined) return known;
  fmt ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p = fmt.formatToParts(new Date(hour * HOUR));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  const off = local - hour * HOUR;
  if (offsets.size > 20_000) offsets.clear();
  offsets.set(hour, off);
  return off;
}

function ymdParts(ymd: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${ymd}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** The moment (epoch ms) of a UK wall-clock time on a UK date. Right on both sides of a clock change. */
export function londonSlot(day: string, hhmm: string): number {
  const [y, m, d] = ymdParts(day);
  const [hh, mm] = hhmm.split(':').map(Number);
  const target = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  let t = target - londonOffset(target);
  const again = londonOffset(t);
  if (target - again !== t) t = target - again;
  return t;
}

/** UK date 'YYYY-MM-DD' of a moment. */
export function ukDate(ms: number): string {
  return new Date(ms + londonOffset(ms)).toISOString().slice(0, 10);
}

/** UK time 'HH:MM' of a moment. */
export function ukTime(ms: number): string {
  return new Date(ms + londonOffset(ms)).toISOString().slice(11, 16);
}

/** Y-M-D arithmetic (never adding 86,400,000 ms). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymdParts(ymd);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/** '1' = Monday … '7' = Sunday. */
export function weekday(ymd: string): Weekday {
  const [y, m, d] = ymdParts(ymd);
  const w = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return String(w === 0 ? 7 : w) as Weekday;
}

/** The days from `from` to `to` inclusive (at most 400). */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Down to a 5-minute mark (UK offsets are whole hours, so this is 5 minutes on the clock too). */
export const floorTo5 = (ms: number): number => Math.floor(ms / (5 * MIN)) * 5 * MIN;

/* ── The day ──────────────────────────────────────────────────────────────────── */

/** Overlapping or nested appointments become one block, placed where the one that ends last is. */
export function mergeBlocks(items: Item[]): Block[] {
  const timed = items.filter((i) => !i.allDayBlock && i.end > i.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const blocks: Block[] = [];
  for (const it of timed) {
    const cur = blocks[blocks.length - 1];
    if (cur && it.start < cur.end) {
      if (it.end >= cur.end) {
        cur.end = it.end;
        cur.place = it.place;
      }
      cur.surveys += it.isSurvey ? 1 : 0;
      cur.ids.push(it.id);
    } else {
      blocks.push({ start: it.start, end: it.end, place: it.place, surveys: it.isSurvey ? 1 : 0, ids: [it.id] });
    }
  }
  return blocks;
}

type Anchor = { kind: 'start' | 'end' | 'block'; start: number; end: number; place: Place; surveys: number };

/** Every start time on one day that fits around what's already there. */
export function slotsForDay(x: {
  C: Place;
  minutes: number;
  base: Place;
  items: Item[];
  win: Window;
  s: EngineSettings;
  earliestAllowed: number;
  drive: Drive;
}): DayResult {
  const { C, minutes, base, win, s, earliestAllowed, drive } = x;
  if (x.items.some((i) => i.allDayBlock)) return { cands: [], reason: 'blocked' };

  // Online / phone appointments are wherever he was before (or at home).
  let prev = base;
  const timed = x.items
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start)
    .map((i) => {
      const place = i.place.online ? prev : i.place;
      prev = place;
      return { ...i, place };
    });
  const blocks = mergeBlocks(timed);
  if (blocks.reduce((n, b) => n + b.surveys, 0) >= s.maxPerDay) return { cands: [], reason: 'full' };

  const oneWay = drive(base, C, win.firstStart);
  if (oneWay > s.maxOneWayMins) return { cands: [], reason: 'too_far' };
  if (win.maxFromBase != null && oneWay > win.maxFromBase) return { cands: [], reason: 'too_far_today' };

  const pad = (a: Anchor) => (a.place.unknown ? s.unknownPadMins : 0) * MIN;
  const departOf = (a: Anchor) =>
    a.kind === 'start' ? (win.leaveFrom ?? win.firstStart - HOUR) : a.end + (s.bufferMins + s.coffeeMins) * MIN + pad(a);
  const anchors: Anchor[] = [
    { kind: 'start', start: win.firstStart, end: win.firstStart, place: base, surveys: 0 },
    ...blocks.map((b): Anchor => ({ kind: 'block', start: b.start, end: b.end, place: b.place, surveys: b.surveys })),
    { kind: 'end', start: win.lastFinish, end: win.lastFinish, place: base, surveys: 0 },
  ];
  let existingDrive = 0;
  for (let i = 0; i + 1 < anchors.length; i++) existingDrive += drive(anchors[i].place, anchors[i + 1].place, departOf(anchors[i]));

  const step = Math.max(1, s.stepMins) * MIN;
  const ceilToStep = (t: number) => win.firstStart + Math.ceil((t - win.firstStart) / step) * step;
  const len = minutes * MIN;
  const cands: Candidate[] = [];

  for (let g = 0; g + 1 < anchors.length; g++) {
    const A = anchors[g];
    const B = anchors[g + 1];
    const departA = departOf(A);
    const dIn = drive(A.place, C, departA);
    const arriveBy =
      A.kind === 'start'
        ? win.leaveFrom != null
          ? win.leaveFrom + (dIn + s.arrivalMins) * MIN
          : -Infinity
        : departA + (dIn + s.arrivalMins) * MIN;
    let t = ceilToStep(Math.max(win.firstStart, earliestAllowed, arriveBy));
    while (t + len <= win.lastFinish && (B.kind === 'end' || t + len <= B.start)) {
      const end = t + len;
      const leave = end + s.bufferMins * MIN;
      let dOut: number;
      let ok: boolean;
      let dAB: number;
      if (B.kind === 'end') {
        dOut = drive(C, base, leave);
        ok = win.homeBy == null || leave + dOut * MIN <= win.homeBy;
        dAB = drive(A.place, base, departA);
      } else {
        dOut = drive(C, B.place, leave + s.coffeeMins * MIN);
        ok = leave + (s.coffeeMins + dOut) * MIN + pad(B) + (B.surveys > 0 ? s.arrivalMins * MIN : 0) <= B.start;
        dAB = drive(A.place, B.place, departA);
      }
      const detour = dIn + dOut - dAB;
      if (ok && (blocks.length === 0 || detour <= s.maxDetourMins) && existingDrive + detour <= s.maxDriveMinsPerDay) {
        cands.push({
          start: t,
          end,
          detour,
          driveIn: dIn,
          driveOut: dOut,
          gap: g,
          nearby: blocks.length > 0 && detour <= Math.max(15, 0.25 * (dIn + dOut)),
        });
      }
      t += step; // keep stepping: the rush-hour factor can make a later time fit
    }
  }
  return cands.length ? { cands } : { cands, reason: 'no_gap' };
}

/**
 * The few times shown for a day: the earliest in each gap (least idle time), best detour first,
 * then others at least an hour from every one already chosen. Sorted by start.
 */
export function pickTimes<T extends Candidate>(cands: T[], perDay: number): (T & { recommended: boolean })[] {
  const n = Math.max(0, Math.floor(perDay));
  const byDetour = (a: T, b: T) => a.detour - b.detour || a.start - b.start;
  const firstOf = new Map<number, T>();
  for (const c of cands) {
    const f = firstOf.get(c.gap);
    if (!f || c.start < f.start) firstOf.set(c.gap, c);
  }
  const chosen = [...firstOf.values()].sort(byDetour).slice(0, n);
  const rest = cands.filter((c) => !chosen.includes(c)).sort(byDetour);
  for (const c of rest) {
    if (chosen.length >= n) break;
    if (chosen.every((x) => Math.abs(x.start - c.start) >= HOUR)) chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start).map((c) => ({ ...c, recommended: c.nearby }));
}

/**
 * The first day a customer can book: the next working day, or the one after it once it's past the
 * cut-off. A working day is a day with hours for some surveyor that isn't a bank holiday or closed
 * (Saturday counts).
 */
export function earliestBookableDay(nowMs: number, cutoff: string, isWorkingDay: (ymd: string) => boolean): string {
  const nextWorking = (from: string) => {
    let d = addDays(from, 1);
    for (let i = 0; i < 60 && !isWorkingDay(d); i++) d = addDays(d, 1);
    return d;
  };
  const next = nextWorking(ukDate(nowMs));
  return ukTime(nowMs) < cutoff ? next : nextWorking(next);
}

/* ── Drive times ──────────────────────────────────────────────────────────────── */

/** The Prince of Wales Bridge (M4 Severn crossing). */
export const POW_BRIDGE: LatLng = { lat: 51.5745, lng: -2.7016 };
const WALES_AREAS = ['CF', 'NP', 'SA', 'LD'];
const ENGLAND_AREAS = ['BS', 'BA', 'TA', 'EX', 'TQ', 'PL', 'TR', 'DT', 'BH', 'SP', 'SN'];

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 'NP20 4AB' / 'NP20' → 'NP'. */
export const postcodeArea = (outcode: string | undefined): string => (outcode || '').toUpperCase().match(/^[A-Z]{1,2}/)?.[0] ?? '';

/** Which side of the Severn, by postcode area ('' if the area isn't one either side). */
export function severnSide(outcode: string | undefined): 'wales' | 'england' | null {
  const area = postcodeArea(outcode);
  return WALES_AREAS.includes(area) ? 'wales' : ENGLAND_AREAS.includes(area) ? 'england' : null;
}

/** An outcode in the rural list (an entry with no digits, like 'LD', covers the whole area). */
export function isRural(outcode: string | undefined, list: string[]): boolean {
  const oc = (outcode || '').toUpperCase();
  if (!oc) return false;
  const area = postcodeArea(oc);
  return list.some((r) => (/\d/.test(r) ? r === oc : r === area));
}

/**
 * Our own drive-time estimate in minutes (no rush hour), erring on the long side: straight-line
 * distance (via the Prince of Wales Bridge when it crosses the Severn), × a road factor, at 30 km/h
 * for the first 5 km, 55 for the next 15 and 80 after that, plus 5 minutes.
 */
export function estimateMinutes(
  a: LatLng,
  b: LatLng,
  o: { roadFactor: number; ruralFactor: number; ruralA: boolean; ruralB: boolean; severnA: 'wales' | 'england' | null; severnB: 'wales' | 'england' | null }
): number {
  // By postcode area; otherwise east of -2.70 counts as the English side. Needs at least one known area.
  const sideA = o.severnA ?? (o.severnB ? (a.lng > -2.7 ? 'england' : 'wales') : null);
  const sideB = o.severnB ?? (o.severnA ? (b.lng > -2.7 ? 'england' : 'wales') : null);
  const crosses = !!sideA && !!sideB && sideA !== sideB;
  const d = crosses ? haversineKm(a, POW_BRIDGE) + haversineKm(POW_BRIDGE, b) : haversineKm(a, b);
  const r = d * (o.ruralA || o.ruralB ? o.ruralFactor : o.roadFactor);
  return 5 + 60 * (Math.min(r, 5) / 30 + Math.min(Math.max(r - 5, 0), 15) / 55 + Math.max(r - 20, 0) / 80);
}

/** estimateMinutes between two places (null if either has no coordinates). */
export function placeEstimate(a: Place, b: Place, o: { roadFactor: number; ruralFactor: number; ruralOutcodes: string[] }): number | null {
  if (!a.ll || !b.ll) return null;
  return estimateMinutes(a.ll, b.ll, {
    roadFactor: o.roadFactor,
    ruralFactor: o.ruralFactor,
    ruralA: isRural(a.outcode, o.ruralOutcodes),
    ruralB: isRural(b.outcode, o.ruralOutcodes),
    severnA: severnSide(a.outcode),
    severnB: severnSide(b.outcode),
  });
}

/** Weekday departures inside a rush-hour window. */
export function inRush(ms: number, windows: [string, string][]): boolean {
  if (!windows.length || Number(weekday(ukDate(ms))) > 5) return false;
  const t = ukTime(ms);
  return windows.some(([from, to]) => t >= from && t < to);
}

const homeish = (p: Place) => !!(p.home || p.unknown);
const sameLl = (a: Place, b: Place) =>
  !!a.ll && !!b.ll && Math.abs(a.ll.lat - b.ll.lat) < 1e-5 && Math.abs(a.ll.lng - b.ll.lng) < 1e-5;

/**
 * The drive function the engine uses for one search. Legs to or from the customer come from
 * `customerLeg` (the provider's matrix; null → the estimate × ratio); legs between two existing
 * places are the estimate × ratio (the median provider ÷ estimate over this search's customer legs).
 * Then × rushFactor on weekday rush-hour departures, rounded UP to 5 minutes, at least 10 (5 for the
 * same postcode; 0 for online or the same place).
 */
export function makeDrive(o: {
  customer: Place;
  customerLeg?: (other: Place, toCustomer: boolean) => number | null;
  estimate: (a: Place, b: Place) => number | null;
  ratio: number;
  rushFactor: number;
  rushWindows: [string, string][];
}): Drive {
  return (from, to, departAt) => {
    if (from === to || from.online || to.online || (homeish(from) && homeish(to))) return 0;
    let raw: number | null = null;
    if (from === o.customer || to === o.customer) {
      const other = from === o.customer ? to : from;
      raw = o.customerLeg?.(other, to === o.customer) ?? null;
    }
    raw ??= (o.estimate(from, to) ?? 30) * o.ratio;
    if (o.rushFactor > 1 && inRush(departAt, o.rushWindows)) raw *= o.rushFactor;
    const rounded = Math.ceil(raw / 5 - 1e-9) * 5;
    const samePostcode = (!!from.pc && from.pc === to.pc) || sameLl(from, to);
    return Math.max(samePostcode ? 5 : 10, rounded);
  };
}
