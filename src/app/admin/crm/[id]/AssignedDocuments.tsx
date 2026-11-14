'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandIcon } from '../CrmUi';

type Row = { id: string; number: string; title: string; updated_at: string };
type Eic = { id: string; number: string; status: string; issued_on: string | null; address: string };

/** The Documents (tenders and the like) made for this customer, organisation or job: open one, or download it as PDF or Word. */
export function AssignedDocuments({ projectId, enquiryId, version }: { projectId: string; enquiryId: string; version?: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [eics, setEics] = useState<Eic[]>([]);
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

  useEffect(() => {
    let live = true;
    const get = (qs: string) =>
      fetch(`/api/crm/eic?${qs}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => ((d?.certificates ?? []) as Eic[]))
        .catch(() => [] as Eic[]);
    void Promise.all([get(`project=${projectId}`), get(`enquiry=${enquiryId}`)]).then(([a, b]) => {
      if (!live) return;
      const seen = new Set<string>();
      setEics([...a, ...b].filter((e) => !seen.has(e.id) && seen.add(e.id)));
    });
    return () => {
      live = false;
    };
  }, [projectId, enquiryId, version]);

  async function startEic() {
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/eic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enquiry_id: enquiryId, project_id: projectId }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok || !d.id) {
      setBusy(false);
      return setErr(d.error || 'Couldn’t start the certificate.');
    }
    router.push(`/admin/eic/${d.id}`);
  }

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
        <span className="dk-written__acts">
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => void startEic()}>
            + New EIC
          </button>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => void start()}>
            {busy ? 'Starting…' : '+ New document'}
          </button>
        </span>
      </header>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {eics.length > 0 && (
        <ul className="dk-written__list">
          {eics.map((e) => (
            <li key={e.id}>
              <Link className="crm-link" href={`/admin/eic/${e.id}`}>
                <strong>{e.number}</strong> Electrical Installation Certificate · {e.status === 'issued' ? `issued ${e.issued_on ?? ''}` : 'draft'}
              </Link>
              <span className="dk-written__acts">
                <a className="crm-link" href={`/api/crm/eic/${e.id}/pdf`}>
                  PDF
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length === 0 && eics.length === 0 && <p className="mcs-note">Nothing written for this customer yet. Documents (tenders, letters) made in Sales › Documents and assigned to them appear here.</p>}
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
