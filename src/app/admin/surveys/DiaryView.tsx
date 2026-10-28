'use client';

import { BrandIcon } from '@/app/admin/crm/CrmUi';
import Link from 'next/link';
import { Fragment, useEffect, useEffectEvent, useState } from 'react';
import { ukDate, ukTime } from '@/lib/booking/engine';
import { DiaryEntrySheet, type EntryView } from './DiaryEntrySheet';
import { FindTimeSheet } from './FindTimeSheet';
import './diary.css';

/**
 * The Diary: the next 3 weeks for each surveyor (surveys, installs, Outlook, his own entries) with
 * the drives between them, free time for jobs nearby, and why customers can't book a day; the
 * survey requests waiting for a tap; and the one-off "Copy these dates into Outlook" list.
 * Data from /api/crm/booking/diary (read-only); changes go through the booking and diary APIs.
 */

type Item = {
  id: string;
  kind: 'outlook' | 'booking' | 'crm_survey' | 'install' | 'entry' | 'closed';
  start: string;
  end: string;
  time: string;
  label: string;
  place: string;
  postcode: string | null;
  mapUrl: string | null;
  isSurvey: boolean;
  allDay: boolean;
  private: boolean;
  movedInOutlook: boolean;
  noLocation: boolean;
  approx: boolean;
  online: boolean;
  projectId: string | null;
  bookingId: string | null;
  entryId: string | null;
  status: string | null;
};
type Leg = { from: string; to: string; minutes: number; rush: boolean; afterId: string | null; beforeId: string | null };
type Day = {
  day: string;
  label: string;
  hours: { start: string; end: string; maxFromBaseMins?: number } | null;
  items: Item[];
  allDay: Item[];
  legs: Leg[];
  free: { start: string; end: string; time: string }[];
  surveys: number;
  reason: string | null;
  note: string | null;
};
type SurveyorDays = {
  key: string;
  name: string;
  base: { label: string; postcode: string };
  leaveHomeFrom: string | null;
  homeBy: string | null;
  outlookOk: boolean;
  outlookError: string | null;
  days: Day[];
  notBlocking: Item[];
};
type Request = {
  id: string;
  projectId: string | null;
  customer: string;
  phone: string | null;
  email: string | null;
  start: string | null;
  label: string;
  typeLabel: string;
  minutes: number;
  postcode: string;
  surveyorName: string;
  wouldConfirm: boolean | null;
  notify: 'whatsapp' | 'email' | 'call';
  duplicateOf: string | null;
  expiresAt: string | null;
};
type Diary = {
  ready: true;
  today: string;
  enabled: boolean;
  mode: 'request' | 'instant';
  cutoff: string;
  bufferMins: number;
  coffeeMins: number;
  connected: { outlook: boolean; provider: 'google' | 'estimate' };
  surveyors: SurveyorDays[];
  requests: Request[];
  backfill: number;
};
type Backfill = { kind: 'survey' | 'install' | 'entry'; id: string; label: string; when: string };
type Declined = { id: string; text: string; url: string | null; phone: string | null; projectId: string | null; customer: string };

const KIND_TAG: Partial<Record<Item['kind'], string>> = { outlook: 'Outlook', entry: 'your diary' };
const hrs = (m: number) => (m === 60 ? '1 hr' : m === 90 ? '1½ hrs' : m % 60 === 0 ? `${m / 60} hrs` : `${m} min`);
const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;

async function send(
  url: string,
  method: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> & { error?: string; message?: string } }> {
  try {
    const r = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, data: { error: 'No connection. Try again.' } };
  }
}

async function loadDiary(fresh: boolean): Promise<{ diary: Diary | null; ready: boolean; entries: EntryView[]; error?: string }> {
  try {
    const [d, e] = await Promise.all([
      fetch(`/api/crm/booking/diary${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/crm/diary-entries', { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => ({ entries: [] })),
    ]);
    if (d?.error) return { diary: null, ready: true, entries: [], error: d.error };
    if (!d?.ready) return { diary: null, ready: false, entries: [] };
    return { diary: d as Diary, ready: true, entries: (e?.entries ?? []) as EntryView[] };
  } catch {
    return { diary: null, ready: true, entries: [], error: 'Couldn’t load the diary. Check your signal and try again.' };
  }
}

export function DiaryView({
  ready,
  isAdmin,
  project,
  add,
  find = false,
  today: todayProp,
}: {
  ready: boolean;
  isAdmin: boolean;
  /** ?project={id}: open Find a time for that job. */
  project: string | null;
  /** ?add=1: open + Add to my diary. */
  add: boolean;
  /** ?find=1: open Find a time with no job chosen yet. */
  find?: boolean;
  /** The UK date when the page was made (until the diary has loaded). */
  today: string;
}) {
  const [diary, setDiary] = useState<Diary | null>(null);
  const [entries, setEntries] = useState<EntryView[]>([]);
  const [schema, setSchema] = useState(ready);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [sheet, setSheet] = useState<{ kind: 'entry'; entry: EntryView | null } | { kind: 'find'; project: string | null } | null>(
    project ? { kind: 'find', project } : find ? { kind: 'find', project: null } : add ? { kind: 'entry', entry: null } : null
  );
  const [declined, setDeclined] = useState<Declined | null>(null);
  const [bf, setBf] = useState<{ items: Backfill[]; off: string[] } | null>(null);

  function apply(r: Awaited<ReturnType<typeof loadDiary>>) {
    setSchema(r.ready);
    if (r.error) return setError(r.error);
    setError('');
    setDiary(r.diary);
    setEntries(r.entries);
  }

  const loaded = useEffectEvent((r: Awaited<ReturnType<typeof loadDiary>>) => apply(r));
  useEffect(() => {
    if (!ready) return;
    let gone = false;
    loadDiary(false).then((r) => {
      if (!gone) loaded(r);
    });
    return () => {
      gone = true;
    };
  }, [ready]);

  async function reload(fresh = false, message = '') {
    setBusy(fresh ? 'refresh' : 'load');
    const r = await loadDiary(fresh);
    setBusy('');
    apply(r);
    if (message) setMsg(message);
  }

  /* Waiting for you */
  async function confirmRequest(rq: Request, force = false) {
    setBusy(`confirm:${rq.id}`);
    setError('');
    setMsg('');
    const r = await send(`/api/crm/booking/${rq.id}`, 'POST', { action: 'confirm', force });
    setBusy('');
    if (r.status === 409 && r.data.error === 'clash') {
      if (window.confirm(String(r.data.message || 'This no longer fits the diary. Confirm anyway?'))) return confirmRequest(rq, true);
      return;
    }
    if (!r.ok) return setError(r.data.error || 'Not confirmed. Try again.');
    await reload(false, `Confirmed ✓ ${rq.customer}: ${rq.label}. They’ll get the confirmation by itself.`);
  }
  async function offerAnother(rq: Request) {
    if (!window.confirm(`Turn down ${rq.customer}’s request for ${rq.label}? You’ll get a message to send them with their booking link.`)) return;
    setBusy(`decline:${rq.id}`);
    setError('');
    setMsg('');
    const r = await send(`/api/crm/booking/${rq.id}`, 'POST', { action: 'decline' });
    setBusy('');
    if (!r.ok) return setError(r.data.error || 'Not changed. Try again.');
    setDeclined({
      id: rq.id,
      text: String(r.data.text || ''),
      url: (r.data.url as string | null) ?? null,
      phone: (r.data.phone as string | null) ?? rq.phone,
      projectId: rq.projectId,
      customer: rq.customer,
    });
    await reload();
  }

  /* Moved in Outlook */
  async function useOutlookTime(i: Item) {
    if (!window.confirm(`Change it to ${ukTime(Date.parse(i.start))} on ${dayShort(i.start)}, the time in Outlook?`)) return;
    setBusy(`moved:${i.id}`);
    setError('');
    const r = i.entryId
      ? await send(`/api/crm/diary-entries/${i.entryId}`, 'PATCH', { starts_at: i.start, ends_at: i.end })
      : i.projectId
        ? await send(`/api/crm/projects/${i.projectId}`, 'PATCH', { survey_at: i.start })
        : { ok: false, status: 0, data: { error: 'Change it in the CRM instead.' } };
    setBusy('');
    if (!r.ok) return setError(r.data.error || 'Not changed. Try again.');
    await reload(true, 'Changed to Outlook’s time ✓');
  }
  async function putBack(i: Item) {
    setBusy(`moved:${i.id}`);
    setError('');
    const r = await send('/api/crm/booking/outlook-backfill', 'POST', {
      project_ids: i.entryId ? [] : [i.projectId],
      entry_ids: i.entryId ? [i.entryId] : [],
      rewrite: true,
    });
    setBusy('');
    if (!r.ok) return setError(r.data.error || 'Not changed. Try again.');
    setMsg('Outlook will be put back to the CRM’s time within a minute or two.');
  }

  /* Copy these dates into Outlook */
  async function openBackfill() {
    setBusy('backfill');
    setError('');
    const r = await send('/api/crm/booking/outlook-backfill', 'GET');
    setBusy('');
    if (!r.ok) return setError(r.data.error || 'Couldn’t load the list.');
    setBf({ items: (r.data.items as Backfill[]) ?? [], off: [] });
  }
  async function copyBackfill() {
    if (!bf) return;
    const keep = bf.items.filter((x) => !bf.off.includes(`${x.kind}:${x.id}`));
    setBusy('backfill');
    setError('');
    const r = await send('/api/crm/booking/outlook-backfill', 'POST', {
      project_ids: [...new Set(keep.filter((x) => x.kind !== 'entry').map((x) => x.id))],
      entry_ids: keep.filter((x) => x.kind === 'entry').map((x) => x.id),
      // Unticked: already in Outlook by hand, so never copied (unless the date changes).
      skip: bf.off,
    });
    setBusy('');
    if (!r.ok) return setError(r.data.error || 'Not copied. Try again.');
    setBf(null);
    await reload(
      false,
      keep.length
        ? `${keep.length} date${keep.length === 1 ? '' : 's'} will appear in Outlook within a few minutes ✓`
        : 'Done ✓ None of those will be copied into Outlook.'
    );
  }

  function openItem(i: Item) {
    const e = i.entryId ? entries.find((x) => x.id === i.entryId) : null;
    if (e) setSheet({ kind: 'entry', entry: e });
  }

  if (!schema) {
    return (
      <div className="dy">
        <div className="dy-head">
          <div>
            <h1>Diary</h1>
          </div>
        </div>
        <p className="dy-banner">
          The Diary appears once <b>survey-booking.sql</b> has been run in Supabase. The to-do list on the home page shows you how.
        </p>
      </div>
    );
  }

  const today = diary?.today ?? todayProp;
  const surveyorList = (diary?.surveyors ?? []).map((s) => ({ key: s.key, name: s.name }));
  const outlookErrors = (diary?.surveyors ?? []).filter((s) => !s.outlookOk && s.outlookError);

  return (
    <div className="dy">
      <div className="dy-head">
        <div>
          <h1>Diary</h1>
          <p>The next 3 weeks: surveys, installs{diary?.connected.outlook ? ', Outlook' : ''} and what you’ve added, with the drives between.</p>
        </div>
      </div>
      <div className="dy-actions">
        <button type="button" className="dy-btn dy-btn--solar" onClick={() => setSheet({ kind: 'entry', entry: null })}>
          + Add to my diary
        </button>
        <button type="button" className="dy-btn" onClick={() => setSheet({ kind: 'find', project: null })}>
          Find a time
        </button>
        <button type="button" className="dy-btn dy-btn--ghost" disabled={!!busy} onClick={() => reload(true)}>
          {busy === 'refresh' ? 'Refreshing…' : diary?.connected.outlook ? 'Refresh (read Outlook again)' : 'Refresh'}
        </button>
      </div>

      {msg && (
        <p className="dy-banner dy-banner--ok" role="status">
          {msg}
        </p>
      )}
      {error && (
        <p className="dy-banner dy-banner--err" role="alert">
          {error}
        </p>
      )}
      {!diary && !error && <p className="dy-muted">Loading the diary…</p>}

      {diary && !diary.connected.outlook && (
        <p className="dy-banner">
          Outlook isn’t connected yet, so the diary only knows the surveys in the CRM and what you add here. Customers can request a time and you confirm it
          here.
        </p>
      )}
      {outlookErrors.map((s) => (
        <p key={s.key} className="dy-banner dy-banner--err">
          Couldn’t read {s.name}’s Outlook ({s.outlookError}). Times are worked out without it, and nothing is booked instantly until it can be read.
        </p>
      ))}
      {diary && !diary.enabled && (
        <p className="dy-banner">
          Online booking is switched off, so customers can’t book yet. You can still find times and book them here.{' '}
          {isAdmin && (
            <Link href="/admin/surveys/settings" className="dy-link">
              Booking settings
            </Link>
          )}
        </p>
      )}

      {declined && (
        <div className="dy-card">
          <h3>Send {declined.customer} another time</h3>
          <p className="dy-small">Their request is turned down. Send them this, so they can pick a new time:</p>
          <p className="dy-msg">{declined.text}</p>
          <div className="dy-row">
            <button
              type="button"
              className="dy-btn"
              onClick={() =>
                navigator.clipboard.writeText(declined.text).then(
                  () => setMsg('Message copied ✓ Paste it into their WhatsApp chat or an email.'),
                  () => setMsg('Couldn’t copy: select the text instead.')
                )
              }
            >
              Copy message
            </button>
            {declined.projectId && (
              <Link href={`/admin/crm/${declined.projectId}`} className="dy-btn dy-btn--ghost">
                Open the job to send it
              </Link>
            )}
            {declined.phone && (
              <a href={tel(declined.phone)} className="dy-btn dy-btn--ghost">
                Call {declined.phone}
              </a>
            )}
            <button type="button" className="dy-btn dy-btn--ghost" onClick={() => setDeclined(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      {diary && diary.requests.length > 0 && (
        <section className="dy-section">
          <h2>
            Waiting for you <span className="dy-count">{diary.requests.length}</span>
          </h2>
          {diary.requests.map((rq) => (
            <div key={rq.id} className="dy-card">
              <h3>
                {rq.projectId ? (
                  <Link href={`/admin/crm/${rq.projectId}`} className="dy-item">
                    {rq.customer}
                  </Link>
                ) : (
                  rq.customer
                )}{' '}
                <span className="dy-tag">{rq.postcode}</span> {rq.duplicateOf && <span className="dy-tag dy-tag--req">Possible duplicate</span>}
              </h3>
              <p>
                <b>{rq.label}</b> · {rq.typeLabel} ({hrs(rq.minutes)}){surveyorList.length > 1 ? ` · ${rq.surveyorName}` : ''}
              </p>
              {diary.connected.outlook && rq.wouldConfirm !== null && (
                <p className={rq.wouldConfirm ? 'dy-yes' : 'dy-no'}>
                  {rq.wouldConfirm ? 'Instant booking would have accepted this ✓' : '✗ Outlook couldn’t be read'}
                </p>
              )}
              <p className="dy-small">
                {rq.notify === 'whatsapp'
                  ? 'They’ll be told by WhatsApp when you confirm.'
                  : rq.notify === 'email'
                    ? 'They’ll be told by email when you confirm.'
                    : 'No WhatsApp or email for them: call to tell them.'}
                {rq.expiresAt ? ` Lapses ${dayShort(rq.expiresAt)} ${ukTime(Date.parse(rq.expiresAt))} if not confirmed.` : ''}
              </p>
              <div className="dy-row">
                <button type="button" className="dy-btn" disabled={!!busy} onClick={() => confirmRequest(rq)}>
                  {busy === `confirm:${rq.id}` ? 'Confirming…' : 'Confirm'}
                </button>
                <button type="button" className="dy-btn dy-btn--ghost" disabled={!!busy} onClick={() => offerAnother(rq)}>
                  {busy === `decline:${rq.id}` ? 'Just a moment…' : 'Offer another time'}
                </button>
                {rq.notify === 'call' && rq.phone && (
                  <a href={tel(rq.phone)} className="dy-btn dy-btn--ghost">
                    Call {rq.phone}
                  </a>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {diary && diary.connected.outlook && diary.backfill > 0 && (
        <section className="dy-section">
          <div className="dy-card dy-backfill">
            <h3>Copy these {diary.backfill} upcoming dates into Outlook</h3>
            <p className="dy-small">Surveys, installs and diary entries set before Outlook was connected. Untick any you’ve already put in Outlook by hand.</p>
            {!bf ? (
              <div className="dy-row">
                <button type="button" className="dy-btn dy-btn--ghost" disabled={busy === 'backfill'} onClick={openBackfill}>
                  {busy === 'backfill' ? 'Loading…' : 'Show the list'}
                </button>
              </div>
            ) : (
              <>
                {bf.items.map((x) => {
                  const k = `${x.kind}:${x.id}`;
                  return (
                    <label key={k}>
                      <input
                        type="checkbox"
                        checked={!bf.off.includes(k)}
                        onChange={(e) => setBf({ ...bf, off: e.target.checked ? bf.off.filter((y) => y !== k) : [...bf.off, k] })}
                      />
                      <span>
                        {x.label} <span className="dy-small">· {x.when}</span>
                      </span>
                    </label>
                  );
                })}
                <div className="dy-row">
                  <button type="button" className="dy-btn" disabled={busy === 'backfill'} onClick={copyBackfill}>
                    {busy === 'backfill' ? 'Copying…' : bf.off.length === bf.items.length ? 'Don’t copy any' : `Copy ${bf.items.length - bf.off.length}`}
                  </button>
                  <button type="button" className="dy-btn dy-btn--ghost" onClick={() => setBf(null)}>
                    Not now
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {diary && (
        <section className="dy-section">
          <h2>Next 3 weeks</h2>
          {diary.surveyors.map((sv) => (
            <div key={sv.key}>
              {diary.surveyors.length > 1 && <h3 className="dy-dayname">{sv.name}</h3>}
              {sv.days.map((d) => (
                <DayCard
                  key={d.day}
                  d={d}
                  sv={sv}
                  today={today}
                  diary={diary}
                  busy={busy}
                  onOpen={openItem}
                  onUseOutlook={useOutlookTime}
                  onPutBack={putBack}
                />
              ))}
            </div>
          ))}
          <p className="dy-small">Drive times are our own estimate, erring on the long side, with 20% added in rush hour.</p>
        </section>
      )}

      {sheet?.kind === 'entry' && (
        <DiaryEntrySheet
          key={sheet.entry?.id ?? 'new'}
          entry={sheet.entry}
          defaultDay={today}
          surveyors={surveyorList}
          onClose={() => setSheet(null)}
          onSaved={(m) => {
            setSheet(null);
            void reload(false, m);
          }}
        />
      )}
      {sheet?.kind === 'find' && (
        <FindTimeSheet
          projectId={sheet.project}
          today={today}
          surveyors={surveyorList}
          onClose={() => setSheet(null)}
          onBooked={(m) => {
            setSheet(null);
            void reload(false, m);
          }}
        />
      )}
    </div>
  );
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Tue 3 Nov" for an ISO time (UK date). */
function dayShort(iso: string): string {
  const ymd = ukDate(Date.parse(iso));
  const d = new Date(`${ymd}T12:00:00Z`);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

function DayCard({
  d,
  sv,
  today,
  diary,
  busy,
  onOpen,
  onUseOutlook,
  onPutBack,
}: {
  d: Day;
  sv: SurveyorDays;
  today: string;
  diary: Diary;
  busy: string;
  onOpen: (i: Item) => void;
  onUseOutlook: (i: Item) => void;
  onPutBack: (i: Item) => void;
}) {
  const notBlocking = sv.notBlocking.filter((i) => i.id.endsWith(`:${d.day}`) || ukDate(Date.parse(i.start)) === d.day);
  const first = d.legs.find((l) => l.afterId === null);
  const last = d.legs.find((l) => l.beforeId === null && l.afterId !== null);
  // Each drive is shown just before the appointment it leads to.
  const into = new Map(d.legs.filter((l) => l.afterId && l.beforeId).map((l) => [l.beforeId as string, l]));
  // Bank holidays and closed days are already the reason the day has no times.
  const allDay = d.allDay.filter((i) => i.kind !== 'closed');
  const empty = !d.items.length && !allDay.length;
  const off = !d.hours;
  const rush = (l: Leg) => (l.rush ? ' + rush hour' : '');
  const shownFree = new Set<string>();
  const freeBefore = (until: number) =>
    d.free.filter((f) => {
      if (shownFree.has(f.start) || Date.parse(f.start) >= until) return false;
      shownFree.add(f.start);
      return true;
    });
  const freeLine = (f: { start: string; time: string }) => (
    <li key={`free-${f.start}`} className="dy-line dy-line--free">
      <b>{f.time}</b>
      <div>Free for jobs nearby</div>
    </li>
  );

  return (
    <article className={`dy-day${d.day === today ? ' dy-day--today' : ''}${off && empty ? ' dy-day--off' : ''}`}>
      <header className="dy-dayhead">
        <h3>
          {d.day === today ? 'Today · ' : ''}
          {d.label}
        </h3>
        <span>
          {d.hours ? `${d.hours.start}–${d.hours.end}` : 'No surveys'}
          {d.surveys ? ` · ${d.surveys} survey${d.surveys === 1 ? '' : 's'}` : ''}
        </span>
      </header>
      {d.note && <p className="dy-why">{d.note}</p>}
      {d.reason && d.hours && <p className="dy-why">{d.reason}</p>}

      {(allDay.length > 0 || d.items.length > 0 || d.free.length > 0) && (
        <ul className="dy-lines">
          {allDay.map((i) => (
            <li key={i.id} className="dy-line dy-line--allday">
              <b>All day</b>
              <div>
                <ItemLabel i={i} onOpen={onOpen} />
              </div>
            </li>
          ))}
          {d.items.map((i, k) => {
            const leg = into.get(i.id);
            return (
              <Fragment key={i.id}>
                {freeBefore(Date.parse(i.start)).map(freeLine)}
                {k === 0 && first && (
                  <li className="dy-line dy-line--home">
                    <b>{sv.leaveHomeFrom ? `${sv.leaveHomeFrom} leave` : 'From home'}</b>
                    <div>
                      {sv.base.label} {sv.base.postcode} → {first.minutes} min{rush(first)}
                    </div>
                  </li>
                )}
                {leg && (
                  <li className="dy-line dy-line--leg">
                    <b />
                    <div>
                      → {leg.minutes} min{rush(leg)} · buffer {diary.bufferMins} · coffee {diary.coffeeMins}
                    </div>
                  </li>
                )}
                <li className="dy-line">
                  <b>{i.time}</b>
                  <div>
                    <ItemLabel i={i} onOpen={onOpen} />
                    {i.mapUrl && (
                      <>
                        {' '}
                        <a className="dy-map" href={i.mapUrl} target="_blank" rel="noreferrer" aria-label={`Open ${i.label} in Google Maps`}>
                          <BrandIcon k="mappin" size={14} /> Map
                        </a>
                      </>
                    )}
                  </div>
                </li>
                {i.noLocation && (
                  <li className="dy-flag dy-flag--warn">No location on this Outlook appointment. Add a postcode in Outlook so travel can be worked out.</li>
                )}
                {i.approx && <li className="dy-flag dy-flag--grey">That postcode has no exact location, so it’s placed in the middle of the area.</li>}
                {i.movedInOutlook && (
                  <li className="dy-flag dy-flag--moved">
                    Moved in Outlook to {ukTime(Date.parse(i.start))}.
                    {(i.projectId || i.entryId) && (
                      <div className="dy-row">
                        <button type="button" className="dy-btn dy-btn--small" disabled={!!busy} onClick={() => onUseOutlook(i)}>
                          Use Outlook’s time
                        </button>
                        <button type="button" className="dy-btn dy-btn--ghost dy-btn--small" disabled={!!busy} onClick={() => onPutBack(i)}>
                          Put it back
                        </button>
                      </div>
                    )}
                  </li>
                )}
              </Fragment>
            );
          })}
          {last && (
            <li className="dy-line dy-line--home">
              <b>Home</b>
              <div>
                → {last.minutes} min{rush(last)} back to {sv.base.postcode}
                {sv.homeBy ? ` (home by ${sv.homeBy})` : ''}
              </div>
            </li>
          )}
          {freeBefore(Infinity).map(freeLine)}
        </ul>
      )}
      {empty && !d.free.length && d.hours && !d.reason && <p className="dy-why">Nothing booked.</p>}
      {notBlocking.map((i) => (
        <p key={i.id} className="dy-flag dy-flag--grey">
          {i.kind === 'outlook'
            ? `${i.label.replace(/ \(Outlook, all day\)$/, '')} (Outlook, all day): not blocking, because it’s marked Free. Mark days off as Away.`
            : `${i.label} (all day): not blocking${i.kind === 'install' ? `, because ${sv.name} isn’t on the install team` : ''}.`}
        </p>
      ))}
    </article>
  );
}

function ItemLabel({ i, onOpen }: { i: Item; onOpen: (i: Item) => void }) {
  const tag = KIND_TAG[i.kind];
  const text = (
    <>
      {i.label}
      {tag && !i.movedInOutlook ? ` (${tag})` : ''}
      {i.place ? ` · ${i.place}` : ''}
    </>
  );
  const status =
    i.status === 'requested' ? (
      <span className="dy-tag dy-tag--req">waiting for you</span>
    ) : i.status === 'held' ? (
      <span className="dy-tag">held online</span>
    ) : null;
  if (i.kind === 'entry' && i.entryId) {
    return (
      <>
        <button type="button" className="dy-item" onClick={() => onOpen(i)}>
          {text}
        </button>{' '}
        {status}
      </>
    );
  }
  if (i.projectId && !i.movedInOutlook) {
    return (
      <>
        <Link href={`/admin/crm/${i.projectId}`} className={i.isSurvey ? 'dy-item dy-item--survey' : 'dy-item'}>
          {text}
        </Link>{' '}
        {status}
      </>
    );
  }
  return (
    <span className={i.isSurvey ? 'dy-item dy-item--survey' : 'dy-item'}>
      {text} {status}
    </span>
  );
}
