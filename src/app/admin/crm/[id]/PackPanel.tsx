'use client';

import { useState } from 'react';
import { BrandIcon, FileButton } from '@/app/admin/crm/CrmUi';
import { buttonsFor, type Pack, type PackItem } from '@/lib/docs/packs';
import { uploadFile } from './ProjectExtras';
import './docs.css';

const when = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }).format(new Date(iso));
  } catch {
    return '';
  }
};

/** A line's mark: a green tick when it is done, an orange warning when it is still needed, a dash when it isn't needed. */
export function Mark({ state }: { state: PackItem['state'] }) {
  if (state === 'complete')
    return (
      <span className="dk-mark dk-mark--ok" role="img" aria-label="Complete">
        <BrandIcon k="check" size={24} />
      </span>
    );
  if (state === 'na')
    return (
      <span className="dk-mark dk-mark--na" role="img" aria-label="Not needed">
        <i />
      </span>
    );
  return (
    <span className="dk-mark dk-mark--warn" role="img" aria-label="Still needed">
      <BrandIcon k="warning" size={24} />
    </span>
  );
}

/**
 * One pack as line items: what the pack needs, each with a green tick (done) or an orange warning (still needed), its code and
 * document number, and Preview, Edit and Download where there is something to open. Up top: the pack's ZIP, and Send to the
 * customer for the packs the customer is given.
 */
export function PackPanel({ projectId, pack, canUpload, onEdit, onChanged }: { projectId: string; pack: Pack; canUpload: boolean; onEdit: (code: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const field = pack.key === 'proposal' ? 'proposal_slot' : 'inhouse_slot';
  const doc = (id: string, q = '') => `/api/crm/documents/${id}${q}`;
  const form = (code: string, q = '') => `/api/crm/projects/${projectId}/forms/${encodeURIComponent(code)}/pdf${q}`;
  const hasFiles = pack.items.some((i) => i.docs.length > 0 || i.form);
  const pct = pack.headline.total ? Math.round((pack.headline.complete / pack.headline.total) * 100) : 0;

  async function upload(code: string, files: File[]) {
    setBusy(code);
    setErr('');
    try {
      for (const f of files) await uploadFile(`/api/crm/projects/${projectId}/documents`, f, { [field]: code });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  }

  function row(i: PackItem) {
    const b = buttonsFor(i);
    const newest = [...i.docs].sort((a, c) => c.version - a.version || c.at.localeCompare(a.at))[0];
    const isOpen = open === i.code;
    return (
      <li key={i.code} className={`dk-row dk-row--${i.state}`}>
        <Mark state={i.state} />
        <span className="dk-row__main">
          <span className="dk-row__title">
            <b>{i.title}</b>
            <code>{i.code}</code>
            {i.docNo && <span className="dk-docno">{i.docNo}</span>}
          </span>
          {i.why && i.state !== 'complete' && <small className={`dk-row__why${i.state === 'na' ? '' : ' is-act'}`}>{i.why}</small>}
          {newest && i.state === 'complete' && (
            <small className="dk-row__why">
              {newest.generated ? 'Made by Heliaxis' : 'Uploaded'} {when(newest.at)}
              {i.docs.length > 1 && (
                <>
                  {' · '}
                  <button type="button" className="crm-link" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i.code)}>
                    {i.docs.length} files
                  </button>
                </>
              )}
            </small>
          )}
        </span>
        <span className="dk-row__btns">
          {b.preview && (
            <a className="crm-btn crm-btn--ghost crm-btn--small" href={i.form ? form(i.code) : doc(newest!.id)} target="_blank" rel="noreferrer">
              Preview
            </a>
          )}
          {b.edit && (
            <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={() => onEdit(i.code)}>
              {i.state === 'complete' ? 'Open' : 'Edit'}
            </button>
          )}
          {b.download && (
            <a className="crm-btn crm-btn--ghost crm-btn--small" href={i.form ? form(i.code, '?download=1') : doc(newest!.id, '?download=1')}>
              Download
            </a>
          )}
          {b.upload && canUpload && <FileButton label={busy === i.code ? 'Uploading…' : i.docs.length ? 'Add another' : 'Upload'} busy={busy !== null} onFiles={(f) => void upload(i.code, f)} />}
        </span>
        {isOpen && (
          <ul className="dk-files">
            {i.docs.map((d) => (
              <li key={d.id}>
                <span>
                  {d.name} <small>v{d.version} · {when(d.at)}</small>
                </span>
                <a className="crm-link" href={doc(d.id)} target="_blank" rel="noreferrer">
                  Preview
                </a>
                <a className="crm-link" href={doc(d.id, '?download=1')}>
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  const groups = pack.groups.map((g) => ({ ...g, items: pack.items.filter((i) => i.group === g.key) })).filter((g) => g.items.length);
  const sendNote = !pack.customer ? 'Internal: never sent to a customer.' : pack.key === 'proposal' ? 'The customer is sent to their login once every item is complete.' : '';

  return (
    <div className="dk-panel">
      <header className="dk-head">
        <div className="dk-head__main">
          <h3>{pack.title} pack</h3>
          <p className="dk-head__blurb">{pack.blurb}</p>
          <p className="dk-head__sum">{pack.headline.words}</p>
          <span className="dk-bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        </div>
        <div className="dk-head__btns">
          {hasFiles ? (
            <a className="crm-btn crm-btn--ghost" href={`/api/crm/projects/${projectId}/packs/${pack.key}/zip`}>
              Download ZIP
            </a>
          ) : (
            <button type="button" className="crm-btn crm-btn--ghost" disabled>
              Download ZIP
            </button>
          )}
          {pack.customer && (
            <button type="button" className="crm-btn crm-btn--solar" disabled={pack.headline.open > 0} title={pack.headline.open > 0 ? 'Every item has to be complete first' : undefined}>
              Send to customer
            </button>
          )}
          {sendNote && <small>{sendNote}</small>}
        </div>
      </header>
      {err && (
        <p className="mcs-err" role="alert">
          {err}
        </p>
      )}
      {!pack.ready ? (
        <p className="mcs-note">This pack isn’t set up on this system yet.</p>
      ) : groups.length === 0 ? (
        <p className="mcs-note">Nothing in this pack for this job yet.</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="dk-group" aria-label={g.title}>
            <h4>{g.title}</h4>
            <ul className="dk-rows">{g.items.map(row)}</ul>
          </section>
        ))
      )}
    </div>
  );
}
