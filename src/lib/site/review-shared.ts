/**
 * The office's review of what a trade signed, after their PO has gone (the owner, 21 Oct: "give them
 * the auto PO with the wording that protects us… tell them we are going to review the work from the
 * images and results they send and then give them the green light or a return to site required").
 *
 * Every signed submission (the roofer's, the scaffold going up and coming down, the electrician's)
 * starts Waiting for review. The office gives it the Green light, or asks for a Return to site: the
 * written notice of clause 12.3 of the Framework Agreement, put right at the trade's own cost, with a
 * fix-by date (7 working days by default, as the clause gives where safety or the home is affected).
 * The trade signs a short Put right on their phone and it comes back for review. While a return to
 * site is open the PO is on hold (clauses 4.7 and 12.4); the green light lifts it.
 *
 * Types and words only: safe in the browser, on the server and in scripts/test-site-review.mjs.
 */
import { TRADE_LABEL, type Stage, type Trade } from './types';

/** A signed submission's review (site_signoffs.review_status). */
export type ReviewStatus = 'waiting' | 'green' | 'return';
/**
 * A return to site (site_returns.status): open (with the trade), fixed (put right, waiting for
 * review), green (the put right got the green light), again (returned again: a newer one follows),
 * withdrawn (the office reopened the sign-off instead).
 */
export type ReturnStatus = 'open' | 'fixed' | 'green' | 'again' | 'withdrawn';
/** Where a submission is up to, as everyone sees it. */
export type ReviewState = 'waiting' | 'open' | 'fixed' | 'green';
/** The labour PO's review (purchase_orders.review_status): what the PO lists show. */
export type PoReview = 'waiting' | 'hold' | 'green';

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  waiting: 'Waiting for review',
  open: 'Return to site required',
  fixed: 'Put right: waiting for review',
  green: 'Green light',
};
export const PO_REVIEW_LABEL: Record<PoReview, string> = {
  waiting: 'Waiting for review',
  hold: 'On hold: return to site required',
  green: 'Green light',
};

/** Working days to put right (clause 12.3, where safety or the home is affected): the fix-by date's default. */
export const FIX_WORKING_DAYS = 7;

/** One return to site as the office and the phone see it. */
export type ReturnView = {
  id: string;
  n: number;
  stage: Stage;
  signoff_id: string | null;
  what: string;
  photo_ids: string[];
  fix_by: string;
  safety: boolean;
  status: ReturnStatus;
  created_at: string;
  created_by_name: string | null;
  /** When the written notice first reached them. */
  notice_sent_at: string | null;
  fixed_at: string | null;
  fixed_name: string | null;
  fixed_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

/** A return to site from its row (dates as text, arrays as arrays). */
export function returnView(r: Record<string, unknown>): ReturnView {
  const s = (k: string) => (r[k] == null ? null : String(r[k]));
  return {
    id: String(r.id),
    n: Number(r.n) || 1,
    stage: (s('stage') ?? 'main') as Stage,
    signoff_id: s('signoff_id'),
    what: String(r.what ?? ''),
    photo_ids: Array.isArray(r.photo_ids) ? (r.photo_ids as unknown[]).map(String) : [],
    fix_by: String(r.fix_by ?? '').slice(0, 10),
    safety: r.safety === true,
    status: (s('status') ?? 'open') as ReturnStatus,
    created_at: String(r.created_at ?? ''),
    created_by_name: s('created_by_name'),
    notice_sent_at: s('notice_sent_at'),
    fixed_at: s('fixed_at'),
    fixed_name: s('fixed_name'),
    fixed_note: s('fixed_note'),
    reviewed_at: s('reviewed_at'),
    reviewed_by: s('reviewed_by'),
  };
}

/** A return to site that's still live: with the trade, or put right and waiting for the office. */
export const isLiveReturn = (r: { status: ReturnStatus }) => r.status === 'open' || r.status === 'fixed';

/** The newest live return to site for a stage, if there is one. */
export function liveReturnFor<T extends { stage: Stage; n: number; status: ReturnStatus }>(returns: T[], stage: Stage): T | null {
  return returns.filter((r) => r.stage === stage && isLiveReturn(r)).sort((a, b) => b.n - a.n)[0] ?? null;
}

/** A submission's state from its review and its live return to site. */
export function reviewState(status: ReviewStatus | null | undefined, live: { status: ReturnStatus } | null): ReviewState {
  if (status === 'green') return 'green';
  if (status === 'return' && live) return live.status === 'fixed' ? 'fixed' : 'open';
  return 'waiting';
}

/**
 * The PO's review from every submission of the trade's: on hold while any return to site is live,
 * waiting while any is waiting, green once all have the green light. Null before anything's signed.
 */
export function poReviewOf(states: ReviewState[]): PoReview | null {
  if (!states.length) return null;
  if (states.some((s) => s === 'open' || s === 'fixed')) return 'hold';
  if (states.some((s) => s === 'waiting')) return 'waiting';
  return 'green';
}

/** The stage in words for the office ("Scaffold up", "Scaffold down", "Sign-off"). */
export const STAGE_WORDS: Record<Stage, string> = { main: 'Sign-off', erection: 'Scaffold up', strike: 'Scaffold down' };

const REVIEW_WORK: Record<Trade, string> = { roofer: 'roofing', scaffolder: 'scaffolding', electrician: 'electrical', other: 'work' };

/** "Review Dave Price’s roofing photos, HX-0042" (the task made at sign-off, due the next working day). */
export function reviewTaskTitle(name: string, trade: Trade, stage: Stage, ref: string | null): string {
  const what = stage === 'strike' ? 'scaffold-down' : REVIEW_WORK[trade];
  return `Review ${name || TRADE_LABEL[trade]}’s ${what} photos, ${ref || 'the job'}`;
}

/** "Review Dave Price’s put right photos, HX-0042" (made when a Put right is signed). */
export const putRightTaskTitle = (name: string, trade: Trade, ref: string | null) => `Review ${name || TRADE_LABEL[trade]}’s put right photos, ${ref || 'the job'}`;

/** The photo slot a Put right's photos go in: PR:1, PR:2… */
export const putRightSlot = (n: number) => `PR:${n}`;
export const isPutRightSlot = (slot: string) => /^PR:\d{1,3}$/.test(slot);

/** Each signed stage's state from its review and the returns to site (the phone's copy, or the server's rows). */
export function stageStates<R extends { stage: Stage; n: number; status: ReturnStatus }>(
  signoffs: { stage: Stage; review?: ReviewStatus | null }[],
  returns: R[]
): { stage: Stage; state: ReviewState; live: R | null }[] {
  return signoffs.map((s) => {
    const live = liveReturnFor(returns, s.stage);
    return { stage: s.stage, state: reviewState(s.review ?? 'waiting', live), live };
  });
}
