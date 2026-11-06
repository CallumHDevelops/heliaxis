/**
 * The MCS pack as one thing: the In-House items, the forms to complete, and (apart) the customer's handover pack.
 * This is the headline over the first two. Pure.
 */
import type { SlotView } from './slots';

/** `superseded` is an old revision, never the live one; if one shows it counts as not started. */
export type FormLine = { status: 'none' | 'draft' | 'signed' | 'superseded' };
export type PackHeadline = { complete: number; total: number; waiting: number; missing: number; na: number; words: string };

/**
 * "9 of 14 complete · 2 waiting · 3 missing · 1 not needed". In-House items that apply (not the optional forms, not
 * what is for other technologies) and each form on the job: a signed form is complete, one being filled in is waiting,
 * one not started is missing.
 */
export function packHeadline(views: SlotView[], forms: FormLine[]): PackHeadline {
  const items = views.filter((v) => !v.hidden && v.counted);
  const n = (s: SlotView['state']) => items.filter((v) => v.state === s).length;
  const na = n('na');
  const complete = n('complete') + forms.filter((f) => f.status === 'signed').length;
  const waiting = n('waiting') + forms.filter((f) => f.status === 'draft').length;
  const missing = n('missing') + forms.filter((f) => f.status === 'none' || f.status === 'superseded').length;
  const total = items.filter((v) => v.state !== 'na').length + forms.length;
  const words = [`${complete} of ${total} complete`, waiting && `${waiting} waiting`, missing && `${missing} missing`, na && `${na} not needed`].filter(Boolean).join(' · ');
  return { complete, total, waiting, missing, na, words };
}
