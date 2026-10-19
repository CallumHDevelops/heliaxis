'use client';

import { useRef, useState } from 'react';
import type { RunStep } from '@/lib/surveys/rules';
import { PhotoThumb, type SlotPhoto } from './PhotoSlot';

/**
 * "Take the photos": every photo the survey asks for, one at a time and in the order of the visit
 * (Needed and Should first, then the optional ones), with one big Take photo button. Uses the same
 * camera input and photo queue as the questions, so photos taken here appear there too.
 */

const LEVEL_WORD = { must: 'Needed', should: 'Should', optional: 'Optional' } as const;

export function PhotoRun({
  steps,
  photos,
  startSlot,
  drawingNeeded,
  onAdd,
  onOpen,
  onClose,
}: {
  steps: RunStep[];
  photos: SlotPhoto[];
  /** Start here; otherwise at the first photo not taken yet. */
  startSlot?: string | null;
  drawingNeeded: (slot: string) => boolean;
  onAdd: (slot: string, files: File[]) => Promise<void>;
  onOpen: (p: SlotPhoto, draw?: boolean) => void;
  onClose: () => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [slot, setSlot] = useState<string | null>(() => {
    const start = (startSlot && steps.find((s) => s.slot === startSlot)) || steps.find((s) => !s.done && s.level !== 'optional') || steps.find((s) => !s.done) || steps[0];
    return start?.slot ?? null;
  });
  const [busy, setBusy] = useState(false);

  // The steps can change while the run is open (a photo taken, a question answered): follow the slot.
  const found = steps.findIndex((s) => s.slot === slot);
  const i = found >= 0 ? found : 0;
  const step = steps[i];
  const next = steps[i + 1];
  const prev = steps[i - 1];
  const todo = steps.filter((s) => !s.done && s.level !== 'optional').length;

  if (!step) {
    return (
      <div className="svf-full" role="dialog" aria-modal="true" aria-label="Take the photos">
        <div className="svf-full__bar">
          <button type="button" className="svf-btn svf-btn--ghost" onClick={onClose}>
            ✕ Close
          </button>
        </div>
        <div className="svf-full__body">
          <p className="svf-big">No photos to take.</p>
        </div>
      </div>
    );
  }

  const mine = photos.filter((p) => p.slot === step.slot);
  const live = mine.filter((p) => p.state !== 'failed');
  const undrawn = drawingNeeded(step.slot) && live.length > 0 && !live.some((p) => p.markup);
  const go = (s: RunStep | undefined) => s && setSlot(s.slot);

  async function onFiles(files: FileList | null, input: HTMLInputElement | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    if (input) input.value = '';
    setBusy(true);
    try {
      await onAdd(step.slot, list);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="svf-full" role="dialog" aria-modal="true" aria-label="Take the photos">
      <div className="svf-full__bar">
        <button type="button" className="svf-btn svf-btn--ghost" onClick={onClose}>
          ✕ Close
        </button>
        <span className="svf-full__title">
          Photo {i + 1} of {steps.length}
          {todo ? ` · ${todo} to go` : ' · all needed done ✓'}
        </span>
      </div>

      <div className="svf-full__body svf-run">
        {step.level === 'optional' && prev && prev.level !== 'optional' && <p className="svf-note">The rest are optional. Close when you’re done.</p>}
        <span className={`svf-badge ${step.level === 'must' ? 'svf-badge--need' : 'svf-badge--plain'}`}>
          {step.done ? '✓ Taken' : LEVEL_WORD[step.level]}
        </span>
        <h2 className="svf-run-title">{step.label}</h2>
        {step.hint && <p className="svp-hint svp-hint--big">{step.hint}</p>}

        {mine.length > 0 && (
          <div className="svp-grid">
            {mine.map((p) => (
              <PhotoThumb key={p.key} photo={p} label={step.label} onOpen={() => onOpen(p)} />
            ))}
          </div>
        )}
        {undrawn && (
          <div className="svp-draw-later">
            <span>Draw on it now, or later in the van.</span>
            <button type="button" className="svf-btn svf-btn--ghost" onClick={() => onOpen(live[0], true)}>
              ✎ Draw
            </button>
          </div>
        )}

        <button type="button" className="svf-btn svf-btn--solar svf-btn--huge" disabled={busy} onClick={() => camera.current?.click()}>
          📷 {live.length ? 'Take another' : 'Take photo'}
        </button>
        <button type="button" className="svf-btn svf-btn--ghost svf-btn--wide" disabled={busy} onClick={() => gallery.current?.click()}>
          🖼 From gallery
        </button>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFiles(e.target.files, e.currentTarget)} />
        <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files, e.currentTarget)} />
      </div>

      <div className="svf-full__foot">
        <button type="button" className="svf-btn svf-btn--ghost" disabled={!prev} onClick={() => go(prev)}>
          ← Back
        </button>
        {next ? (
          <button type="button" className={step.done ? 'svf-btn svf-btn--grow' : 'svf-btn svf-btn--ghost svf-btn--grow'} onClick={() => go(next)}>
            {step.done ? `Next: ${next.label}` : 'Skip'}
          </button>
        ) : (
          <button type="button" className="svf-btn svf-btn--grow" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    </div>
  );
}
