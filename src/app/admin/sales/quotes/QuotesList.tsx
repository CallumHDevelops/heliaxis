'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { money } from '@/lib/quotes/types';

export type QuoteListRow = { id: string; number: string; title: string; status: string; customer: string; project_id: string; total: number; updated_at: string };
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
      <div className="qb-page">
        <h1>Quotes</h1>
        <p className="crm-banner crm-banner--err">Quotes need one database step first: run <b>supabase/quotes.sql</b> in the Supabase SQL editor, then refresh.</p>
      </div>
    );
  }
  const rows = initial.filter((r) => filter === 'all' || r.status === filter);
  return (
    <div className="qb-page">
      <div className="qb-head">
        <h1>Quotes</h1>
        <button type="button" className="crm-btn crm-btn--solar" onClick={() => setPicking(true)}>
          + New quote
        </button>
      </div>
      <div className="qb-chips">
        {(['all', 'draft', 'sent', 'accepted'] as const).map((f) => (
          <button key={f} type="button" className={`qb-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : STATUS[f]}
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
          <button type="button" className="crm-link" onClick={() => setPicking(false)}>
            Cancel
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="crm-muted">No quotes yet. Press + New quote to build one.</p>
      ) : (
        <div className="qb-table">
          {rows.map((r) => (
            <Link key={r.id} href={`/admin/sales/quotes/${r.id}`} className="qb-row">
              <span className="qb-num">{r.number}</span>
              <span className="qb-main">
                <b>{r.customer}</b>
                <small className="crm-muted">{r.title}</small>
              </span>
              <span className={`qb-status qb-status--${r.status}`}>{STATUS[r.status] ?? r.status}</span>
              <span className="qb-total">{r.total ? money(r.total) : '–'}</span>
              <small className="crm-muted">{new Date(r.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
