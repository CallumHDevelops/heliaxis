'use client';

import { useEffect, useState } from 'react';
import { calState, calWords, KINDS, kindLabel, type Instrument } from '@/lib/instruments/shared';
import { Sheet } from '../crm/CrmUi';
import '../crm/crm.css';
import './instruments.css';

const today = () => new Date().toISOString().slice(0, 10);
const day = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–');
type Draft = Partial<Instrument>;

/** Operations › Test instruments: the register, with calibration and expiry dates; the EIC picks from it and warns when one has run out. */
export function InstrumentsList({ admin }: { admin: boolean }) {
  const [rows, setRows] = useState<Instrument[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Draft | null>(null);
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => {
    void fetch('/api/crm/instruments', { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!ok) return setErr(d.missing ? 'Test instruments aren’t set up yet (supabase/test-instruments.sql).' : d.error || 'Couldn’t load the instruments.');
        setRows((d.instruments ?? []) as Instrument[]);
      });
  }, []);

  const t = today();
  const live = (rows ?? []).filter((r) => r.status === 'active');
  const expired = live.filter((r) => calState(r.calibration_due, t) === 'expired').length;
  const soon = live.filter((r) => calState(r.calibration_due, t) === 'soon').length;
  const shown = (rows ?? [])
    .filter((r) => (showRetired ? true : r.status === 'active'))
    .filter((r) => !q.trim() || `${r.name} ${r.make} ${r.model} ${r.serial} ${r.asset_no} ${r.assigned_to}`.toLowerCase().includes(q.trim().toLowerCase()));

  const saved = (i: Instrument) => setRows((l) => [...(l ?? []).filter((x) => x.id !== i.id), i].sort((a, b) => (a.calibration_due ?? '9999').localeCompare(b.calibration_due ?? '9999') || a.name.localeCompare(b.name)));

  return (
    <div className="in-page">
      <header className="in-head">
        <div>
          <h1>Test instruments</h1>
          <p className="crm-muted">Everything we test with: serial and asset numbers and when each was calibrated and runs out. The EIC picks from here and warns when an instrument is out of calibration.</p>
        </div>
        <button type="button" className="crm-btn crm-btn--solar" onClick={() => setEdit({ kind: 'mft' })}>
          + Add an instrument
        </button>
      </header>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {rows && (expired > 0 || soon > 0) && (
        <p className={`crm-banner${expired ? ' crm-banner--err' : ''}`}>
          {expired > 0 ? `${expired} instrument${expired === 1 ? ' is' : 's are'} out of calibration. ` : ''}
          {soon > 0 ? `${soon} ${soon === 1 ? 'runs' : 'run'} out within a month.` : ''}
        </p>
      )}
      <div className="in-tools">
        <input className="crm-input in-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, serial, asset number or who has it" aria-label="Search instruments" />
        <label className="in-check">
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> Show retired
        </label>
      </div>
      {rows && shown.length === 0 && <p className="in-empty">{rows.length ? 'Nothing matches.' : 'No instruments yet. Add the multifunction tester and the others you test with.'}</p>}
      {shown.length > 0 && (
        <ul className="in-list">
          {shown.map((r) => {
            const s = calState(r.calibration_due, t);
            return (
              <li key={r.id} className={r.status === 'retired' ? 'is-retired' : ''}>
                <button type="button" onClick={() => setEdit(r)}>
                  <span className="in-name">
                    <b>{r.name}</b>
                    <small>{[kindLabel(r.kind), r.make, r.model].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="in-ids">
                    <span>SN {r.serial || '–'}</span>
                    <small>Asset {r.asset_no || '–'}</small>
                  </span>
                  <span className="in-cal">
                    <span>Calibrated {day(r.calibrated_on)}</span>
                    <small>{r.assigned_to ? `With ${r.assigned_to}` : 'Not assigned'}</small>
                  </span>
                  <span className={`in-chip in-chip--${r.status === 'retired' ? 'retired' : s}`}>{r.status === 'retired' ? 'Retired' : calWords(r.calibration_due, t)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <InstrumentSheet draft={edit} admin={admin} onClose={() => setEdit(null)} onSaved={(i) => { saved(i); setEdit(null); }} onDeleted={(id) => { setRows((l) => (l ?? []).filter((x) => x.id !== id)); setEdit(null); }} />}
    </div>
  );
}

function InstrumentSheet({ draft, admin, onClose, onSaved, onDeleted }: { draft: Draft; admin: boolean; onClose: () => void; onSaved: (i: Instrument) => void; onDeleted: (id: string) => void }) {
  const [f, setF] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof Instrument, v: string | null) => setF((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof Instrument, label: string, ph = '') => (
    <div className="in-field">
      <label htmlFor={`in-${k}`}>{label}</label>
      <input id={`in-${k}`} className="crm-input" value={String(f[k] ?? '')} placeholder={ph} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  async function save() {
    setBusy(true);
    setErr('');
    const r = await fetch(f.id ? `/api/crm/instruments/${f.id}` : '/api/crm/instruments', { method: f.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) return setErr(d.error || 'Couldn’t save it.');
    onSaved(d.instrument as Instrument);
  }
  async function remove() {
    if (!f.id || !window.confirm(`Delete ${f.name}? Retire it instead if it has been used on certificates.`)) return;
    const r = await fetch(`/api/crm/instruments/${f.id}`, { method: 'DELETE' });
    if (r.ok) onDeleted(f.id);
    else setErr((await r.json().catch(() => ({}))).error || 'Couldn’t delete it.');
  }
  return (
    <Sheet title={f.id ? f.name || 'Instrument' : 'Add an instrument'} onClose={onClose}>
      <div className="in-form">
        {txt('name', 'Name', 'e.g. Megger MFT1741')}
        <div className="in-field">
          <label htmlFor="in-kind">What it tests</label>
          <select id="in-kind" className="crm-input" value={f.kind ?? 'mft'} onChange={(e) => set('kind', e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="in-two">
          {txt('make', 'Make')}
          {txt('model', 'Model')}
        </div>
        <div className="in-two">
          {txt('serial', 'Serial number')}
          {txt('asset_no', 'Asset number')}
        </div>
        <div className="in-two">
          <div className="in-field">
            <label htmlFor="in-cal">Calibrated on</label>
            <input id="in-cal" className="crm-input" type="date" value={f.calibrated_on ?? ''} onChange={(e) => set('calibrated_on', e.target.value || null)} />
          </div>
          <div className="in-field">
            <label htmlFor="in-due">Calibration expires</label>
            <input id="in-due" className="crm-input" type="date" value={f.calibration_due ?? ''} onChange={(e) => set('calibration_due', e.target.value || null)} />
          </div>
        </div>
        <div className="in-two">
          {txt('cert_no', 'Calibration certificate number')}
          {txt('calibrated_by', 'Calibrated by')}
        </div>
        {txt('assigned_to', 'Who has it', 'e.g. Callum, or the van')}
        <div className="in-field">
          <label htmlFor="in-notes">Notes</label>
          <textarea id="in-notes" className="crm-input" rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </div>
        <label className="in-check">
          <input type="checkbox" checked={f.status === 'retired'} onChange={(e) => set('status', e.target.checked ? 'retired' : 'active')} /> Retired (no longer used; kept for old certificates)
        </label>
        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        <div className="crm-actions">
          <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !String(f.name ?? '').trim()} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {f.id && admin && (
            <button type="button" className="crm-link" onClick={() => void remove()}>
              Delete
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
