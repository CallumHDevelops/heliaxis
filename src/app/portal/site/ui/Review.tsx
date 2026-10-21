'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { shortDate } from '@/lib/site/client';
import { putRightDeclaration } from '@/lib/site/declaration';
import type { Field } from '@/lib/site/forms/types';
import { byJob, getDevice, getFile, type OutboxRecord, type PackRecord } from '@/lib/site/offline';
import { queuePutRight } from '@/lib/site/putright-client';
import { putRightSlot, REVIEW_STATE_LABEL, stageStates, type ReturnView, type ReviewState } from '@/lib/site/review-shared';
import type { Stage } from '@/lib/site/types';
import { SyncLine, TopBar } from './bits';
import type { JobForms } from './form-state';
import { go, useBlobUrl, useLive } from './nav';
import { PhotoSlot } from './PhotoSlot';

/**
 * The office's review on the trade's phone (review-shared.ts): where each sign-off is up to (waiting
 * for review, green light, return to site), the return-to-site card on the job with what needs
 * putting right, and the short Put right form (photos of the fix, what they did, the declaration and
 * their signature), which works with no signal like the sign-off.
 */

/** The declaration as signed: "I confirm that:", the bullets as a list, the rest as paragraphs. */
export function DeclarationText({ text }: { text: string }) {
  const lines = text.split('\n').filter((l) => l.trim());
  const out: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('• ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('• ')) items.push(lines[i++].slice(2));
      i--;
      out.push(
        <ul key={i} className="sa-decl-list">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      );
    } else out.push(<p key={i}>{lines[i]}</p>);
  }
  return <div className="sa-declaration">{out}</div>;
}

/** Each signed stage's review on this phone's copy. */
export const reviewOf = (rec: PackRecord) => stageStates(rec.pack.assignment.signoffs, rec.pack.returns ?? []);
const putRightPath = (rec: PackRecord, n: number) => `/portal/site/job/${rec.id}/put-right-${n}`;

/** The words under "Signed ✓" until the office has reviewed it (the owner's, 21 Oct). */
export const reviewNextWords = (po: boolean) =>
  `${po ? 'Your PO is below. ' : ''}We’ll review your photos and results and let you know: green light, or return to site if anything needs putting right.`;

/** Where one sign-off's review is up to: its state, and the card once the office has reviewed it (the done screen). */
export function stageReview(rec: PackRecord, stage: Stage) {
  const r = reviewOf(rec).find((x) => x.stage === stage);
  return { state: (r?.state ?? 'waiting') as ReviewState, live: r?.live ?? null };
}

/** The office's answer on a sign-off: Green light, or the return to site card. Nothing while it waits. */
export function ReviewNote({ rec, stage }: { rec: PackRecord; stage: Stage }) {
  const { state, live } = stageReview(rec, stage);
  if (state === 'green')
    return (
      <div className="sa-card sa-review sa-review-green">
        <h3>Green light ✓</h3>
        <p>We’ve reviewed your photos and results. Nothing needs putting right.</p>
      </div>
    );
  if ((state === 'open' || state === 'fixed') && live) return <ReturnCard rec={rec} ret={live} />;
  return null;
}

/** A return to site on the job: what needs putting right, by when, and Put it right (or "sent, waiting for review"). */
export function ReturnCard({ rec, ret }: { rec: PackRecord; ret: ReturnView }) {
  const outbox = useLive(() => byJob<OutboxRecord>('outbox', rec.id), `outbox:${rec.id}`);
  // Signed on this phone and still to send: it counts as done here.
  const pending = (outbox ?? []).some((o) => o.kind === 'put-right' && !o.failed && Number(o.payload.n) === ret.n);
  if (ret.status === 'fixed' || pending)
    return (
      <div className="sa-card sa-review sa-review-fixed" role="status">
        <p className="sa-kicker">Return to site</p>
        <h3>{pending ? 'Put right signed ✓' : 'Put right sent ✓'}</h3>
        <p>{pending ? 'Signed on this phone. It will send when you have signal.' : 'We’ll review your photos of the fix and let you know.'}</p>
      </div>
    );
  return (
    <div className="sa-card sa-review sa-review-open" role="alert">
      <p className="sa-kicker">Heliaxis has reviewed your work</p>
      <h3>Return to site required</h3>
      <p className="sa-pre">{ret.what}</p>
      <p className="sa-review-by">
        Put it right by <b>{shortDate(ret.fix_by)}</b>
        {ret.safety ? '. It affects safety or the home.' : '.'}
      </p>
      <button type="button" className="sa-btn sa-btn-1" onClick={() => go(putRightPath(rec, ret.n))}>
        Put it right
      </button>
    </div>
  );
}

/** Every live return to site, at the top of the job. */
export function ReturnBanners({ rec }: { rec: PackRecord }) {
  const live = reviewOf(rec).filter((r) => r.live && (r.state === 'open' || r.state === 'fixed'));
  if (!live.length) return null;
  return (
    <>
      {live.map((r) => (
        <ReturnCard key={r.live!.id} rec={rec} ret={r.live!} />
      ))}
    </>
  );
}

/** The review's word for a PO (its card and the home list): waiting, on hold, green light. */
export const REVIEW_PILL: Record<ReviewState, { text: string; tone: 'wait' | 'bad' | 'ok' }> = {
  waiting: { text: REVIEW_STATE_LABEL.waiting, tone: 'wait' },
  open: { text: 'On hold: return to site required', tone: 'bad' },
  fixed: { text: 'On hold: put right waiting for review', tone: 'bad' },
  green: { text: REVIEW_STATE_LABEL.green, tone: 'ok' },
};

const PHOTOS_OF_FIX: Field = { key: 'PR', type: 'PHOTOS', label: 'Photos of the fix', hint: 'Show it put right, close up and from further back.', level: 'must', need: 1 };

/**
 * The Put right form (/portal/site/job/<id>/put-right-<n>): what the office asked, the photos of
 * theirs it pointed to, then photos of the fix, what they did, the declaration and Sign. Signed with
 * no signal, it sends when there is (putright-client.ts).
 */
export function PutRightScreen({ rec, jf, n }: { rec: PackRecord; jf: JobForms; n: number }) {
  const job = rec.id;
  const device = useLive(getDevice, 'device');
  const outbox = useLive(() => byJob<OutboxRecord>('outbox', job), `outbox:${job}`);
  const [note, setNote] = useState('');
  const [name, setName] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ret = (rec.pack.returns ?? []).find((r) => r.n === n);
  const back = () => go(`/portal/site/job/${job}`);
  if (!ret) {
    return (
      <>
        <TopBar title="Put right" onBack={back} />
        <main className="sa-main">
          <p className="sa-empty">That return to site isn’t on this phone. Go back to the job.</p>
        </main>
      </>
    );
  }
  const slot = putRightSlot(n);
  const photos = jf.photos[slot] ?? [];
  const pending = (outbox ?? []).some((o) => o.kind === 'put-right' && !o.failed && Number(o.payload.n) === n);
  const declaration = putRightDeclaration(ret.what, jf.ctx.address);
  const who = name ?? device?.contact.name ?? '';
  const gate = rec.putRightGate?.n === n ? rec.putRightGate : null;
  const reasons = [...(!photos.length ? ['a photo of the fix'] : []), ...(!note.trim() ? ['what you did'] : []), ...(!who.trim() ? ['your name'] : []), ...(!signature ? ['your signature'] : [])];
  const done = ret.status !== 'open' || pending;

  return (
    <>
      <TopBar title="Put right" onBack={back} />
      <SyncLine />
      <main className="sa-main sa-sign">
        <p className="sa-kicker">Return to site {n > 1 ? n : ''}</p>
        <section className="sa-card sa-review sa-review-open">
          <h3>What needs putting right</h3>
          <p className="sa-pre">{ret.what}</p>
          <p className="sa-review-by">
            Put it right by <b>{shortDate(ret.fix_by)}</b>
            {ret.safety ? '. It affects safety or the home.' : '.'} At your own cost, under your Subcontractor Agreement.
          </p>
          {ret.photo_ids.length > 0 && <PointedTo rec={rec} ids={ret.photo_ids} />}
        </section>

        {done ? (
          <div className="sa-card sa-signed">
            <h2>Signed ✓</h2>
            <p>{pending ? 'Signed on this phone. It will send when you have signal.' : 'Sent. We’ll review your photos of the fix and let you know.'}</p>
          </div>
        ) : (
          <>
            {gate && (
              <div className="sa-alert sa-alert-bad" role="alert">
                <b>Not sent yet</b>
                <span>{gate.message}</span>
              </div>
            )}
            <section className="sa-card">
              <h3>Photos of the fix</h3>
              <PhotoSlot field={PHOTOS_OF_FIX} slot={slot} need={1} rec={rec} photos={photos} locked={false} />
            </section>
            <section className="sa-card">
              <label className="sa-label" htmlFor="sa-pr-note">
                What did you do?
              </label>
              <textarea id="sa-pr-note" className="sa-text sa-long" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="In a few words" />
            </section>
            <section className="sa-card">
              <h3>Declaration</h3>
              <DeclarationText text={declaration} />
              <label className="sa-label" htmlFor="sa-pr-name">
                Your name
              </label>
              <input id="sa-pr-name" className="sa-text" type="text" autoComplete="name" value={who} onChange={(e) => setName(e.target.value)} />
              <p className="sa-label">Sign here</p>
              <div className="sa-pad">
                <SignaturePad onChange={setSignature} height={180} />
              </div>
            </section>
            {reasons.length > 0 && <p className="sa-muted sa-reasons">To sign: {reasons.join(', ')}.</p>}
            <button
              type="button"
              className="sa-btn sa-btn-1 sa-signbtn"
              disabled={!!reasons.length || busy}
              onClick={async () => {
                if (!signature) return;
                setBusy(true);
                await queuePutRight(job, { n, note: note.trim(), name: who.trim(), signature, declaration });
                setBusy(false);
              }}
            >
              {busy ? 'Signing…' : 'Sign: it’s put right'}
            </button>
          </>
        )}
        <button type="button" className="sa-btn sa-btn-2" onClick={back}>
          Back to the job
        </button>
      </main>
    </>
  );
}

/** The photos of theirs the office pointed to (thumbnails kept on the phone). */
function PointedTo({ rec, ids }: { rec: PackRecord; ids: string[] }) {
  const known = rec.pack.photos.filter((p) => ids.includes(p.id));
  if (!known.length) return null;
  return (
    <>
      <p className="sa-label">The photos it’s about</p>
      <div className="sa-thumbs">
        {known.map((p) => (
          <Thumb key={p.id} id={p.id} />
        ))}
      </div>
    </>
  );
}

function Thumb({ id }: { id: string }) {
  const file = useLive(() => getFile(`thumb:${id}`), `thumb:${id}`);
  const url = useBlobUrl(file?.blob);
  return (
    <span className="sa-thumb">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob from the phone
        <img src={url} alt="" />
      ) : (
        <span className="sa-thumb-none" />
      )}
    </span>
  );
}
