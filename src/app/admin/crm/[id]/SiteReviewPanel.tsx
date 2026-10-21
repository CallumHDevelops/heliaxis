'use client';

import { useState } from 'react';
import { sendTimeWords } from '@/lib/site/messages';
import { PO_REVIEW_LABEL, poReviewOf, REVIEW_STATE_LABEL, STAGE_WORDS, type ReviewState } from '@/lib/site/review-shared';
import type { ReviewPhoto, ReviewReturn, SiteReview } from '@/lib/site/review';
import type { SiteTabData } from '@/lib/site/server';
import { send } from './record-shared';

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '';
const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');

const STATE_TONE: Record<ReviewState, string> = { waiting: 'wait', open: 'bad', fixed: 'wait', green: 'ok' };
const RETURN_WORDS: Record<string, string> = { open: 'With them: waiting for their put right', fixed: 'Put right: waiting for your review', green: 'Green light', again: 'Returned to site again', withdrawn: 'Withdrawn (the sign-off was reopened)' };

type Reply = { ok: true; review: SiteReview; data: SiteTabData; notes: string[]; messages: { channel: string; status: string; send_after: string }[] };

/**
 * The office's review of a trade's signed work, at the top of their review drawer (the owner, 21 Oct):
 * each submission (the sign-off; the scaffold up and down) with Green light and Return to site
 * required. Return to site asks what needs putting right, lets the office point to their photos, takes
 * a fix-by date (7 working days by default, clause 12.3) and a safety tick, and sends the written
 * notice at once. Below it, every return to site with its notice and put right: the history.
 */
export function SiteReviewPanel({
  assignmentId,
  review,
  onReview,
  onChanged,
  onViewPhoto,
}: {
  assignmentId: string;
  review: SiteReview;
  onReview: (r: SiteReview) => void;
  onChanged: (d: SiteTabData) => void;
  onViewPhoto: (p: ReviewPhoto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [asking, setAsking] = useState<string | null>(null);
  const subs = review.review.submissions;
  if (!subs.length) return null;
  const openFlags = review.flags.filter((f) => !f.resolved_at).length;
  const poReview = poReviewOf(subs.map((s) => s.state));

  async function act(signoffId: string, body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await send<Reply>(`/api/crm/site-assignments/${assignmentId}/review`, 'POST', { signoff_id: signoffId, ...body });
      onReview(r.review);
      onChanged(r.data);
      const how = (list: Reply['messages']) => [...new Set(list.map((m) => (m.channel === 'email' ? 'email' : 'WhatsApp')))].join(' and ');
      const went = r.messages.filter((m) => m.status === 'sent');
      // A green light isn't urgent: late in the evening it waits for the morning.
      const later = r.messages.filter((m) => m.status === 'queued');
      setNotice([done, went.length ? `Sent by ${how(went)}.` : '', later.length ? `Goes by ${how(later)} at ${sendTimeWords(later[0].send_after)}.` : '', ...r.notes].filter(Boolean).join(' '));
      setAsking(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved. Try again.');
    }
    setBusy(false);
  }

  return (
    <section className="sxr-review" aria-label="Your review">
      <h4>Your review</h4>
      <p className="crm-muted crm-small">Their PO has gone. Check the photos and answers, then give it the green light, or ask them to return to site to put something right.</p>
      {error && <p className="crm-banner crm-banner--err">{error}</p>}
      {notice && (
        <p className="crm-banner" role="status">
          {notice}
        </p>
      )}
      {subs.map((s) => {
        const live = s.live ? review.review.returns.find((r) => r.id === s.live!.id) : null;
        return (
          <div key={s.id} className={`sxr-sub sxr-sub--${STATE_TONE[s.state]}`}>
            <div className="sxr-sub__head">
              <div>
                <b>
                  {subs.length > 1 ? `${STAGE_WORDS[s.stage]} · ` : ''}Signed by {s.signed_name}, {when(s.signed_at)}
                </b>
                <span className={`sxr-state sxr-state--${STATE_TONE[s.state]}`}>
                  {REVIEW_STATE_LABEL[s.state]}
                  {s.state === 'open' && live ? ` · put right by ${day(live.fix_by)}` : ''}
                  {s.state === 'fixed' && live?.fixed_at ? ` · sent ${when(live.fixed_at)}` : ''}
                  {s.state === 'green' && s.reviewed_at ? ` · ${s.reviewed_by ?? 'the office'}, ${when(s.reviewed_at)}` : ''}
                </span>
              </div>
              <div className="sx-actions">
                {s.state !== 'green' && (
                  <button
                    type="button"
                    className="crm-btn crm-btn--small sxr-green"
                    disabled={busy}
                    onClick={() => {
                      if (s.state === 'open' && !window.confirm('They haven’t sent their put right yet. Give it the green light anyway?')) return;
                      if (openFlags && !window.confirm(`${openFlags === 1 ? '1 flag is' : `${openFlags} flags are`} still open. Give it the green light anyway?`)) return;
                      void act(s.id, { action: 'green' }, 'Green light given.');
                    }}
                  >
                    Green light
                  </button>
                )}
                {s.state !== 'open' && (
                  <button type="button" className={`crm-btn crm-btn--small ${s.state === 'green' ? 'crm-btn--ghost' : 'sxr-return'}`} disabled={busy} onClick={() => setAsking(asking === s.id ? null : s.id)}>
                    Return to site required
                  </button>
                )}
              </div>
            </div>
            {s.state === 'fixed' && live && <PutRightLines r={live} photos={review.photos} onViewPhoto={onViewPhoto} />}
            {asking === s.id && (
              <ReturnForm
                photos={review.photos.filter((p) => !/^PR:/.test(p.slot))}
                fixBy={review.review.fix_by_default}
                busy={busy}
                again={s.state === 'fixed'}
                onCancel={() => setAsking(null)}
                onSend={(b) => void act(s.id, { action: 'return', ...b }, 'Return to site sent: their PO is on hold until it’s put right.')}
              />
            )}
          </div>
        );
      })}
      {review.po && poReview && (
        <p className="crm-small crm-muted">
          {review.po.po_number}: {PO_REVIEW_LABEL[poReview]}
        </p>
      )}
      {review.review.returns.length > 0 && (
        <details className="sxr-history">
          <summary>History: {review.review.returns.length === 1 ? '1 return to site' : `${review.review.returns.length} returns to site`}</summary>
          {review.review.returns.map((r) => (
            <ReturnHistory key={r.id} r={r} photos={review.photos} onViewPhoto={onViewPhoto} />
          ))}
        </details>
      )}
    </section>
  );
}

/** What the trade sent back: what they did and their photos of the fix. */
function PutRightLines({ r, photos, onViewPhoto }: { r: ReviewReturn; photos: ReviewPhoto[]; onViewPhoto: (p: ReviewPhoto) => void }) {
  const fix = photos.filter((p) => p.slot === `PR:${r.n}`);
  return (
    <div className="sxr-putright">
      <p>
        <b>Asked:</b> {r.what}
      </p>
      {r.fixed_note && (
        <p>
          <b>What they did:</b> {r.fixed_note}
        </p>
      )}
      {fix.length > 0 && <Thumbs photos={fix} onViewPhoto={onViewPhoto} />}
    </div>
  );
}

function Thumbs({ photos, onViewPhoto }: { photos: ReviewPhoto[]; onViewPhoto: (p: ReviewPhoto) => void }) {
  return (
    <div className="sxr-grid sxr-grid--small">
      {photos.map((p) => (
        <button key={p.id} type="button" className="sxr-thumb" onClick={() => onViewPhoto(p)} aria-label={`${p.label}, ${when(p.taken_at)}`}>
          {p.thumb ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link to a private file */}
              <img src={p.thumb} alt="" loading="lazy" />
            </>
          ) : (
            <span>Photo</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Return to site required: what, their photos it's about, by when, and the safety tick. */
function ReturnForm({
  photos,
  fixBy,
  busy,
  again,
  onCancel,
  onSend,
}: {
  photos: ReviewPhoto[];
  fixBy: string;
  busy: boolean;
  again: boolean;
  onCancel: () => void;
  onSend: (b: { what: string; photo_ids: string[]; fix_by: string; safety: boolean }) => void;
}) {
  const [what, setWhat] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [by, setBy] = useState(fixBy);
  const [safety, setSafety] = useState(false);
  return (
    <div className="sxr-returnform">
      {again && <p className="crm-small">Their put right isn’t enough: this asks them to return to site again.</p>}
      <label className="crm-label" htmlFor="sxr-what">
        What needs putting right
      </label>
      <textarea id="sxr-what" className="crm-input" rows={3} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. Two tiles are left lifted above the left of the array. Dress them back flat." />
      {photos.length > 0 && (
        <>
          <p className="crm-label">Point to their photos (optional)</p>
          <div className="sxr-grid sxr-grid--small">
            {photos.map((p) => {
              const on = picked.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`sxr-thumb sxr-pick${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  aria-label={p.label}
                  onClick={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])}
                >
                  {p.thumb ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link to a private file */}
                      <img src={p.thumb} alt="" loading="lazy" />
                    </>
                  ) : (
                    <span>Photo</span>
                  )}
                  <small>{p.label}</small>
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="sxr-returnform__row">
        <label className="crm-label" htmlFor="sxr-fixby">
          Put right by
          <input id="sxr-fixby" className="crm-input" type="date" value={by} onChange={(e) => setBy(e.target.value)} />
        </label>
        <label className="sxr-check">
          <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} />
          It affects safety or the home (the agreement gives 7 working days)
        </label>
      </div>
      <p className="crm-small crm-muted">It goes now by email and WhatsApp as the written notice (clause 12.3). Their PO goes on hold until it’s put right.</p>
      <div className="sx-actions">
        <button type="button" className="crm-btn crm-btn--small sxr-return" disabled={busy || !what.trim() || !by} onClick={() => onSend({ what: what.trim(), photo_ids: picked, fix_by: by, safety })}>
          {busy ? 'Sending…' : 'Send return to site'}
        </button>
        <button type="button" className="crm-chipbtn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** One return to site, start to finish: the notice as it went, the messages, the put right, the review. */
function ReturnHistory({ r, photos, onViewPhoto }: { r: ReviewReturn; photos: ReviewPhoto[]; onViewPhoto: (p: ReviewPhoto) => void }) {
  const pointed = photos.filter((p) => r.photo_ids.includes(p.id));
  const fix = photos.filter((p) => p.slot === `PR:${r.n}`);
  return (
    <div className="sxr-hist">
      <p>
        <b>Return to site {r.n}</b> · {STAGE_WORDS[r.stage]} · asked {when(r.created_at)}
        {r.created_by_name ? ` by ${r.created_by_name}` : ''} · put right by {day(r.fix_by)}
        {r.safety ? ' · affects safety or the home' : ''}
      </p>
      <p className="sxr-hist__state">{RETURN_WORDS[r.status] ?? r.status}</p>
      <p className="sxr-pre">{r.what}</p>
      {pointed.length > 0 && <Thumbs photos={pointed} onViewPhoto={onViewPhoto} />}
      <p className="crm-small crm-muted">
        Notice: {r.notice_sent_at ? `reached them ${when(r.notice_sent_at)}` : 'not delivered yet'}
        {r.messages.map((m) => ` · ${m.channel === 'email' ? 'email' : 'WhatsApp'} ${m.status === 'sent' ? `sent ${when(m.sent_at)}` : m.status === 'failed' ? `didn’t go (${m.error ?? 'error'})` : m.status}`).join('')}
      </p>
      {r.notice && (
        <details>
          <summary className="crm-small">The notice as it went</summary>
          <div className="sxr-notice">
            <p>
              <b>{r.notice.subject}</b>
            </p>
            {r.notice.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </details>
      )}
      {r.fixed_at && (
        <div className="sxr-putright">
          <p>
            <b>Put right</b> by {r.fixed_name}, {when(r.fixed_at)}
          </p>
          {r.fixed_note && <p>{r.fixed_note}</p>}
          {fix.length > 0 && <Thumbs photos={fix} onViewPhoto={onViewPhoto} />}
          {r.fixed_declaration && (
            <details>
              <summary className="crm-small">Their declaration</summary>
              <p className="sxr-pre crm-small">{r.fixed_declaration}</p>
            </details>
          )}
          {r.fixed_signature && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link to a private file */}
              <img className="sxr-sig" src={r.fixed_signature} alt={`Signature of ${r.fixed_name ?? 'the trade'}`} />
            </>
          )}
        </div>
      )}
      {r.reviewed_at && (r.status === 'green' || r.status === 'again') && (
        <p className="crm-small">
          {r.status === 'green' ? 'Green light' : 'Returned again'} · {r.reviewed_by ?? 'the office'}, {when(r.reviewed_at)}
        </p>
      )}
    </div>
  );
}
