'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AssignPicker, type Picked } from '@/components/admin/AssignPicker';
import { Sheet } from '../crm/CrmUi';
import '../crm/crm.css';
import './eic-manual.css';

type Row = { id: string; number: string; route: string; title: string; customer: string | null; job: string | null; address: string; status: string; issued_on: string | null; updated_at: string };
const ROUTE: Record<string, string> = { eic: 'Three-part EIC', eic_single: 'Single-signature EIC', meiwc: 'Minor Works' };
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });

/** Operations › EIC certificates: the ones made in the office, and a way to start another for a customer, a job or both. */
export function EicList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [making, setMaking] = useState(false);

  useEffect(() => {
    void fetch('/api/crm/eic', { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!ok) return setErr(d.missing ? 'EIC certificates aren’t set up yet (supabase/eic-manual.sql).' : d.error || 'Couldn’t load the certificates.');
        setRows((d.certificates ?? []) as Row[]);
      });
  }, []);

  const shown = (rows ?? []).filter((r) => !q.trim() || `${r.number} ${r.title} ${r.customer ?? ''} ${r.job ?? ''} ${r.address}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="em-page">
      <header className="em-head">
        <div>
          <h1>EIC certificates</h1>
          <p className="crm-muted">Electrical Installation Certificates written up here: the same certificate the site app makes, for work you want to record by hand.</p>
        </div>
        <button type="button" className="crm-btn crm-btn--solar" onClick={() => setMaking(true)}>
          + New EIC
        </button>
      </header>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <input className="crm-input em-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by number, customer, job or address" aria-label="Search certificates" />
      {rows && shown.length === 0 && <p className="em-empty">{rows.length ? 'Nothing matches.' : 'No certificates yet. Press New EIC to start one.'}</p>}
      {shown.length > 0 && (
        <ul className="em-list">
          {shown.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/eic/${r.id}`}>
                <b className="em-num">{r.number}</b>
                <span className="em-main2">
                  <b>{r.customer ?? 'No customer'}</b>
                  <small>{[r.job, r.address, ROUTE[r.route]].filter(Boolean).join(' · ')}</small>
                </span>
                <span className={`em-status em-status--${r.status}`}>{r.status === 'issued' ? `Issued ${r.issued_on ? when(r.issued_on) : ''}` : 'Draft'}</span>
                <span className="crm-muted em-when">{when(r.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {making && <NewEic onClose={() => setMaking(false)} onMade={(id) => router.push(`/admin/eic/${id}`)} />}
    </div>
  );
}

function NewEic({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [route, setRoute] = useState<'eic_single' | 'eic'>('eic_single');
  const [who, setWho] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function make() {
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/eic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ route, enquiry_id: who?.enquiry_id, project_id: who?.project_id }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok || !d.id) {
      setBusy(false);
      return setErr(d.error || 'Couldn’t start the certificate.');
    }
    onMade(d.id as string);
  }
  return (
    <Sheet title="New EIC" onClose={onClose}>
      <div className="em-new">
        <div className="em-lab">Which certificate?</div>
        <div className="em-seg">
          <button type="button" className={route === 'eic_single' ? 'is-on' : ''} onClick={() => setRoute('eic_single')}>
            Single signature
          </button>
          <button type="button" className={route === 'eic' ? 'is-on' : ''} onClick={() => setRoute('eic')}>
            Three-part (design, construction, testing)
          </button>
        </div>
        <small className="crm-muted">Single signature: one person designed, built and tested it. Three-part: separate signatures, with a design part.</small>
        <div className="em-lab">Assign to (optional)</div>
        {who ? (
          <div className="em-who">
            <b>{who.label}</b>
            <button type="button" className="crm-link" onClick={() => setWho(null)}>
              Change
            </button>
          </div>
        ) : (
          <AssignPicker onPick={setWho} autoFocus={false} />
        )}
        <small className="crm-muted">A customer, a job, or a job (which brings its customer). You can change this later. A certificate on a job is filed in that job’s Docs when issued.</small>
        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        <div className="crm-actions">
          <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => void make()}>
            {busy ? 'Starting…' : 'Start the certificate'}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
