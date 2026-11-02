'use client';

import { useState } from 'react';
import { RECORD_KINDS, type QmsRecord, type RecordKind } from '@/lib/qms/types';
import { Sheet } from '../crm/CrmUi';
import '../crm/crm.css';
import '../qms/qms.css';
import { deleteRecord, refreshRecords, saveRecord } from '../qms/actions';

/**
 * Operations → Quality records: customer complaints, corrective and preventive actions, internal reviews, tool
 * calibration and the skills and training matrix. Open to every signed-in user (anyone can log a complaint or
 * see where one has got to); only an admin deletes. The QMS documents and their approval are separate (QMS Administration).
 */
export function RecordsPage({ ready, initial, admin, today, initialKind }: { ready: boolean; initial: QmsRecord[]; admin: boolean; today: string; initialKind: RecordKind }) {
  const [records, setRecords] = useState(initial);
  const [kind, setKind] = useState<RecordKind>(initialKind);
  const [rec, setRec] = useState<{ kind: RecordKind; record: QmsRecord | null } | null>(null);
  const [show, setShow] = useState<'live' | 'all'>('live');
  const rows = records.filter((r) => r.kind === kind && (show === 'all' || r.status !== 'closed'));

  if (!ready) {
    return (
      <div className="qms">
        <h1 className="qms-title">Quality records</h1>
        <p className="qms-muted">This needs one setup step: run <code>qms.sql</code> in Supabase (it’s on the “From Claude” to-do list in Setup).</p>
      </div>
    );
  }

  return (
    <div className="qms">
      <div className="qms-head">
        <h1 className="qms-title">Quality records</h1>
        <span className="qms-spacer" />
        <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => setRec({ kind, record: null })}>Add</button>
      </div>
      <div className="qms-tabs qms-tabs--page" role="tablist">
        {RECORD_KINDS.map((k) => (
          <button key={k.key} type="button" role="tab" aria-selected={kind === k.key} className={kind === k.key ? 'is-on' : ''} onClick={() => setKind(k.key)}>{k.plural}</button>
        ))}
      </div>
      <div className="qms-bar2">
        <div className="qms-chips">
          <button type="button" className={show === 'live' ? 'is-on' : ''} onClick={() => setShow('live')}>Open</button>
          <button type="button" className={show === 'all' ? 'is-on' : ''} onClick={() => setShow('all')}>All</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="qms-muted">None yet.</p>
      ) : (
        <table className="qms-table">
          <thead><tr><th>Ref</th><th>Title</th><th>Status</th><th>Owner</th><th>Due</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} tabIndex={0} onClick={() => setRec({ kind: r.kind, record: r })} onKeyDown={(e) => e.key === 'Enter' && setRec({ kind: r.kind, record: r })}>
                <td className="qms-ref">{r.ref}</td><td>{r.title}</td>
                <td><span className={`qms-chip qms-chip--r-${r.status}`}>{r.status === 'open' ? 'Open' : r.status === 'in_progress' ? 'In progress' : 'Closed'}</span></td>
                <td>{r.owner ?? ''}</td><td className={r.due_on && r.status !== 'closed' && r.due_on < today ? 'qms-late' : ''}>{r.due_on ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rec && <RecordSheet kind={rec.kind} record={rec.record} admin={admin} onClose={() => setRec(null)} onSaved={async () => { setRec(null); setRecords(await refreshRecords()); }} />}
    </div>
  );
}

export function RecordSheet({ kind, record, admin, onClose, onSaved }: { kind: RecordKind; record: QmsRecord | null; admin: boolean; onClose: () => void; onSaved: () => void }) {
  const k = RECORD_KINDS.find((x) => x.key === kind)!;
  const [title, setTitle] = useState(record?.title ?? '');
  const [status, setStatus] = useState<QmsRecord['status']>(record?.status ?? 'open');
  const [owner, setOwner] = useState(record?.owner ?? '');
  const [due, setDue] = useState(record?.due_on ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');
  const [data, setData] = useState<Record<string, string>>(record?.data ?? {});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  return (
    <Sheet title={record ? `${record.ref} · ${k.label}` : `New ${k.label.toLowerCase()}`} onClose={onClose}>
      <label className="crm-label" htmlFor="qr-title">Title</label>
      <input id="qr-title" className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      {k.fields.map((f) => (
        <div key={f.key}>
          <label className="crm-label" htmlFor={`qr-${f.key}`}>{f.label}</label>
          {f.long ? <textarea id={`qr-${f.key}`} className="crm-input" rows={3} value={data[f.key] ?? ''} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} /> : <input id={`qr-${f.key}`} type={f.date ? 'date' : 'text'} className="crm-input" value={data[f.key] ?? ''} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} />}
        </div>
      ))}
      <div className="crm-grid2">
        <div><label className="crm-label" htmlFor="qr-owner">Owner</label><input id="qr-owner" className="crm-input" value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
        <div><label className="crm-label" htmlFor="qr-due">{kind === 'calibration' ? 'Next due' : 'Due'}</label><input id="qr-due" type="date" className="crm-input" value={due} onChange={(e) => setDue(e.target.value)} /></div>
      </div>
      <label className="crm-label" htmlFor="qr-status">Status</label>
      <select id="qr-status" className="crm-input" value={status} onChange={(e) => setStatus(e.target.value as QmsRecord['status'])}>
        <option value="open">Open</option><option value="in_progress">In progress</option><option value="closed">Closed</option>
      </select>
      <label className="crm-label" htmlFor="qr-notes">Notes</label>
      <textarea id="qr-notes" className="crm-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      {err && <p className="qms-err" role="alert">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={!!busy || !title.trim()} onClick={async () => { setBusy('save'); const r = await saveRecord({ id: record?.id, kind, title, status, owner, due_on: due, data, notes }); setBusy(''); if (r.ok) onSaved(); else setErr(r.error); }}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>Cancel</button>
        {admin && record && <button type="button" className="crm-link" disabled={!!busy} onClick={async () => { if (!window.confirm('Delete this record?')) return; setBusy('del'); const r = await deleteRecord(record.id); setBusy(''); if (r.ok) onSaved(); else setErr(r.error); }}>Delete</button>}
      </div>
    </Sheet>
  );
}
