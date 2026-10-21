'use client';

import { useEffect, useState } from 'react';
import { formatPence } from '@/lib/site/money';
import { heldWords } from '@/lib/site/po-shared';
import { PO_REVIEW_LABEL, poReviewOf } from '@/lib/site/review-shared';
import type { ReviewEvent, ReviewPhoto, ReviewRead, SiteReview } from '@/lib/site/review';
import type { AssignmentView, SiteTabData } from '@/lib/site/server';
import { SEVERITY_LABEL, type Flag } from '@/lib/site/types';
import { Sheet } from '../CrmUi';
import { send } from './record-shared';
import { SiteReviewPanel } from './SiteReviewPanel';

type Tab = 'answers' | 'photos' | 'reads' | 'signoff' | 'po' | 'events';
const TABS: { key: Tab; label: string }[] = [
  { key: 'answers', label: 'Answers' },
  { key: 'photos', label: 'Photos' },
  { key: 'reads', label: 'Serials and reads' },
  { key: 'signoff', label: 'Sign-off' },
  { key: 'po', label: 'PO' },
  { key: 'events', label: 'Events' },
];

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '';

const EVENT_WORDS: Record<string, string> = {
  created: 'Added to the job',
  edited: 'Changed on the Site tab',
  link_copied: 'Link copied',
  link_rotated: 'New link made',
  opened: 'Opened the job on a phone',
  message_queued: 'Message queued',
  message_sent: 'Message sent',
  message_failed: 'Message didn’t go',
  photo_deleted: 'Photo taken off',
  two_phones: 'Two phones gave different answers',
  flag_raised: 'Flagged',
  flag_cleared: 'Flag cleared by a changed answer',
  flag_resolved: 'Flag resolved',
  read_confirmed: 'Label read confirmed',
  signed_off: 'Signed off',
  signoff_reopened: 'Sign-off reopened',
  po_issued: 'PO issued',
  review_green: 'Green light',
  review_return: 'Return to site required',
  put_right_signed: 'Put right signed',
  cancelled: 'Taken off the job',
};

/** One line of detail for an event, from what it recorded. */
function eventDetail(e: ReviewEvent): string {
  const d = e.detail ?? {};
  const v = (k: string) => (d[k] == null ? '' : String(d[k]));
  switch (e.type) {
    case 'flag_raised':
      return v('text');
    case 'flag_resolved':
      return [v('code'), v('note')].filter(Boolean).join(': ');
    case 'message_queued':
    case 'message_sent':
    case 'message_failed':
      return [v('kind'), v('channel'), v('error')].filter(Boolean).join(' · ');
    case 'po_issued':
      return `${v('po_number')} v${v('version')}${d.payable != null ? ` · ${formatPence(Number(d.payable))} to pay` : ''}`;
    case 'signed_off':
      return `${v('stage')} · ${v('name')}`;
    case 'review_return':
      return [v('what'), d.fix_by ? `by ${v('fix_by')}` : '', d.safety ? 'affects safety' : ''].filter(Boolean).join(' · ');
    case 'review_green':
      return [v('stage'), d.return ? `put right ${v('return')}` : '', v('po')].filter(Boolean).join(' · ');
    case 'put_right_signed':
      return `${v('name')} · ${v('photos')} photo${d.photos === 1 ? '' : 's'}`;
    case 'two_phones':
      return `${v('key')}: ${JSON.stringify(d.was)} → ${JSON.stringify(d.now)}`;
    case 'edited':
      return Array.isArray(d.fields) ? (d.fields as string[]).join(', ') : '';
    default:
      return '';
  }
}

function readWords(r: ReviewRead): string {
  const x = r.result;
  if (r.status === 'queued') return 'Waiting to be read';
  if (r.status === 'failed') return 'The read didn’t work';
  if (!x || r.status === 'unreadable' || !x.readable) return `Couldn’t be read${x?.problem ? `: ${x.problem}` : ''}`;
  const bits = [
    [x.make, x.model].filter(Boolean).join(' '),
    x.serials.length ? `Serials: ${x.serials.join(', ')}` : '',
    x.panel?.pmax_w ? `${x.panel.pmax_w} W` : '',
    x.panel?.voc_v ? `Voc ${x.panel.voc_v} V` : '',
    x.panel?.isc_a ? `Isc ${x.panel.isc_a} A` : '',
    x.battery?.usable_kwh ? `${x.battery.usable_kwh} kWh usable` : '',
    x.inverter?.rated_ac_kw ? `${x.inverter.rated_ac_kw} kW AC` : '',
    x.meter?.reading_kwh != null ? `Meter ${x.meter.reading_kwh} kWh` : '',
  ];
  return bits.filter(Boolean).join(' · ') || 'Read, nothing useful on it';
}

/**
 * The review drawer for one trade (screen D4): your review first once they've signed (Green light or
 * Return to site required, and every return to site: SiteReviewPanel), then what they answered (by
 * step, where each came from, flags beside them with Resolve), their photos by slot (full screen,
 * download), Claude's label reads to confirm, the sign-off evidence, the PO and documents, and the
 * history. Reopen and Issue PO are here too.
 */
export function ReviewDrawer({
  a,
  onClose,
  onChanged,
  onIssue,
  onReopen,
}: {
  a: AssignmentView;
  onClose: () => void;
  onChanged: (d: SiteTabData) => void;
  onIssue: (override: boolean) => void;
  onReopen: () => void;
}) {
  const [review, setReview] = useState<SiteReview | null>(null);
  const [tab, setTab] = useState<Tab>('answers');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<ReviewPhoto | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/crm/site-assignments/${a.id}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) setError(d.error || 'Couldn’t load the review.');
        else setReview(d as SiteReview);
      })
      .catch(() => live && setError('Couldn’t reach the server. Try again.'));
    return () => {
      live = false;
    };
  }, [a.id, a.status, a.po?.status, a.po?.version]);

  async function resolve(f: Flag, note: string) {
    setBusy(true);
    setError('');
    try {
      const r = await send<{ ok: true; review: SiteReview; data: SiteTabData }>(`/api/crm/site-assignments/${a.id}/resolve-flag`, 'POST', { code: f.code, note });
      setReview(r.review);
      onChanged(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not resolved. Try again.');
    }
    setBusy(false);
  }

  async function confirm(r: ReviewRead) {
    setBusy(true);
    setError('');
    try {
      setReview((await send<{ ok: true; review: SiteReview }>(`/api/crm/site-assignments/${a.id}/confirm`, 'POST', { read_id: r.id })).review);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not confirmed. Try again.');
    }
    setBusy(false);
  }

  const counts: Partial<Record<Tab, number>> = review
    ? { photos: review.photos.length, reads: review.reads.filter((r) => r.status === 'read' && !r.confirmed_at).length, events: review.events.length }
    : {};
  const open = review?.flags.filter((f) => !f.resolved_at) ?? [];
  const signed = a.status === 'signed' || a.status === 'done';
  const poReview = review ? poReviewOf(review.review.submissions.map((s) => s.state)) : null;

  return (
    <Sheet title={`${a.title}: ${a.contact.name}`} onClose={onClose} wide>
      <div className="sxr">
        {review && <SiteReviewPanel assignmentId={a.id} review={review} onReview={setReview} onChanged={onChanged} onViewPhoto={setViewing} />}
        <div className="sxr-tabs" role="tablist" aria-label="Review">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : undefined} onClick={() => setTab(t.key)}>
              {t.label}
              {!!counts[t.key] && <em>{counts[t.key]}</em>}
            </button>
          ))}
        </div>
        {error && <p className="crm-banner crm-banner--err">{error}</p>}
        {!review ? (
          !error && <p className="crm-muted">Loading…</p>
        ) : (
          <>
            {tab === 'answers' && (
              <div className="sxr-answers">
                {open.length > 0 && (
                  <section className="sxr-open">
                    <h4>Open flags</h4>
                    {open.map((f) => (
                      <FlagRow key={`${f.code}-${f.key}`} f={f} busy={busy} onResolve={(note) => void resolve(f, note)} />
                    ))}
                  </section>
                )}
                {review.steps.length === 0 && <p className="crm-muted">Nothing answered yet.</p>}
                {review.steps.map((s) => (
                  <section key={`${s.form}-${s.step}`} className="sxr-step">
                    <h4>
                      {s.form} · {s.step} {s.signed && <span className="sxr-tag">Signed ✓</span>}
                    </h4>
                    <dl className="sxr-rows">
                      {s.rows.map((r) => (
                        <div key={r.key} className={r.flags.some((f) => !f.resolved_at) ? 'is-flagged' : undefined}>
                          <dt>{r.label}</dt>
                          <dd>
                            {r.value ?? <span className="crm-muted">Not answered</span>}
                            {r.src && r.value && <span className="sxr-src">{r.src}</span>}
                            {r.flags.map((f) => (
                              <span key={f.code} className={`sxr-flag sxr-flag--${f.severity}${f.resolved_at ? ' is-done' : ''}`}>
                                {SEVERITY_LABEL[f.severity]}: {f.text}
                                {f.resolved_at ? ` · resolved by ${f.resolved_by ?? 'the office'}${f.note ? `: ${f.note}` : ''}` : ''}
                              </span>
                            ))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            )}

            {tab === 'photos' && (
              <div className="sxr-photos">
                {review.photos.length === 0 && <p className="crm-muted">No photos yet.</p>}
                {[...new Set(review.photos.map((p) => p.label))].map((label) => (
                  <section key={label}>
                    <h4>{label}</h4>
                    <div className="sxr-grid">
                      {review.photos
                        .filter((p) => p.label === label)
                        .map((p) => (
                          <button key={p.id} type="button" className="sxr-thumb" onClick={() => setViewing(p)} aria-label={`${label}, ${when(p.taken_at)}`}>
                            {p.thumb ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link to a private file */}
                                <img src={p.thumb} alt="" loading="lazy" />
                              </>
                            ) : (
                              <span>Photo</span>
                            )}
                            <small>{when(p.taken_at)}</small>
                          </button>
                        ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {tab === 'reads' && (
              <div className="sxr-reads">
                {review.reads.length === 0 && <p className="crm-muted">No label or data-badge photos read yet.</p>}
                {review.reads.map((r) => (
                  <div key={r.id} className="sxr-read">
                    {r.thumb ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link to a private file */}
                        <img src={r.thumb} alt="" />
                      </>
                    ) : (
                      <span className="sxr-read__noimg" />
                    )}
                    <div>
                      <b>{r.label}</b>
                      <p>{readWords(r)}</p>
                      <small className="crm-muted">
                        {r.read_at ? `Read ${when(r.read_at)} · ` : ''}
                        {r.confirmed_at ? `Confirmed ${when(r.confirmed_at)}` : 'A suggestion until someone checks it against the photo'}
                      </small>
                    </div>
                    {r.status === 'read' && !r.confirmed_at && (
                      <button type="button" className="crm-btn crm-btn--small" disabled={busy} onClick={() => void confirm(r)}>
                        Confirm
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === 'signoff' && (
              <div className="sxr-signoffs">
                {review.signoffs.length === 0 && <p className="crm-muted">Not signed off yet.</p>}
                {review.signoffs.map((s) => (
                  <section key={s.id} className="sxr-signoff">
                    <h4>{s.stage === 'erection' ? 'Scaffold up' : s.stage === 'strike' ? 'Scaffold down' : 'Signed off'}</h4>
                    <dl className="sxr-rows">
                      <div>
                        <dt>Signed by</dt>
                        <dd>{s.signed_name}</dd>
                      </div>
                      <div>
                        <dt>Signed (the phone’s time)</dt>
                        <dd>{when(s.signed_at)}</dd>
                      </div>
                      <div>
                        <dt>Reached us</dt>
                        <dd>{when(s.received_at)}</dd>
                      </div>
                      <div>
                        <dt>Phone</dt>
                        <dd>
                          {s.user_agent ?? 'Not recorded'}
                          {s.ip ? ` · ${s.ip}` : ''}
                          {s.device_id ? <span className="crm-muted"> · device {s.device_id.slice(0, 8)}</span> : null}
                        </dd>
                      </div>
                      <div>
                        <dt>Declaration</dt>
                        <dd>
                          {s.declaration}
                          {s.declaration_phone && <p className="sx-warnline">The phone sent other words, kept here but not recorded as signed: “{s.declaration_phone}”</p>}
                        </dd>
                      </div>
                      <div>
                        <dt>Answers and photos signed</dt>
                        <dd className="sxr-hash">{s.answers_hash}</dd>
                      </div>
                      <div>
                        <dt>After it</dt>
                        <dd>{[s.steps_done.po ? 'PO done' : 'PO to do', s.steps_done.docs ? 'report made' : 'report to make', s.steps_done.notified ? 'owner told' : 'owner to tell'].join(' · ')}</dd>
                      </div>
                    </dl>
                    {s.signature && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link to a private file */}
                        <img className="sxr-sig" src={s.signature} alt={`Signature of ${s.signed_name}`} />
                      </>
                    )}
                  </section>
                ))}
                {signed && (
                  <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={onReopen}>
                    Reopen sign-off
                  </button>
                )}
              </div>
            )}

            {tab === 'po' && (
              <div className="sxr-po">
                {!review.po ? (
                  <p className="crm-muted">{a.raise_po ? 'Raised when they sign off.' : 'No PO for this trade (turned off).'}</p>
                ) : (
                  <>
                    <h4>
                      {review.po.po_number} · {review.po.status === 'draft' ? (review.po.labour?.held.length ? 'Held' : 'Being issued') : review.po.changed_since_sent ? 'Changed since it was sent' : 'Issued'}
                      {poReview && <span className={`sxr-state sxr-state--${poReview === 'hold' ? 'bad' : poReview === 'green' ? 'ok' : 'wait'}`}>{PO_REVIEW_LABEL[poReview]}</span>}
                    </h4>
                    {review.po.status === 'draft' && !!review.po.labour?.held.length && <p className="sx-warnline">{heldWords(review.po.labour).join('. ')}.</p>}
                    {review.po.labour && (
                      <dl className="sxr-rows">
                        <div>
                          <dt>{review.po.labour.rate_words ?? 'No agreed rate yet'}</dt>
                          <dd>{formatPence(review.po.labour.labour_net)}</dd>
                        </div>
                        <div>
                          <dt>{review.po.labour.vat_words}</dt>
                          <dd>{formatPence(review.po.labour.vat)}</dd>
                        </div>
                        <div>
                          <dt>{review.po.labour.cis.words}</dt>
                          <dd>−{formatPence(review.po.labour.cis.pence)}</dd>
                        </div>
                        <div className="sxr-total">
                          <dt>What they’ll be paid</dt>
                          <dd>{formatPence(review.po.labour.payable)}</dd>
                        </div>
                      </dl>
                    )}
                    <div className="sx-actions">
                      {review.po.status === 'draft' ? (
                        <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy} onClick={() => onIssue(true)}>
                          {review.po.labour?.held.length ? 'Issue anyway' : 'Issue PO'}
                        </button>
                      ) : (
                        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => onIssue(true)}>
                          Issue again
                        </button>
                      )}
                    </div>
                  </>
                )}
                {review.documents.length > 0 && (
                  <>
                    <h4>Documents</h4>
                    <ul className="sxr-docs">
                      {review.documents.map((d) => (
                        <li key={d.id}>
                          {d.url ? (
                            <a href={d.url} target="_blank" rel="noopener noreferrer">
                              {d.name}
                            </a>
                          ) : (
                            d.name
                          )}
                          {d.version ? <small className="crm-muted"> · v{d.version}</small> : null}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {tab === 'events' && (
              <ol className="sxr-events">
                {review.events.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <time>{when(e.at)}</time>
                    <b>{EVENT_WORDS[e.type] ?? e.type}</b>
                    <span>{eventDetail(e)}</span>
                    <small className="crm-muted">{e.actor}</small>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
      {viewing && (
        <div className="sxr-viewer" role="dialog" aria-modal="true" aria-label={viewing.label} onClick={() => setViewing(null)}>
          {viewing.url && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link to a private file */}
              <img src={viewing.url} alt={viewing.label} />
            </>
          )}
          <div className="sxr-viewer__bar" onClick={(e) => e.stopPropagation()}>
            <span>
              {viewing.label} · {when(viewing.taken_at)}
            </span>
            {viewing.download && (
              <a className="crm-btn crm-btn--small" href={viewing.download}>
                Download
              </a>
            )}
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** An open flag with Resolve: a note (what was done about it) and Resolve. */
function FlagRow({ f, busy, onResolve }: { f: Flag; busy: boolean; onResolve: (note: string) => void }) {
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <div className={`sxr-flagrow sxr-flag--${f.severity}`}>
      <span>
        <b>{SEVERITY_LABEL[f.severity]}:</b> {f.text}
      </span>
      {open ? (
        <span className="sxr-resolve">
          <input className="crm-input" value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder="What was done (optional)" aria-label="What was done about it" />
          <button type="button" className="crm-btn crm-btn--small" disabled={busy} onClick={() => onResolve(note)}>
            Resolve
          </button>
        </span>
      ) : (
        <button type="button" className="crm-chipbtn" onClick={() => setOpen(true)}>
          Resolve
        </button>
      )}
    </div>
  );
}
