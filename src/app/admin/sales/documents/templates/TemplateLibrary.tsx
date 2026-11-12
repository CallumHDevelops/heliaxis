'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DOC_LIBRARY_CATEGORIES } from '@/lib/writeups/categories';
import '../../../crm/crm.css';
import '../documents.css';

type Tpl = { id: string; name: string; category: string; note: string; standard: boolean; blocks: number };

/** The template library: pick one (by category or search) to make a new document from a copy of it. */
export function TemplateLibrary({ admin }: { admin: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<Tpl[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');

  const load = () =>
    fetch('/api/crm/writeups/templates', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        else setRows(d.templates as Tpl[]);
      })
      .catch(() => setErr('Couldn’t load the templates.'));
  useEffect(() => {
    void load();
  }, []);

  async function use(t: Tpl) {
    setBusy(t.id);
    setErr('');
    const r = await fetch('/api/crm/writeups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template_id: t.id }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.id) {
      setBusy(null);
      return setErr(d.error || 'Couldn’t start the document.');
    }
    router.push(`/admin/sales/documents/${d.id}`);
  }

  async function remove(t: Tpl) {
    if (!window.confirm(`Remove “${t.name}” from the library? Documents already made from it keep their copy.`)) return;
    await fetch(`/api/crm/writeups/templates/${t.id}`, { method: 'DELETE' });
    void load();
  }

  const cats = ['All', ...DOC_LIBRARY_CATEGORIES.filter((c) => (rows ?? []).some((t) => t.category === c))];
  const shown = (rows ?? []).filter((t) => (cat === 'All' || t.category === cat) && (!q.trim() || `${t.name} ${t.note} ${t.category}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="crm dw-page">
      <div className="dw-head">
        <div>
          <Link href="/admin/sales/documents" className="dw-back">
            ← Documents
          </Link>
          <h1>Template library</h1>
          <p className="crm-muted">Choose a template to start a new document from a copy of it. Save your own from inside any document.</p>
        </div>
      </div>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {rows && (
        <>
          <input className="crm-input dw-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" aria-label="Search templates" />
          <div className="dw-cats" role="group" aria-label="Category">
            {cats.map((c) => (
              <button key={c} type="button" className={`dw-cat${cat === c ? ' is-on' : ''}`} onClick={() => setCat(c)}>
                {c}
              </button>
            ))}
          </div>
        </>
      )}
      {!rows && !err && <p className="crm-muted">Loading…</p>}
      {rows && !shown.length && <p className="crm-muted">No templates here yet.</p>}
      <ul className="dw-tpls">
        {shown.map((t) => (
          <li key={t.id} className="dw-tpl">
            <span className="dw-tag">{t.category}</span>
            <b>{t.name}</b>
            {t.note && <small>{t.note}</small>}
            <div className="dw-tools">
              <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy !== null} onClick={() => void use(t)}>
                {busy === t.id ? 'Starting…' : 'Use this template'}
              </button>
              {!t.standard && admin && (
                <button type="button" className="crm-link crm-danger" onClick={() => void remove(t)}>
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
