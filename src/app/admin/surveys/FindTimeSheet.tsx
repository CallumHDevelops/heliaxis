'use client';

import Link from 'next/link';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { SURVEY_TYPES, type SurveyTypeKey } from '@/lib/crm/stages';
import { londonSlot, ukDate, ukTime, weekday } from '@/lib/booking/engine';
import type { Job } from './DiaryEntrySheet';

/**
 * Find a time (staff): pick the customer's job (or just type a postcode), see the times that fit
 * the diary with who'd go and the extra driving, then Book it, send the customer their booking
 * link, or Book anyway outside the usual rules (only an overlap stops it).
 */

type StaffSlot = {
  start: string;
  end: string;
  time: string;
  recommended: boolean;
  surveyorKey: string;
  surveyorName: string;
  detour: number;
  driveIn: number;
  driveOut: number;
};
type SlotDay = { day: string; label: string; morning: StaffSlot[]; afternoon: StaffSlot[] };
type Project = { id: string; title: string; customer: string; postcode: string | null; surveyAt: string | null; stage: string };
type Found = {
  project: Project | null;
  type: SurveyTypeKey;
  postcode: string;
  approx: boolean;
  mode: 'request' | 'instant';
  minutesText: string;
  days: SlotDay[];
  reasons: Record<string, string>;
  tooFar: boolean;
  provider: 'google' | 'estimate';
  outlookOk: boolean;
  outlookError: string | null;
};
type Reply = Record<string, unknown> & { error?: string; message?: string; days?: SlotDay[]; project?: Project | null; type?: SurveyTypeKey };

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Tue 3 Nov" */
const dayWords = (ymd: string) => `${WD[Number(weekday(ymd)) - 1]} ${Number(ymd.slice(8, 10))} ${MON[Number(ymd.slice(5, 7)) - 1]}`;
const when = (iso: string) => `${dayWords(ukDate(Date.parse(iso)))} ${ukTime(Date.parse(iso))}`;
const detourText = (m: number) => (m <= 0 ? 'no extra driving' : `+${m} min driving`);

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Reply }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    return { ok: r.ok, status: r.status, data: (await r.json().catch(() => ({}))) as Reply };
  } catch {
    return { ok: false, status: 0, data: { error: 'No connection. Try again.' } };
  }
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function FindTimeSheet({
  projectId,
  today,
  surveyors,
  onClose,
  onBooked,
}: {
  projectId: string | null;
  today: string;
  surveyors: { key: string; name: string }[];
  onClose: () => void;
  onBooked: (message: string) => void;
}) {
  const [job, setJob] = useState<Project | null>(null);
  const [q, setQ] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [postcode, setPostcode] = useState('');
  const [type, setType] = useState<SurveyTypeKey>('solar');
  const [found, setFound] = useState<Found | null>(null);
  const [pick, setPick] = useState<StaffSlot | null>(null);
  const [busy, setBusy] = useState(!!projectId);
  const [error, setError] = useState('');
  const [link, setLink] = useState<{ url: string; text: string } | null>(null);
  const [copied, setCopied] = useState('');
  const [anyway, setAnyway] = useState(false);
  const [aDay, setADay] = useState(today);
  const [aTime, setATime] = useState('09:00');
  const [aWho, setAWho] = useState(surveyors[0]?.key ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(r: { ok: boolean; data: Reply }) {
    if (r.data.project !== undefined) setJob(r.data.project ?? null);
    if (r.data.type) setType(r.data.type);
    if (!r.ok) {
      setFound(null);
      return setError(r.data.error || 'Couldn’t find times. Try again.');
    }
    const f = r.data as unknown as Found;
    setFound(f);
    setPostcode(f.postcode);
    setPick(null);
    setError('');
  }

  // Opened from a job (?project=…): find its times straight away.
  const firstFind = useEffectEvent((r: { ok: boolean; data: Reply }) => {
    setBusy(false);
    if (r.data.project) setPostcode(r.data.project.postcode ?? '');
    apply(r);
  });
  useEffect(() => {
    if (!projectId) return;
    let gone = false;
    post('/api/crm/booking/find', { project_id: projectId }).then((r) => {
      if (!gone) firstFind(r);
    });
    return () => {
      gone = true;
    };
  }, [projectId]);

  async function find(o: { job?: Project | null; pc?: string; t?: SurveyTypeKey } = {}) {
    const j = o.job !== undefined ? o.job : job;
    const pc = (o.pc ?? postcode).trim();
    if (!j && pc.replace(/\s/g, '').length < 5) return setError('Pick a customer or enter a postcode.');
    setBusy(true);
    setError('');
    setLink(null);
    const r = await post('/api/crm/booking/find', { project_id: j?.id, postcode: pc || undefined, type: o.t ?? type });
    setBusy(false);
    apply(r);
  }

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

  async function bookIt() {
    if (!job || !pick) return;
    setBusy(true);
    setError('');
    // The postcode these times were worked out for (typed here when the job has none, or it's elsewhere).
    const r = await post('/api/crm/booking/book', { project_id: job.id, start: pick.start, type, postcode: found?.postcode, surveyor_key: pick.surveyorKey });
    setBusy(false);
    if (r.ok && r.data.ok) return onBooked(`Booked ✓ ${job.customer}: ${when(pick.start)} with ${String(r.data.surveyor || pick.surveyorName)}`);
    if (r.status === 409 && Array.isArray(r.data.days) && found) {
      setFound({ ...found, days: r.data.days });
      setPick(null);
    }
    setError(r.data.error || 'Not booked. Try again.');
  }

  async function bookAnyway(allDayOk = false) {
    if (!job) return setError('Pick the customer’s job first.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(aDay) || !/^\d{2}:\d{2}$/.test(aTime)) return setError('Pick the day and time.');
    const start = new Date(londonSlot(aDay, aTime)).toISOString();
    setBusy(true);
    setError('');
    const r = await post('/api/crm/booking/book', {
      project_id: job.id,
      start,
      type,
      postcode: postcode.trim() || undefined,
      surveyor_key: aWho || undefined,
      override: true,
      all_day_ok: allDayOk,
    });
    setBusy(false);
    if (r.ok && r.data.ok) return onBooked(`Booked ✓ ${job.customer}: ${when(start)} (outside the usual rules)`);
    if (r.status === 409 && r.data.error === 'all_day') {
      if (window.confirm(r.data.message || 'The diary is blocked all day. Book anyway?')) return bookAnyway(true);
      return;
    }
    setError(r.data.error || 'Not booked. Try again.');
  }

  async function sendLink() {
    if (!job) return;
    setBusy(true);
    setError('');
    const r = await post('/api/crm/booking/link', { project_id: job.id });
    setBusy(false);
    if (!r.ok) return setError(r.data.error || 'Couldn’t make a link.');
    setLink({ url: String(r.data.url), text: String(r.data.whatsappText) });
    setCopied('');
  }

  const typeLabel = (k: SurveyTypeKey) => SURVEY_TYPES.find((t) => t.key === k)?.short ?? k;
  const noTimes = found ? Object.entries(found.reasons).sort(([a], [b]) => a.localeCompare(b)) : [];
  const slot = (x: StaffSlot) => (
    <button
      key={`${x.start}-${x.surveyorKey}`}
      type="button"
      className={`dy-time${x.recommended ? ' is-near' : ''}${pick?.start === x.start ? ' is-on' : ''}`}
      aria-pressed={pick?.start === x.start}
      onClick={() => setPick(x)}
    >
      <b>{x.time}</b>
      <small>
        {x.surveyorName ? `${x.surveyorName} · ` : ''}
        {x.recommended ? `Nearby · ${detourText(x.detour)}` : detourText(x.detour)}
      </small>
    </button>
  );

  return (
    <div className="dy-sheet" role="dialog" aria-modal="true" aria-labelledby="dy-find-title" onClick={onClose}>
      <div className="dy-sheet-box" onClick={(e) => e.stopPropagation()}>
        <div className="dy-sheet-top">
          <h2 id="dy-find-title">Find a time</h2>
          <button type="button" className="dy-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <span className="dy-label">Customer</span>
        {job ? (
          <div className="dy-picked">
            <span>
              <Link href={`/admin/crm/${job.id}`} className="dy-link">
                {job.customer}
              </Link>
              {job.postcode ? ` · ${job.postcode}` : ''}
              {job.surveyAt && <small className="dy-small"> · survey now {when(job.surveyAt)}</small>}
            </span>
            <button
              type="button"
              className="dy-btn dy-btn--ghost dy-btn--small"
              onClick={() => {
                setJob(null);
                setFound(null);
                setLink(null);
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              className="dy-input"
              value={q}
              placeholder="Search by name, mobile or postcode"
              onChange={(e) => search(e.target.value)}
              aria-label="Search for a customer"
            />
            {jobs.length > 0 && (
              <ul className="dy-results">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const p: Project = { id: j.id, title: j.title, customer: j.customer, postcode: j.postcode, surveyAt: j.surveyAt, stage: j.stage };
                        const t = j.type === 'solar' || j.type === 'ashp' || j.type === 'solar_ashp' ? j.type : type;
                        setJob(p);
                        setJobs([]);
                        setQ('');
                        setType(t);
                        setPostcode(j.postcode ?? '');
                        void find({ job: p, pc: j.postcode ?? '', t });
                      }}
                    >
                      {j.customer}
                      <small>{[j.postcode, j.stageLabel].filter(Boolean).join(' · ')}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {job?.surveyAt && <p className="dy-small">Booking a new time moves their survey from {when(job.surveyAt)}.</p>}

        <span className="dy-label">Survey</span>
        <div className="dy-chips">
          {SURVEY_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={type === t.key ? 'dy-chip is-on' : 'dy-chip'}
              aria-pressed={type === t.key}
              onClick={() => {
                setType(t.key);
                if (found) void find({ t: t.key });
              }}
            >
              {t.short}
            </button>
          ))}
        </div>
        <label className="dy-label" htmlFor="dy-find-pc">
          Postcode
        </label>
        <form
          className="dy-inline"
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <input
            id="dy-find-pc"
            className="dy-input"
            value={postcode}
            maxLength={10}
            autoCapitalize="characters"
            onChange={(e) => setPostcode(e.target.value)}
          />
          <button type="submit" className="dy-btn" disabled={busy}>
            {busy ? 'Finding…' : 'Find times'}
          </button>
        </form>

        {error && (
          <p className="dy-banner dy-banner--err" role="alert">
            {error}
          </p>
        )}

        {found && (
          <div className="dy-section">
            {!found.outlookOk && found.outlookError && (
              <p className="dy-banner">Outlook couldn’t be read ({found.outlookError}), so these times only know the CRM and your diary.</p>
            )}
            {found.approx && <p className="dy-small">That postcode has no exact location, so drives are worked out from the middle of the area.</p>}
            <p className="dy-muted">
              {typeLabel(found.type)} survey, {found.minutesText}. {found.days.length ? 'Nearby times are marked.' : ''}
            </p>
            {found.tooFar && <p className="dy-banner">Too far from home for the usual rules. Use Book anyway if you want to go.</p>}
            {!found.tooFar && !found.days.length && <p className="dy-banner">No times fit in the next 3 weeks. Use Book anyway to pick one yourself.</p>}
            {found.days.map((dd) => (
              <div key={dd.day}>
                <p className="dy-dayname">{dd.label}</p>
                <div className="dy-times">
                  {dd.morning.map(slot)}
                  {dd.afternoon.map(slot)}
                </div>
              </div>
            ))}
            {noTimes.length > 0 && (
              <details className="dy-small">
                <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Why some days have no times</summary>
                <ul className="dy-facts">
                  {noTimes.map(([dd, why]) => (
                    <li key={dd}>
                      <b>{dayWords(dd)}</b>: {why}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="dy-small">Drive times: {found.provider === 'google' ? 'Google' : 'our estimate (errs on the long side)'}.</p>
          </div>
        )}

        {link && (
          <div className="dy-card">
            <p>
              <b>Booking link for {job?.customer}</b>
            </p>
            <p className="dy-msg">{link.text}</p>
            <div className="dy-row">
              <button
                type="button"
                className="dy-btn"
                onClick={() => copy(link.text).then((ok) => setCopied(ok ? 'Message copied ✓' : 'Couldn’t copy: select the text instead'))}
              >
                Copy message
              </button>
              <button
                type="button"
                className="dy-btn dy-btn--ghost"
                onClick={() => copy(link.url).then((ok) => setCopied(ok ? 'Link copied ✓' : 'Couldn’t copy: select the text instead'))}
              >
                Copy link
              </button>
              {job && (
                <Link href={`/admin/crm/${job.id}`} className="dy-btn dy-btn--ghost">
                  Open the job to send it
                </Link>
              )}
            </div>
            {copied && <p className="dy-small">{copied}</p>}
          </div>
        )}

        {anyway && (
          <div className="dy-card">
            <h3>Book anyway</h3>
            <p className="dy-small">
              Any day and time you choose, outside the usual hours, distance and daily limits. It’s still refused if it overlaps something in the diary.
            </p>
            <div className="dy-grid2">
              <div>
                <label className="dy-label" htmlFor="dy-a-day">
                  Day
                </label>
                <input id="dy-a-day" className="dy-input" type="date" value={aDay} onChange={(e) => setADay(e.target.value)} />
              </div>
              <div>
                <label className="dy-label" htmlFor="dy-a-time">
                  Arrive at
                </label>
                <input id="dy-a-time" className="dy-input" type="time" step={900} value={aTime} onChange={(e) => setATime(e.target.value)} />
              </div>
            </div>
            {surveyors.length > 1 && (
              <>
                <label className="dy-label" htmlFor="dy-a-who">
                  Who
                </label>
                <select id="dy-a-who" className="dy-input" value={aWho} onChange={(e) => setAWho(e.target.value)}>
                  {surveyors.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <div className="dy-row">
              <button type="button" className="dy-btn dy-btn--solar" disabled={busy || !job} onClick={() => bookAnyway()}>
                {busy ? 'Booking…' : `Book ${typeLabel(type).toLowerCase()} survey anyway`}
              </button>
            </div>
            {!job && <p className="dy-small">Pick the customer first.</p>}
          </div>
        )}

        <div className="dy-bar">
          <button type="button" className="dy-btn" disabled={busy || !job || !pick} onClick={bookIt}>
            {pick ? `Book it: ${when(pick.start)}` : 'Book it'}
          </button>
          <button type="button" className="dy-btn dy-btn--ghost" disabled={busy || !job} onClick={sendLink}>
            Send booking link
          </button>
          {!anyway && (
            <button type="button" className="dy-btn dy-btn--ghost" onClick={() => setAnyway(true)}>
              Book anyway…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
