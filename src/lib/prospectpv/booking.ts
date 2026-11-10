/**
 * Booking logic shared by the landing page (live total) and the booking route
 * (validation and the stored quote). The server always recomputes the total
 * from stored prices; the browser's figure is never trusted.
 */
import { maxExtraModules, type HomePattern } from './savings';
import type { ExtraRow, LetterData } from './types';

export type BookingRequest = {
  code: string;
  name: string;
  phone: string;
  email: string;
  bestTime: BestTime;
  consent: boolean;
  usageKwh: number;
  monthlyBill: number;
  homePattern: HomePattern;
  extraModules: number;
  extras: string[];
  /** Honeypot. Real people leave it empty. */
  company?: string;
};

/** Stored verbatim with each booking as the consent record. */
export const CONSENT_TEXT = 'I own this property and I’m happy for Heliaxis to contact me about a survey.';

export const BEST_TIMES = ['Morning', 'Afternoon', 'Evening', 'Any time'] as const;
export type BestTime = (typeof BEST_TIMES)[number];

export type QuoteContext = {
  packagePrice: number;
  baseBatteryKwh: number;
  moduleKwh: number;
  modulePrice: number | null;
  maxKwh: number | null;
  extras: ExtraRow[];
  /** Package claims, so "whole-home backup" isn't sold twice. */
  claims: LetterData['package']['claims'];
};

/** Extras a person can actually add: active, priced, and not already in the package. */
export function availableExtras(ctx: Pick<QuoteContext, 'extras' | 'claims'>): ExtraRow[] {
  return ctx.extras.filter((e) => e.price !== null && !(e.effect.backup && ctx.claims.includes('backup')));
}

export function moduleLimit(ctx: QuoteContext): number {
  return ctx.modulePrice === null ? 0 : maxExtraModules(ctx.baseBatteryKwh, ctx.moduleKwh, ctx.maxKwh);
}

export type Quote = {
  total: number;
  batteryKwh: number;
  diverter: boolean;
  extras: { key: string; name: string; price: number }[];
};

export function quote(ctx: QuoteContext, extraModules: number, extraKeys: string[]): Quote {
  const modules = Math.min(Math.max(0, Math.floor(extraModules) || 0), moduleLimit(ctx));
  const allowed = availableExtras(ctx);
  const chosen = allowed.filter((e) => extraKeys.includes(e.key));
  const extraBattery = chosen.reduce((s, e) => s + (e.effect.battery_kwh ?? 0), 0);
  return {
    total: ctx.packagePrice + modules * (ctx.modulePrice ?? 0) + chosen.reduce((s, e) => s + (e.price ?? 0), 0),
    batteryKwh: ctx.baseBatteryKwh + modules * ctx.moduleKwh + extraBattery,
    diverter: chosen.some((e) => e.effect.diverter),
    extras: chosen.map((e) => ({ key: e.key, name: e.name, price: e.price ?? 0 })),
  };
}

export type FieldErrors = Partial<Record<'name' | 'phone' | 'email' | 'bestTime' | 'consent' | 'form', string>>;

/** UK numbers: 10–11 digits from 0, or +44 followed by 9–10 digits. */
export function normaliseUkPhone(raw: string): string | null {
  const s = raw.replace(/[\s()-]/g, '');
  if (/^0\d{9,10}$/.test(s)) return s;
  if (/^\+44\d{9,10}$/.test(s)) return `0${s.slice(3)}`;
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateBooking(
  raw: unknown,
  inputs: { usage_min: number; usage_max: number; bill_min: number; bill_max: number },
): { ok: true; value: BookingRequest } | { ok: false; errors: FieldErrors } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (k: string, max = 200) => (typeof r[k] === 'string' ? (r[k] as string).trim().slice(0, max) : '');
  const num = (k: string) => (typeof r[k] === 'number' && Number.isFinite(r[k]) ? (r[k] as number) : Number.NaN);
  const errors: FieldErrors = {};

  const name = str('name', 120);
  if (name.length < 2) errors.name = 'Enter your full name.';
  const phone = normaliseUkPhone(str('phone', 30));
  if (!phone) errors.phone = 'Enter a UK phone number, like 07700 900123.';
  const email = str('email', 254).toLowerCase();
  if (!EMAIL.test(email)) errors.email = 'Enter an email address, like name@example.com.';
  const bestTime = str('bestTime') as BestTime;
  if (!BEST_TIMES.includes(bestTime)) errors.bestTime = 'Choose a time for us to call.';
  if (r.consent !== true) errors.consent = 'Tick the box to confirm you own the property and are happy for us to contact you.';

  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const usage = num('usageKwh');
  const bill = num('monthlyBill');
  const pattern = r.homePattern;
  if (Number.isNaN(usage) || Number.isNaN(bill) || !(pattern === 'out' || pattern === 'some' || pattern === 'all')) {
    errors.form = 'Something went wrong with the calculator values. Refresh the page and try again.';
  }
  const extras = Array.isArray(r.extras) ? r.extras.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      code: str('code', 16),
      name,
      phone: phone!,
      email,
      bestTime,
      consent: true,
      usageKwh: clamp(usage, inputs.usage_min, inputs.usage_max),
      monthlyBill: clamp(bill, inputs.bill_min, inputs.bill_max),
      homePattern: pattern as HomePattern,
      extraModules: Math.max(0, Math.floor(num('extraModules')) || 0),
      extras,
      company: str('company', 200),
    },
  };
}
