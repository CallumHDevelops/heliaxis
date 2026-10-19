'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addPhotos, queued, QUEUE_CHANGED, uploadQueued, watchQueue } from '@/lib/crm/photo-queue';
import { PHOTO_CATEGORIES, photoLabel } from '@/lib/crm/stages';
import { ukWhen, type Photo } from './record-shared';

/** The Photos tab: a grid by type, with the camera and the gallery, and uploads that wait for signal. */
export function PhotosTab({ id, photos, initialCat, onChanged }: { id: string; photos: Photo[]; initialCat?: string | null; onChanged: () => Promise<void> | void }) {
  const [cat, setCat] = useState<string>(initialCat || 'all');
  const [waiting, setWaiting] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Photo | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const target = cat === 'all' ? 'site' : cat;

  const refreshQueue = useCallback(async () => {
    const q = await queued().catch(() => []);
    setWaiting(q.filter((p) => p.projectId === id).length);
  }, [id]);

  useEffect(() => {
    const stop = watchQueue();
    let before = -1;
    const onQ = async () => {
      const q = await queued().catch(() => []);
      const n = q.filter((p) => p.projectId === id).length;
      setWaiting(n);
      if (before > n) void onChanged(); // something finished uploading
      before = n;
    };
    window.addEventListener(QUEUE_CHANGED, onQ);
    void onQ();
    return () => {
      stop();
      window.removeEventListener(QUEUE_CHANGED, onQ);
    };
  }, [id, onChanged]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      await addPhotos(id, target, files);
    } finally {
      setBusy(false);
      await refreshQueue();
      await onChanged();
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of photos) c[p.category] = (c[p.category] || 0) + 1;
    return c;
  }, [photos]);
  const shown = cat === 'all' ? photos : photos.filter((p) => p.category === cat);

  return (
    <div className="crmr-photostab">
      <div className="crm-stages crm-stages--tight">
        <button type="button" className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
          All <span>{photos.length}</span>
        </button>
        {PHOTO_CATEGORIES.map((c) => (
          <button key={c.key} type="button" className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
            {c.label} <span>{counts[c.key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="crm-photo-actions">
        <button type="button" className="crm-btn crm-btn--solar crm-btn--big" disabled={busy} onClick={() => cameraRef.current?.click()}>
          📷 Take {photoLabel(target).toLowerCase()} photo
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" disabled={busy} onClick={() => pickRef.current?.click()}>
          🖼 From gallery
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files).then(() => (e.target.value = ''))} />
        <input ref={pickRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files).then(() => (e.target.value = ''))} />
      </div>
      {cat === 'all' && <p className="crm-muted crm-small">Pick a type above first. Photos taken from “All” are filed under Site.</p>}
      {(busy || waiting > 0) && (
        <p className="crm-banner">
          {busy ? 'Preparing photos…' : `${waiting} photo${waiting === 1 ? '' : 's'} waiting to upload`}
          {!busy && (typeof navigator !== 'undefined' && !navigator.onLine ? ': no signal, they’ll go up when it’s back.' : '…')}
          {!busy && (
            <button type="button" className="crm-link" onClick={() => void uploadQueued()}>
              Retry now
            </button>
          )}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="crm-muted">No {cat === 'all' ? '' : `${photoLabel(cat).toLowerCase()} `}photos yet.</p>
      ) : (
        <div className="crm-photos">
          {shown.map((p) => (
            <button key={p.id} type="button" className="crm-photo" onClick={() => setOpen(p)}>
              {/* Signed storage links: next/image can't optimise them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.thumb ? <img src={p.thumb} alt={p.caption || photoLabel(p.category)} loading="lazy" /> : <span>📷</span>}
              {cat === 'all' && <span className="crm-photo-tag">{photoLabel(p.category)}</span>}
            </button>
          ))}
        </div>
      )}

      {open && (
        <PhotoViewer
          photo={open}
          onClose={() => setOpen(null)}
          onChanged={async () => {
            setOpen(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function PhotoViewer({ photo, onClose, onChanged }: { photo: Photo; onClose: () => void; onChanged: () => Promise<void> }) {
  const [caption, setCaption] = useState(photo.caption || '');
  const [category, setCategory] = useState(photo.category);
  const dirty = caption !== (photo.caption || '') || category !== photo.category;
  async function save() {
    await fetch(`/api/crm/photos/${photo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption, category }),
    });
    await onChanged();
  }
  async function remove() {
    if (!confirm('Delete this photo?')) return;
    await fetch(`/api/crm/photos/${photo.id}`, { method: 'DELETE' });
    await onChanged();
  }
  return (
    <div className="crm-viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="crm-viewer-box" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo.url ? <img src={photo.url} alt={photo.caption || ''} /> : <p className="crm-muted">Image unavailable</p>}
        <div className="crm-viewer-meta">
          <span className="crm-muted crm-small">
            {photo.by ? `${photo.by} · ` : ''}
            {ukWhen(photo.created_at)}
          </span>
          <input className="crm-input" placeholder="Caption (e.g. consumer unit, roof south face)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <select className="crm-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {PHOTO_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="crm-actions">
            {dirty && (
              <button type="button" className="crm-btn crm-btn--solar" onClick={save}>
                Save
              </button>
            )}
            {photo.url && (
              <a className="crm-btn crm-btn--ghost" href={photo.url} target="_blank" rel="noreferrer">
                Full size
              </a>
            )}
            <button type="button" className="crm-btn crm-btn--ghost" onClick={remove}>
              Delete
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
