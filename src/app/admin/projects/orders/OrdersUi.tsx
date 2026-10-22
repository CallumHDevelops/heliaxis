'use client';

import { money } from '@/lib/crm/stages';
import { formatPence, isLate, STATUS_LABEL, type PoStatus } from '@/lib/purchase-orders/money';
import type { OrdersSummary, PurchaseOrder } from '@/lib/purchase-orders/shared';
import { PO_REVIEW_LABEL } from '@/lib/site/review-shared';
import { shortDate } from '../../crm/crm-shared';

/** Small pieces shared by the job's Orders tab, the order sheet and the Purchase orders page. */

/** GET / POST / PATCH / DELETE JSON, with the API's error message (or `fallback`) thrown on failure. */
export async function api<T>(url: string, init: { method?: string; body?: unknown } = {}, fallback = 'That didn’t work. Try again.'): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: init.method ?? 'GET',
      cache: 'no-store',
      ...(init.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new Error('Couldn’t reach the server. Check your connection and try again.');
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((d as { error?: string }).error || fallback), { status: r.status, data: d });
  return d as T;
}

/** The status in its colour: Draft grey, Sent amber, Confirmed blue, Delivered green, Cancelled red. Late when it's open and past its date. */
export function StatusChip({ status, late = false, labour = false }: { status: string; late?: boolean; labour?: boolean }) {
  // A labour PO that's still a draft is held for the office; once issued it's "Issued".
  const label = labour && status === 'draft' ? 'Held' : labour && status === 'sent' ? 'Issued' : (STATUS_LABEL[status as PoStatus] ?? status);
  return (
    <span className={`po-chip po-chip--${status}${late ? ' is-late' : ''}`}>
      {label}
      {late ? ' · late' : ''}
    </span>
  );
}

const showsReview = (o: Pick<PurchaseOrder, 'kind' | 'status' | 'review_status'>) => o.kind === 'labour' && !!o.review_status && o.status !== 'cancelled' && o.status !== 'draft';

/**
 * A labour PO's review of the work, beside its status on the PO sheet: "On hold: return to site
 * required" in red, "Green light" in green, "Waiting for review" quiet. Nothing for supply orders,
 * held drafts or cancelled POs.
 */
export function ReviewChip({ o }: { o: Pick<PurchaseOrder, 'kind' | 'status' | 'review_status'> }) {
  if (!showsReview(o)) return null;
  return <span className={`po-chip po-chip--review-${o.review_status}`}>{PO_REVIEW_LABEL[o.review_status!]}</span>;
}

/** The same in a list row, as a line under who it's for (the status column is too narrow for the words). */
export function ReviewLine({ o }: { o: Pick<PurchaseOrder, 'kind' | 'status' | 'review_status'> }) {
  if (!showsReview(o)) return null;
  return <small className={`po-review po-review--${o.review_status}`}>{PO_REVIEW_LABEL[o.review_status!]}</small>;
}

/** Kit orders and labour POs together (the tab's count). */
export const ordersCount = (s: OrdersSummary | null | undefined) => (s ? s.count + (s.labour?.count ?? 0) : 0);

/** A labour PO's date column: when it was signed for, and paid. */
export function labourWhen(o: Pick<PurchaseOrder, 'labour' | 'paid_on'>): string {
  if (o.paid_on) return `Paid ${shortDate(o.paid_on)}`;
  const at = o.labour?.signed?.at;
  return at ? `Signed ${shortDate(at.slice(0, 10))}` : 'Not signed';
}

/** "Needed Tue 3 Nov", "Late: needed Mon 2 Nov", or "No date". */
export function neededWords(o: { status: string; required_by: string | null }, today: string): string {
  if (!o.required_by) return 'No date';
  const day = shortDate(o.required_by);
  if (o.status === 'delivered' || o.status === 'cancelled') return `Needed ${day}`;
  return isLate(o, today) ? `Late: needed ${day}` : o.required_by === today ? 'Needed today' : `Needed ${day}`;
}

/**
 * "Kit ordered £4,210.00 ex VAT · 2 open · next delivery Tue 3 Nov" (the Overview tile and the
 * Orders tab). Drafts are counted separately: they haven't gone to anyone yet.
 */
export function KitOrdered({ s, today, value }: { s: OrdersSummary; today: string; value?: number | null }) {
  const late = !!s.nextDelivery && !!today && s.nextDelivery < today;
  const labour = s.labour?.count ? (
    <small className="po-kit__sub">
      Labour {formatPence(s.labour.payable)} to pay
      {s.labour.held ? ` · ${s.labour.held} held for you to check` : ''}
    </small>
  ) : null;
  if (!s.count) return labour;
  return (
    <>
      <span className="po-kit">
        <b>Kit ordered {formatPence(s.orderedNet)}</b> <span className="crm-muted">ex VAT</span>
      </span>
      <small className="po-kit__sub">
        {[
          s.open ? `${s.open} open` : s.count ? 'none open' : '',
          s.drafts ? `${s.drafts} draft${s.drafts === 1 ? '' : 's'}` : '',
          s.nextDelivery ? (late ? `late: needed ${shortDate(s.nextDelivery)}` : `next delivery ${shortDate(s.nextDelivery)}`) : '',
          value ? `job value ${money(value)} inc VAT` : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </small>
      {labour}
    </>
  );
}
