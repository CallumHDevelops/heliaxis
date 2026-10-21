/**
 * The site app's shared shapes: trades, assignment statuses, answers with where each came from,
 * flags, and what the staff screens and the phone are sent. Types and small pure helpers only (type
 * imports at most), so they're safe in the browser, on the server and in scripts/test-site-*.mjs.
 */

export type Trade = 'roofer' | 'scaffolder' | 'electrician' | 'other';
export const TRADES: Trade[] = ['scaffolder', 'roofer', 'electrician', 'other'];
export const isTrade = (v: unknown): v is Trade => TRADES.includes(v as Trade);
export const TRADE_LABEL: Record<Trade, string> = { roofer: 'Roofer', scaffolder: 'Scaffolder', electrician: 'Electrician', other: 'Other trade' };
/** The work in words, for messages and job packs: "the roofing work at 12 High Street". */
export const TRADE_WORK: Record<Trade, string> = { roofer: 'roofing work', scaffolder: 'scaffolding', electrician: 'electrical work', other: 'work' };

/** draft → sent → opened (pack downloaded) → started (first answer or photo) → signed → done · cancelled. */
export type AssignmentStatus = 'draft' | 'sent' | 'opened' | 'started' | 'signed' | 'done' | 'cancelled';
export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  draft: 'Not sent',
  sent: 'Sent',
  opened: 'Opened',
  started: 'Started',
  signed: 'Signed off',
  done: 'Done',
  cancelled: 'Cancelled',
};
/** Still on the job (not cancelled). */
export const isLive = (s: string) => s !== 'cancelled';
/** Answers can still come in (the form isn't signed off). */
export const isOpenForAnswers = (s: string) => s === 'sent' || s === 'opened' || s === 'started';

/** Sign-off stages: roofer and electrician one ("main"); the scaffold two (up, then down). */
export type Stage = 'main' | 'erection' | 'strike';
export const STAGES_FOR: Record<Trade, Stage[]> = { roofer: ['main'], electrician: ['main'], scaffolder: ['erection', 'strike'], other: ['main'] };

export type { CisRate, RateBasis, VatTreatment } from './money';
export type CertRoute = 'eic' | 'eic_single' | 'meiwc' | 'own';

/** Where a value came from: typed, scanned, read from a photo, offered from the roofer, the design or the job, calculated, or remembered from the last job. */
export type Source = 'typed' | 'scan' | 'photo' | 'roofer' | 'design' | 'job' | 'calc' | 'last';
export const SOURCE_LABEL: Record<Source, string> = {
  typed: 'Typed',
  scan: 'Scanned',
  photo: 'Read from photo',
  roofer: 'From the roofer',
  design: 'From the design',
  job: 'From the job',
  calc: 'Calculated',
  last: 'From your last job',
};

/** One answer as stored: the value, its source, when it was given (ISO), and the phone it came from (site_devices id). */
export type Answer = { v: unknown; src?: Source; at?: string; dev?: string };
export type Answers = Record<string, Answer>;

/** Answers as plain values (what the rules read). */
export function valuesOf(a: Answers | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(a ?? {})) if (x && typeof x === 'object' && 'v' in x) out[k] = x.v;
  return out;
}

export type Severity = 'stop' | 'urgent' | 'review';
export const SEVERITY_LABEL: Record<Severity, string> = { stop: 'Fix this', urgent: 'Urgent', review: 'For the office' };

/** A problem raised by an answer (FORMS 5). Stored on site_assignments.flags once raised. */
export type Flag = {
  code: string;
  severity: Severity;
  /** The question it's about. */
  key: string;
  text: string;
  at?: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  note?: string | null;
};

/** A photo the server holds for an assignment, as the rules and the phone see it. */
export type SitePhoto = { id: string; slot: string; client_id?: string | null; taken_at?: string | null; url?: string | null; thumb?: string | null };

/** A serial captured on site (Unit 2): what was read and whether a person confirmed it. */
export type Capture = { key: string; value: string | null; src: Source; confirmed: boolean; unreadable?: boolean; photo_id?: string | null };

/** A Yes/No answer as stored ('yes' / 'no'), or null when it isn't answered yet. */
export const yesNo = (v: unknown): boolean | null => (v === 'yes' || v === true ? true : v === 'no' || v === false ? false : null);

/** "Dave Price" → "Dave". */
export const firstNameOf = (name: string | null | undefined) => (name || '').trim().split(/\s+/)[0] || '';
