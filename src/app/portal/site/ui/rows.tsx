'use client';

import { useState } from 'react';
import type { Field } from '@/lib/site/forms/types';
import { getFile, type PackRecord } from '@/lib/site/offline';
import { missing, openForms, stepShown } from '@/lib/site/rules';
import type { JobForms, SlotPhoto } from './form-state';
import { go, useBlobUrl, useLive } from './nav';

/**
 * Pieces of a question row for the electrician's pack (P9, P14): the evidence beside a checklist row
 * (their own photos, the roofer's), guidance behind ⓘ, a worked-out answer's tag, and the Finish
 * screen's "Everything provided" list.
 */

function Thumb({ photo, server }: { photo?: SlotPhoto; server?: string }) {
  const id = server ?? (photo?.server ? `thumb:${photo.server.id}` : null);
  const kept = useLive(() => (id ? getFile(id) : Promise.resolve(undefined)), `ev:${id ?? photo?.id}`);
  const url = useBlobUrl(photo?.local?.thumb ?? kept?.blob ?? null);
  return (
    <span className="sa-ev-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob from the phone */}
      {url && <img src={url} alt="" />}
    </span>
  );
}

/** Evidence beside a row: "Your photos: Cable routes (3)", "Roofer: roof hooks (2)". Tapping one of yours opens its step. */
export function Evidence({ f, jf, rec, labels }: { f: Field; jf: JobForms; rec: PackRecord; labels: Record<string, string> }) {
  const mine = (f.evidence ?? []).map((slot) => ({ slot, list: jf.photos[slot] ?? [] }));
  const theirs = (f.rooferEvidence ?? []).map((slot) => ({ slot, list: (rec.pack.electrician?.roofer_photos ?? []).filter((p) => p.slot === slot) }));
  if (!mine.length && !theirs.length) return null;
  return (
    <div className="sa-ev">
      {mine.map(({ slot, list }) => (
        <button key={slot} type="button" className="sa-ev-row" onClick={() => go(`/portal/site/job/${rec.id}/photos`)}>
          <span className="sa-ev-label">
            {labels[slot] ?? slot}: {list.length ? `${list.length} photo${list.length === 1 ? '' : 's'}` : 'no photo yet'}
          </span>
          <span className="sa-ev-thumbs">
            {list.slice(0, 3).map((p) => (
              <Thumb key={p.id} photo={p} />
            ))}
          </span>
        </button>
      ))}
      {theirs.map(({ slot, list }) =>
        list.length ? (
          <div key={slot} className="sa-ev-row">
            <span className="sa-ev-label">
              Roofer’s photos: {labels[slot] ?? slot} ({list.length})
            </span>
            <span className="sa-ev-thumbs">
              {list.slice(0, 3).map((p) => (
                <Thumb key={p.id} server={`thumb:${p.id}`} />
              ))}
            </span>
          </div>
        ) : null
      )}
    </div>
  );
}

/** How to do it, behind ⓘ (the battery tests), in full when tapped. */
export function Info({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sa-info">
      <button type="button" className="sa-info-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">ⓘ</span> {open ? 'Hide the guidance' : 'Guidance'}
      </button>
      {open && <p className="sa-info-text">{text}</p>}
    </div>
  );
}

/**
 * P14 "Everything provided": every must still open on the other steps, each opening its step. Green
 * with a tick when there's nothing left.
 */
export function MissingPanel({ jf, rec }: { jf: JobForms; rec: PackRecord }) {
  const items = openForms(jf.forms, jf.signed).flatMap((form) =>
    missing({ ...form, steps: form.steps.filter((s) => s.key !== 'finish' && stepShown(s, jf.ctx)) }, jf.ctx).must.map((m) => ({ ...m, title: form.steps.find((s) => s.key === m.step)?.title ?? '' }))
  );
  if (!items.length) return <p className="sa-provided is-done">Everything provided ✓</p>;
  const byStep = new Map<string, typeof items>();
  for (const m of items) byStep.set(m.step, [...(byStep.get(m.step) ?? []), m]);
  return (
    <div className="sa-provided">
      <p className="sa-provided-head">
        {items.length} thing{items.length === 1 ? '' : 's'} still to do before you can finish:
      </p>
      {[...byStep.entries()].map(([step, list]) => (
        <div key={step} className="sa-provided-step">
          <h4>{list[0].title}</h4>
          <ul className="sa-todo">
            {list.slice(0, 8).map((m) => (
              <li key={m.key}>
                <button type="button" className="sa-todo-row" onClick={() => go(`/portal/site/job/${rec.id}/${step}`)}>
                  <span>{m.label}</span>
                  <span className="sa-muted">{m.why}</span>
                </button>
              </li>
            ))}
            {list.length > 8 && <li className="sa-muted">and {list.length - 8} more</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}
