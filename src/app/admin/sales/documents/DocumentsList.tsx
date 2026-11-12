'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sheet } from '../../crm/CrmUi';
import '../../crm/crm.css';
import './documents.css';

type Row = { id: string; number: string; title: string; kind: string; for: string; updated_at: string };

const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function DocumentsList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    let live = true;
    fetch('/api/crm/writeups', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (d.error) setErr(d.missing ? 'The documents table isn’t set up yet (supabase/writeups.sql).' : d.error);
        else setRows(d.documents as Row[]);
      })
      .catch(() => live && setErr('Couldn’t load the documents.'));
    return () => {
      live = false;
    };
  }, []);

  async function start() {
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/writeups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.id) {
      setBusy(false);
      return setErr(d.error || 'Couldn’t start the document.');
    }
    router.push(`/admin/sales/documents/${d.id}`);
  }

  const shown = (rows ?? []).filter((r) => !q.trim() || `${r.number} ${r.title} ${r.for}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="crm dw-page">
      <div className="dw-head">
        <div>
          <h1>Documents</h1>
          <p className="crm-muted">Tenders and other documents, written here from sections, text, pictures and tables. Assign one to a customer, then download it as a PDF or a Word file.</p>
        </div>
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => setChoosing(true)}>
          + New document
        </button>
      </div>
      {choosing && (
        <Sheet title="New document" onClose={() => setChoosing(false)}>
          <div className="dw-choose">
            <Link href="/admin/sales/documents/templates" className="dw-choice">
              <b>From template</b>
              <small>Pick a ready-made document from the library and fill it in.</small>
            </Link>
            <button type="button" className="dw-choice" disabled={busy} onClick={() => void start()}>
              <b>{busy ? 'Starting…' : 'Create blank document'}</b>
              <small>Start empty and build it from sections, text, pictures and tables.</small>
            </button>
          </div>
        </Sheet>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {rows && rows.length > 0 && <input className="crm-input dw-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by number, title or customer" aria-label="Search documents" />}
      {!rows && !err && <p className="crm-muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="crm-muted">No documents yet. Start with + New document.</p>}
      {shown.length > 0 && (
        <ul className="dw-list">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/sales/documents/${r.id}`}>
                <span className="dw-num">{r.number}</span>
                <span className="dw-main">
                  <b>{r.title}</b>
                  <small>{r.for ? `For ${r.for}` : 'Not assigned to a customer yet'}</small>
                </span>
                <span className="dw-when">{when(r.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
