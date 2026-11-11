'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandIcon } from '../CrmUi';

type Row = { id: string; number: string; title: string; updated_at: string };

/** The Documents (tenders and the like) made for this customer, organisation or job: open one, or download it as PDF or Word. */
export function AssignedDocuments({ projectId, enquiryId, version }: { projectId: string; enquiryId: string; version?: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`/api/crm/projects/${projectId}/writeups`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setRows(((d?.documents ?? []) as Row[])))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [projectId, version]);

  async function start() {
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/writeups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiry_id: enquiryId, project_id: projectId }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok || !d.id) {
      setBusy(false);
      return setErr(d.error || 'Couldn’t start the document.');
    }
    router.push(`/admin/sales/documents/${d.id}`);
  }

  return (
    <section className="dk-written">
      <header className="dk-written__head">
        <h3>
          <BrandIcon k="document" size={18} /> Documents
        </h3>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => void start()}>
          {busy ? 'Starting…' : '+ New document'}
        </button>
      </header>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {rows && rows.length === 0 && <p className="mcs-note">Nothing written for this customer yet. Documents (tenders, letters) made in Sales › Documents and assigned to them appear here.</p>}
      {rows && rows.length > 0 && (
        <ul className="dk-written__list">
          {rows.map((d) => (
            <li key={d.id}>
              <Link className="crm-link" href={`/admin/sales/documents/${d.id}`}>
                <strong>{d.number}</strong> {d.title}
              </Link>
              <span className="dk-written__acts">
                <a className="crm-link" href={`/api/crm/writeups/${d.id}/download?format=pdf`}>
                  PDF
                </a>
                <a className="crm-link" href={`/api/crm/writeups/${d.id}/download?format=docx`}>
                  Word
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
