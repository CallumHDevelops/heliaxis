'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STATUS_LABEL, type SubStatus } from '@/lib/subcontractors/types';
import { createSubcontractor } from './actions';
import { EMPTY_TERMS, TermsForm } from './TermsForm';
import './subcontractors.css';

export type ListRow = {
  id: string;
  ref: string;
  companyName: string;
  contactName: string;
  email: string;
  trade: string | null;
  status: SubStatus;
  invitedAt: string | null;
  lastSeenAt: string | null;
  docCount: number;
  missing: string[];
  expired: number;
  expiring: number;
  pendingReview: number;
};

type Filter = 'all' | 'onboarding' | 'awaiting_countersign' | 'active' | 'attention' | 'inactive';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';

function needsAttention(r: ListRow) {
  return r.status === 'awaiting_countersign' || r.pendingReview > 0 || r.expired > 0 || r.expiring > 0 ||
    (r.status === 'active' && r.missing.length > 0);
}

export function SubcontractorsList({ rows }: { rows: ListRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ id: string; link: string } | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  const counts = useMemo(
    () => ({
      onboarding: rows.filter((r) => r.status === 'invited' || r.status === 'in_progress').length,
      awaiting: rows.filter((r) => r.status === 'awaiting_countersign').length,
      active: rows.filter((r) => r.status === 'active').length,
      attention: rows.filter(needsAttention).length,
    }),
    [rows]
  );

  const shown = rows.filter((r) => {
    if (q && !`${r.companyName} ${r.contactName} ${r.email} ${r.ref} ${r.trade}`.toLowerCase().includes(q.toLowerCase())) return false;
    switch (filter) {
      case 'onboarding': return r.status === 'invited' || r.status === 'in_progress';
      case 'awaiting_countersign': return r.status === 'awaiting_countersign';
      case 'active': return r.status === 'active';
      case 'attention': return needsAttention(r);
      case 'inactive': return r.status === 'suspended' || r.status === 'terminated';
      default: return true;
    }
  });

  return (
    <div className="sc-page">
      <div className="sc-head">
        <div>
          <h1>Subcontractors</h1>
          <p>Add a subcontractor, send them the Framework Agreement to sign, and track their ID, cards, qualifications and insurance.</p>
        </div>
        {!adding && (
          <button className="sc-btn" onClick={() => { setAdding(true); setCreated(null); }}>+ Add subcontractor</button>
        )}
      </div>

      {created && (
        <div className="sc-banner is-ok">
          Added. Their portal link (only shown now — sending a new one replaces it):
          <code className="sc-link">{created.link}</code>
          <div className="sc-row">
            <button className="sc-btn-ghost" onClick={() => navigator.clipboard.writeText(created.link)}>Copy link</button>
            <a className="sc-btn-ghost" href={`/admin/subcontractors/${created.id}`}>Open record →</a>
          </div>
        </div>
      )}

      {adding && (
        <div className="sc-card">
          <h2>New subcontractor</h2>
          <TermsForm
            initial={EMPTY_TERMS}
            submitLabel="Create"
            showInvite
            onCancel={() => setAdding(false)}
            onSubmit={async (v, sendInvite) => {
              const r = await createSubcontractor({ ...v, sendInvite });
              if (!r.ok) return r.error;
              setCreated({ id: r.id, link: r.link });
              setAdding(false);
              router.refresh();
              return null;
            }}
          />
        </div>
      )}

      <div className="sc-stats">
        {(
          [
            ['onboarding', 'Onboarding', counts.onboarding],
            ['awaiting_countersign', 'To countersign', counts.awaiting],
            ['active', 'Active', counts.active],
            ['attention', 'Need attention', counts.attention],
          ] as [Filter, string, number][]
        ).map(([k, label, n]) => (
          <button key={k} className={`sc-stat${filter === k ? ' is-on' : ''}`} onClick={() => setFilter(filter === k ? 'all' : k)}>
            <span className="n">{n}</span>
            <span className="l">{label}</span>
          </button>
        ))}
      </div>

      <div className="sc-toolbar">
        <input className="sc-search" placeholder="Search name, email, ref…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">All</option>
          <option value="onboarding">Onboarding</option>
          <option value="awaiting_countersign">To countersign</option>
          <option value="active">Active</option>
          <option value="attention">Need attention</option>
          <option value="inactive">Suspended / terminated</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="sc-empty">{rows.length ? 'Nothing matches.' : 'No subcontractors yet — add your first one above.'}</p>
      ) : (
        <div className="sc-table-wrap">
          <table className="sc-table">
            <thead>
              <tr>
                <th>Subcontractor</th>
                <th>Trade</th>
                <th>Status</th>
                <th>Documents</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => router.push(`/admin/subcontractors/${r.id}`)}>
                  <td>
                    <a href={`/admin/subcontractors/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.companyName}</a>
                    <span className="sc-sub">{r.contactName} · {r.ref}</span>
                  </td>
                  <td>{r.trade || '—'}</td>
                  <td><span className={`sc-status s-${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                  <td>
                    <span className="sc-doc-cell">
                      {r.docCount} on file
                      {r.pendingReview > 0 && <span className="sc-pill is-info">{r.pendingReview} to review</span>}
                      {r.expired > 0 && <span className="sc-pill is-bad">{r.expired} expired</span>}
                      {r.expiring > 0 && <span className="sc-pill is-warn">{r.expiring} expiring</span>}
                      {r.missing.length > 0 && r.status !== 'invited' && (
                        <span className="sc-pill is-warn" title={r.missing.join(', ')}>{r.missing.length} missing</span>
                      )}
                    </span>
                  </td>
                  <td>{fmt(r.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
