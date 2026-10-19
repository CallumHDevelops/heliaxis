/**
 * Survey booking settings: types, the owner's defaults (owner-settings, 19 Oct 2026) and
 * cleanBookingSettings. Stored in cms_kv under 'survey-booking'. Safe for server and client code,
 * and no runtime imports, so the test scripts can load it straight into node.
 */

export type Weekday = '1' | '2' | '3' | '4' | '5' | '6' | '7'; // 1 = Monday
/** Time ON SITE: the first survey starts no earlier than `start` and the last finishes by `end`. null = no surveys. */
export type DayHours = { start: string; end: string; maxFromBaseMins?: number } | null;

export type Surveyor = {
  /** Lower-case Outlook address = survey_bookings.surveyor_key. */
  key: string;
  /** First name: shown to customers in the confirmation only. */
  name: string;
  /** Matched to profiles.email at run time. */
  profileEmail: string;
  /** Every day starts and ends here. */
  basePostcode: string;
  baseLabel: string;
  hours: Record<Weekday, DayHours>;
  /** Advanced, off by default: don't set off before this. */
  leaveHomeFrom?: string;
  /** Advanced, off by default: be back home by this. */
  homeBy?: string;
};

export type InstallBlocks = 'never' | 'if_on_team_or_empty' | 'always';
export type TravelProvider = 'auto' | 'google' | 'estimate';

export type BookingAdvanced = {
  /** Customers can move or cancel online up to this long before. */
  changeNoticeHours: number;
  horizonDays: number;
  /** England & Wales, gov.uk. */
  skipBankHolidays: boolean;
  arrivalMins: number;
  /** Each side of an appointment with no location. */
  unknownPadMins: number;
  tentativeBlocks: boolean;
  /** Including the drives from and back home. */
  maxDriveMinsPerDay: number;
  /** From home; further → "we'll call you". */
  maxOneWayMins: number;
  /** Extra driving one booking may add (not on an empty day). */
  maxDetourMins: number;
  stepMins: number;
  /** Times shown per day. */
  timesPerDay: number;
  holdMins: number;
  /** Or the cut-off before the day, whichever is first. */
  requestExpiryHours: number;
  rushFactor: number;
  /** Weekdays only. */
  rushWindows: [string, string][];
  roadFactor: number;
  ruralFactor: number;
  ruralOutcodes: string[];
  installBlocks: InstallBlocks;
  /** '' = MS_MAILBOX. */
  installMailbox: string;
  /** false: the team sees "Busy". */
  showSubjects: boolean;
  /** auto = Google if the key is set. */
  travelProvider: TravelProvider;
  googleDailyElements: number;
  /** Top-of-form message. */
  intro: string;
};

export type BookingSettings = {
  /** false until he's checked it (the to-do asks him to, then switch on). */
  enabled: boolean;
  /** 'request' = "Ask me to confirm" (D12). */
  mode: 'request' | 'instant';
  durations: { solar: number; ashp: number; solar_ashp: number };
  surveyors: Surveyor[];
  /** After each appointment. */
  bufferMins: number;
  /** Between appointments. */
  coffeeMins: number;
  maxPerDay: number;
  /** After this, the next working day is closed. */
  cutoffTime: string;
  closedDates: string[];
  /** Solar (and solar + heat pump) surveys end before sunset; heat pump only is exempt. */
  solarBeforeSunset: boolean;
  advanced: BookingAdvanced;
};

export const WEEKDAYS: Weekday[] = ['1', '2', '3', '4', '5', '6', '7'];
export const WEEKDAY_NAMES: Record<Weekday, string> = {
  '1': 'Monday',
  '2': 'Tuesday',
  '3': 'Wednesday',
  '4': 'Thursday',
  '5': 'Friday',
  '6': 'Saturday',
  '7': 'Sunday',
};

export const CALLUM: Surveyor = {
  key: 'callum@heliaxis.co.uk',
  name: 'Callum',
  profileEmail: 'callum@heliaxis.co.uk',
  basePostcode: 'NP26 5ST',
  baseLabel: 'Home',
  hours: {
    '1': { start: '08:30', end: '18:00' },
    '2': { start: '08:30', end: '18:00' },
    '3': { start: '08:30', end: '18:00' },
    '4': { start: '08:30', end: '18:00' },
    '5': { start: '08:30', end: '18:00' },
    '6': { start: '08:30', end: '12:00', maxFromBaseMins: 30 },
    '7': null,
  },
};

export const DEFAULT_ADVANCED: BookingAdvanced = {
  changeNoticeHours: 24,
  horizonDays: 21,
  skipBankHolidays: true,
  arrivalMins: 0,
  unknownPadMins: 15,
  tentativeBlocks: true,
  maxDriveMinsPerDay: 240,
  maxOneWayMins: 90,
  maxDetourMins: 75,
  stepMins: 15,
  timesPerDay: 4,
  holdMins: 10,
  requestExpiryHours: 48,
  rushFactor: 1.2,
  rushWindows: [
    ['07:30', '09:30'],
    ['16:00', '18:00'],
  ],
  roadFactor: 1.3,
  ruralFactor: 1.4,
  ruralOutcodes: [
    'NP4', 'NP7', 'NP8', 'NP11', 'NP12', 'NP13', 'NP22', 'NP23', 'NP24', 'NP25',
    'CF37', 'CF38', 'CF39', 'CF40', 'CF41', 'CF42', 'CF43', 'CF44', 'CF45', 'CF46', 'CF47', 'CF48',
    'LD', 'HR', 'SA',
  ],
  installBlocks: 'if_on_team_or_empty',
  installMailbox: '',
  showSubjects: false,
  travelProvider: 'auto',
  googleDailyElements: 300,
  intro: '',
};

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  enabled: false,
  mode: 'request',
  durations: { solar: 60, ashp: 60, solar_ashp: 90 },
  surveyors: [CALLUM],
  bufferMins: 15,
  coffeeMins: 15,
  maxPerDay: 4,
  cutoffTime: '15:00',
  closedDates: [],
  solarBeforeSunset: true,
  advanced: DEFAULT_ADVANCED,
};

/* ── Cleaning (anything unknown or out of range falls back to the default) ─────── */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTCODE = /^[A-Z]{1,2}(\d[A-Z\d]?)?$/;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
function num(v: unknown, d: number, min: number, max: number, int = true) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return d;
  const x = int ? Math.round(n) : Math.round(n * 100) / 100;
  return Math.min(max, Math.max(min, x));
}
const hhmm = (v: unknown, d: string) => (typeof v === 'string' && HHMM.test(v.trim()) ? v.trim() : d);
const optHhmm = (v: unknown) => (typeof v === 'string' && HHMM.test(v.trim()) ? v.trim() : undefined);
const text = (v: unknown, d: string, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/** "np26 5st" → "NP26 5ST". */
export function formatPostcode(pc: string): string {
  const k = pc.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return k.length > 3 ? `${k.slice(0, -3)} ${k.slice(-3)}` : k;
}

function cleanHours(v: unknown, d: DayHours): DayHours {
  if (v === null) return null;
  if (v === undefined) return d;
  const h = obj(v);
  const start = optHhmm(h.start);
  const end = optHhmm(h.end);
  if (!start || !end || start >= end) return d;
  const out: NonNullable<DayHours> = { start, end };
  if (h.maxFromBaseMins != null && h.maxFromBaseMins !== '') out.maxFromBaseMins = num(h.maxFromBaseMins, 30, 5, 240);
  return out;
}

function cleanSurveyor(v: unknown, fallback: Surveyor): Surveyor | null {
  const o = obj(v);
  const key = text(o.key, '', 200).toLowerCase();
  if (!EMAIL.test(key)) return null;
  const pc = text(o.basePostcode, '', 10);
  const raw = obj(o.hours);
  const hours = {} as Record<Weekday, DayHours>;
  for (const w of WEEKDAYS) hours[w] = cleanHours(raw[w], fallback.hours[w]);
  const s: Surveyor = {
    key,
    name: text(o.name, '', 60).split(/\s+/)[0] || key.split('@')[0],
    profileEmail: (EMAIL.test(text(o.profileEmail, '', 200)) ? text(o.profileEmail, '', 200) : key).toLowerCase(),
    basePostcode: POSTCODE.test(pc) ? formatPostcode(pc) : fallback.basePostcode,
    baseLabel: text(o.baseLabel, fallback.baseLabel, 40) || 'Home',
    hours,
  };
  const leave = optHhmm(o.leaveHomeFrom);
  const home = optHhmm(o.homeBy);
  if (leave) s.leaveHomeFrom = leave;
  if (home) s.homeBy = home;
  return s;
}

const STEPS = [5, 10, 15, 20, 30, 60];

function cleanAdvanced(v: unknown): BookingAdvanced {
  const a = obj(v);
  const d = DEFAULT_ADVANCED;
  const windows = Array.isArray(a.rushWindows)
    ? a.rushWindows
        .map((w): [string, string] | null => {
          if (!Array.isArray(w)) return null;
          const from = optHhmm(w[0]);
          const to = optHhmm(w[1]);
          return from && to && from < to ? [from, to] : null;
        })
        .filter((w): w is [string, string] => !!w)
        .slice(0, 6)
    : d.rushWindows;
  const outcodes = Array.isArray(a.ruralOutcodes)
    ? [...new Set(a.ruralOutcodes.map((x) => String(x || '').toUpperCase().replace(/\s+/g, '')).filter((x) => OUTCODE.test(x)))].slice(0, 200)
    : d.ruralOutcodes;
  const mailbox = text(a.installMailbox, '', 200).toLowerCase();
  return {
    changeNoticeHours: num(a.changeNoticeHours, d.changeNoticeHours, 0, 168),
    horizonDays: num(a.horizonDays, d.horizonDays, 1, 60),
    skipBankHolidays: bool(a.skipBankHolidays, d.skipBankHolidays),
    arrivalMins: num(a.arrivalMins, d.arrivalMins, 0, 60),
    unknownPadMins: num(a.unknownPadMins, d.unknownPadMins, 0, 90),
    tentativeBlocks: bool(a.tentativeBlocks, d.tentativeBlocks),
    maxDriveMinsPerDay: num(a.maxDriveMinsPerDay, d.maxDriveMinsPerDay, 30, 720),
    maxOneWayMins: num(a.maxOneWayMins, d.maxOneWayMins, 10, 300),
    maxDetourMins: num(a.maxDetourMins, d.maxDetourMins, 0, 300),
    stepMins: STEPS.includes(num(a.stepMins, d.stepMins, 5, 60)) ? num(a.stepMins, d.stepMins, 5, 60) : d.stepMins,
    timesPerDay: num(a.timesPerDay, d.timesPerDay, 1, 12),
    holdMins: num(a.holdMins, d.holdMins, 3, 30),
    requestExpiryHours: num(a.requestExpiryHours, d.requestExpiryHours, 2, 168),
    rushFactor: num(a.rushFactor, d.rushFactor, 1, 2, false),
    rushWindows: windows,
    roadFactor: num(a.roadFactor, d.roadFactor, 1, 2, false),
    ruralFactor: num(a.ruralFactor, d.ruralFactor, 1, 2.5, false),
    ruralOutcodes: outcodes,
    installBlocks: oneOf(a.installBlocks, ['never', 'if_on_team_or_empty', 'always'] as const, d.installBlocks),
    installMailbox: EMAIL.test(mailbox) ? mailbox : '',
    showSubjects: bool(a.showSubjects, d.showSubjects),
    travelProvider: oneOf(a.travelProvider, ['auto', 'google', 'estimate'] as const, d.travelProvider),
    googleDailyElements: num(a.googleDailyElements, d.googleDailyElements, 0, 5000),
    intro: text(a.intro, d.intro, 600),
  };
}

/** Whatever was stored (or sent from the settings screen) → full, valid settings. */
export function cleanBookingSettings(raw: unknown): BookingSettings {
  const o = obj(raw);
  const d = DEFAULT_BOOKING_SETTINGS;
  const dur = obj(o.durations);
  let surveyors: Surveyor[] = d.surveyors;
  if (Array.isArray(o.surveyors)) {
    surveyors = [];
    for (const raw of o.surveyors.slice(0, 10)) {
      const s = cleanSurveyor(raw, CALLUM);
      if (s && !surveyors.some((x) => x.key === s.key)) surveyors.push(s);
    }
  }
  const closed = Array.isArray(o.closedDates)
    ? [...new Set(o.closedDates.map((x) => String(x || '').trim()).filter((x) => YMD.test(x)))].sort().slice(-400)
    : d.closedDates;
  return {
    enabled: bool(o.enabled, d.enabled),
    mode: oneOf(o.mode, ['request', 'instant'] as const, d.mode),
    durations: {
      solar: num(dur.solar, d.durations.solar, 15, 480),
      ashp: num(dur.ashp, d.durations.ashp, 15, 480),
      solar_ashp: num(dur.solar_ashp, d.durations.solar_ashp, 15, 480),
    },
    surveyors,
    bufferMins: num(o.bufferMins, d.bufferMins, 0, 120),
    coffeeMins: num(o.coffeeMins, d.coffeeMins, 0, 120),
    maxPerDay: num(o.maxPerDay, d.maxPerDay, 1, 12),
    cutoffTime: hhmm(o.cutoffTime, d.cutoffTime),
    closedDates: closed,
    solarBeforeSunset: bool(o.solarBeforeSunset, d.solarBeforeSunset),
    advanced: cleanAdvanced(o.advanced),
  };
}
