'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileButton } from '@/app/admin/crm/CrmUi';
import type { PackHeadline } from '@/lib/inhouse/pack';
import { GROUPS, STATE_LABEL, type SlotView } from '@/lib/inhouse/slots';
import { uploadFile } from './ProjectExtras';
import './handover.css';
import './mcs.css';

export type FormItem = { code: string; title: string; purpose: string | null; status: 'none' | 'draft' | 'signed' | 'superseded'; revision: number; progress: { asked: number; answered: number; left: number }; signed: string[]; updatedAt: string | null };
type Pack = {
  headline: PackHeadline;
  inhouse: { rows: SlotView[]; hidden: number; uploads: boolean };
  forms: { ready: boolean; list: FormItem[] };
  handover: { available: boolean; summary: { words: string; next: string; complete: number; total: number; sent: boolean } | null; opensAt: string | null };
};

const when = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }).format(new Date(iso));
  } catch {
    return '';
  }
};

/** A form's state as the same chip the Handover pack uses: signed is complete, being filled in is waiting, not started is missing. */
export function formState(f: Pick<FormItem, 'status'>): 'complete' | 'waiting' | 'missing' {
  return f.status === 'signed' ? 'complete' : f.status === 'draft' ? 'waiting' : 'missing';
}
const formWords = (f: FormItem) =>
  f.status === 'signed' ? 'Signed' : f.status === 'draft' ? (f.progress.left ? `${f.progress.left} to answer` : 'Ready to sign') : 'Not started';

/**
 * The MCS pack on a job (Docs → MCS pack): the paperwork a heat pump (or any MCS) job needs, in three parts.
 * In-House: Heliaxis’s own file, never shown to a customer. Forms: the commissioning record and the rest, filled in here.
 * Handover: the customer’s pack, which has its own tab from Ready to book.
 */
export function McsPack({ projectId, version, onOpenForm, onOpenHandover }: { projectId: string; version: string; onOpenForm: (code: string) => void; onOpenHandover: () => void }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crm/projects/${projectId}/mcs`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not open the MCS pack.');
      setPack(d as Pack);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open the MCS pack.');
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load, version]);

  async function file(code: string, files: File[]) {
    setBusy(code);
    setErr('');
    try {
      for (const f of files) await uploadFile(`/api/crm/projects/${projectId}/documents`, f, { inhouse_slot: code });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  }

  if (!pack) return <p className="mcs-note">{err || 'Opening the MCS pack…'}</p>;
  const pct = pack.headline.total ? Math.round((pack.headline.complete / pack.headline.total) * 100) : 0;
  const rows = pack.inhouse.rows;

  function row(s: SlotView) {
    const isOpen = open === s.code;
    return (
      <li key={s.code} className={`hv-row hv-row--${s.state}`}>
        <div className="hv-row__head">
          <span className={`hv-state hv-state--${s.state}`}>{STATE_LABEL[s.state]}</span>
          <span className="hv-row__main">
            <span className="hv-row__title">
              <b>{s.title}</b> <code>{s.code}</code>
            </span>
            {s.why && <small className={`hv-row__why${s.state === 'missing' ? ' is-act' : ''}`}>{s.why}</small>}
          </span>
          <span className="mcs-rowacts">
            {s.docs.length > 0 && (
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.code)}>
                {s.docs.length === 1 ? '1 file' : `${s.docs.length} files`}
              </button>
            )}
            {pack!.inhouse.uploads && s.state !== 'na' && <FileButton label={busy === s.code ? 'Uploading…' : s.docs.length ? 'Add another' : 'Upload'} busy={busy !== null} onFiles={(f) => void file(s.code, f)} />}
          </span>
        </div>
        {isOpen && (
          <ul className="mcs-files">
            {s.docs.map((d) => (
              <li key={d.id}>
                <a className="crm-link" href={`/api/crm/documents/${d.id}`} target="_blank" rel="noreferrer">
                  {d.name}
                </a>
                <small>{when(d.at)}</small>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="mcs">
      <section className="hv-top" aria-label="MCS pack">
        <div className="hv-top__main">
          <h3>MCS pack</h3>
          <p className="hv-head">{pack.headline.words || 'Nothing to do yet'}</p>
          <span className="hv-bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
          <p className="hv-packline">The In-House file and the forms are Heliaxis’s own records. Customers only ever see the Handover pack.</p>
        </div>
      </section>
      {err && (
        <p className="mcs-err" role="alert">
          {err}
        </p>
      )}

      <section className="hv-group" aria-label="Forms">
        <h4>Forms</h4>
        {!pack.forms.ready ? (
          <p className="mcs-note">Forms aren’t set up on this system yet.</p>
        ) : pack.forms.list.length === 0 ? (
          <p className="mcs-note">No forms for this job’s technology. Heat pump jobs get the commissioning record, the cylinder record and the handover certificate.</p>
        ) : (
          <ul className="hv-rows">
            {pack.forms.list.map((f) => (
              <li key={f.code} className={`hv-row hv-row--${formState(f)}`}>
                <div className="hv-row__head">
                  <span className={`hv-state hv-state--${formState(f)}`}>{formWords(f)}</span>
                  <span className="hv-row__main">
                    <span className="hv-row__title">
                      <b>{f.title}</b> <code>{f.code}</code>
                    </span>
                    {f.purpose && <small className="hv-row__cust">{f.purpose}</small>}
                    {f.status !== 'none' && (
                      <small className="hv-row__why">
                        {f.progress.answered} of {f.progress.asked} answered{f.revision > 1 ? ` · revision ${f.revision}` : ''}
                        {f.updatedAt ? ` · ${when(f.updatedAt)}` : ''}
                      </small>
                    )}
                  </span>
                  <span className="mcs-rowacts">
                    <button type="button" className={`crm-btn crm-btn--${f.status === 'signed' ? 'ghost' : 'solar'} crm-btn--small`} onClick={() => onOpenForm(f.code)}>
                      {f.status === 'none' ? 'Start' : f.status === 'signed' ? 'Open' : 'Continue'}
                    </button>
                    <a className="crm-btn crm-btn--ghost crm-btn--small" href={`/api/crm/projects/${projectId}/forms/${encodeURIComponent(f.code)}/pdf`} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hv-group" aria-label="In-House file">
        <h4>In-House file · internal, not for customers</h4>
        <ul className="hv-rows">
          {GROUPS.map((g) => {
            const list = rows.filter((s) => s.group === g.key);
            if (!list.length) return null;
            return (
              <li key={g.key} className="mcs-sub">
                <h5>{g.title}</h5>
                <ul className="hv-rows">{list.map(row)}</ul>
              </li>
            );
          })}
        </ul>
        {pack.inhouse.hidden > 0 && <p className="hv-hidden">{pack.inhouse.hidden} item{pack.inhouse.hidden === 1 ? '' : 's'} left out because they’re for technologies this job doesn’t have.</p>}
        {!pack.inhouse.uploads && <p className="mcs-note">Filing documents against these items needs inhouse-docs.sql to be run.</p>}
      </section>

      <section className="hv-group" aria-label="Handover pack">
        <h4>Handover pack · for the customer</h4>
        <div className="hv-row hv-row--na mcs-handover">
          {pack.handover.available && pack.handover.summary ? (
            <>
              <span className="hv-row__main">
                <b>{pack.handover.summary.words}</b>
                <small className="hv-row__why">
                  {pack.handover.summary.sent ? 'Sent · ' : ''}
                  {pack.handover.summary.next}
                </small>
              </span>
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={onOpenHandover}>
                Open the Handover pack
              </button>
            </>
          ) : (
            <span className="hv-row__main">
              <b>Not open yet</b>
              <small className="hv-row__why">{pack.handover.opensAt ? `The customer’s Handover pack opens at ${pack.handover.opensAt}.` : 'Handover isn’t set up on this system yet.'}</small>
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
