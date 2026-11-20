'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PlainSheet } from './RecordSheets';
import { send } from './record-shared';

type OsOption = { name?: string; systemKwp?: number; annualGenerationKwh?: number; shadeFactor?: number; panelCount?: number; panelModel?: string; batteryModel?: string };

/**
 * The OpenSolar proposal for the handover pack: upload the PDF, it's read (the same reader as the quote
 * builder's), pick the option that was installed, and its figures make the system design calculations
 * (HX-HO-14) and the solar estimate page (HX-HO-10). If it can't be read, the figures are typed instead.
 */
export function OpenSolarSheet({ projectId, onClose, onDone }: { projectId: string; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<'' | 'upload' | 'read' | 'use'>('');
  const [err, setErr] = useState('');
  const [options, setOptions] = useState<OsOption[] | null>(null);
  const url = `/api/crm/projects/${projectId}/opensolar`;

  async function choose(o: OsOption) {
    setBusy('use');
    setErr('');
    try {
      await send(url, 'POST', { action: 'use', option: o });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
      setBusy('');
    }
  }
  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return setErr('Use the proposal as a PDF.');
    setErr('');
    try {
      setBusy('upload');
      const p = await send<{ bucket: string; path: string; token: string }>(url, 'POST', { action: 'prepare' });
      const up = await createClient().storage.from(p.bucket).uploadToSignedUrl(p.path, p.token, file, { contentType: 'application/pdf' });
      if (up.error) throw new Error(up.error.message);
      setBusy('read');
      const r = await send<{ options: OsOption[] }>(url, 'POST', { action: 'read', path: p.path, name: file.name }, 'It couldn’t read that file.');
      if (r.options.length === 1) return void choose(r.options[0]);
      setOptions(r.options);
    } catch (e) {
      setErr(`${e instanceof Error ? e.message : 'It couldn’t read that file.'} You can type the figures in instead.`);
    }
    setBusy('');
  }

  return (
    <PlainSheet label="OpenSolar proposal" onClose={onClose}>
      <h2>Upload the OpenSolar proposal</h2>
      <p className="crm-muted crm-small">
        Its performance table makes the <b>system design calculations</b>, and its yearly generation and shade factor the <b>solar estimate</b> page. The PDF is kept on the job with the design
        documents.
      </p>
      {!options && (
        <label className="crm-btn crm-btn--solar" style={{ display: 'inline-block' }}>
          {busy === 'upload' ? 'Uploading…' : busy === 'read' ? 'Reading it (up to a minute)…' : busy === 'use' ? 'Saving…' : 'Choose the PDF'}
          <input type="file" accept="application/pdf,.pdf" hidden disabled={!!busy} onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
      )}
      {options && (
        <>
          <p className="crm-small">
            <b>Which option was installed?</b>
          </p>
          <ul className="rq-people">
            {options.map((o, i) => (
              <li key={i}>
                <button type="button" className="rq-person" disabled={!!busy} onClick={() => void choose(o)}>
                  <b>{o.name || `Option ${i + 1}`}</b>
                  <small>
                    {[
                      o.systemKwp ? `${o.systemKwp} kWp` : null,
                      o.panelCount ? `${o.panelCount} panels` : null,
                      o.batteryModel ?? null,
                      o.annualGenerationKwh ? `${o.annualGenerationKwh.toLocaleString('en-GB')} kWh a year` : null,
                      o.shadeFactor !== undefined ? `shade factor ${o.shadeFactor}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </PlainSheet>
  );
}
