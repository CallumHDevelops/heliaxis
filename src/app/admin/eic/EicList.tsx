'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AssignPicker, type Picked } from '@/components/admin/AssignPicker';
import { createClient } from '@/lib/supabase/client';
import { FileButton, Sheet } from '../crm/CrmUi';
import { WritingSpark } from '../sales/quotes/[id]/WritingSpark';
import '../sales/quotes/quotes.css';
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
  const [importing, setImporting] = useState(false);

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
        <div className="em-actions">
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setImporting(true)}>
            Import a certificate
          </button>
          <button type="button" className="crm-btn crm-btn--solar" onClick={() => setMaking(true)}>
            + New EIC
          </button>
        </div>
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
      {importing && <ImportEic onClose={() => setImporting(false)} onMade={(id) => router.push(`/admin/eic/${id}`)} />}
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
        <div className="em-lab">Which job? (optional)</div>
        {who ? (
          <div className="em-who">
            <b>{who.label}</b>
            <button type="button" className="crm-link" onClick={() => setWho(null)}>
              Change
            </button>
          </div>
        ) : (
          <AssignPicker jobOnly onPick={setWho} autoFocus={false} />
        )}
        <small className="crm-muted">MCS paperwork belongs to a job, so pick the customer’s job (it brings the customer with it). You can do it later. A certificate on a job is filed in that job’s Docs when issued.</small>
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

/** Import a certificate someone else made (NICEIC, NAPIT…): the file goes straight to storage, is read, and becomes a draft of ours to check. */
function ImportEic({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [who, setWho] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function run(files: File[]) {
    const f = files[0];
    if (!f) return;
    setBusy(true);
    setErr('');
    try {
      const head = { 'Content-Type': 'application/json' };
      const prep = await fetch('/api/crm/eic/import', { method: 'POST', headers: head, body: JSON.stringify({ action: 'prepare', name: f.name }) });
      const p = await prep.json().catch(() => ({}));
      if (!prep.ok) throw new Error(p.error || 'Couldn’t start the upload.');
      const up = await createClient().storage.from(p.bucket).uploadToSignedUrl(p.path, p.token, f, { contentType: f.type || undefined });
      if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
      const r = await fetch('/api/crm/eic/import', { method: 'POST', headers: head, body: JSON.stringify({ action: 'import', path: p.path, enquiry_id: who?.enquiry_id, project_id: who?.project_id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) throw new Error(d.error || 'It couldn’t read that certificate.');
      onMade(d.id as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'It couldn’t read that certificate.');
      setBusy(false);
    }
  }
  return (
    <Sheet title="Import a certificate" onClose={onClose}>
      <div className="em-new">
        <p style={{ margin: 0 }}>
          Choose an Electrical Installation Certificate made by another contractor (an NICEIC or NAPIT one, as a PDF or a photo). It’s read into one of ours as a draft, with its circuits and test results.
        </p>
        <small className="crm-muted">
          Signatures are never copied, and anything it wasn’t sure of is left for you to fill in. Check every answer against the original before it’s issued, and only issue it under our name if the work was ours to certify.
        </small>
        <div className="em-lab">Which job? (optional)</div>
        {who ? (
          <div className="em-who">
            <b>{who.label}</b>
            <button type="button" className="crm-link" onClick={() => setWho(null)}>
              Change
            </button>
          </div>
        ) : (
          <AssignPicker jobOnly onPick={setWho} autoFocus={false} />
        )}
        {busy && <WritingSpark label="Reading the certificate" steps={['Uploading the certificate', 'Reading the supply and earthing', 'Reading the inspections', 'Reading each circuit', 'Checking what is certain']} stepMs={5000} />}
        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        <div className="crm-actions">
          <FileButton label={busy ? 'Reading…' : 'Choose the certificate'} accept="application/pdf,image/jpeg,image/png,image/webp" busy={busy} onFiles={(f) => void run(f)} variant="solar" />
        </div>
      </div>
    </Sheet>
  );
}
