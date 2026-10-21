/**
 * The job pack's shape (built by pack.ts on the server, kept on the phone by offline.ts), and what
 * changed between two of them. Types and pure helpers only: safe in the browser.
 */
import type { Design } from './design';
import type { ElectricianPack } from './electrician-shared';
import type { EicFacts } from './forms/types';
import type { PoNext } from './po-shared';
import type { PoReview, ReturnView, ReviewStatus } from './review-shared';
import type { StripStep } from './strip';
import type { Answers, Flag, Stage, Trade } from './types';

export type PackFile = { id: string; name: string; kind: 'drawing' | 'design' | 'photo'; mime: string; size: number | null; url: string };
export type PackPhoto = { id: string; slot: string; client_id: string | null; taken_at: string | null; thumb: string | null; url: string | null };
export type PackPo = {
  id: string;
  po_number: string;
  status: string;
  net_pence: number;
  vat_pence: number;
  cis_pence: number | null;
  payable_pence: number | null;
  sent_at: string | null;
  paid_on: string | null;
  /** Gone, then changed: the office issues it again. */
  changed_since_sent: boolean;
  labour: Record<string, unknown> | null;
  /** The office's review of the work it's for: waiting, on hold (return to site), green light. */
  review_status?: PoReview | null;
};

export type SitePack = {
  version: string;
  at: string;
  assignment: {
    id: string;
    trade: Trade;
    title: string;
    scope: string | null;
    status: string;
    starts_on: string | null;
    days: number | null;
    note_to_trade: string | null;
    forms: string[];
    cert_route: string;
    schema_version: number;
    rev: number;
    answers: Answers;
    flags: Flag[];
    /** Each with the office's review of it (review-shared.ts); missing on a sign-off made on this phone a moment ago. */
    signoffs: { stage: Stage; signed_at: string; signed_name: string; review?: ReviewStatus }[];
  };
  job: {
    ref: string | null;
    address: string[];
    short: string;
    postcode: string | null;
    map: string;
    customer: { name: string; first: string; phone: string | null };
    install_dates: string[];
    scaffold_up_on: string | null;
    scaffold_down_on: string | null;
    products: string[];
  };
  office: { phone: string; email: string; owner: string | null };
  team: { trade: Trade; title: string; name: string; status: string; status_label: string; starts_on: string | null; me: boolean }[];
  strip: StripStep[];
  access: { label: string; value: string }[];
  system: {
    kwp: number | null;
    panel_count: number | null;
    panel_model: string | null;
    inverter_model: string | null;
    battery_model: string | null;
  };
  design: Design;
  /** Scaffold sides from the survey (front, rear, left, right). */
  sides: string[];
  files: PackFile[];
  /** Files left out, in words ("Design.pdf is over 10 MB: ask the office for it"). */
  skipped: string[];
  photos: PackPhoto[];
  po: PackPo | null;
  reads: { photo_id: string; key: string; status: string; result: unknown }[];
  /** The owner's choices the phone needs (location on photos only when turned on, D18). */
  settings: { locationStamps: boolean };
  /** Returns to site the office has asked for (not withdrawn), oldest first: the Put right form reads them. */
  returns?: ReturnView[];
  /** Electricians: what their forms read from the roofer, the job and the office, and their uploads (electrician-shared.ts). */
  electrician?: ElectricianPack;
  /** Electricians: what the certificate's questions are offered from (site/eic/facts.ts). */
  eic?: EicFacts;
};

/** The reply to a sign-off (POST /api/site/jobs/<id>/signoff): what the done screen shows (P11). */
export type SignoffReply = {
  signoff: { id: string; stage: Stage; signed_at: string; signed_name: string };
  status: string;
  po: PackPo | null;
  /** What happens to the PO next (po-shared.ts poNext). It goes at once when it's on its way: POs aren't held for the evening. */
  po_next: PoNext;
  /** A retry: the first sign-off's result. */
  again: boolean;
};

/** One job on the home screen (GET /api/site/jobs). */
export type SiteJobRow = {
  id: string;
  trade: string;
  title: string;
  status: string;
  status_label: string;
  starts_on: string | null;
  site: string;
  ref: string | null;
  rev: number;
  signed_at: string | null;
  done_at: string | null;
  po: { po_number: string; status: string; payable_pence: number | null; sent_at: string | null; paid_on: string | null; review_status?: PoReview | null } | null;
  /** A return to site waiting for their put right: the newest one's number and fix-by date. */
  put_right?: { n: number; fix_by: string } | null;
};

/** The office's changes between two packs, in words, for "Updated by the office: start date, access notes". */
export function packChanges(was: Pick<SitePack, 'assignment' | 'job' | 'access' | 'files'>, now: Pick<SitePack, 'assignment' | 'job' | 'access' | 'files'>): string[] {
  const out: string[] = [];
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (!same(was.assignment.starts_on, now.assignment.starts_on) || !same(was.assignment.days, now.assignment.days)) out.push('start date');
  if (!same(was.assignment.note_to_trade, now.assignment.note_to_trade)) out.push('notes from the office');
  if (!same(was.assignment.scope, now.assignment.scope)) out.push('the work');
  if (!same(was.access, now.access)) out.push('access notes');
  if (!same(was.job.address, now.job.address) || !same(was.job.postcode, now.job.postcode)) out.push('address');
  if (!same(was.job.install_dates, now.job.install_dates)) out.push('install dates');
  if (!same(was.files.map((f) => f.id), now.files.map((f) => f.id))) out.push('drawings');
  return out;
}

/**
 * A labour PO's state for the trade: "Issued", "Paid 14 Nov", "Being checked" while the office holds
 * it, then the office's review of the work: "On hold: return to site", "Green light".
 */
export function poState(po: { status: string; paid_on: string | null; review_status?: PoReview | null }): string {
  if (po.paid_on) {
    const d = new Date(`${po.paid_on.slice(0, 10)}T12:00:00Z`);
    return `Paid ${d.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' })}`;
  }
  if (po.status === 'draft') return 'Being checked';
  if (po.status === 'cancelled') return 'Cancelled';
  if (po.review_status === 'hold') return 'On hold: return to site';
  if (po.review_status === 'green') return 'Issued · green light';
  return 'Issued';
}
