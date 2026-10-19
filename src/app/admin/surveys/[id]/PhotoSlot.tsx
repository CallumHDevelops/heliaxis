'use client';

import { useRef, useState } from 'react';
import { markupShapes, type Markup } from '@/lib/surveys/markup';

/**
 * Survey photos on the phone: one question's photos (taken, uploading or up), a thumbnail, the
 * drawing laid over a photo as SVG (the form, the viewer and the report all use it), and the
 * full-screen viewer (view, draw, delete).
 *
 * Photos come from two places: the server (uploaded) and the phone's photo queue (waiting, or
 * "couldn't upload"). SurveyForm turns both into SlotPhoto and owns what happens on a tap.
 */

export type SlotPhoto = {
  /** 'p:{photoId}' for an uploaded photo, 'q:{queueId}' for one still on the phone. */
  key: string;
  slot: string;
  photoId: string | null;
  queueId: string | null;
  /** The phone's queue id it came from (an uploaded photo keeps it), to follow a photo as it goes up. */
  clientId: string | null;
  /** Small picture for the grid (a signed URL, or the phone's copy). */
  thumb: string | null;
  /** Full size, to view and draw on. */
  src: string | null;
  /** The phone's copy of a waiting photo, so a drawing can be flattened with no signal. */
  blob: Blob | null;
  markup: Markup | null;
  width: number | null;
  height: number | null;
  state: 'up' | 'waiting' | 'failed';
  failed: string | null;
};

export type PhotoActions = {
  add: (slot: string, files: FileList | File[]) => Promise<void>;
  /** Open the viewer; `draw` goes straight to the drawing tool. */
  open: (p: SlotPhoto, draw?: boolean) => void;
  /** False on a finished survey: photos can still be drawn on, not added. */
  canAdd: boolean;
};

/* ── Drawing over a photo ─────────────────────────────────────────────────────── */

/** The drawing as SVG over a W × H picture (absolutely placed over the <img> by the CSS). */
export function MarkupOverlay({ markup, width, height }: { markup: Markup | null; width: number; height: number }) {
  if (!markup || !width || !height) return null;
  const shapes = markupShapes(markup, width, height);
  return (
    <svg className="svp-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {shapes.map((s, i) =>
        s.kind === 'line' ? (
          <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={s.d} stroke="rgba(0,0,0,0.55)" strokeWidth={s.width + Math.max(2, s.width * 0.6)} />
            <path d={s.d} stroke={s.stroke} strokeWidth={s.width} />
          </g>
        ) : (
          <text
            key={i}
            x={s.x}
            y={s.y}
            fontSize={s.size}
            fontWeight={700}
            fill={s.fill}
            stroke="rgba(0,0,0,0.75)"
            strokeWidth={s.outline}
            paintOrder="stroke"
            strokeLinejoin="round"
            dominantBaseline="middle"
            fontFamily='system-ui, -apple-system, "Segoe UI", sans-serif'
          >
            {s.text}
          </text>
        )
      )}
    </svg>
  );
}

/**
 * A photo with its drawing on top. The drawing needs the photo's real size; when it isn't known
 * (a HEIC converted on the server, an old photo) it's read from the picture once it loads.
 */
export function PhotoFigure({
  src,
  markup,
  width,
  height,
  alt,
  className,
}: {
  src: string | null;
  markup: Markup | null;
  width: number | null;
  height: number | null;
  alt: string;
  className?: string;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [broken, setBroken] = useState(false);
  const w = natural?.w || width || 0;
  const h = natural?.h || height || 0;
  if (!src || broken) {
    return (
      <div className={`svp-figure svp-figure--none ${className ?? ''}`}>
        <span>{src ? 'This photo can’t be shown without signal. It’s safe on the server.' : 'No picture yet'}</span>
      </div>
    );
  }
  return (
    <div className={`svp-figure ${className ?? ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs and the phone's own copies */}
      <img
        src={src}
        alt={alt}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        onError={() => setBroken(true)}
      />
      <MarkupOverlay markup={markup} width={w} height={h} />
    </div>
  );
}

/* ── One thumbnail ────────────────────────────────────────────────────────────── */

export function PhotoThumb({ photo, label, onOpen }: { photo: SlotPhoto; label: string; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  const state =
    photo.state === 'failed' ? 'Couldn’t upload' : photo.state === 'waiting' ? 'Uploading' : photo.markup ? 'Drawn on' : null;
  return (
    <button type="button" className={`svp-thumb is-${photo.state}`} onClick={onOpen} aria-label={`${label}: open photo${state ? ` (${state.toLowerCase()})` : ''}`}>
      {photo.thumb && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs and the phone's own copies
        <img src={photo.thumb} alt="" onError={() => setBroken(true)} />
      ) : (
        <span className="svp-thumb__none">📷 Saved</span>
      )}
      {state && <span className="svp-thumb__state">{photo.state === 'up' && photo.markup ? '✎ Drawn' : state}</span>}
    </button>
  );
}

/* ── One question's photos ────────────────────────────────────────────────────── */

export function PhotoSlot({
  slot,
  label,
  help,
  hint,
  needed,
  multiple,
  drawingNeeded,
  photos,
  actions,
}: {
  slot: string;
  label: string;
  help?: string;
  hint?: string;
  /** A Must photo with none yet: shows "Needed". */
  needed: boolean;
  /** 'photos' fields take several. */
  multiple: boolean;
  /** R13, C1, C2: the photo needs a drawing (now, or later in the van). */
  drawingNeeded: boolean;
  photos: SlotPhoto[];
  actions: PhotoActions;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const live = photos.filter((p) => p.state !== 'failed');
  const failed = photos.filter((p) => p.state === 'failed');
  const undrawn = drawingNeeded && live.length > 0 && !live.some((p) => p.markup);

  async function onFiles(files: FileList | null, input: HTMLInputElement | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    if (input) input.value = ''; // the same photo can be picked again
    setBusy(true);
    try {
      await actions.add(slot, list);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`svp-slot${needed ? ' is-needed' : ''}`}>
      <div className="svf-label">
        <span>{label}</span>
        {needed ? <span className="svf-badge svf-badge--need">Needed</span> : live.length > 0 && <span className="svf-badge svf-badge--done">✓ {live.length}</span>}
      </div>
      {help && <p className="svf-help">{help}</p>}
      {hint && <p className="svp-hint">{hint}</p>}

      {photos.length > 0 && (
        <div className="svp-grid">
          {photos.map((p) => (
            <PhotoThumb key={p.key} photo={p} label={label} onOpen={() => actions.open(p)} />
          ))}
        </div>
      )}
      {failed.length > 0 && (
        <p className="svf-error" role="alert">
          {failed.length === 1 ? 'A photo' : `${failed.length} photos`} couldn’t upload ({failed[0].failed}). Tap {failed.length === 1 ? 'it' : 'one'} to retry or remove it, or take {failed.length === 1 ? 'it' : 'them'} again.
        </p>
      )}
      {undrawn && (
        <div className="svp-draw-later">
          <span>Draw on it now, or later in the van.</span>
          <button type="button" className="svf-btn svf-btn--ghost" onClick={() => actions.open(live[0], true)}>
            ✎ Draw
          </button>
        </div>
      )}

      {actions.canAdd && (
        <div className="svp-actions">
          <button type="button" className="svf-btn svf-btn--solar svp-take" disabled={busy} onClick={() => camera.current?.click()}>
            📷 {live.length && !multiple ? 'Take another' : 'Take photo'}
          </button>
          <button type="button" className="svf-btn svf-btn--ghost" disabled={busy} onClick={() => gallery.current?.click()}>
            🖼 From gallery
          </button>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFiles(e.target.files, e.currentTarget)} />
          <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files, e.currentTarget)} />
        </div>
      )}
    </div>
  );
}

/* ── Full-screen viewer ───────────────────────────────────────────────────────── */

export function PhotoViewer({
  photo,
  label,
  canDelete,
  canDraw,
  busy,
  error,
  onDraw,
  onDelete,
  onRetry,
  onClose,
}: {
  photo: SlotPhoto;
  label: string;
  canDelete: boolean;
  /** False on a cancelled survey, or with no picture to draw on. */
  canDraw: boolean;
  busy: boolean;
  error: string | null;
  onDraw: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const status =
    photo.state === 'failed'
      ? `Couldn’t upload: ${photo.failed}.`
      : photo.state === 'waiting'
        ? 'On this phone: it uploads by itself when there’s signal.'
        : 'Uploaded.';
  return (
    <div className="svf-full" role="dialog" aria-modal="true" aria-label={label}>
      <div className="svf-full__bar">
        <button type="button" className="svf-btn svf-btn--ghost" onClick={onClose}>
          ✕ Close
        </button>
        <strong className="svf-full__title">{label}</strong>
      </div>
      <div className="svf-full__body svp-view">
        <PhotoFigure
          key={`${photo.key}:${photo.src ?? photo.thumb ?? ''}`}
          src={photo.src || photo.thumb}
          markup={photo.markup}
          width={photo.width}
          height={photo.height}
          alt={label}
          className="svp-figure--big"
        />
        <p className={photo.state === 'failed' ? 'svf-error' : 'svf-help'}>{status}</p>
        {error && (
          <p className="svf-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="svf-full__foot">
        {photo.state === 'failed' ? (
          <>
            <button type="button" className="svf-btn svf-btn--solar" disabled={busy} onClick={onRetry}>
              ↻ Try again
            </button>
            <button type="button" className="svf-btn svf-btn--danger" disabled={busy} onClick={onDelete}>
              Remove
            </button>
          </>
        ) : (
          <>
            {canDraw && (
              <button type="button" className="svf-btn svf-btn--solar" disabled={busy} onClick={onDraw}>
                ✎ {photo.markup ? 'Change the drawing' : 'Draw on photo'}
              </button>
            )}
            {canDelete && (
              <button type="button" className="svf-btn svf-btn--danger" disabled={busy} onClick={onDelete}>
                Delete
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
