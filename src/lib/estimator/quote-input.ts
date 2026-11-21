/**
 * What the quote form sends, read defensively (it comes from a browser), and the consent wording shown with it. Pure: the route, the tests and the form share it.
 * The browser sends the answers to the questions, never prices: the server re-runs estimate() with the stored settings.
 */
import type { Daytime, Inputs, Shade } from './calc';

/** Bump when any wording below changes: each lead stores the version and the exact words it saw. */
export const CONSENT_VERSION = 'est-2026-11-v1';
export const CONSENT_WORDING = {
  quote: 'By choosing how to get it, you are asking us to send you this estimate and to answer questions about it.',
  emailFollowUps: 'We’ll also send you the odd follow-up about your quote and similar products. Untick if you’d rather we didn’t.',
  whatsappMarketing: 'Send me occasional offers and news from Heliaxis on WhatsApp too.',
} as const;

export type Delivery = 'email' | 'whatsapp' | 'both';
export const DELIVERIES: Delivery[] = ['email', 'whatsapp', 'both'];

export type ConsentRecord = {
  version: string;
  at: string;
  /** What they asked for: the quote itself needs no tick box. */
  delivery: Delivery;
  /** PECR soft opt-in: the box is ticked by default and says how to opt out. */
  emailFollowUps: boolean;
  /** Separate, unticked: WhatsApp offers and news beyond the quote. */
  whatsappMarketing: boolean;
  /** The words on screen when they sent it. */
  wording: typeof CONSENT_WORDING;
};

export function buildConsent(delivery: Delivery, emailFollowUps: boolean, whatsappMarketing: boolean, at = new Date()): ConsentRecord {
  return { version: CONSENT_VERSION, at: at.toISOString(), delivery, emailFollowUps, whatsappMarketing, wording: CONSENT_WORDING };
}

const DAYTIMES: Daytime[] = ['out', 'some', 'home', 'office', 'long', 'always', 'evening'];
const SHADES: Shade[] = ['none', 'some', 'lots'];
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return v !== '' && v != null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export type QuoteInputs = { inputs: Inputs; imp: number; exp: number };

/** The answers behind an estimate, clamped to sensible ranges; null when it is not an estimate at all. */
export function parseQuoteInputs(raw: unknown): QuoteInputs | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const i = (o.inputs && typeof o.inputs === 'object' ? o.inputs : null) as Record<string, unknown> | null;
  if (!i) return null;
  if (i.who !== 'home' && i.who !== 'business') return null;
  const u = (i.usage && typeof i.usage === 'object' ? i.usage : {}) as Record<string, unknown>;
  const kind = u.kind === 'kwh' ? 'kwh' : 'bill';
  const monthly = Array.isArray(i.monthlyPerKwp) && i.monthlyPerKwp.length === 12 ? i.monthlyPerKwp.map((m) => num(m, 0, 400, 0)) : null;
  const battery = i.battery === true;
  const inputs: Inputs = {
    who: i.who,
    yieldKwhPerKwp: num(i.yieldKwhPerKwp, 300, 1500, 900),
    monthlyPerKwp: monthly && monthly.some((m) => m > 0) ? monthly : null,
    shade: SHADES.includes(i.shade as Shade) ? (i.shade as Shade) : 'none',
    usage: kind === 'kwh' ? { kind, value: num(u.value, 0, 1_000_000, 3800) } : { kind, value: num(u.value, 0, 50_000, 120) },
    daytime: DAYTIMES.includes(i.daytime as Daytime) ? (i.daytime as Daytime) : 'some',
    battery,
    ev: i.ev === true,
    heatpump: i.heatpump === true,
    maxPanels: num(i.maxPanels, 0, 300, 0) || undefined,
    sizeMode: i.sizeMode === 'roof' ? 'roof' : 'usage',
    batteryKwh: battery ? num(i.batteryKwh, 1, 30, 5) : undefined,
    phase: i.phase === 'three' ? 'three' : i.phase === 'single' ? 'single' : 'unknown',
  };
  return { inputs, imp: num(o.imp, 1, 100, 26.3), exp: num(o.exp, 0, 60, 12) };
}

/** A UK mobile as 447XXXXXXXXX (what WhatsApp wants), or null if it isn't one. */
export function normaliseUkMobile(v: unknown): string | null {
  let d = String(v ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `44${d.slice(1)}`;
  return /^447\d{9}$/.test(d) ? d : null;
}

export const validEmail = (v: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? '').trim()) && String(v).length <= 200;

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** HX-EST-XXXXXX: six characters with no look-alikes (0/O, 1/I). */
export function makeReference(random: (n: number) => Uint8Array): string {
  const b = random(6);
  return `HX-EST-${Array.from(b, (x) => REF_ALPHABET[x % REF_ALPHABET.length]).join('')}`;
}
export const REFERENCE_PATTERN = /HX-EST-[A-HJ-NP-Z2-9]{6}/;

/** Only a picture we looked up ourselves: the roof lookup's own signed link. */
export function ownImagePath(v: unknown): string | null {
  const s = String(v ?? '');
  return /^\/api\/solar\/image\?lat=-?\d+\.\d+&lng=-?\d+\.\d+&sig=[a-f0-9]{20}$/.test(s) ? s : null;
}
