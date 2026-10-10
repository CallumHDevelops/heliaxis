'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STATUS_LABEL, type CisRate, type SubStatus } from '@/lib/subcontractors/types';
import { createSubcontractor, optimiseExistingDocuments, sendFreshLinksToAll } from './actions';
import { FRESH_LINK_MESSAGE } from '@/lib/subcontractors/messages';
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
  /** Verified with HMRC by our accountants (and at what rate). */
  cisVerified: boolean;
  cisRate: CisRate | null;
};

const CIS_SHORT: Record<CisRate, string> = { gross: 'gross', net: '20%', higher: '30%' };

/** Firms we work with (or are about to) need verifying with HMRC before they're paid. */
const needsCis = (r: ListRow) => !r.cisVerified && (r.status === 'active' || r.status === 'awaiting_countersign');

type Filter = 'all' | 'onboarding' | 'awaiting_countersign' | 'active' | 'attention' | 'inactive';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';

function needsAttention(r: ListRow) {
  return r.status === 'awaiting_countersign' || r.pendingReview > 0 || r.expired > 0 || r.expiring > 0 ||
    (r.status === 'active' && r.missing.length > 0) || needsCis(r);
}

export function SubcontractorsList({
  rows,
  recipients,
  unprocessed,
}: {
  rows: ListRow[];
  recipients: number;
  /** Documents uploaded before conversion to PDF existed (null until portal-v4.sql has run). */
  unprocessed: number | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [freshOpen, setFreshOpen] = useState(false);
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
        <div className="sc-row">
          <button className="sc-btn-ghost" onClick={() => setFreshOpen((v) => !v)} disabled={!recipients}>
            Send everyone a fresh link
          </button>
          {!adding && (
            <button className="sc-btn" onClick={() => { setAdding(true); setCreated(null); }}>+ Add subcontractor</button>
          )}
        </div>
      </div>

      {freshOpen && <FreshLinks recipients={recipients} onDone={() => router.refresh()} />}
      {!!unprocessed && <OptimiseFiles count={unprocessed} onDone={() => router.refresh()} />}

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
                  <td>
                    <span className="sc-doc-cell">
                      <span className={`sc-status s-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                      {r.cisVerified ? (
                        <span className="sc-pill is-ok" title="Verified with HMRC">CIS ✓{r.cisRate ? ` ${CIS_SHORT[r.cisRate]}` : ''}</span>
                      ) : (
                        needsCis(r) && <span className="sc-pill is-warn">CIS not verified</span>
                      )}
                    </span>
                  </td>
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

/** Preview of the apology email, then a batched send to every subcontractor. */
function FreshLinks({ recipients, onDone }: { recipients: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: string[]; remaining: number } | null>(null);
  const [err, setErr] = useState('');
  // The server stamps the run on the first call; retries reuse it so nobody is emailed twice.
  const since = useRef<string | undefined>(undefined);
  const total = useRef(0);
  const m = FRESH_LINK_MESSAGE;

  async function send() {
    if (!since.current && !confirm(`Email ${recipients} subcontractor${recipients === 1 ? '' : 's'} an apology and a new personal link? Any older links they have stop working.`)) return;
    setBusy(true);
    setErr('');
    try {
      for (let i = 0; i < 20; i++) {
        const r = await sendFreshLinksToAll(since.current);
        if (!r.ok) throw new Error(r.error);
        since.current = r.since;
        total.current += r.sent;
        setResult({ sent: total.current, failed: r.failed, remaining: r.remaining });
        // Stop when everyone's done, or a batch made no progress (only failures left).
        if (r.remaining <= 0 || r.sent === 0) break;
      }
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const finished = !!result && result.remaining <= 0;
  return (
    <div className="sc-card">
      <h2>Send everyone a fresh link</h2>
      <p className="sc-muted">
        Goes to {recipients} subcontractor{recipients === 1 ? '' : 's'} (everyone except terminated). Each gets their own link
        straight into the portal, valid 14 days.
      </p>
      <div className="sc-preview">
        <p><strong>Subject:</strong> {m.subject}</p>
        <p><strong>{m.title}</strong></p>
        <p>Hi [first name],</p>
        {m.paragraphs.map((t, i) => <p key={i}>{t}</p>)}
        <p>[{m.button}]</p>
        <p>The Heliaxis team</p>
      </div>
      {err && <p className="sc-error">{err}</p>}
      {result && (
        <p className={result.remaining > 0 ? 'sc-error' : 'sc-muted'}>
          Sent to {result.sent}.
          {result.remaining > 0 && ` ${result.remaining} not sent yet${result.failed.length ? ` (${result.failed.join('; ')})` : ''} — press Retry to send to just those.`}
        </p>
      )}
      <button className="sc-btn" disabled={busy || finished} onClick={send}>
        {busy ? 'Sending…' : finished ? 'All sent' : since.current ? 'Retry the rest' : `Send to ${recipients}`}
      </button>
    </div>
  );
}

const mb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`);

/** One-off: turn documents uploaded before conversion existed into compact PDFs, in batches. */
function OptimiseFiles({ count, onDone }: { count: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<{ converted: number; kept: number; saved: number; remaining: number } | null>(null);
  const [err, setErr] = useState('');
  const stop = useRef(false);
  // Leaving the page stops the run (otherwise it keeps going, and queues behind it every other action).
  useEffect(() => () => {
    stop.current = true;
  }, []);

  async function start() {
    setBusy(true);
    setStopping(false);
    setErr('');
    stop.current = false;
    const total = { converted: 0, kept: 0, saved: 0 };
    let before = Infinity;
    try {
      for (let i = 0; i < 200 && !stop.current; i++) {
        const r = await optimiseExistingDocuments();
        if (!r.ok) throw new Error(r.error);
        total.converted += r.converted;
        total.kept += r.kept;
        total.saved += r.saved;
        setProgress({ ...total, remaining: r.remaining });
        if (r.remaining <= 0) break;
        // Nothing got further this batch (e.g. storage full) — stop instead of looping.
        if (r.remaining >= before) {
          setErr(`${r.remaining} couldn’t be processed right now — try again later.`);
          break;
        }
        before = r.remaining;
      }
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      setStopping(false);
    }
  }

  const finished = !!progress && progress.remaining <= 0;
  return (
    <div className="sc-card">
      <div className="sc-row-between">
        <h2>Convert existing documents to PDF</h2>
        <span className="sc-pill is-info">{progress ? progress.remaining : count} to do</span>
      </div>
      <p className="sc-muted">
        New uploads are turned into one compact PDF automatically (photos converted, scans compressed). This does the same
        for documents uploaded before that — approved ones keep only the PDF; others keep the original until approved.
        Documents RAMS has already pulled are left exactly as they are.
      </p>
      {/* Always present, so each update is announced. */}
      <p className="sc-muted" role="status">
        {progress &&
          `${progress.converted} converted · ${mb(progress.saved)} saved${progress.kept ? ` · ${progress.kept} left as they were` : ''}${
            progress.remaining > 0 ? ` · ${progress.remaining} still to do` : ' · all done'
          }`}
      </p>
      {err && <p className="sc-error">{err}</p>}
      {!finished && (
        <div className="sc-row">
          {/* One button that changes, so keyboard focus stays put while it runs. */}
          <button
            className={busy ? 'sc-btn-ghost' : 'sc-btn'}
            aria-disabled={stopping || undefined}
            onClick={() => {
              if (!busy) return void start();
              if (stopping) return;
              stop.current = true;
              setStopping(true);
            }}
          >
            {!busy ? (progress ? 'Carry on' : 'Convert them now') : stopping ? 'Stopping after this batch…' : 'Stop after this batch'}
          </button>
        </div>
      )}
    </div>
  );
}
