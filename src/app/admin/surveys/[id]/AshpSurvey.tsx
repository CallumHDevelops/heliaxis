'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SurveyDocument, SurveyPayload } from '@/lib/surveys/solar-schema';
import { PhotoSlot, type PhotoActions, type SlotPhoto } from './PhotoSlot';

/**
 * A heat pump survey: the survey itself is done in SimpliHeat, so this just keeps its link and its
 * report (PDF), a few notes and general photos. Mark complete needs the link or the report.
 */

const isHttps = (s: string) => {
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
};

export function AshpSurvey({
  payload,
  photos,
  actions,
  readOnly,
  online,
  onFinish,
  onChanged,
}: {
  payload: SurveyPayload;
  photos: SlotPhoto[];
  actions: PhotoActions;
  readOnly: boolean;
  online: boolean;
  onFinish: () => Promise<void>;
  /** Something changed on the server: open the survey again. */
  onChanged: () => void;
}) {
  const s = payload.survey;
  const [link, setLink] = useState(s.simpliheat_url ?? '');
  const [savedLink, setSavedLink] = useState(s.simpliheat_url ?? '');
  const [notes, setNotes] = useState(s.notes ?? '');
  const [savedNotes, setSavedNotes] = useState(s.notes ?? '');
  const [docs, setDocs] = useState<SurveyDocument[]>(payload.documents);
  const [busy, setBusy] = useState<null | 'link' | 'notes' | 'pdf' | 'finish'>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const jobLink = payload.project.simpliheat_url ?? '';
  const ready = !!savedLink || docs.length > 0;

  async function patch(body: Record<string, unknown>) {
    const r = await fetch(`/api/crm/surveys/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    }).catch(() => null);
    if (!r) throw new Error('No signal: try again when you have signal.');
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) throw new Error(j.error || 'That didn’t save. Try again.');
  }

  async function saveLink(value = link) {
    const v = value.trim();
    if (v && !isHttps(v)) {
      setError('Paste the SimpliHeat link (it starts with https://).');
      return;
    }
    setBusy('link');
    setError(null);
    try {
      await patch({ simpliheat_url: v || null });
      setLink(v);
      setSavedLink(v);
      setDone(v ? 'Link saved ✓' : 'Link removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save.');
    } finally {
      setBusy(null);
    }
  }

  async function saveNotes() {
    if (notes.trim() === savedNotes.trim()) return;
    setBusy('notes');
    setError(null);
    try {
      await patch({ notes });
      setSavedNotes(notes);
      setDone('Notes saved ✓');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t save.');
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    if (file.type !== 'application/pdf') {
      setError('Upload the SimpliHeat report as a PDF.');
      return;
    }
    setBusy('pdf');
    setError(null);
    const url = `/api/crm/surveys/${s.id}/documents`;
    try {
      const prep = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare', name: file.name, mime: file.type, size: file.size }),
        cache: 'no-store',
      });
      const p = (await prep.json().catch(() => ({}))) as { bucket?: string; path?: string; token?: string; error?: string };
      if (!prep.ok || !p.bucket || !p.path || !p.token) throw new Error(p.error || 'Upload failed. Try again.');
      const up = await createClient().storage.from(p.bucket).uploadToSignedUrl(p.path, p.token, file, { contentType: file.type });
      if (up.error) throw new Error(up.error.message);
      const save = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', path: p.path, name: file.name.replace(/\.pdf$/i, '') || 'SimpliHeat report', mime: file.type, size: file.size, category: 'design' }),
        cache: 'no-store',
      });
      const j = (await save.json().catch(() => ({}))) as { document?: SurveyDocument; error?: string };
      if (!save.ok || !j.document) throw new Error(j.error || 'Upload failed. Try again.');
      const doc = j.document;
      setDocs((d) => [doc, ...d]);
      setDone('Report uploaded ✓');
    } catch (err) {
      setError(online ? (err instanceof Error ? err.message : 'Upload failed.') : 'No signal: upload the report when you have signal.');
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    setBusy('finish');
    setError(null);
    try {
      await onFinish();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="svf-ashp">
      {error && (
        <p className="svf-banner svf-banner--err" role="alert">
          {error}
        </p>
      )}
      {done && !error && (
        <p className="svf-banner svf-banner--ok" role="status">
          {done}
        </p>
      )}

      <section className="svf-card">
        <h2 className="svf-screen__title">SimpliHeat survey</h2>
        <p className="svf-help">Do the heat pump survey in SimpliHeat, then keep its link and report here.</p>
        <div className="svf-field">
          <div className="svf-label">
            <label htmlFor="svf-simpliheat">SimpliHeat link</label>
            {savedLink ? <span className="svf-badge svf-badge--done">✓</span> : null}
          </div>
          <input
            id="svf-simpliheat"
            className="svf-input"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={link}
            disabled={readOnly}
            onChange={(e) => setLink(e.target.value)}
          />
          <div className="svf-row">
            {!readOnly && (
              <button type="button" className="svf-btn" disabled={busy === 'link' || link.trim() === savedLink} onClick={() => void saveLink()}>
                {busy === 'link' ? 'Saving…' : 'Save link'}
              </button>
            )}
            {savedLink && isHttps(savedLink) && (
              <a className="svf-btn svf-btn--ghost" href={savedLink} target="_blank" rel="noopener noreferrer">
                Open in SimpliHeat ↗
              </a>
            )}
          </div>
          {!savedLink && jobLink && isHttps(jobLink) && !readOnly && (
            <button type="button" className="svf-link" onClick={() => void saveLink(jobLink)}>
              Use the job’s SimpliHeat link
            </button>
          )}
        </div>

        <div className="svf-field">
          <div className="svf-label">
            <span>SimpliHeat report (PDF)</span>
            {docs.length ? <span className="svf-badge svf-badge--done">✓ {docs.length}</span> : null}
          </div>
          {docs.length > 0 && (
            <ul className="svf-docs">
              {docs.map((d) => (
                <li key={d.id}>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer">
                      📄 {d.name}
                    </a>
                  ) : (
                    <span>📄 {d.name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!readOnly && (
            <>
              <button type="button" className="svf-btn svf-btn--ghost svf-btn--wide" disabled={busy === 'pdf'} onClick={() => pdf.current?.click()}>
                {busy === 'pdf' ? 'Uploading…' : '📄 Upload SimpliHeat report (PDF)'}
              </button>
              <input
                ref={pdf}
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (f) void upload(f);
                }}
              />
            </>
          )}
        </div>

        <div className="svf-field">
          <div className="svf-label">
            <label htmlFor="svf-ashp-notes">Notes</label>
          </div>
          <textarea
            id="svf-ashp-notes"
            className="svf-input svf-textarea"
            rows={4}
            value={notes}
            disabled={readOnly}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => void saveNotes()}
          />
          {notes.trim() !== savedNotes.trim() && !readOnly && (
            <button type="button" className="svf-btn svf-btn--ghost" disabled={busy === 'notes'} onClick={() => void saveNotes()}>
              {busy === 'notes' ? 'Saving…' : 'Save notes'}
            </button>
          )}
        </div>

        <div className="svf-field" id="f-G1">
          <PhotoSlot
            slot="G1"
            label="Photos"
            hint="Anything worth keeping with the job: the outside unit spot, the cylinder, the boiler"
            needed={false}
            multiple
            drawingNeeded={false}
            photos={photos}
            actions={actions}
          />
        </div>
      </section>

      {!readOnly && (
        <div className="svf-finish__go">
          <button type="button" className="svf-btn svf-btn--solar svf-btn--huge" disabled={!ready || busy === 'finish'} onClick={() => void complete()}>
            ✓ Mark complete
          </button>
          <p className="svf-help">{ready ? 'The job moves to Surveyed.' : 'Save the SimpliHeat link or upload its report first.'}</p>
        </div>
      )}
      {readOnly && s.status !== 'complete' && (
        <button type="button" className="svf-link" onClick={onChanged}>
          Check again
        </button>
      )}
    </div>
  );
}
