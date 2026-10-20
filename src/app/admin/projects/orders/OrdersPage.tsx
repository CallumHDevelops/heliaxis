'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import { formatPence, isLate, isOpen } from '@/lib/purchase-orders/money';
import { matchesOrder, type PoListRow, type Supplier } from '@/lib/purchase-orders/shared';
import { plusDays } from '@/lib/projects/feed';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { useNow } from '@/lib/use-now';
import { Icon, Sheet } from '../../crm/CrmUi';
import { rememberView, shortDate, ukDayOf } from '../../crm/crm-shared';
import { OrderSheet } from './OrderSheet';
import { api, neededWords, StatusChip } from './OrdersUi';
import { SupplierForm } from './SupplierForm';
import '../../crm/crm.css';
import '../projects.css';
import './orders.css';

export type OrdersView = 'orders' | 'suppliers';
type Filter = 'live' | 'draft' | 'open' | 'awaiting' | 'delivered' | 'cancelled';

const FILTERS: { key: Filter; label: string; title: string }[] = [
  { key: 'live', label: 'Live', title: 'Drafts, and orders not delivered yet' },
  { key: 'draft', label: 'Draft', title: 'Not sent to the supplier yet' },
  { key: 'open', label: 'Open', title: 'Sent or confirmed, not delivered yet' },
  { key: 'awaiting', label: 'Awaiting delivery', title: 'Confirmed by the supplier, not delivered yet' },
  { key: 'delivered', label: 'Delivered', title: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled', title: 'Cancelled' },
];
const TEST: Record<Filter, (o: PoListRow) => boolean> = {
  live: (o) => o.status === 'draft' || isOpen(o.status),
  draft: (o) => o.status === 'draft',
  open: (o) => isOpen(o.status),
  awaiting: (o) => o.status === 'confirmed',
  delivered: (o) => o.status === 'delivered',
  cancelled: (o) => o.status === 'cancelled',
};

/**
 * Projects → Purchase orders: every order on every job. Live (the default) puts late deliveries
 * first, then those due in the next 7 days, drafts still to send, later ones and ones with no date.
 * Chips by status, a supplier filter and a search (PO number, job reference, customer, supplier);
 * a row opens the order sheet. Suppliers has the supplier list (add, edit, archive).
 */
export function OrdersPage({
  ready,
  initial,
  today: serverToday,
  initialView,
  openId,
  myName,
}: {
  ready: boolean;
  initial: PoListRow[];
  today: string;
  initialView: OrdersView;
  openId: string | null;
  myName: string | null;
}) {
  const now = useNow(60_000);
  const today = now ? ukDayOf(now) : serverToday;
  const [orders, setOrders] = useState<PoListRow[]>(initial);
  const [error, setError] = useState('');
  const [view, setView] = useState<OrdersView>(initialView);
  const [filter, setFilter] = useState<Filter>('live');
  const [supplier, setSupplier] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(openId);

  const skipFirst = useRef(true);
  const load = useCallback(async () => {
    if (!ready) return true;
    if (skipFirst.current) {
      skipFirst.current = false;
      return true;
    }
    try {
      const d = await api<{ orders: PoListRow[] }>('/api/crm/purchase-orders');
      setOrders(d.orders);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the orders.');
      return false;
    }
  }, [ready]);
  const { reload } = useLiveRefresh(load, 60_000);

  function pickView(v: OrdersView) {
    setView(v);
    rememberView('view', v);
  }

  const suppliersUsed = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders) if (o.supplier) m.set(o.supplier.id, o.supplier.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);
  const searched = orders.filter((o) => (!supplier || o.supplier_id === supplier) && matchesOrder(o, q));
  const shown = searched.filter(TEST[filter]);
  const open7 = plusDays(today, 6);
  const openOrders = orders.filter((o) => isOpen(o.status));
  const due = openOrders.filter((o) => o.required_by && o.required_by <= open7).length;
  const summary = [
    `${openOrders.length} open`,
    openOrders.length ? `${formatPence(openOrders.reduce((n, o) => n + o.net_pence, 0))} on order ex VAT` : '',
    due ? `${due} due in the next 7 days` : '',
  ].filter(Boolean);

  return (
    <div className="crm crmh prj po-page" data-view={view}>
      <Link href="/admin/projects" className="crm-back">
        ← Projects
      </Link>
      <div className="crmh-head">
        <div className="crmh-head__l">
          <h1 className="crmh-h1">Purchase orders</h1>
          {ready && view === 'orders' && (
            <span className="crmh-sum" title={summary.join(' · ')}>
              {summary.join(' · ')}
            </span>
          )}
        </div>
        {ready && view === 'orders' && (
          <label className="crmh-searchbox crmh-search po-search">
            <span className="crmh-searchbox__field">
              <Icon k="search" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="PO number, HX-ref, customer or supplier" aria-label="Search the purchase orders" />
            </span>
          </label>
        )}
        <div className="crmh-head__r">
          {ready && (
            <div className="crmh-seg crmh-views" role="group" aria-label="Show">
              {(['orders', 'suppliers'] as const).map((v) => (
                <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => pickView(v)}>
                  {v === 'orders' ? 'Orders' : 'Suppliers'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <p className="crm-banner crm-banner--err">{error}</p>}

      {!ready ? (
        <div className="crm-emptystate">
          <b>Purchase orders appear here once purchase-orders.sql has been run</b>
          <p>
            It’s on your <Link href="/admin/setup">to-do list</Link>.
          </p>
        </div>
      ) : view === 'suppliers' ? (
        <SuppliersPanel />
      ) : (
        <>
          <div className="po-filters">
            <div className="crm-stages crmh-chips" role="group" aria-label="Show">
              {FILTERS.map((f) => {
                const n = searched.filter(TEST[f.key]).length;
                return (
                  <button key={f.key} type="button" title={f.title} className={filter === f.key ? 'on' : ''} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                    {f.label}
                    <span>{n}</span>
                  </button>
                );
              })}
            </div>
            {suppliersUsed.length > 1 && (
              <select className="crm-input po-supsel" value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier">
                <option value="">Every supplier</option>
                {suppliersUsed.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <OrdersList rows={shown} filter={filter} today={today} onOpen={setOpen} empty={!orders.length} />
        </>
      )}

      {open && (
        <OrderSheet
          orderId={open}
          today={today}
          myName={myName}
          showJob
          onClose={() => setOpen(null)}
          onChanged={() => void reload()}
        />
      )}
    </div>
  );
}

/* ── The list ────────────────────────────────────────────────────────────────── */

function OrdersList({ rows, filter, today, onOpen, empty }: { rows: PoListRow[]; filter: Filter; today: string; onOpen: (id: string) => void; empty: boolean }) {
  const sections = useMemo(() => {
    const byDate = (a: PoListRow, b: PoListRow) => (a.required_by ?? '9999').localeCompare(b.required_by ?? '9999') || a.po_number.localeCompare(b.po_number);
    if (filter === 'delivered' || filter === 'cancelled' || filter === 'draft') {
      const when = (o: PoListRow) => o.delivered_at || o.cancelled_at || o.created_at;
      return [{ key: 'all', label: '', rows: [...rows].sort((a, b) => when(b).localeCompare(when(a))) }];
    }
    const week = plusDays(today, 6);
    const open = rows.filter((o) => isOpen(o.status));
    return [
      { key: 'late', label: 'Late', rows: open.filter((o) => isLate(o, today)).sort(byDate) },
      { key: 'soon', label: 'Due in the next 7 days', rows: open.filter((o) => o.required_by && o.required_by >= today && o.required_by <= week).sort(byDate) },
      { key: 'draft', label: 'Drafts: not sent yet', rows: rows.filter((o) => o.status === 'draft').sort((a, b) => b.created_at.localeCompare(a.created_at)) },
      { key: 'later', label: 'Later', rows: open.filter((o) => o.required_by && o.required_by > week).sort(byDate) },
      { key: 'none', label: 'No date', rows: open.filter((o) => !o.required_by).sort((a, b) => b.created_at.localeCompare(a.created_at)) },
    ].filter((s) => s.rows.length);
  }, [rows, filter, today]);

  if (!rows.length) {
    return (
      <div className="crm-emptystate">
        <b>{empty ? 'No purchase orders yet' : 'No orders here'}</b>
        {empty && <p>Orders are made on a job: open it from Projects, then its Orders tab.</p>}
      </div>
    );
  }
  return (
    <div className="po-list">
      <div className="po-row po-row--head" aria-hidden="true">
        <span>PO</span>
        <span>Job</span>
        <span>Supplier</span>
        <span>Status</span>
        <span>Required by</span>
        <span className="po-amt">Total ex VAT</span>
      </div>
      {sections.map((s) => (
        <section key={s.key} aria-label={s.label || 'Orders'}>
          {s.label && (
            <h2 className={`po-sec${s.key === 'late' ? ' late' : ''}`}>
              {s.label} <span className="crmh-n">{s.rows.length}</span>
            </h2>
          )}
          {s.rows.map((o) => {
            const late = isLate(o, today);
            return (
              <button key={o.id} type="button" className={`po-row${late ? ' is-late' : ''}`} onClick={() => onOpen(o.id)}>
                <span className="po-no">{o.po_number}</span>
                <span className="po-who">
                  <b>{o.job?.customer || o.job?.title || 'Job'}</b>
                  <small>
                    {o.job?.ref}
                    {o.supplier && <span className="po-who__sup">{o.job?.ref ? ' · ' : ''}{o.supplier.name}</span>}
                    {o.changed_since_sent ? ' · changed since sent' : ''}
                  </small>
                </span>
                <span className="po-supplier">{o.supplier?.name}</span>
                <span className="po-chipcell">
                  <StatusChip status={o.status} late={late} />
                </span>
                <span className={`po-when${late ? ' po-late' : ''}`}>
                  {o.status === 'delivered' && o.delivered_at ? `Delivered ${shortDate(ukDayOf(o.delivered_at))}` : neededWords(o, today)}
                </span>
                <span className="po-amt">
                  {formatPence(o.net_pence)}
                  <small>
                    {o.lines} line{o.lines === 1 ? '' : 's'}
                  </small>
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/* ── Suppliers ───────────────────────────────────────────────────────────────── */

function SuppliersPanel() {
  const [list, setList] = useState<Supplier[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ suppliers: Supplier[] }>('/api/crm/suppliers?all=1');
      setList(d.suppliers);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the suppliers.');
      return false;
    }
  }, []);
  const { reload } = useLiveRefresh(load, 120_000);

  async function act(s: Supplier, how: 'archive' | 'restore' | 'remove') {
    setError('');
    setNotice('');
    try {
      if (how === 'remove') {
        if (!window.confirm(`Remove ${s.name}?${s.orders ? ' It has orders, so it’s archived rather than deleted.' : ''}`)) return;
        const d = await api<{ archived?: boolean; message?: string }>(`/api/crm/suppliers/${s.id}`, { method: 'DELETE' });
        setNotice(d.archived ? (d.message ?? 'Archived') : `${s.name} removed`);
      } else {
        await api(`/api/crm/suppliers/${s.id}`, { method: 'PATCH', body: { archived: how === 'archive' } });
        setNotice(how === 'archive' ? `${s.name} archived: it’s no longer offered for new orders.` : `${s.name} is back.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    }
    void reload();
  }

  const shown = (list ?? []).filter((s) => archived || !s.archived_at);
  const nArchived = (list ?? []).filter((s) => s.archived_at).length;
  return (
    <div className="po-sups">
      <div className="po-sups__head">
        <p className="crm-muted crm-small">Who you order from. A supplier that’s been used is archived, never deleted, so its orders keep it.</p>
        <span className="crm-actions" style={{ marginTop: 0 }}>
          {nArchived > 0 && (
            <label className="crm-check">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived ({nArchived})
            </label>
          )}
          <button type="button" className="crm-btn crm-btn--solar" onClick={() => setEditing('new')}>
            + Add a supplier
          </button>
        </span>
      </div>
      {notice && <p className="crm-banner po-ok">{notice}</p>}
      {error && <p className="crm-banner crm-banner--err">{error}</p>}
      {!list ? (
        !error && <p className="crm-muted">Loading…</p>
      ) : !shown.length ? (
        <div className="crm-emptystate">
          <b>No suppliers yet</b>
          <p>Add the wholesalers you buy kit from, with the email address their orders go to.</p>
        </div>
      ) : (
        <div className="po-list" role="list" aria-label="Suppliers">
          {shown.map((s) => (
            <div key={s.id} role="listitem" className={`po-sup${s.archived_at ? ' is-archived' : ''}`}>
              <div>
                <b>
                  {s.name}
                  {s.archived_at ? ' (archived)' : ''}
                </b>
                <small>{[s.contact_name, s.account_number ? `Account ${s.account_number}` : ''].filter(Boolean).join(' · ') || ' '}</small>
              </div>
              <div>
                <small>{s.email || 'No email yet: orders can’t be emailed to them'}</small>
                {s.phone && <small>{s.phone}</small>}
              </div>
              <span className="po-sup__n crm-muted crm-small">
                {s.orders ? `${s.orders} order${s.orders === 1 ? '' : 's'}` : 'No orders'}
              </span>
              <span className="po-sup__acts">
                <button type="button" className="crm-link" onClick={() => setEditing(s)}>
                  Edit
                </button>
                {s.archived_at ? (
                  <button type="button" className="crm-link" onClick={() => void act(s, 'restore')}>
                    Bring back
                  </button>
                ) : s.orders ? (
                  <button type="button" className="crm-link" onClick={() => void act(s, 'archive')}>
                    Archive
                  </button>
                ) : (
                  <button type="button" className="crm-link po-danger" onClick={() => void act(s, 'remove')}>
                    Delete
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <Sheet title={editing === 'new' ? 'Add a supplier' : `Edit ${editing.name}`} onClose={() => setEditing(null)} wide>
          <SupplierForm
            supplier={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(s) => {
              setEditing(null);
              setNotice(`${s.name} saved ✓`);
              void reload();
            }}
          />
        </Sheet>
      )}
    </div>
  );
}
