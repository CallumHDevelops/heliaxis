'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatPence, isLate } from '@/lib/purchase-orders/money';
import { summariseOrders, type PoListRow } from '@/lib/purchase-orders/shared';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { api, KitOrdered, neededWords, StatusChip } from './OrdersUi';
import { OrderSheet } from './OrderSheet';
import './orders.css';

/** "+ Add" on the Overview's Purchase orders tile: open a new order once the tab is showing. */
let newPending: string | null = null;
const NEW_ORDER = 'hx:new-purchase-order';
export function askNewOrder(projectId: string) {
  newPending = projectId;
  window.dispatchEvent(new CustomEvent(NEW_ORDER, { detail: { projectId } }));
}

/**
 * The job record's Orders tab (CRM and Projects): this job's purchase orders (number, supplier,
 * status, required by, total ex VAT) with "Kit ordered" above them, and New purchase order. A row
 * opens the order sheet; any change there reads the list again and tells the page (`onChanged`),
 * so the Overview's summary and the timeline follow.
 */
export function OrdersTab({ projectId, today, myName, onChanged }: { projectId: string; today: string; myName: string | null; onChanged: () => void }) {
  const [rows, setRows] = useState<PoListRow[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<{ id: string | null } | null>(() => {
    // Asked for from the Overview just before this tab opened.
    if (newPending !== projectId) return null;
    newPending = null;
    return { id: null };
  });

  const load = useCallback(async () => {
    try {
      const d = await api<{ ready: boolean; orders: PoListRow[] }>(`/api/crm/purchase-orders?project=${projectId}`);
      setRows(d.orders);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the orders.');
      return false;
    }
  }, [projectId]);
  const { reload } = useLiveRefresh(load, 60_000);

  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent<{ projectId?: string }>).detail?.projectId !== projectId) return;
      newPending = null;
      setOpen({ id: null });
    };
    window.addEventListener(NEW_ORDER, on);
    return () => window.removeEventListener(NEW_ORDER, on);
  }, [projectId]);

  const summary = rows ? summariseOrders(rows) : null;
  return (
    <div className="po-tab">
      <div className="po-tab__head">
        <div>{summary && summary.count > 0 ? <KitOrdered s={summary} today={today} /> : <span className="crm-muted">Order the kit for this job from your suppliers.</span>}</div>
        <button type="button" className="crm-btn crm-btn--solar" onClick={() => setOpen({ id: null })}>
          + New purchase order
        </button>
      </div>
      {error && <p className="crm-banner crm-banner--err">{error}</p>}
      {!rows ? (
        !error && <p className="crm-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="po-emptytab">No purchase orders for this job yet.</p>
      ) : (
        <div className="po-list" role="list" aria-label="Purchase orders for this job">
          <div className="po-row po-row--head" aria-hidden="true">
            <span>PO</span>
            <span>Supplier</span>
            <span>Status</span>
            <span>Required by</span>
            <span className="po-amt">Total ex VAT</span>
          </div>
          {rows.map((o) => {
            const late = isLate(o, today);
            return (
              <button key={o.id} type="button" role="listitem" className={`po-row${late ? ' is-late' : ''}`} onClick={() => setOpen({ id: o.id })}>
                <span className="po-no">{o.po_number}</span>
                <span className="po-who">
                  <b>{o.supplier?.name ?? 'Supplier'}</b>
                  {o.changed_since_sent && <small className="po-late">Changed since sent: send it again</small>}
                </span>
                <span className="po-chipcell">
                  <StatusChip status={o.status} late={late} />
                </span>
                <span className={`po-when${late ? ' po-late' : ''}`}>{neededWords(o, today)}</span>
                <span className="po-amt">
                  {formatPence(o.net_pence)}
                  <small>{formatPence(o.gross_pence)} inc VAT</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <p className="crm-muted crm-small">
        Every order, on every job:{' '}
        <Link className="crmh-link" href="/admin/projects/orders">
          Purchase orders →
        </Link>
      </p>
      {open && (
        <OrderSheet
          orderId={open.id}
          newFor={open.id ? null : { projectId }}
          today={today}
          myName={myName}
          onClose={() => setOpen(null)}
          onChanged={(full) => {
            // A new one keeps its sheet open as itself.
            if (full && !open.id) setOpen({ id: full.order.id });
            void reload();
            onChanged();
          }}
        />
      )}
    </div>
  );
}
