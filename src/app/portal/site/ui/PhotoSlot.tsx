'use client';

import { useEffect, useRef, useState } from 'react';
import { checkSharpness } from '@/lib/site/blur';
import { siteFetch } from '@/lib/site/client';
import type { Field, LabelReadResult } from '@/lib/site/forms/types';
import { getFile, updatePack, type PackRecord } from '@/lib/site/offline';
import { addPhoto, removePhoto, removeServerPhoto, retryPhoto } from '@/lib/site/photo-queue';
import { drainSoon } from '@/lib/site/sync';
import type { SlotPhoto } from './form-state';
import { useBlobUrl, useLive } from './nav';

const asked = new Set<string>();

/** Where the phone is, when the owner has turned location stamps on (D18). Never waits long. */
function whereAmI(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    const t = setTimeout(() => resolve(null), 2500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(t);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
      { maximumAge: 120_000, timeout: 2500 }
    );
  });
}

/**
 * P6: one photo slot. A big Take photo button (Take another once there's one, in the same place),
 * Add from photos, the count against the minimum, and the thumbnails with a sent tick or a failed dot.
 * Label photos get the blur check; read photos are read by Claude once they're up ("Reading…").
 */
export function PhotoSlot({
  field,
  slot,
  title,
  need,
  rec,
  photos,
  locked,
}: {
  field: Field;
  slot: string;
  title?: string;
  need: number;
  rec: PackRecord;
  photos: SlotPhoto[];
  locked: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [check, setCheck] = useState<{ id: string; text: string } | null>(null);
  const [viewing, setViewing] = useState<SlotPhoto | null>(null);
  const job = rec.id;
  const n = photos.length;

  const take = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setProblem(null);
    const where = rec.pack.settings?.locationStamps ? await whereAmI() : null;
    for (const file of Array.from(files)) {
      try {
        const p = await addPhoto(job, slot, file, { label: field.label_photo, read: field.read, ...(where ?? {}) });
        if (field.label_photo && files.length === 1) {
          const s = await checkSharpness(p.full ?? file);
          if (s?.blurry || s?.dark) setCheck({ id: p.client_id, text: s.dark ? 'That looks too dark to read. Take it again?' : 'That looks blurry. Take it again?' });
        }
      } catch (e) {
        setProblem(e instanceof Error ? e.message : 'That photo couldn’t be kept. Try again.');
      }
    }
    setBusy(false);
    drainSoon(0);
  };

  // A read photo, once it's on the server: ask for the read and wait for it (up to about 15 s).
  const reads = rec.pack.reads;
  const readable = photos.filter((p) => field.read && p.local?.uploadedId && !reads.some((r) => r.photo_id === p.local?.uploadedId));
  const [reading, setReading] = useState(false);
  useEffect(() => {
    const p = readable[0]?.local;
    if (!p?.uploadedId || asked.has(p.uploadedId)) return;
    asked.add(p.uploadedId);
    const id = p.uploadedId;
    queueMicrotask(() => setReading(true));
    void siteFetch<{ status: string; result: LabelReadResult | null }>(`/api/site/jobs/${job}/read`, { body: { photo_id: id, key: field.key }, job, timeoutMs: 25_000 }).then(async (r) => {
      setReading(false);
      if (!r.ok || r.data.status === 'queued' || r.data.status === 'off') return;
      await updatePack(job, (x) => ({ ...x, pack: { ...x.pack, reads: [...x.pack.reads.filter((q) => q.photo_id !== id), { photo_id: id, key: field.key, status: r.data.status, result: r.data.result }] } }));
    });
  });
  const lastRead = [...reads].reverse().find((r) => r.key === field.key && photos.some((p) => (p.local?.uploadedId ?? p.server?.id) === r.photo_id));

  return (
    <div className="sa-photos">
      {title && <p className="sa-photos-title">{title}</p>}
      <p className={`sa-photos-count${need && n >= need ? ' is-done' : ''}`}>
        {need ? (n >= need ? `${n} of ${need} ✓` : `${n} of ${need} needed`) : n ? `${n} photo${n === 1 ? '' : 's'}` : 'Only if there’s something to show'}
      </p>
      {!!photos.length && (
        <div className="sa-thumbs">
          {photos.map((p) => (
            <Thumb key={p.id} p={p} onOpen={() => setViewing(p)} />
          ))}
        </div>
      )}
      {check && (
        <div className="sa-alert" role="alert">
          <span>{check.text}</span>
          <button
            type="button"
            className="sa-small"
            onClick={async () => {
              await removePhoto(check.id);
              setCheck(null);
              camera.current?.click();
            }}
          >
            Take again
          </button>
          <button type="button" className="sa-small" onClick={() => setCheck(null)}>
            Keep it
          </button>
        </div>
      )}
      {reading && <p className="sa-reading">Reading the label…</p>}
      {!reading && lastRead && lastRead.status === 'unreadable' && (
        <p className="sa-hint-warn">
          That label couldn’t be read{(lastRead.result as LabelReadResult | null)?.problem ? ` (${(lastRead.result as LabelReadResult).problem})` : ''}. Take another?
        </p>
      )}
      {!reading && lastRead && lastRead.status === 'read' && <p className="sa-hint-ok">Label read ✓ Check what it found below.</p>}
      {problem && <p className="sa-err">{problem}</p>}
      {!locked && (
        <>
          <button type="button" className="sa-btn sa-btn-1 sa-take" disabled={busy} onClick={() => camera.current?.click()}>
            {busy ? 'Keeping the photo…' : n ? 'Take another' : 'Take photo'}
          </button>
          <button type="button" className="sa-link sa-fromroll" disabled={busy} onClick={() => gallery.current?.click()}>
            Add from photos
          </button>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void take(e.target.files).then(() => (e.target.value = ''))} />
          <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => void take(e.target.files).then(() => (e.target.value = ''))} />
        </>
      )}
      {viewing && (
        <Viewer
          p={viewing}
          locked={locked}
          onClose={() => setViewing(null)}
          onDelete={async () => {
            if (viewing.local) await removePhoto(viewing.local.client_id);
            else await removeServerPhoto(job, viewing.id);
            setViewing(null);
          }}
        />
      )}
    </div>
  );
}

function useThumb(p: SlotPhoto): string | null {
  const server = useLive(() => (p.server ? getFile(`thumb:${p.server.id}`) : Promise.resolve(undefined)), `thumb:${p.id}`);
  return useBlobUrl(p.local?.thumb ?? server?.blob ?? null);
}

function Thumb({ p, onOpen }: { p: SlotPhoto; onOpen: () => void }) {
  const url = useThumb(p);
  const sent = !!p.server || (p.local && !p.local.full);
  const failed = !!p.local?.failed;
  return (
    <button type="button" className="sa-thumb" onClick={onOpen} aria-label={sent ? 'Photo, sent' : failed ? 'Photo, not sent' : 'Photo, waiting to send'}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob from the phone
        <img src={url} alt="" />
      ) : (
        <span className="sa-thumb-none" />
      )}
      <span className={`sa-thumb-state ${sent ? 'is-sent' : failed ? 'is-failed' : 'is-waiting'}`} aria-hidden="true">
        {sent ? '✓' : failed ? '!' : ''}
      </span>
    </button>
  );
}

function Viewer({ p, locked, onClose, onDelete }: { p: SlotPhoto; locked: boolean; onClose: () => void; onDelete: () => void }) {
  const full = useBlobUrl(p.local?.full ?? null);
  const thumb = useThumb(p);
  const url = full ?? p.server?.url ?? thumb;
  return (
    <div className="sa-viewer" role="dialog" aria-modal="true" aria-label="Photo">
      <div className="sa-viewer-bar">
        {!locked && (
          <button type="button" className="sa-viewer-close sa-viewer-delete" onClick={onDelete}>
            Delete
          </button>
        )}
        {p.local?.failed && (
          <button type="button" className="sa-viewer-close" onClick={() => void retryPhoto(p.local!.client_id).then(onClose)}>
            Try again
          </button>
        )}
        <button type="button" className="sa-viewer-close" onClick={onClose}>
          Close
        </button>
      </div>
      {p.local?.failed && <p className="sa-viewer-note">Couldn’t send: {p.local.failed}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob from the phone */}
      {url && <img src={url} alt="" />}
    </div>
  );
}
