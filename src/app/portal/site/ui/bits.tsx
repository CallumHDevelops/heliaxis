'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import { OFFICE_PHONE } from '@/lib/site/client';
import { allRec, type OutboxRecord, type PhotoRecord } from '@/lib/site/offline';
import { drain, removeFailed, retryFailed, syncWords } from '@/lib/site/sync';
import { back, useLive, useSync } from './nav';

/** Top bar (56 px): back · title · sync pill. */
export function TopBar({ title, backTo, onBack }: { title: string; backTo?: string; onBack?: () => void }) {
  const [sheet, setSheet] = useState(false);
  return (
    <>
      <header className="sa-top">
        {backTo || onBack ? (
          <button type="button" className="sa-back" aria-label="Back" onClick={() => (onBack ? onBack() : back(backTo))}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <Image src="/assets/heliaxis-logo-light.png" alt="Heliaxis" width={96} height={20} className="sa-logo" unoptimized priority />
        )}
        <h1 className="sa-title">{title}</h1>
        <SyncPill onOpen={() => setSheet(true)} />
      </header>
      {sheet && <SyncSheet onClose={() => setSheet(false)} />}
    </>
  );
}

export function SyncPill({ onOpen }: { onOpen: () => void }) {
  const s = useSync();
  const w = syncWords(s);
  return (
    <button type="button" className={`sa-pill sa-pill-${w.tone}`} onClick={onOpen} aria-label={`${w.line} Open the sending details.`}>
      {w.pill}
    </button>
  );
}

/** The sentence under the top bar: always says where things stand (P12). Tapping it opens the sheet. */
export function SyncLine() {
  const s = useSync();
  const [sheet, setSheet] = useState(false);
  const w = syncWords(s);
  if (w.tone === 'ok' && !s.nearlyFull) return null;
  return (
    <>
      <button type="button" className={`sa-syncline sa-syncline-${w.tone}`} onClick={() => setSheet(true)}>
        {w.line}
      </button>
      {s.nearlyFull && <p className="sa-warn">Your phone is nearly full. Send your photos before taking more.</p>}
      {sheet && <SyncSheet onClose={() => setSheet(false)} />}
    </>
  );
}

const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

/** P12: what's waiting, storage, failed items with Retry and Remove, and Send now. */
export function SyncSheet({ onClose }: { onClose: () => void }) {
  const s = useSync();
  const w = syncWords(s);
  const failed = useLive(async () => {
    const ops = (await allRec<OutboxRecord>('outbox')).filter((o) => o.failed);
    const photos = (await allRec<PhotoRecord>('photos')).filter((p) => p.failed && p.full);
    return { ops, photos };
  }, 'failed');
  const [busy, setBusy] = useState(false);
  const sendNow = async () => {
    setBusy(true);
    await drain();
    setBusy(false);
  };
  return (
    <div className="sa-sheet-wrap" role="dialog" aria-modal="true" aria-label="Sending">
      <button type="button" className="sa-sheet-shade" aria-label="Close" onClick={onClose} />
      <div className="sa-sheet">
        <div className="sa-sheet-head">
          <h2>Sending</h2>
          <button type="button" className="sa-link" onClick={onClose}>
            Close
          </button>
        </div>
        <p className={`sa-sheet-state sa-tone-${w.tone}`}>{w.line}</p>
        <dl className="sa-counts">
          <div>
            <dt>Answers</dt>
            <dd>{s.waiting.answers ? `${s.waiting.answers} waiting` : 'Sent'}</dd>
          </div>
          <div>
            <dt>Photos</dt>
            <dd>{s.waiting.photos ? `${s.waiting.photos} waiting` : 'Sent'}</dd>
          </div>
          {s.waiting.other > 0 && (
            <div>
              <dt>Other</dt>
              <dd>{s.waiting.other} waiting</dd>
            </div>
          )}
          {s.storage && (
            <div>
              <dt>Storage used</dt>
              <dd>
                {mb(s.storage.used)} of {mb(s.storage.quota)}
              </dd>
            </div>
          )}
        </dl>
        {s.nearlyFull && <p className="sa-warn">Your phone is nearly full. Send your photos before taking more.</p>}
        {!!failed && (failed.ops.length > 0 || failed.photos.length > 0) && (
          <div className="sa-failed">
            <h3>Couldn’t send</h3>
            {failed.photos.map((p) => (
              <div className="sa-failed-row" key={p.client_id}>
                <span>
                  Photo: {p.failed}
                </span>
                <button type="button" className="sa-small" onClick={() => void removeFailed(p.client_id, 'photo')}>
                  Remove
                </button>
              </div>
            ))}
            {failed.ops.map((o) => (
              <div className="sa-failed-row" key={o.op_id}>
                <span>
                  {o.kind === 'answers' ? 'Answers' : o.kind === 'photo-delete' ? 'Taking a photo off' : 'Sign-off'}: {o.failed}
                </span>
                <button type="button" className="sa-small" onClick={() => void removeFailed(o.op_id, 'op')}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="sa-btn sa-btn-2" onClick={() => void retryFailed()}>
              Retry
            </button>
          </div>
        )}
        <button type="button" className="sa-btn sa-btn-1" disabled={busy || s.phase === 'sending'} onClick={() => void sendNow()}>
          {busy || s.phase === 'sending' ? 'Sending…' : 'Send now'}
        </button>
      </div>
    </div>
  );
}

/** P17: a problem with its own screen. Always says what to do, and that nothing waiting is lost. */
export function ProblemScreen({ title, message, children }: { title: string; message: string; children?: ReactNode }) {
  const s = useSync();
  const waiting = s.waiting.total + s.failed.total;
  return (
    <div className="sa-problem">
      <Image src="/assets/heliaxis-logo.png" alt="Heliaxis" width={150} height={35} className="sa-problem-logo" unoptimized priority />
      <h1>{title}</h1>
      <p>{message}</p>
      {waiting > 0 && <p className="sa-keep">{waiting === 1 ? '1 thing' : `${waiting} things`} on this phone haven’t been sent yet. They’re kept, and will send once this is sorted.</p>}
      {children}
      <a className="sa-btn sa-btn-2" href={`tel:${OFFICE_PHONE.replace(/\s/g, '')}`}>
        Call the office: {OFFICE_PHONE}
      </a>
    </div>
  );
}

export function Splash({ text = 'Opening…' }: { text?: string }) {
  return (
    <div className="sa-splash">
      <Image src="/assets/heliaxis-logo.png" alt="Heliaxis" width={150} height={35} unoptimized priority />
      <p>{text}</p>
    </div>
  );
}

/** A tick list row (P2), done or not yet. */
export function Tick({ done, children }: { done: boolean | null; children: ReactNode }) {
  return (
    <li className={`sa-tick ${done ? 'is-done' : done === false ? 'is-wait' : ''}`}>
      <span className="sa-tick-mark" aria-hidden="true">
        {done ? '✓' : done === false ? '–' : ''}
      </span>
      <span>{children}</span>
    </li>
  );
}
