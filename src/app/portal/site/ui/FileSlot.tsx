'use client';

import { useRef, useState } from 'react';
import { queueFile, removeFile, waitingFiles } from '@/lib/site/electrician-client';
import type { Field } from '@/lib/site/forms/types';
import { getFile, type PackRecord } from '@/lib/site/offline';
import type { JobForms } from './form-state';
import { useLive } from './nav';
import { PhotoSlot } from './PhotoSlot';

/**
 * A slot that takes a PDF as well as photos (an uploaded certificate): the PDF from the scheme's
 * software, or a photo of each page. Kept on the phone and sent when there's signal, like photos;
 * both count towards the slot.
 */
export function FileSlot({ field, rec, jf, need, locked }: { field: Field; rec: PackRecord; jf: JobForms; need: number; locked: boolean }) {
  const job = rec.id;
  const picker = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const waiting = useLive(() => waitingFiles(job), `files:${job}`) ?? [];
  const sent = (rec.pack.electrician?.uploads ?? []).filter((u) => u.slot === field.key && !waiting.some((w) => w.client_id === u.client_id));
  const pages = jf.photos[field.key] ?? [];
  const n = sent.length + waiting.filter((w) => w.slot === field.key && !w.failed).length + pages.length;

  const open = async (id: string) => {
    const kept = await getFile(`upload:${id}`);
    if (!kept) return setProblem('Not on this phone yet. It downloads when you have signal.');
    const url = URL.createObjectURL(kept.blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="sa-fileslot">
      <p className={`sa-photos-count${need && n >= need ? ' is-done' : ''}`}>{need ? (n >= need ? 'Added ✓' : 'Not added yet') : ''}</p>
      {(sent.length > 0 || waiting.some((w) => w.slot === field.key)) && (
        <ul className="sa-filelist">
          {waiting
            .filter((w) => w.slot === field.key)
            .map((w) => (
              <li key={w.op_id} className="sa-file-row">
                <span className="sa-file-name">{w.name}</span>
                <span className={w.failed ? 'sa-hint-warn' : 'sa-muted'}>{w.failed ? `Couldn’t send: ${w.failed}` : 'Waiting to send'}</span>
                {!locked && (
                  <button type="button" className="sa-x" aria-label={`Remove ${w.name}`} onClick={() => void removeFile(job, { op_id: w.op_id, client_id: w.client_id })}>
                    ×
                  </button>
                )}
              </li>
            ))}
          {sent.map((u) => (
            <li key={u.id} className="sa-file-row">
              <button type="button" className="sa-link sa-file-name" onClick={() => void open(u.id)}>
                {u.name}
              </button>
              <span className="sa-ok-tag">Sent ✓</span>
              {!locked && (
                <button type="button" className="sa-x" aria-label={`Remove ${u.name}`} onClick={() => void removeFile(job, { client_id: u.client_id })}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <>
          <button type="button" className="sa-btn sa-btn-1" onClick={() => picker.current?.click()}>
            Add the PDF
          </button>
          <input
            ref={picker}
            type="file"
            accept="application/pdf"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const r = await queueFile(job, field.key, file);
              setProblem(r.ok ? null : r.message);
            }}
          />
        </>
      )}
      {problem && <p className="sa-err">{problem}</p>}
      <p className="sa-or">or a photo of each page</p>
      <PhotoSlot field={{ ...field, label_photo: true }} slot={field.key} need={0} rec={rec} photos={pages} locked={locked} />
    </div>
  );
}
