import { createHash } from 'node:crypto';
import type { DocTemplate } from './types';

/**
 * Legal sign-off of fixed template wording. Pure. A template with `legalReview` is a draft until an admin approves
 * its exact wording: the approval stores the wording's hash, so changing a word withdraws it. Nothing here decides who
 * may approve (that is the route: admins only) and Metis never approves anything.
 */

export const LEGAL_BANNER = 'DRAFT — awaiting legal review. This wording has not been approved and must not be issued to a customer or signed.';

export type Approval = { approved: boolean; hash: string; issue: string; by: string | null; at: string };
export type Approvals = Record<string, Approval | undefined>;
export type LegalStatus = 'not_required' | 'approved' | 'draft' | 'changed';

const stable = (v: unknown): unknown => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, stable(x)])) : v);

/** A fingerprint of the template's wording and questions (everything the customer sees). */
export const templateHash = (t: DocTemplate) => createHash('sha256').update(JSON.stringify(stable(t))).digest('hex');

export function legalStatus(t: DocTemplate, approvals: Approvals): LegalStatus {
  if (!t.legalReview) return 'not_required';
  const a = approvals[t.code];
  if (!a?.approved) return 'draft';
  return a.hash === templateHash(t) ? 'approved' : 'changed';
}

/** Can this template be signed or issued? Only an approved one, or one that needs no review. */
export const canIssue = (t: DocTemplate, approvals: Approvals) => ['approved', 'not_required'].includes(legalStatus(t, approvals));

/** The template as it should print now: flagged as a draft (a banner on every copy) until its wording is approved. */
export function forPrinting(t: DocTemplate, approvals: Approvals): DocTemplate {
  return canIssue(t, approvals) ? t : { ...t, legalDraft: true };
}

export const WHY_NOT_SIGNABLE = 'This document is still awaiting legal review, so it cannot be signed yet. An admin approves it under Legal templates in HAP.';
