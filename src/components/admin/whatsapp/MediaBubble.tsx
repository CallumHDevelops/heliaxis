'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { shownBody } from '@/lib/whatsapp/describe';
import {
  canRetry,
  captionOf,
  fileKind,
  formatSize,
  mediaLabel,
  mediaShape,
  mediaStatusText,
  type MediaFields,
} from '@/lib/whatsapp/media-shared';
import './media.css';

/**
 * A WhatsApp message's photo, video, voice note, sticker or file, inside its bubble in the chat
 * (ChatPane, both looks; the record page can use it too). The file comes from /api/whatsapp/media/{id},
 * which checks the person can open the chat. Photos show small and open full size on a tap; stickers
 * show small; video and voice notes play here, with a download beside them; anything else is a
 * Download. The message's own text stays as the caption.
 *
 * Not here yet: the message's text with "Photo on its way…", or why it couldn't be kept. With a job
 * (`jobId`, CRM staff), a photo can be copied into that job's photos.
 */

export type MediaMessage = { id: string; kind: string; body: string | null; created_at: string; direction?: string } & MediaFields;

type Props = {
  m: MediaMessage;
  /** The job this chat is open for: shows "Save to job photos" on photos. */
  jobId?: string | null;
  /** Fetch the chat again (a file has arrived, or Try again worked). */
  onChange?: () => unknown;
};

/** No longer "on its way" after this: WhatsApp normally hands a file over within seconds. */
const STUCK_MS = 60_000;

export function MediaBubble({ m, jobId = null, onChange }: Props) {
  const src = `/api/whatsapp/media/${m.id}`;
  const shape = mediaShape(m.kind, m.media_mime);
  if (m.media_status !== 'saved') return <Waiting m={m} src={src} onChange={onChange} />;

  const caption = captionOf(m.kind, m.body, m.media_name);
  const text = caption ? <span className="wa-text">{caption}</span> : null;
  switch (shape) {
    case 'photo':
      return <Photo m={m} src={src} caption={caption} jobId={jobId} text={text} />;
    case 'sticker':
      return (
        <div className="wa-media">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind our own route */}
          <img className="wa-media__sticker" src={src} alt="Sticker" loading="lazy" decoding="async" width={120} height={120} />
        </div>
      );
    case 'video':
    case 'audio':
      return <Player m={m} src={src} video={shape === 'video'} text={text} />;
    default:
      return (
        <div className="wa-media">
          <div className="wa-file">
            <span className="wa-file__icon" aria-hidden="true">
              📄
            </span>
            <span className="wa-file__about">
              <b>{m.media_name || mediaLabel(m.kind, m.media_mime, m.body)}</b>
              <small>{[fileKind(m.media_mime, m.media_name), formatSize(m.media_size)].filter(Boolean).join(' · ')}</small>
            </span>
            <a className="wa-file__get" href={`${src}?download=1`} download>
              Download
            </a>
          </div>
          {text}
        </div>
      );
  }
}

/** Not saved (yet): the message as it's always read, and what's happening with its file. */
function Waiting({ m, src, onChange }: { m: MediaMessage; src: string; onChange?: () => unknown }) {
  const [busy, setBusy] = useState(false);
  const pending = m.media_status === 'pending';

  async function tryAgain() {
    setBusy(true);
    try {
      await fetch(`${src}?info=1`, { cache: 'no-store' });
      await onChange?.();
    } finally {
      setBusy(false);
    }
  }

  // Still "on its way" a minute after it came: the fetch after the webhook didn't finish, so ask once more.
  useEffect(() => {
    if (!pending) return;
    const wait = Math.max(0, Date.parse(m.created_at) + STUCK_MS - Date.now());
    const t = setTimeout(() => {
      void fetch(`${src}?info=1`, { cache: 'no-store' })
        .then(() => onChange?.())
        .catch(() => null);
    }, wait);
    return () => clearTimeout(t);
  }, [pending, m.created_at, src, onChange]);

  return (
    <>
      <span className="wa-text">{shownBody(m.body)}</span>
      <span className={`wa-media__status${pending ? ' is-pending' : ''}`} role={pending ? 'status' : undefined}>
        {mediaStatusText(m)}
        {!pending && canRetry(m) && (
          <button type="button" className="wa-media__retry" onClick={() => void tryAgain()} disabled={busy}>
            {busy ? 'Trying…' : 'Try again'}
          </button>
        )}
      </span>
    </>
  );
}

function Photo({ m, src, caption, jobId, text }: { m: MediaMessage; src: string; caption: string; jobId: string | null; text: ReactNode }) {
  const [viewing, setViewing] = useState(false);
  const [broken, setBroken] = useState(false);
  const alt = caption || (m.direction === 'out' ? 'Photo' : 'Photo they sent');
  return (
    <div className="wa-media">
      {broken ? (
        <p className="wa-media__status">
          This photo wouldn’t load.{' '}
          <a href={`${src}?download=1`} download>
            Download it
          </a>
        </p>
      ) : (
        <button type="button" className="wa-media__photo" onClick={() => setViewing(true)} aria-label={`Open the photo full size${caption ? `: ${caption}` : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind our own route */}
          <img src={`${src}?thumb=1`} alt={alt} loading="lazy" decoding="async" width={240} height={240} onError={() => setBroken(true)} />
        </button>
      )}
      {text}
      {jobId && m.direction !== 'out' && <SaveToJob id={m.id} jobId={jobId} />}
      {viewing && (
        <dialog
          className="wa-viewer"
          aria-label={alt}
          ref={(d) => {
            if (d && !d.open) d.showModal();
          }}
          onClose={() => setViewing(false)}
          // A tap on the dark surround closes it, like the photo viewers people know.
          onClick={(e) => {
            if (e.target === e.currentTarget) e.currentTarget.close();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind our own route */}
          <img src={src} alt={alt} />
          <div className="wa-viewer__bar">
            {caption && <span>{caption}</span>}
            <a href={`${src}?download=1`} download>
              Download
            </a>
            <a href={src} target="_blank" rel="noopener noreferrer">
              Open in a new tab
            </a>
            <button type="button" onClick={(e) => e.currentTarget.closest('dialog')?.close()} autoFocus>
              Close
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}

/* ── Video and audio ──────────────────────────────────────────────────────────────────────────────── */

const noSubscribe = () => () => {};
const playable = new Map<string, boolean>();

/** Can this browser play it? Voice notes are Ogg Opus, which Safari only plays from 18.4 (iOS and Mac). */
function canPlay(mime: string, video: boolean): boolean {
  const type = /^audio\/ogg\s*$/i.test(mime) ? 'audio/ogg; codecs=opus' : mime;
  let yes = playable.get(type);
  if (yes === undefined) {
    yes = document.createElement(video ? 'video' : 'audio').canPlayType(type) !== '';
    playable.set(type, yes);
  }
  return yes;
}

function Player({ m, src, video, text }: { m: MediaMessage; src: string; video: boolean; text: ReactNode }) {
  const mime = m.media_mime || (video ? 'video/mp4' : 'audio/ogg');
  // Asked in the browser only (the server can't know); the server's answer is "yes".
  const ok = useSyncExternalStore(noSubscribe, () => canPlay(mime, video), () => true);
  const what = mediaLabel(m.kind, m.media_mime, m.body).toLowerCase();
  return (
    <div className={`wa-media${video ? '' : ' wa-media--audio'}`}>
      {ok ? (
        video ? (
          <video className="wa-media__video" src={src} controls preload="metadata" playsInline />
        ) : (
          <audio className="wa-media__audio" src={src} controls preload="metadata" aria-label={mediaLabel(m.kind, m.media_mime, m.body)} />
        )
      ) : (
        <p className="wa-media__status">
          This browser can’t play this {what}. Download it to {video ? 'watch' : 'listen'}.
        </p>
      )}
      <a className="wa-media__get" href={`${src}?download=1`} download>
        Download{m.media_size ? ` (${formatSize(m.media_size)})` : ''}
      </a>
      {text}
    </div>
  );
}

/* ── Save to job photos ───────────────────────────────────────────────────────────────────────────── */

/** Which chat photos each job already has: asked once a minute at most, shared by every photo in the chat. */
const jobPhotos = new Map<string, { at: number; ids: Promise<Set<string>> }>();
function savedIn(jobId: string): Promise<Set<string>> {
  const known = jobPhotos.get(jobId);
  if (known && Date.now() - known.at < 60_000) return known.ids;
  const ids = fetch(`/api/whatsapp/media?job=${jobId}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { saved: [] }))
    .then((d: { saved?: string[] }) => new Set(d.saved ?? []))
    .catch(() => new Set<string>());
  jobPhotos.set(jobId, { at: Date.now(), ids });
  return ids;
}

function SaveToJob({ id, jobId }: { id: string; jobId: string }) {
  const [state, setState] = useState<'unknown' | 'no' | 'saving' | 'saved' | string>('unknown');
  useEffect(() => {
    let live = true;
    void savedIn(jobId).then((ids) => {
      if (live) setState((s) => (s === 'unknown' ? (ids.has(id) ? 'saved' : 'no') : s));
    });
    return () => {
      live = false;
    };
  }, [id, jobId]);

  async function save() {
    setState('saving');
    try {
      const r = await fetch(`/api/whatsapp/media/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'job', projectId: jobId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Not saved');
      void savedIn(jobId).then((ids) => ids.add(id));
      setState('saved');
    } catch (e) {
      setState(e instanceof Error ? e.message : 'Not saved');
    }
  }

  if (state === 'unknown') return null;
  if (state === 'saved') return <span className="wa-media__saved">Saved to job ✓</span>;
  const failed = state !== 'no' && state !== 'saving';
  return (
    <span className="wa-media__job">
      <button type="button" onClick={() => void save()} disabled={state === 'saving'}>
        {state === 'saving' ? 'Saving…' : failed ? 'Try again' : 'Save to job photos'}
      </button>
      {failed && <span className="wa-err">{state}</span>}
    </span>
  );
}
