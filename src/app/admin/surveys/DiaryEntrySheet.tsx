'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';

/**
 * + Add to my diary: site visits, installs not in the CRM, meetings and personal time, each with
 * where it is, so survey times leave room to drive there and back. Also edits and deletes them.
 * Saved through /api/crm/diary-entries (the postcode is looked up there); once Microsoft 365 is
 * connected, the entry is copied into Outlook too.
 */

export type EntryView = {
  id: string;
  surveyorKey: string;
  kind: Kind;
  kindLabel: string;
  title: string;
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  day: string | null;
  start: string | null;
  end: string | null;
  dayFrom: string | null;
  dayTo: string | null;
  whereKind: Where;
  address: string | null;
  postcode: string | null;
  projectId: string | null;
  inOutlook: boolean;
  outlookError: string | null;
};
type Kind = 'site_visit' | 'install' | 'meeting' | 'personal' | 'other';
type Where = 'address' | 'home' | 'online';
export type Job = {
  id: string;
  customer: string;
  title: string;
  stage: string;
  stageLabel: string;
  postcode: string | null;
  surveyAt: string | null;
  type: string | null;
};

const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: 'site_visit', label: 'Site visit', hint: 'e.g. Roof check for Jones' },
  { key: 'install', label: 'Install', hint: 'e.g. Battery fit, Cwmbran' },
  { key: 'meeting', label: 'Meeting', hint: 'e.g. Supplier meeting' },
  { key: 'personal', label: 'Personal', hint: 'e.g. Dentist' },
  { key: 'other', label: 'Other', hint: 'What is it?' },
];
const WHERE: { key: Where; label: string }[] = [
  { key: 'address', label: 'At an address' },
  { key: 'home', label: 'At home' },
  { key: 'online', label: 'Online / phone' },
];

const toMins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHhmm = (m: number) => {
  const x = Math.min(23 * 60 + 45, Math.max(0, m));
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function DiaryEntrySheet({
  entry,
  defaultDay,
  surveyors,
  onClose,
  onSaved,
}: {
  /** null = a new entry. */
  entry: EntryView | null;
  defaultDay: string;
  surveyors: { key: string; name: string }[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [kind, setKind] = useState<Kind>(entry?.kind ?? 'site_visit');
  const [title, setTitle] = useState(entry?.title ?? '');
  const [allDay, setAllDay] = useState(entry?.allDay ?? false);
  const [day, setDay] = useState(entry?.allDay ? (entry.dayFrom ?? defaultDay) : (entry?.day ?? defaultDay));
  const [lastDay, setLastDay] = useState(entry?.dayTo ?? entry?.day ?? defaultDay);
  const [start, setStart] = useState(entry?.start ?? '09:00');
  const [end, setEnd] = useState(entry?.end ?? '10:00');
  const [where, setWhere] = useState<Where>(entry?.whereKind ?? 'address');
  const [address, setAddress] = useState(entry?.address ?? '');
  const [postcode, setPostcode] = useState(entry?.postcode ?? '');
  const [surveyor, setSurveyor] = useState(entry?.surveyorKey ?? surveyors[0]?.key ?? '');
  const [job, setJob] = useState<{ id: string; label: string } | null>(entry?.projectId ? { id: entry.projectId, label: 'A job in the CRM' } : null);
  const [q, setQ] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [askDelete, setAskDelete] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Moving the start keeps the length the same. */
  function moveStart(next: string) {
    if (!HHMM.test(next)) return setStart(next);
    const len = HHMM.test(start) && HHMM.test(end) ? toMins(end) - toMins(start) : 60;
    setStart(next);
    setEnd(toHhmm(toMins(next) + (len > 0 ? len : 60)));
  }
  const step = (t: string, by: number) => toHhmm((HHMM.test(t) ? toMins(t) : 9 * 60) + by);

  function search(text: string) {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) return setJobs([]);
    timer.current = setTimeout(() => {
      fetch(`/api/crm/booking/find?q=${encodeURIComponent(text.trim())}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d: { jobs?: Job[] }) => setJobs(d.jobs ?? []))
        .catch(() => setJobs([]));
    }, 300);
  }

  async function save() {
    setError('');
    if (!allDay && (!HHMM.test(start) || !HHMM.test(end))) return setError('Pick the start and end times.');
    if (!allDay && toMins(end) <= toMins(start)) return setError('The end is before the start.');
    if (allDay && lastDay < day) return setError('The last day is before the first.');
    if (where === 'address' && postcode.replace(/\s/g, '').length < 5) return setError('Add the postcode, so travel can be worked out.');
    setBusy(true);
    const body = {
      surveyor_key: surveyor || undefined,
      kind,
      title: title.trim(),
      all_day: allDay,
      ...(allDay ? { day_from: day, day_to: lastDay } : { day, start, end }),
      where_kind: where,
      address: where === 'address' ? address.trim() : '',
      postcode: where === 'address' ? postcode.trim() : '',
      project_id: job?.id ?? null,
    };
    const r = await fetch(entry ? `/api/crm/diary-entries/${entry.id}` : '/api/crm/diary-entries', {
      method: entry ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setError(d.error || 'Not saved. Check your signal and try again.');
    onSaved(entry ? 'Saved ✓' : 'Added to your diary ✓');
  }

  async function remove() {
    if (!entry) return;
    setBusy(true);
    setError('');
    const r = await fetch(`/api/crm/diary-entries/${entry.id}`, { method: 'DELETE', cache: 'no-store' }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setError(d.error || 'Not deleted. Try again.');
    onSaved(entry.inOutlook ? 'Deleted ✓ (and from Outlook within a minute)' : 'Deleted ✓');
  }

  const hint = KINDS.find((k) => k.key === kind)?.hint ?? '';
  return (
    <div className="dy-sheet" role="dialog" aria-modal="true" aria-labelledby="dy-entry-title" onClick={onClose}>
      <div className="dy-sheet-box" onClick={(e) => e.stopPropagation()}>
        <div className="dy-sheet-top">
          <h2 id="dy-entry-title">{entry ? 'Change diary entry' : 'Add to my diary'}</h2>
          <button type="button" className="dy-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="dy-muted">Booked time counts as busy, and where it is counts for the drive to and from the customers either side.</p>

        <span className="dy-label">What</span>
        <div className="dy-chips">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              className={kind === k.key ? 'dy-chip is-on' : 'dy-chip'}
              aria-pressed={kind === k.key}
              onClick={() => setKind(k.key)}
            >
              {k.label}
            </button>
          ))}
        </div>
        <label className="dy-label" htmlFor="dy-title">
          Title
        </label>
        <input id="dy-title" className="dy-input" value={title} placeholder={hint} maxLength={120} onChange={(e) => setTitle(e.target.value)} />

        {surveyors.length > 1 && (
          <>
            <label className="dy-label" htmlFor="dy-who">
              Whose diary
            </label>
            <select id="dy-who" className="dy-input" value={surveyor} onChange={(e) => setSurveyor(e.target.value)}>
              {surveyors.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}

        <span className="dy-label">When</span>
        <label className="dy-check">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>
        <div className="dy-grid2">
          <div>
            <label className="dy-label" htmlFor="dy-day">
              {allDay ? 'First day' : 'Day'}
            </label>
            <input
              id="dy-day"
              className="dy-input"
              type="date"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                if (lastDay < e.target.value) setLastDay(e.target.value);
              }}
            />
          </div>
          {allDay && (
            <div>
              <label className="dy-label" htmlFor="dy-last">
                Last day
              </label>
              <input id="dy-last" className="dy-input" type="date" min={day} value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
            </div>
          )}
        </div>
        {!allDay && (
          <div className="dy-grid2">
            <div>
              <label className="dy-label" htmlFor="dy-start">
                Start
              </label>
              <div className="dy-stepper">
                <button type="button" aria-label="15 minutes earlier" onClick={() => moveStart(step(start, -15))}>
                  −
                </button>
                <input id="dy-start" className="dy-input" type="time" step={900} value={start} onChange={(e) => moveStart(e.target.value)} />
                <button type="button" aria-label="15 minutes later" onClick={() => moveStart(step(start, 15))}>
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="dy-label" htmlFor="dy-end">
                End
              </label>
              <div className="dy-stepper">
                <button type="button" aria-label="End 15 minutes earlier" onClick={() => setEnd(step(end, -15))}>
                  −
                </button>
                <input id="dy-end" className="dy-input" type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />
                <button type="button" aria-label="End 15 minutes later" onClick={() => setEnd(step(end, 15))}>
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        <span className="dy-label">Where</span>
        <div className="dy-chips">
          {WHERE.map((w) => (
            <button
              key={w.key}
              type="button"
              className={where === w.key ? 'dy-chip is-on' : 'dy-chip'}
              aria-pressed={where === w.key}
              onClick={() => setWhere(w.key)}
            >
              {w.label}
            </button>
          ))}
        </div>
        {where === 'address' && (
          <div className="dy-grid2">
            <div>
              <label className="dy-label" htmlFor="dy-addr">
                Address (optional)
              </label>
              <input id="dy-addr" className="dy-input" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label className="dy-label" htmlFor="dy-pc">
                Postcode
              </label>
              <input
                id="dy-pc"
                className="dy-input"
                value={postcode}
                maxLength={10}
                autoCapitalize="characters"
                onChange={(e) => setPostcode(e.target.value)}
              />
            </div>
          </div>
        )}
        {where === 'home' && <p className="dy-small">Counts as being at home: no driving before or after.</p>}
        {where === 'online' && <p className="dy-small">Counts as wherever you were before it.</p>}

        <span className="dy-label">Job (optional)</span>
        {job ? (
          <div className="dy-picked">
            <span>
              {entry?.projectId === job.id ? (
                <Link href={`/admin/crm/${job.id}`} className="dy-link">
                  {job.label}
                </Link>
              ) : (
                job.label
              )}
            </span>
            <button type="button" className="dy-btn dy-btn--ghost dy-btn--small" onClick={() => setJob(null)}>
              Remove
            </button>
          </div>
        ) : (
          <>
            <input
              className="dy-input"
              value={q}
              placeholder="Search by customer name or postcode"
              onChange={(e) => search(e.target.value)}
              aria-label="Search for a job"
            />
            {jobs.length > 0 && (
              <ul className="dy-results">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setJob({ id: j.id, label: `${j.customer}${j.postcode ? ` · ${j.postcode}` : ''}` });
                        if (where === 'address' && !postcode && j.postcode) setPostcode(j.postcode);
                        setJobs([]);
                        setQ('');
                      }}
                    >
                      {j.customer}
                      <small>
                        {[j.postcode, j.stageLabel].filter(Boolean).join(' · ')}
                        {j.title && j.title !== j.customer ? ` · ${j.title}` : ''}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {entry?.outlookError && <p className="dy-banner dy-banner--err">Couldn’t copy it to Outlook: {entry.outlookError}</p>}
        {error && (
          <p className="dy-banner dy-banner--err" role="alert">
            {error}
          </p>
        )}

        {askDelete ? (
          <div className="dy-bar">
            <p className="dy-muted" style={{ flex: '1 1 100%', margin: 0 }}>
              Delete this from your diary{entry?.inOutlook ? ' and from Outlook' : ''}?
            </p>
            <button type="button" className="dy-btn dy-btn--danger" disabled={busy} onClick={remove}>
              {busy ? 'Deleting…' : 'Yes, delete it'}
            </button>
            <button type="button" className="dy-btn dy-btn--ghost" onClick={() => setAskDelete(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <div className="dy-bar">
            <button type="button" className="dy-btn" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : entry ? 'Save' : 'Add to my diary'}
            </button>
            {entry && (
              <button type="button" className="dy-btn dy-btn--danger" onClick={() => setAskDelete(true)}>
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
