'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { money, pct, type Profit } from '@/lib/quotes/types';
import '../../crm/crm.css';
import './quotes.css';

export type QuoteListRow = { id: string; number: string; title: string; status: string; customer: string; project_id: string; total: number; profit: Profit; updated_at: string };
type Found = { id: string; name: string; email: string | null; postcode: string | null; customer_ref: string | null; projects: number };

const STATUS: Record<string, string> = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };

export function QuotesList({ ready, initial }: { ready: boolean; initial: QuoteListRow[] }) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'accepted'>('all');

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      fetch(`/api/crm/customers?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => setFound(d.customers || []))
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function start(enquiryId: string) {
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enquiry_id: enquiryId }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setBusy(false);
      return setErr(d.error || 'Couldn’t start the quote.');
    }
    router.push(`/admin/sales/quotes/${d.id}`);
  }

  if (!ready) {
    return (
      <div className="crm crmh qb-page">
        <div className="crmh-head">
          <h1 className="crmh-h1">Quotes</h1>
        </div>
        <div className="crm-emptystate">
          <b>Quotes appear here once quotes.sql has been run</b>
          <p>Run supabase/quotes.sql in the Supabase SQL editor, then refresh this page.</p>
        </div>
      </div>
    );
  }
  const count = (f: string) => (f === 'all' ? initial.length : initial.filter((r) => r.status === f).length);
  const rows = initial.filter((r) => filter === 'all' || r.status === filter);
  const open = initial.filter((r) => r.status === 'sent');
  const openValue = open.reduce((n, r) => n + r.total, 0);
  const openProfit = open.reduce((n, r) => n + r.profit.profit, 0);
  return (
    <div className="crm crmh qb-page">
      <div className="crmh-head">
        <div className="crmh-head__l">
          <h1 className="crmh-h1">Quotes</h1>
          {open.length > 0 && (
            <span className="crmh-sum">
              {open.length} waiting for a signature · {money(openValue)} · {money(openProfit)} profit
            </span>
          )}
        </div>
        <div className="crmh-head__r">
          <button type="button" className="crm-btn crm-btn--solar" onClick={() => setPicking(true)}>
            + New quote
          </button>
        </div>
      </div>

      <div className="crm-stages crmh-chips qb-chips" role="group" aria-label="Show">
        {(['all', 'draft', 'sent', 'accepted'] as const).map((f) => (
          <button key={f} type="button" className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : STATUS[f]}
            <span>{count(f)}</span>
          </button>
        ))}
      </div>

      {picking && (
        <div className="qb-sheet" role="dialog" aria-label="New quote">
          <b>Who is the quote for?</b>
          <input className="crm-input" autoFocus placeholder="Search by name, email, phone, postcode or HX-ref" value={q} onChange={(e) => setQ(e.target.value)} />
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="qb-found">
            {q.trim().length >= 2 && found.length === 0 && <p className="crm-muted crm-small">No one found. Add them as an enquiry or opportunity first.</p>}
            {found.map((c) => (
              <button key={c.id} type="button" className="qb-person" disabled={busy} onClick={() => void start(c.id)}>
                <b>{c.name}</b>
                <span className="crm-muted crm-small">{[c.customer_ref, c.postcode, c.email].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
          </div>
          <button type="button" className="crm-link" style={{ margin: 0 }} onClick={() => setPicking(false)}>
            Cancel
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="crm-emptystate">
          <b>{initial.length === 0 ? 'No quotes yet' : 'No quotes here'}</b>
          {initial.length === 0 && <p>Press + New quote, choose the customer, and build the quote with prices, text, pictures and datasheets.</p>}
        </div>
      ) : (
        <div className="qb-list">
          <div className="qb-row qb-row--head" aria-hidden="true">
            <span>Quote</span>
            <span>Customer</span>
            <span>Status</span>
            <span className="qb-total">Total</span>
            <span className="qb-total">Profit (internal)</span>
            <span>Updated</span>
          </div>
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/sales/quotes/${r.id}`} className="qb-row">
              <span className="qb-num">{r.number}</span>
              <span className="qb-main">
                <b>{r.customer}</b>
                <small>{r.title}</small>
              </span>
              <span>
                <span className={`qb-status qb-status--${r.status}`}>{STATUS[r.status] ?? r.status}</span>
              </span>
              <span className="qb-total">{r.total ? money(r.total) : '–'}</span>
              <span className={`qb-total qb-pf${r.profit.profit < 0 ? ' neg' : ''}`}>
                {r.profit.cost > 0 ? (
                  <>
                    {money(r.profit.profit)}
                    <small>{pct(r.profit.marginPct)} margin</small>
                  </>
                ) : (
                  <small>no costs yet</small>
                )}
              </span>
              <small className="qb-when">{new Date(r.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
