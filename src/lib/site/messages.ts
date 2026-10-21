/**
 * What the site app says to trades: the job pack email and WhatsApp, the PO raised, the scaffold
 * strike photos, "you're clear to start" and "don't use the scaffold yet", the words for "WhatsApp
 * from my phone", and when a message goes (the evening rule, D19). Pure: the Site tab previews with
 * it, server.ts sends with it, and scripts/test-site-templates.mjs checks it.
 */
import { isQuiet, nextClock } from '../whatsapp/schedule';
import { TRADE_WORK, type Trade } from './types';

export const OFFICE_PHONE = '01633 965205';

/* ── When a message goes (D19) ───────────────────────────────────────────────── */

/**
 * The settings that decide it: quiet hours from the WhatsApp settings, and the late-night rule
 * (lateRule, lateFromMin, lateSendAtMin) once the WhatsApp Send later work is in. Optional, so this
 * works with either version of the settings.
 */
export type EveningSettings = { quietFromMin: number; quietToMin: number; lateRule?: unknown; lateFromMin?: unknown; lateSendAtMin?: unknown };

/** The late-night rule is in the settings (wf-send-later): after 20:30 → 07:00 the next morning. */
const hasLateRule = (s: EveningSettings): s is EveningSettings & { lateRule: boolean; lateFromMin: number; lateSendAtMin: number } =>
  typeof s.lateRule === 'boolean' && typeof s.lateFromMin === 'number' && typeof s.lateSendAtMin === 'number';

/**
 * When a message staff send now really goes. With the late-night rule: at or after 20:30 (or in the
 * small hours) it waits for 07:00; the rule turned off sends at once. Before that rule exists, the
 * quiet hours (21:00 → 08:45 by default) do the same job. Email and WhatsApp alike.
 */
export function sendAfter(now: Date, s: EveningSettings): Date {
  if (hasLateRule(s)) {
    if (!s.lateRule || !isQuiet(now, { quietFromMin: s.lateFromMin, quietToMin: s.lateSendAtMin })) return now;
    return nextClock(now, s.lateSendAtMin);
  }
  if (!isQuiet(now, s)) return now;
  return nextClock(now, s.quietToMin);
}

const ukTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** "07:00" (UK) for "Waiting to send at 07:00". */
export const sendTimeWords = (at: Date | string) => ukTime.format(new Date(at));

/* ── Words shared by every message ───────────────────────────────────────────── */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Tuesday 3 November" for a YYYY-MM-DD day. */
export function dayWords(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "roofing work on Tuesday 3 November", or without the day when there's no start date. */
export function workWords(trade: Trade, startsOn?: string | null): string {
  return startsOn && /^\d{4}-\d{2}-\d{2}$/.test(startsOn) ? `${TRADE_WORK[trade]} on ${dayWords(startsOn)}` : TRADE_WORK[trade];
}

/** The site in a few words: the first line of the address and the postcode ("12 High Street, NP20 4AB"). */
export function siteShort(address: string | null | undefined, postcode: string | null | undefined): string {
  const first = (address || '').split(/\n|,/)[0].trim();
  const pc = (postcode || '').trim().toUpperCase();
  if (!first) return pc;
  return pc && !first.toUpperCase().includes(pc) ? `${first}, ${pc}` : first;
}

/** What a message about one assignment needs. */
export type About = {
  firstName: string;
  trade: Trade;
  startsOn?: string | null;
  site: string;
  jobRef: string | null;
  link: string;
};

/* ── The job pack (1E) ───────────────────────────────────────────────────────── */

/** {{1}}–{{4}} of site_job_pack: first name, the work and day, the site, the link. */
export const jobPackParams = (a: About) => [a.firstName || 'there', workWords(a.trade, a.startsOn), a.site, a.link];

/** The same words as the WhatsApp template, for "Copy link" and "WhatsApp from my phone". */
export const jobPackText = (a: About) =>
  `Hi ${a.firstName || 'there'}, Heliaxis has booked you for the ${workWords(a.trade, a.startsOn)} at ${a.site}. Your job pack, with everything you need on site, is here: ${a.link} Please open it before you set off and add it to your home screen so it works with no signal. Any questions, call us on ${OFFICE_PHONE}.`;

/** https://wa.me/<number>?text=…: opens the staff member's own WhatsApp, no template needed. */
export const clickToChat = (waId: string | null | undefined, text: string) => `https://wa.me/${waId ?? ''}?text=${encodeURIComponent(text)}`;

export type EmailText = { subject: string; title: string; paragraphs: string[]; cta?: { href: string; label: string } };

const SUBJECT_WORK: Record<Trade, string> = { roofer: 'roofing', scaffolder: 'scaffolding', electrician: 'electrics', other: 'work' };

/** "Job pack: roofing at 12 High Street, NP20 4AB (HX-0042)". */
export function jobPackEmail(a: About & { days?: number | null; note?: string | null }): EmailText {
  const what = SUBJECT_WORK[a.trade];
  const when = a.startsOn ? `${dayWords(a.startsOn)}${a.days && a.days > 1 ? ` (${a.days} days)` : ''}` : 'to be confirmed';
  return {
    subject: `Job pack: ${what} at ${a.site}${a.jobRef ? ` (${a.jobRef})` : ''}`,
    title: 'Your Heliaxis job pack',
    paragraphs: [
      `Hi ${a.firstName || 'there'},`,
      `Heliaxis has booked you for the ${TRADE_WORK[a.trade]} at ${a.site}. Starting: ${when}.`,
      ...(a.note?.trim() ? [`From the office: ${a.note.trim()}`] : []),
      'Install the app, then open your job pack before you set off. Everything you need is in it: the address, access, the drawings and design, and the questions and photos for your sign-off. Once it’s on your phone it works with no signal.',
      `Any questions, call us on ${OFFICE_PHONE}.`,
    ],
    cta: { href: a.link, label: 'Open your job pack' },
  };
}

/* ── The PO (1I) ─────────────────────────────────────────────────────────────── */

/** {{1}}–{{4}} of site_po_raised: first name, the work, the site, the PO number. */
export const poParams = (a: Omit<About, 'link' | 'startsOn'>, poNumber: string) => [a.firstName || 'there', TRADE_WORK[a.trade], a.site, poNumber];

/* ── The scaffold (1H) ───────────────────────────────────────────────────────── */

/** {{1}}–{{3}} of site_strike_photos: first name, the site, the link. */
export const strikeParams = (a: About) => [a.firstName || 'there', a.site, a.link];
/** {{1}}–{{3}} of site_clear_to_start: first name, the site, the link. */
export const clearToStartParams = (a: About) => [a.firstName || 'there', a.site, a.link];
/** {{1}}–{{2}} of site_scaffold_hold: first name, the site. */
export const scaffoldHoldParams = (a: Pick<About, 'firstName' | 'site'>) => [a.firstName || 'there', a.site];

export const strikeEmail = (a: About): EmailText => ({
  subject: `Scaffold down at ${a.site}: photos please${a.jobRef ? ` (${a.jobRef})` : ''}`,
  title: 'Photos once the scaffold is down',
  paragraphs: [
    `Hi ${a.firstName || 'there'},`,
    `When the scaffold at ${a.site} comes down, please take the photos in your job pack, from the same spots as when it went up, so we both have a record.`,
    'It only takes a minute, and it protects you as much as us.',
    'Thanks, the Heliaxis team.',
  ],
  cta: { href: a.link, label: 'Open your job pack' },
});

export const clearToStartText = (a: About) =>
  `Hi ${a.firstName || 'there'}, the scaffold at ${a.site} is up and tagged, so you’re clear to start. Your job pack is here: ${a.link} Any questions, call us on ${OFFICE_PHONE}.`;
export const scaffoldHoldText = (a: Pick<About, 'firstName' | 'site'>) =>
  `Hi ${a.firstName || 'there'}, please don’t use the scaffold at ${a.site} yet: it hasn’t been tagged. We’ll message you as soon as it’s safe. Any questions, call us on ${OFFICE_PHONE}.`;

export const clearToStartEmail = (a: About): EmailText => ({
  subject: `Clear to start at ${a.site}${a.jobRef ? ` (${a.jobRef})` : ''}`,
  title: 'The scaffold is up and tagged',
  paragraphs: [clearToStartText(a).replace(` Your job pack is here: ${a.link}`, '')],
  cta: { href: a.link, label: 'Open your job pack' },
});
export const scaffoldHoldEmail = (a: About): EmailText => ({
  subject: `Don’t use the scaffold at ${a.site} yet${a.jobRef ? ` (${a.jobRef})` : ''}`,
  title: 'The scaffold isn’t tagged yet',
  paragraphs: [scaffoldHoldText(a)],
});

/* ── The kinds, with their template and dedupe key ───────────────────────────── */

export type MessageKind = 'job_pack' | 'po' | 'strike' | 'clear_to_start' | 'scaffold_hold';
export const KIND_TEMPLATE: Record<MessageKind, string> = {
  job_pack: 'site_job_pack',
  po: 'site_po_raised',
  strike: 'site_strike_photos',
  clear_to_start: 'site_clear_to_start',
  scaffold_hold: 'site_scaffold_hold',
};
export const KIND_LABEL: Record<MessageKind, string> = {
  job_pack: 'Job pack',
  po: 'PO',
  strike: 'Strike photos',
  clear_to_start: 'Clear to start',
  scaffold_hold: 'Don’t use the scaffold',
};
