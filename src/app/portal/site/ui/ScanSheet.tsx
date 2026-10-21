'use client';

import { useEffect, useRef, useState } from 'react';
import type { Field, FormCtx } from '@/lib/site/forms/types';
import { addPhoto } from '@/lib/site/photo-queue';
import { needOf } from '@/lib/site/rules';
import { beep, getDetector, scanImage } from '@/lib/site/scan';
import { brandHint, duplicates, pickSerial, type Parsed } from '@/lib/site/serials';
import type { Source } from '@/lib/site/types';

/** One serial as kept in the answers. An unreadable label keeps its photo instead. */
export type Captured = { s: string; src: Source; unread?: boolean; photo?: string };

const listOf = (v: unknown): Captured[] => (Array.isArray(v) ? (v as Captured[]).filter((x) => x && typeof x === 'object') : []);
const norm = (s: string) => s.trim().toUpperCase();

/**
 * A SCAN field: the serials so far with a count against what's expected ("6 of 14"), Scan (the live
 * camera, P7), Type it instead, and Couldn't read it: keep the photo. A duplicate shows "Already
 * scanned" and isn't added twice. With a label photo slot (`field.photo`), what Claude read from it
 * is offered one serial at a time ("Read from photo: check it"), and an unreadable label's photo goes
 * in that slot.
 */
export function ScanField({ field, ctx, value, onChange, job, disabled }: { field: Field; ctx: FormCtx; value: unknown; onChange: (v: Captured[] | undefined) => void; job: string; disabled?: boolean }) {
  const list = listOf(value);
  const need = field.expect?.(ctx) ?? needOf(field, ctx);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const photo = useRef<HTMLInputElement>(null);
  const still = useRef<HTMLInputElement>(null);
  const have = new Set(list.filter((c) => !c.unread).map((c) => norm(c.s)));
  const read = field.photo
    ? [...new Set(ctx.reads.filter((r) => r.key === field.photo && r.status === 'read').flatMap((r) => r.result?.serials ?? []))].filter((x) => x.trim() && !have.has(norm(x)))
    : [];

  const add = (items: Captured[]) => {
    const fresh: Captured[] = [];
    let dup = 0;
    for (const it of items) {
      if (!it.unread && (have.has(norm(it.s)) || fresh.some((f) => norm(f.s) === norm(it.s)))) {
        dup++;
        continue;
      }
      fresh.push(it);
    }
    setNote(dup ? (dup === 1 ? 'Already scanned' : `${dup} already scanned`) : null);
    if (fresh.length) onChange([...list, ...fresh]);
  };

  return (
    <div className="sa-scan">
      <p className={`sa-photos-count${need && list.length >= need ? ' is-done' : ''}`}>
        {need ? `${list.length} of ${need}` : list.length ? `${list.length} scanned` : 'None yet'}
      </p>
      {!!list.length && (
        <ul className="sa-serials">
          {list.map((c, i) => (
            <li key={`${c.s}-${i}`} className="sa-serial">
              <span className="sa-serial-s">{c.unread ? 'Couldn’t read: photo kept' : c.s}</span>
              <span className="sa-src">{c.src === 'scan' ? 'Scanned' : c.src === 'photo' ? 'From the photo' : c.src === 'roofer' ? 'From the roofer' : 'Typed'}</span>
              {!c.unread && brandHint(c.s) && <span className="sa-muted">{brandHint(c.s)}</span>}
              {!disabled && (
                <button type="button" className="sa-x" aria-label={`Remove ${c.s || 'this'}`} onClick={() => onChange(list.filter((_, j) => j !== i).length ? list.filter((_, j) => j !== i) : undefined)}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {duplicates(list.filter((c) => !c.unread).map((c) => c.s)).length > 0 && <p className="sa-hint-warn">The same serial is on the list twice.</p>}
      {!disabled &&
        read.map((x) => (
          <button key={x} type="button" className="sa-suggest" onClick={() => add([{ s: x, src: 'photo' }])}>
            <span className="sa-suggest-src">Read from photo</span>
            <span className="sa-suggest-val">{x}</span>
            <span className="sa-suggest-tick" aria-hidden="true">
              ✓
            </span>
            <span className="sa-sr">Check it against the label, then add it</span>
          </button>
        ))}
      {note && <p className="sa-hint-warn">{note}</p>}
      {!disabled && (
        <>
          <button type="button" className="sa-btn sa-btn-1" onClick={() => setOpen(true)}>
            {list.length ? 'Scan more' : 'Scan'}
          </button>
          <div className="sa-typeit">
            <input className="sa-text" type="text" autoCapitalize="characters" autoComplete="off" aria-label="Type the serial" placeholder="Type it instead" value={typing} onChange={(e) => setTyping(e.target.value)} />
            <button
              type="button"
              className="sa-small"
              disabled={!typing.trim()}
              onClick={() => {
                add([{ s: typing.trim(), src: 'typed' }]);
                setTyping('');
              }}
            >
              Add
            </button>
          </div>
          <div className="sa-scan-more">
            <button type="button" className="sa-link" onClick={() => still.current?.click()}>
              Read it from a photo
            </button>
            <button type="button" className="sa-link" onClick={() => photo.current?.click()}>
              Couldn’t read it: keep the photo
            </button>
          </div>
          <input
            ref={still}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const codes = await scanImage(f).catch(() => [] as string[]);
              const { chips, pick } = pickSerial(codes);
              if (pick < 0) setNote('No code found in that photo. Try the live scan, or type it.');
              else add([{ s: chips[pick].serial!, src: 'scan' }]);
            }}
          />
          <input
            ref={photo}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const p = await addPhoto(job, field.photo ?? field.key, f, { label: true, read: true });
              add([{ s: '', src: 'photo', unread: true, photo: p.client_id }]);
            }}
          />
        </>
      )}
      {open && <ScanSheet need={need} have={list.filter((c) => !c.unread).length} known={have} onClose={() => setOpen(false)} onDone={(found) => add(found.map((s) => ({ s, src: 'scan' as Source })))} />}
    </div>
  );
}

/**
 * P7: the live rear camera with an aiming box, the torch, and a count. Every code it sees beeps and
 * goes in the list (a duplicate says "Already scanned"); several codes in one frame show as chips
 * with the likely serial picked. One tap adds the list.
 */
export function ScanSheet({ need, have, known, onClose, onDone }: { need: number; have: number; known: Set<string>; onClose: () => void; onDone: (serials: string[]) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [found, setFound] = useState<string[]>([]);
  const [frame, setFrame] = useState<Parsed[] | null>(null);
  const [state, setState] = useState<'starting' | 'live' | 'nocamera'>('starting');
  const [torch, setTorch] = useState<boolean | null>(null);
  const [dup, setDup] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const seen = useRef(new Set<string>(known));

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
        if (stop) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => {});
        const caps = (s.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(caps.torch ? false : null);
        setState('live');
        const d = await getDetector();
        const tick = async () => {
          if (stop) return;
          try {
            if (v.readyState >= 2) {
              const codes = (await d.detect(v)).map((c) => c.rawValue).filter(Boolean);
              if (codes.length) {
                const { chips, pick } = pickSerial(codes);
                if (chips.length > 1) setFrame(chips);
                const serial = pick >= 0 ? chips[pick].serial! : null;
                if (serial) {
                  const k = norm(serial);
                  if (seen.current.has(k)) setDup(true);
                  else {
                    seen.current.add(k);
                    setDup(false);
                    setFound((f) => [...f, serial]);
                    beep();
                  }
                }
              }
            }
          } catch {
            // A frame that couldn't be read: try the next one.
          }
          timer = setTimeout(() => void tick(), 220);
        };
        void tick();
      } catch {
        setState('nocamera');
      }
    })();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch;
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => {});
    setTorch(on);
  };

  const total = have + found.length;
  return (
    <div className="sa-scansheet" role="dialog" aria-modal="true" aria-label="Scan">
      <video ref={video} className="sa-scan-video" playsInline muted />
      <div className="sa-scan-aim" aria-hidden="true" />
      <div className="sa-scan-top">
        <span className="sa-scan-count">{need ? `${total} of ${need}` : `${total} scanned`}</span>
        {torch !== null && (
          <button type="button" className={`sa-small sa-torch${torch ? ' is-on' : ''}`} onClick={() => void toggleTorch()}>
            {torch ? 'Torch off' : 'Torch'}
          </button>
        )}
        <button type="button" className="sa-small" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="sa-scan-bottom">
        {state === 'nocamera' && <p className="sa-scan-msg">The camera isn’t available. Close this and type the serial, or read it from a photo.</p>}
        {state === 'starting' && <p className="sa-scan-msg">Starting the camera…</p>}
        {dup && <p className="sa-scan-msg">Already scanned</p>}
        {frame && frame.length > 1 && (
          <div className="sa-scan-frame">
            <span>Codes on that label:</span>
            {frame.map((c, i) => (
              <span key={i} className={`sa-chip${c.serial && found.includes(c.serial) ? ' is-on' : ''}`}>
                {c.serial ?? 'Not a serial'}
              </span>
            ))}
          </div>
        )}
        {!!found.length && (
          <div className="sa-scan-found">
            {found.map((s, i) => (
              <button key={s} type="button" className="sa-chip is-on" aria-label={`Remove ${s}`} onClick={() => setFound((f) => f.filter((_, j) => j !== i))}>
                {s} ×
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="sa-btn sa-btn-1"
          disabled={!found.length}
          onClick={() => {
            onDone(found);
            onClose();
          }}
        >
          {found.length ? `Add ${found.length === 1 ? 'this serial' : `these ${found.length}`}` : 'Point at a barcode or QR code'}
        </button>
      </div>
    </div>
  );
}
