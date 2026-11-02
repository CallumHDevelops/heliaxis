'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { KINDS, SECTIONS, type DocKind } from '@/lib/qms/types';
import type { QmsDetail, QmsOverview, QmsRow } from '@/lib/qms/server';
import { Sheet } from '../crm/CrmUi';
import '../crm/crm.css';
import { createDoc, importStandardRegister, openDoc, refresh } from './actions';
import { DocSheet, StatusChip } from './DocSheet';
import './qms.css';

type View = 'overview' | 'queue' | DocKind;
type Filter = 'all' | 'todo' | 'review' | 'approved' | 'archived';

export function QmsPage({ ready, initial, admin, openRef }: { ready: boolean; initial: QmsOverview; admin: boolean; openRef: string | null }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>('overview');
  const [filter, setFilter] = useState<Filter>('all');
  const [section, setSection] = useState('');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<QmsDetail | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const live = useMemo(() => data.rows.filter((r) => r.status !== 'archived'), [data.rows]);
  const queue = useMemo(() => live.filter((r) => r.status === 'in_review' || r.status === 'changes_requested' || r.addressed > 0), [live]);
  const stats = useMemo(() => {
    const by = (k: DocKind) => {
      const rows = live.filter((r) => r.kind === k);
      return { total: rows.length, approved: rows.filter((r) => r.status === 'approved').length, review: rows.filter((r) => r.status === 'in_review').length, drafts: rows.filter((r) => r.status === 'draft' || r.status === 'changes_requested').length, fails: rows.filter((r) => r.fails > 0).length };
    };
    return { kinds: KINDS.map((k) => ({ ...k, ...by(k.key) })), open: live.reduce((n, r) => n + r.openComments, 0), overdue: live.filter((r) => r.next_review_on && r.next_review_on < data.today).length };
  }, [live, data.today]);

  async function open(id: string) {
    const r = await openDoc(id);
    if (r.ok) setSheet(r.detail);
    else setMsg(r.error);
  }
  async function reload() {
    setData(await refresh());
  }
  async function doImport() {
    setBusy('import');
    setMsg('');
    const r = await importStandardRegister();
    setBusy('');
    if (!r.ok) return setMsg(r.error);
    setMsg(r.added ? `Added ${r.added} documents to the register as drafts.` : 'Everything in the standard register is already there.');
    await reload();
  }

  // Deep link: /admin/qms?doc=P03 opens that document once.
  const linked = useRef(false);
  useEffect(() => {
    if (linked.current || !openRef) return;
    linked.current = true;
    const hit = initial.rows.find((r) => r.ref.toUpperCase() === openRef.toUpperCase());
    if (hit) void openDoc(hit.id).then((r) => r.ok && setSheet(r.detail));
  }, [openRef, initial.rows]);

  const rows = useMemo(() => {
    if (view === 'queue') return queue;
    if (view === 'overview') return [];
    const needle = q.trim().toLowerCase();
    return data.rows
      .filter((r) => r.kind === view)
      .filter((r) => (filter === 'archived' ? r.status === 'archived' : r.status !== 'archived'))
      .filter((r) => (filter === 'todo' ? r.status === 'draft' || r.status === 'changes_requested' : filter === 'review' ? r.status === 'in_review' : filter === 'approved' ? r.status === 'approved' : true))
      .filter((r) => !section || r.section === section)
      .filter((r) => !needle || `${r.ref} ${r.title}`.toLowerCase().includes(needle));
  }, [data.rows, view, filter, section, q, queue]);

  if (!ready) {
    return (
      <div className="qms">
        <h1 className="qms-title">QMS</h1>
        <p className="qms-muted">This needs one setup step: run <code>qms.sql</code> in Supabase. It’s on the “From Claude” to-do list in Setup.</p>
      </div>
    );
  }

  const tabs: { key: View; label: string; n?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'queue', label: 'To review', n: queue.length },
    ...KINDS.map((k) => ({ key: k.key as View, label: k.plural })),
  ];

  return (
    <div className="qms">
      <div className="qms-head">
        <h1 className="qms-title">Quality management</h1>
        <span className="qms-spacer" />
        {admin && <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={doImport}>{busy === 'import' ? 'Adding…' : data.rows.length ? 'Add missing standard documents' : 'Load the standard register'}</button>}
        <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => setAdding(true)}>Add a document</button>
      </div>
      {msg && <p className="qms-msg" role="status">{msg}</p>}

      <div className="qms-tabs qms-tabs--page" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={view === t.key} className={view === t.key ? 'is-on' : ''} onClick={() => { setView(t.key); setFilter('all'); setSection(''); setQ(''); }}>
            {t.label}{t.n ? <span className="qms-count">{t.n}</span> : null}
          </button>
        ))}
      </div>

      {view === 'overview' && (
        <div className="qms-over">
          {data.rows.length === 0 && (
            <div className="qms-box">
              <p><strong>Nothing in the register yet.</strong> {admin ? 'Load the standard register to start from the full list of procedures, forms, internal and external documents. Each starts as an empty draft that the checker will chase until it is written and approved.' : 'Ask an admin to load the standard register.'}</p>
            </div>
          )}
          <div className="qms-tiles">
            {stats.kinds.map((k) => (
              <button key={k.key} type="button" className="qms-tile" onClick={() => setView(k.key)}>
                <span className="qms-tile__name">{k.plural}</span>
                <span className="qms-tile__big">{k.approved}<small> / {k.total} approved</small></span>
                <span className="qms-bar" aria-hidden="true"><span style={{ width: `${k.total ? (k.approved / k.total) * 100 : 0}%` }} /></span>
                <span className="qms-tile__sub">{k.review} in review · {k.drafts} drafts · {k.fails} with checks failing</span>
              </button>
            ))}
          </div>
          <div className="qms-tiles qms-tiles--small">
            <button type="button" className="qms-tile" onClick={() => setView('queue')}><span className="qms-tile__name">Waiting for you</span><span className="qms-tile__big">{queue.length}</span><span className="qms-tile__sub">in review, changes requested, or comments answered</span></button>
            <div className="qms-tile"><span className="qms-tile__name">Open comments</span><span className="qms-tile__big">{stats.open}</span><span className="qms-tile__sub">for Claude to answer or you to resolve</span></div>
            <div className="qms-tile"><span className="qms-tile__name">Reviews overdue</span><span className="qms-tile__big">{stats.overdue}</span><span className="qms-tile__sub">past their review date</span></div>
          </div>
          <p className="qms-muted">The quality records (customer complaints, corrective actions, internal reviews, calibration and training) are open to everyone under <Link className="crm-link" href="/admin/quality">Operations → Quality records</Link>. Purchase orders (R03) are under Finance, suppliers (R08) in Purchase orders → Suppliers, and subcontractors (R09) under Team → Subcontractors. The company documents record (R11) is this register.</p>
        </div>
      )}

      {(view === 'queue' || KINDS.some((k) => k.key === view)) && (
        <>
          {view !== 'queue' && (
            <div className="qms-bar2">
              <input className="crm-input qms-search" placeholder="Search by reference or title" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
              <div className="qms-chips">
                {([['all', 'All'], ['todo', 'To do'], ['review', 'In review'], ['approved', 'Approved'], ['archived', 'Archive']] as [Filter, string][]).map(([k, l]) => (
                  <button key={k} type="button" className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>{l}</button>
                ))}
              </div>
              {SECTIONS[view as DocKind]?.length > 0 && (
                <select className="crm-input qms-sec" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section">
                  <option value="">All sections</option>
                  {SECTIONS[view as DocKind].map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              )}
            </div>
          )}
          {rows.length === 0 ? (
            <p className="qms-muted">{view === 'queue' ? 'Nothing is waiting for review.' : 'Nothing here.'}</p>
          ) : (
            <table className="qms-table">
              <thead><tr><th>Ref</th><th>Title</th><th>Rev</th><th>Date</th><th>Status</th><th>Checks</th><th>Comments</th></tr></thead>
              <tbody>
                {rows.map((r) => <Row key={r.id} r={r} today={data.today} onOpen={() => open(r.id)} />)}
              </tbody>
            </table>
          )}
        </>
      )}

      {sheet && <DocSheet key={sheet.doc.id} initial={sheet} admin={admin} onClose={() => { setSheet(null); void reload(); }} onChanged={() => void reload()} />}
      {adding && <AddDoc defaultKind={KINDS.some((k) => k.key === view) ? (view as DocKind) : 'procedure'} onClose={() => setAdding(false)} onCreated={async (id) => { setAdding(false); await reload(); void open(id); }} />}
    </div>
  );
}

function Row({ r, today, onOpen }: { r: QmsRow; today: string; onOpen: () => void }) {
  const late = r.next_review_on && r.next_review_on < today;
  return (
    <tr tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <td className="qms-ref">{r.ref}</td>
      <td>{r.title}{late ? <span className="qms-late"> · review overdue</span> : null}</td>
      <td>{r.revision}</td>
      <td>{r.revision_date ?? ''}</td>
      <td><StatusChip status={r.status} /></td>
      <td>{r.fails ? <span className="qms-score is-fail">{r.fails} to fix</span> : r.warns ? <span className="qms-score is-warn">{r.warns} to look at</span> : <span className="qms-score is-ok">Clear</span>}</td>
      <td>{r.openComments ? <span className="qms-score is-fail">{r.openComments} open</span> : r.addressed ? <span className="qms-score is-warn">{r.addressed} answered</span> : ''}</td>
    </tr>
  );
}

function AddDoc({ defaultKind, onClose, onCreated }: { defaultKind: DocKind; onClose: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<DocKind>(defaultKind);
  const [ref, setRef] = useState('');
  const [title, setTitle] = useState('');
  const [section, setSection] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Sheet title="Add a document" onClose={onClose}>
      <label className="crm-label" htmlFor="qa-kind">Where does it go?</label>
      <select id="qa-kind" className="crm-input" value={kind} onChange={(e) => { setKind(e.target.value as DocKind); setSection(''); }}>
        {KINDS.map((k) => <option key={k.key} value={k.key}>{k.plural} ({k.prefix})</option>)}
      </select>
      {SECTIONS[kind].length > 0 && (
        <>
          <label className="crm-label" htmlFor="qa-sec">Section</label>
          <select id="qa-sec" className="crm-input" value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">Pick one…</option>
            {SECTIONS[kind].map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </>
      )}
      <label className="crm-label" htmlFor="qa-ref">Reference</label>
      <input id="qa-ref" className="crm-input" placeholder={kind === 'procedure' ? 'P34' : kind === 'form' ? 'F30' : kind === 'external' ? 'EX50' : 'D08'} value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} />
      <label className="crm-label" htmlFor="qa-title">Title</label>
      <input id="qa-title" className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      {err && <p className="qms-err" role="alert">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !ref.trim() || !title.trim()} onClick={async () => { setBusy(true); const r = await createDoc({ kind, ref, title, section }); setBusy(false); if (r.ok) onCreated(r.id); else setErr(r.error); }}>{busy ? 'Adding…' : 'Add'}</button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
