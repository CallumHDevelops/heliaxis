'use client';

import { money } from '@/lib/crm/stages';
import { formatPence, isLate, STATUS_LABEL, type PoStatus } from '@/lib/purchase-orders/money';
import type { OrdersSummary } from '@/lib/purchase-orders/shared';
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
export function StatusChip({ status, late = false }: { status: string; late?: boolean }) {
  return (
    <span className={`po-chip po-chip--${status}${late ? ' is-late' : ''}`}>
      {STATUS_LABEL[status as PoStatus] ?? status}
      {late ? ' · late' : ''}
    </span>
  );
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
    </>
  );
}
