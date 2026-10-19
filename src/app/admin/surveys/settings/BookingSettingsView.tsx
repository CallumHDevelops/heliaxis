'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import {
  CALLUM,
  WEEKDAYS,
  WEEKDAY_NAMES,
  type BookingAdvanced,
  type BookingSettings,
  type DayHours,
  type Surveyor,
  type Weekday,
} from '@/lib/booking/settings';
import { SURVEY_TYPES, type SurveyTypeKey } from '@/lib/crm/stages';
import { weekday } from '@/lib/booking/engine';
import '../diary.css';

/**
 * Survey booking settings (admins change them; everyone on the CRM can see them): online booking
 * on or off, "Ask me to confirm" or "Book instantly", who does surveys and from where, their hours,
 * the cut-off, lengths and gaps, closed days, and an Advanced section to leave alone. Plus Test
 * calendar, a Preview of what customers would see, and "What your diary says".
 */

type Connected = { outlook: boolean; mailbox: string | null; provider: 'google' | 'estimate'; googleKey: boolean; googleUsedToday: number; turnstile: boolean };
type Load = { settings: BookingSettings; ready: boolean; connected: Connected };
type TestResult = { mailbox: string; ok: boolean; error?: string };
type PreviewDay = { day: string; label: string; morning: { time: string; recommended: boolean }[]; afternoon: { time: string; recommended: boolean }[] };
type Preview = { mode: 'request' | 'instant'; minutesText: string; days: PreviewDay[]; reasons: Record<string, string>; tooFar: boolean; outlookOk: boolean };
type Review = {
  connected: boolean;
  mailbox: string | null;
  facts: string[];
  suggestions: { id: string; label: string; settings: BookingSettings }[];
  track: { text: string };
  error?: string;
  readAt?: string;
};

const STEPS = [5, 10, 15, 20, 30, 60];
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Tue 3 Nov" */
const dayWords = (ymd: string) => `${WD[Number(weekday(ymd)) - 1]} ${Number(ymd.slice(8, 10))} ${MON[Number(ymd.slice(5, 7)) - 1]}`;
/** A number field's value (empty while typing = NaN: shown blank, and saved as the default). */
const n = (v: string) => (v.trim() === '' ? NaN : Number(v));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function call(url: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> & { error?: string } }> {
  try {
    const r = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: 'No connection. Try again.' } };
  }
}

function Num({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  id,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  id: string;
}) {
  return (
    <div>
      <label className="dy-label" htmlFor={id}>
        {label}
      </label>
      <div className="dy-inline">
        <input
          id={id}
          className="dy-input dy-input--short"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(n(e.target.value))}
        />
        {suffix && <span className="dy-muted">{suffix}</span>}
      </div>
    </div>
  );
}

function Section({ title, children, note }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="dy-set">
      <h2>{title}</h2>
      {note && <p className="dy-small">{note}</p>}
      {children}
    </section>
  );
}

export function BookingSettingsView({ isAdmin }: { isAdmin: boolean }) {
  const [s, setS] = useState<BookingSettings | null>(null);
  const [conn, setConn] = useState<Connected | null>(null);
  const [ready, setReady] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [tests, setTests] = useState<TestResult[] | null>(null);
  const [closedNew, setClosedNew] = useState('');
  const [pv, setPv] = useState<{ postcode: string; type: SurveyTypeKey; result: Preview | null; error: string }>({
    postcode: '',
    type: 'solar',
    result: null,
    error: '',
  });
  const [review, setReview] = useState<Review | null>(null);
  // The country areas as typed (so a comma or space isn't swallowed while typing).
  const [ruralText, setRuralText] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    call('/api/crm/booking/settings').then((r) => {
      if (gone) return;
      if (!r.ok) return setErr(r.data.error || 'Couldn’t load the settings.');
      const d = r.data as unknown as Load;
      setS(d.settings);
      setConn(d.connected);
      setReady(d.ready);
    });
    return () => {
      gone = true;
    };
  }, []);

  if (!s) {
    return (
      <div className="dy">
        <div className="dy-head">
          <div>
            <h1>Survey booking</h1>
          </div>
        </div>
        {err ? <p className="dy-banner dy-banner--err">{err}</p> : <p className="dy-muted">Loading…</p>}
      </div>
    );
  }

  const change = (next: BookingSettings) => {
    setS(next);
    setDirty(true);
    setMsg('');
  };
  const set = <K extends keyof BookingSettings>(k: K, v: BookingSettings[K]) => change({ ...s, [k]: v });
  const adv = <K extends keyof BookingAdvanced>(k: K, v: BookingAdvanced[K]) => change({ ...s, advanced: { ...s.advanced, [k]: v } });
  const sv = (i: number, patch: Partial<Surveyor>) => change({ ...s, surveyors: s.surveyors.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const hours = (i: number, w: Weekday, h: DayHours) => sv(i, { hours: { ...s.surveyors[i].hours, [w]: h } });

  async function save() {
    if (!s) return;
    const bad = s.surveyors.find((x) => !EMAIL.test(x.key.trim()));
    if (bad) return setErr('Each surveyor needs their Outlook email address.');
    if (!s.surveyors.length) return setErr('Add at least one surveyor.');
    setBusy('save');
    setErr('');
    // A distance limit left blank keeps the usual 30 minutes rather than disappearing.
    const body: BookingSettings = {
      ...s,
      surveyors: s.surveyors.map((x) => ({
        ...x,
        hours: Object.fromEntries(
          WEEKDAYS.map((w) => {
            const h = x.hours[w];
            return [w, h && h.maxFromBaseMins != null && !Number.isFinite(h.maxFromBaseMins) ? { ...h, maxFromBaseMins: 30 } : h];
          })
        ) as Surveyor['hours'],
      })),
    };
    const r = await call('/api/crm/booking/settings', 'PUT', body);
    setBusy('');
    if (!r.ok) return setErr(r.data.error || 'Not saved. Try again.');
    setS(r.data.settings as BookingSettings);
    setDirty(false);
    setRuralText(null);
    setMsg('Saved ✓');
  }

  async function test() {
    setBusy('test');
    const r = await call('/api/crm/booking/settings', 'POST', { action: 'test' });
    setBusy('');
    if (!r.ok) return setErr(r.data.error || 'Couldn’t test the calendars.');
    setTests((r.data.results as TestResult[]) ?? []);
  }

  async function preview() {
    if (pv.postcode.replace(/\s/g, '').length < 5) return setPv({ ...pv, error: 'Enter a postcode.' });
    setBusy('preview');
    const r = await call('/api/crm/booking/find', 'POST', { preview: true, postcode: pv.postcode, type: pv.type });
    setBusy('');
    setPv({ ...pv, result: r.ok ? (r.data as unknown as Preview) : null, error: r.ok ? '' : r.data.error || 'Couldn’t preview.' });
  }

  async function readDiary(fresh = false) {
    setBusy('review');
    const r = await call(`/api/crm/booking/review${fresh ? '?fresh=1' : ''}`);
    setBusy('');
    if (!r.ok) return setErr(r.data.error || 'Couldn’t read the diary.');
    setReview(r.data as unknown as Review);
  }

  const addSurveyor = () =>
    change({
      ...s,
      surveyors: [
        ...s.surveyors,
        {
          key: '',
          name: '',
          profileEmail: '',
          basePostcode: s.surveyors[0]?.basePostcode ?? CALLUM.basePostcode,
          baseLabel: 'Home',
          hours: { ...CALLUM.hours },
        },
      ],
    });
  const typeShort = (k: SurveyTypeKey) => SURVEY_TYPES.find((t) => t.key === k)?.short ?? k;

  return (
    <div className="dy">
      <div className="dy-head">
        <div>
          <h1>Survey booking</h1>
          <p>How customers book surveys online, and the rules the Diary uses. {isAdmin ? '' : 'Only admins can change these.'}</p>
        </div>
        <Link href="/admin/surveys" className="dy-btn dy-btn--ghost">
          Diary
        </Link>
      </div>
      {!ready && (
        <p className="dy-banner">
          Run survey-booking.sql in Supabase first: until then customers can’t book and the Diary stays hidden. You can still check these settings.
        </p>
      )}
      {err && (
        <p className="dy-banner dy-banner--err" role="alert">
          {err}
        </p>
      )}

      {conn && (
        <Section title="Connections">
          <ul className="dy-facts">
            <li>
              <b>Outlook</b>:{' '}
              {conn.outlook
                ? `connected (${conn.mailbox ?? 'Microsoft 365'})`
                : 'not connected yet. Until it is, the diary only knows the CRM and your own entries, and every booking is a request.'}
            </li>
            <li>
              <b>Drive times</b>:{' '}
              {conn.provider === 'google'
                ? `Google (${conn.googleUsedToday} of ${s.advanced.googleDailyElements} lookups used today)`
                : `our own estimate, erring on the long side${conn.googleKey ? '' : ' (add a Google Maps key for better times: see the to-do list)'}`}
            </li>
            <li>
              <b>“I’m not a robot” check</b> on the website form: {conn.turnstile ? 'on' : 'off (the form still works, with limits)'}
            </li>
          </ul>
          <div className="dy-row">
            <button type="button" className="dy-btn dy-btn--ghost" disabled={busy === 'test' || !conn.outlook} onClick={test}>
              {busy === 'test' ? 'Testing…' : 'Test calendar'}
            </button>
          </div>
          {!conn.outlook && <p className="dy-small">Test calendar works once Microsoft 365 is connected.</p>}
          {tests && (
            <ul className="dy-facts">
              {tests.map((t) => (
                <li key={t.mailbox} className={t.ok ? 'dy-yes' : 'dy-no'}>
                  {t.mailbox} {t.ok ? '✓' : `✗ ${t.error ?? ''}`}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <Section title="Online booking">
          <label className="dy-check">
            <input type="checkbox" checked={s.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            <span>
              <b>Online booking is {s.enabled ? 'on' : 'off'}</b>: customers can book on the website (heliaxis.co.uk/book-a-survey) and with booking links
            </span>
          </label>
          <span className="dy-label">When a customer picks a time</span>
          <div className="dy-chips">
            <button
              type="button"
              className={s.mode === 'request' ? 'dy-chip is-on' : 'dy-chip'}
              aria-pressed={s.mode === 'request'}
              onClick={() => set('mode', 'request')}
            >
              Ask me to confirm
            </button>
            <button
              type="button"
              className={s.mode === 'instant' ? 'dy-chip is-on' : 'dy-chip'}
              aria-pressed={s.mode === 'instant'}
              onClick={() => set('mode', 'instant')}
            >
              Book instantly
            </button>
          </div>
          <p className="dy-small">
            {s.mode === 'request'
              ? 'It comes to the Diary under “Waiting for you”, and you confirm it with one tap. Each request shows whether instant booking would have accepted it.'
              : 'It’s booked straight away and goes in Outlook. If Outlook isn’t connected or can’t be read, it falls back to asking you.'}
          </p>
        </Section>

        <Section title="Who does surveys" note="Each day starts and ends at their home. Their Outlook diary counts as busy once Microsoft 365 is connected.">
          {s.surveyors.map((x, i) => (
            <div key={i} className="dy-sv">
              <div className="dy-grid2">
                <div>
                  <label className="dy-label" htmlFor={`sv-name-${i}`}>
                    First name (customers see this)
                  </label>
                  <input id={`sv-name-${i}`} className="dy-input" value={x.name} onChange={(e) => sv(i, { name: e.target.value })} />
                </div>
                <div>
                  <label className="dy-label" htmlFor={`sv-key-${i}`}>
                    Outlook email
                  </label>
                  <input
                    id={`sv-key-${i}`}
                    className="dy-input"
                    type="email"
                    value={x.key}
                    onChange={(e) => sv(i, { key: e.target.value.trim().toLowerCase(), profileEmail: e.target.value.trim().toLowerCase() })}
                  />
                </div>
                <div>
                  <label className="dy-label" htmlFor={`sv-pc-${i}`}>
                    Home postcode
                  </label>
                  <input
                    id={`sv-pc-${i}`}
                    className="dy-input"
                    value={x.basePostcode}
                    maxLength={10}
                    onChange={(e) => sv(i, { basePostcode: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <label className="dy-label" htmlFor={`sv-bl-${i}`}>
                    Called
                  </label>
                  <input id={`sv-bl-${i}`} className="dy-input" value={x.baseLabel} maxLength={40} onChange={(e) => sv(i, { baseLabel: e.target.value })} />
                </div>
              </div>

              <span className="dy-label">Hours (time on site: first start, last finish)</span>
              <table className="dy-hours">
                <tbody>
                  {WEEKDAYS.map((w) => {
                    const h = x.hours[w];
                    return (
                      <tr key={w}>
                        <td>
                          <label className="dy-check">
                            <input
                              type="checkbox"
                              checked={!!h}
                              onChange={(e) => hours(i, w, e.target.checked ? (CALLUM.hours[w] ?? { start: '08:30', end: '18:00' }) : null)}
                            />
                            {WEEKDAY_NAMES[w].slice(0, 3)}
                          </label>
                        </td>
                        {h ? (
                          <>
                            <td>
                              <input
                                className="dy-input"
                                type="time"
                                step={900}
                                aria-label={`${WEEKDAY_NAMES[w]} first start`}
                                value={h.start}
                                onChange={(e) => hours(i, w, { ...h, start: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                className="dy-input"
                                type="time"
                                step={900}
                                aria-label={`${WEEKDAY_NAMES[w]} last finish`}
                                value={h.end}
                                onChange={(e) => hours(i, w, { ...h, end: e.target.value })}
                              />
                            </td>
                          </>
                        ) : (
                          <td colSpan={2} className="dy-muted">
                            No surveys
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {WEEKDAYS.filter((w) => x.hours[w]).map((w) => {
                const h = x.hours[w] as NonNullable<DayHours>;
                const on = h.maxFromBaseMins != null;
                return (
                  <label key={w} className="dy-check">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const { maxFromBaseMins: _drop, ...rest } = h;
                        void _drop;
                        hours(i, w, e.target.checked ? { ...rest, maxFromBaseMins: 30 } : rest);
                      }}
                    />
                    <span>
                      {WEEKDAY_NAMES[w]}: only for customers within{' '}
                      {on ? (
                        <input
                          className="dy-input"
                          style={{ width: 76, minHeight: 40, display: 'inline-block', padding: '4px 6px' }}
                          type="number"
                          min={5}
                          max={240}
                          aria-label={`${WEEKDAY_NAMES[w]}: minutes from home`}
                          value={Number.isFinite(h.maxFromBaseMins) ? h.maxFromBaseMins : ''}
                          onChange={(e) => hours(i, w, { ...h, maxFromBaseMins: n(e.target.value) })}
                        />
                      ) : (
                        '…'
                      )}{' '}
                      min of home
                    </span>
                  </label>
                );
              })}
              {s.surveyors.length > 1 && (
                <div className="dy-row">
                  <button
                    type="button"
                    className="dy-btn dy-btn--danger dy-btn--small"
                    onClick={() => change({ ...s, surveyors: s.surveyors.filter((_, j) => j !== i) })}
                  >
                    Remove {x.name || 'this surveyor'}
                  </button>
                </div>
              )}
            </div>
          ))}
          <p>
            <button type="button" className="dy-link" onClick={addSurveyor}>
              + Add another surveyor
            </button>
          </p>
          <p className="dy-small">
            A new surveyor’s mailbox must be added to the CRM’s Microsoft 365 access too (the same as hello@ and callum@). Test calendar tells you if it isn’t.
          </p>
        </Section>

        <Section title="Rules">
          <label className="dy-label" htmlFor="set-cutoff">
            Cut-off
          </label>
          <p className="dy-inline" style={{ margin: 0 }}>
            <span className="dy-muted">No bookings for the next working day after</span>
            <input
              id="set-cutoff"
              className="dy-input dy-input--short"
              type="time"
              step={900}
              value={s.cutoffTime}
              onChange={(e) => set('cutoffTime', e.target.value)}
            />
          </p>
          <div className="dy-grid2">
            <Num
              id="set-solar"
              label="Solar survey"
              value={s.durations.solar}
              suffix="min"
              min={15}
              max={480}
              onChange={(v) => set('durations', { ...s.durations, solar: v })}
            />
            <Num
              id="set-ashp"
              label="Heat pump survey"
              value={s.durations.ashp}
              suffix="min"
              min={15}
              max={480}
              onChange={(v) => set('durations', { ...s.durations, ashp: v })}
            />
            <Num
              id="set-both"
              label="Both"
              value={s.durations.solar_ashp}
              suffix="min"
              min={15}
              max={480}
              onChange={(v) => set('durations', { ...s.durations, solar_ashp: v })}
            />
            <Num id="set-max" label="Surveys a day (at most)" value={s.maxPerDay} min={1} max={12} onChange={(v) => set('maxPerDay', v)} />
            <Num
              id="set-buffer"
              label="Buffer after each appointment"
              value={s.bufferMins}
              suffix="min"
              min={0}
              max={120}
              onChange={(v) => set('bufferMins', v)}
            />
            <Num
              id="set-coffee"
              label="Coffee between appointments"
              value={s.coffeeMins}
              suffix="min"
              min={0}
              max={120}
              onChange={(v) => set('coffeeMins', v)}
            />
          </div>
          <p className="dy-small">
            Between two appointments the app leaves the drive plus {(s.bufferMins || 0) + (s.coffeeMins || 0)} minutes ({s.bufferMins || 0} buffer,{' '}
            {s.coffeeMins || 0} coffee).
          </p>
          <label className="dy-check">
            <input type="checkbox" checked={s.solarBeforeSunset} onChange={(e) => set('solarBeforeSunset', e.target.checked)} />
            Solar surveys finish before sunset
          </label>
        </Section>

        <Section title="Closed days" note="Days with no surveys at all (holidays, training). Bank holidays are already off.">
          <div className="dy-dates">
            {s.closedDates.map((d) => (
              <span key={d}>
                {dayWords(d)} {d.slice(0, 4)}
                <button
                  type="button"
                  aria-label={`Remove ${d}`}
                  onClick={() =>
                    set(
                      'closedDates',
                      s.closedDates.filter((x) => x !== d)
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
            {!s.closedDates.length && (
              <span className="dy-muted" style={{ border: 0, background: 'none', padding: 0 }}>
                None
              </span>
            )}
          </div>
          <div className="dy-inline" style={{ marginTop: 8 }}>
            <input className="dy-input" type="date" aria-label="Closed day to add" value={closedNew} onChange={(e) => setClosedNew(e.target.value)} />
            <button
              type="button"
              className="dy-btn dy-btn--ghost"
              disabled={!closedNew}
              onClick={() => {
                if (!s.closedDates.includes(closedNew)) set('closedDates', [...s.closedDates, closedNew].sort());
                setClosedNew('');
              }}
            >
              Add
            </button>
          </div>
        </Section>

        <section className="dy-set">
          <details>
            <summary>Advanced (leave as is)</summary>
            {s.surveyors.map((x, i) => (
              <div key={i} className="dy-grid2">
                <div>
                  <label className="dy-label" htmlFor={`adv-leave-${i}`}>
                    {x.name || 'Surveyor'}: don’t leave home before (blank = any time)
                  </label>
                  <input
                    id={`adv-leave-${i}`}
                    className="dy-input"
                    type="time"
                    step={900}
                    value={x.leaveHomeFrom ?? ''}
                    onChange={(e) => sv(i, { leaveHomeFrom: e.target.value || undefined })}
                  />
                </div>
                <div>
                  <label className="dy-label" htmlFor={`adv-home-${i}`}>
                    {x.name || 'Surveyor'}: be home by (blank = off)
                  </label>
                  <input
                    id={`adv-home-${i}`}
                    className="dy-input"
                    type="time"
                    step={900}
                    value={x.homeBy ?? ''}
                    onChange={(e) => sv(i, { homeBy: e.target.value || undefined })}
                  />
                </div>
              </div>
            ))}
            <div className="dy-grid2">
              <Num
                id="adv-notice"
                label="Customers can change or cancel online until"
                value={s.advanced.changeNoticeHours}
                suffix="hours before"
                onChange={(v) => adv('changeNoticeHours', v)}
              />
              <Num id="adv-horizon" label="Customers can book ahead" value={s.advanced.horizonDays} suffix="days" onChange={(v) => adv('horizonDays', v)} />
              <Num id="adv-arrive" label="Arrive early by" value={s.advanced.arrivalMins} suffix="min" onChange={(v) => adv('arrivalMins', v)} />
              <Num
                id="adv-pad"
                label="No location: extra either side"
                value={s.advanced.unknownPadMins}
                suffix="min"
                onChange={(v) => adv('unknownPadMins', v)}
              />
              <Num
                id="adv-drive"
                label="Most driving in a day (incl. home)"
                value={s.advanced.maxDriveMinsPerDay}
                suffix="min"
                onChange={(v) => adv('maxDriveMinsPerDay', v)}
              />
              <Num
                id="adv-oneway"
                label="Furthest from home for online booking"
                value={s.advanced.maxOneWayMins}
                suffix="min drive"
                onChange={(v) => adv('maxOneWayMins', v)}
              />
              <Num
                id="adv-detour"
                label="Most extra driving one booking can add"
                value={s.advanced.maxDetourMins}
                suffix="min"
                onChange={(v) => adv('maxDetourMins', v)}
              />
              <div>
                <label className="dy-label" htmlFor="adv-step">
                  Times every
                </label>
                <select
                  id="adv-step"
                  className="dy-input dy-input--short"
                  value={s.advanced.stepMins}
                  onChange={(e) => adv('stepMins', Number(e.target.value))}
                >
                  {STEPS.map((x) => (
                    <option key={x} value={x}>
                      {x} min
                    </option>
                  ))}
                </select>
              </div>
              <Num id="adv-perday" label="Times shown per day" value={s.advanced.timesPerDay} onChange={(v) => adv('timesPerDay', v)} />
              <Num id="adv-hold" label="Hold a picked time for" value={s.advanced.holdMins} suffix="min" onChange={(v) => adv('holdMins', v)} />
              <Num
                id="adv-expiry"
                label="Unconfirmed requests lapse after"
                value={s.advanced.requestExpiryHours}
                suffix="hours"
                onChange={(v) => adv('requestExpiryHours', v)}
              />
              <Num
                id="adv-rush"
                label="Rush hour: drives take longer by"
                value={s.advanced.rushFactor}
                step={0.05}
                suffix="×"
                onChange={(v) => adv('rushFactor', v)}
              />
              <Num id="adv-road" label="Roads vs straight line" value={s.advanced.roadFactor} step={0.05} suffix="×" onChange={(v) => adv('roadFactor', v)} />
              <Num
                id="adv-rural"
                label="Country lanes vs straight line"
                value={s.advanced.ruralFactor}
                step={0.05}
                suffix="×"
                onChange={(v) => adv('ruralFactor', v)}
              />
              <Num
                id="adv-google"
                label="Google lookups a day (at most)"
                value={s.advanced.googleDailyElements}
                onChange={(v) => adv('googleDailyElements', v)}
              />
            </div>
            <span className="dy-label">Rush hours (weekdays)</span>
            {s.advanced.rushWindows.map((w, i) => (
              <div key={i} className="dy-stepper dy-inline" style={{ marginBottom: 6 }}>
                <input
                  className="dy-input"
                  type="time"
                  step={900}
                  aria-label="Rush hour from"
                  value={w[0]}
                  onChange={(e) =>
                    adv(
                      'rushWindows',
                      s.advanced.rushWindows.map((x, j) => (j === i ? [e.target.value, x[1]] : x))
                    )
                  }
                />
                <span className="dy-muted">to</span>
                <input
                  className="dy-input"
                  type="time"
                  step={900}
                  aria-label="Rush hour to"
                  value={w[1]}
                  onChange={(e) =>
                    adv(
                      'rushWindows',
                      s.advanced.rushWindows.map((x, j) => (j === i ? [x[0], e.target.value] : x))
                    )
                  }
                />
                <button
                  type="button"
                  aria-label="Remove this rush hour"
                  onClick={() =>
                    adv(
                      'rushWindows',
                      s.advanced.rushWindows.filter((_, j) => j !== i)
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="dy-link" onClick={() => adv('rushWindows', [...s.advanced.rushWindows, ['16:00', '18:00']])}>
              + Add a rush hour
            </button>
            <label className="dy-label" htmlFor="adv-rural-list">
              Country areas (postcode districts, comma separated)
            </label>
            <textarea
              id="adv-rural-list"
              className="dy-input"
              rows={2}
              value={ruralText ?? s.advanced.ruralOutcodes.join(', ')}
              onChange={(e) => {
                setRuralText(e.target.value);
                adv(
                  'ruralOutcodes',
                  e.target.value
                    .split(/[,\s]+/)
                    .map((x) => x.trim().toUpperCase())
                    .filter(Boolean)
                );
              }}
            />
            <label className="dy-check">
              <input type="checkbox" checked={s.advanced.skipBankHolidays} onChange={(e) => adv('skipBankHolidays', e.target.checked)} />
              No surveys on bank holidays (England and Wales)
            </label>
            <label className="dy-check">
              <input type="checkbox" checked={s.advanced.tentativeBlocks} onChange={(e) => adv('tentativeBlocks', e.target.checked)} />
              Tentative Outlook appointments count as busy
            </label>
            <label className="dy-check">
              <input type="checkbox" checked={s.advanced.showSubjects} onChange={(e) => adv('showSubjects', e.target.checked)} />
              Show Outlook subjects in the Diary (otherwise “Busy”; private ones always say “Private”)
            </label>
            <label className="dy-label" htmlFor="adv-installs">
              Installs block the surveyor’s diary
            </label>
            <select
              id="adv-installs"
              className="dy-input"
              value={s.advanced.installBlocks}
              onChange={(e) => adv('installBlocks', e.target.value as BookingAdvanced['installBlocks'])}
            >
              <option value="if_on_team_or_empty">When they’re on the install team, or nobody is yet</option>
              <option value="always">Always</option>
              <option value="never">Never</option>
            </select>
            <label className="dy-label" htmlFor="adv-installbox">
              Install calendar (blank = {conn?.mailbox || 'the main mailbox'})
            </label>
            <input
              id="adv-installbox"
              className="dy-input"
              type="email"
              value={s.advanced.installMailbox}
              onChange={(e) => adv('installMailbox', e.target.value.trim().toLowerCase())}
            />
            <label className="dy-label" htmlFor="adv-provider">
              Drive times from
            </label>
            <select
              id="adv-provider"
              className="dy-input"
              value={s.advanced.travelProvider}
              onChange={(e) => adv('travelProvider', e.target.value as BookingAdvanced['travelProvider'])}
            >
              <option value="auto">Google if the key is set, otherwise our estimate</option>
              <option value="google">Google</option>
              <option value="estimate">Our estimate</option>
            </select>
            <label className="dy-label" htmlFor="adv-intro">
              Message at the top of the booking form (optional)
            </label>
            <textarea id="adv-intro" className="dy-input" rows={2} maxLength={600} value={s.advanced.intro} onChange={(e) => adv('intro', e.target.value)} />
          </details>
        </section>

        {isAdmin && (
          <div className="dy-savebar">
            <button type="button" className="dy-btn" disabled={busy === 'save' || !dirty} onClick={save}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <span className="dy-muted" role="status">
              {msg || (dirty ? 'Unsaved changes' : '')}
            </span>
          </div>
        )}
      </fieldset>

      <Section
        title="Preview"
        note="What a customer would see for a postcode, using the saved settings (save first to see changes). Works while online booking is off."
      >
        <div className="dy-chips">
          {SURVEY_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              className={pv.type === t.key ? 'dy-chip is-on' : 'dy-chip'}
              aria-pressed={pv.type === t.key}
              onClick={() => setPv({ ...pv, type: t.key })}
            >
              {t.short}
            </button>
          ))}
        </div>
        <form
          className="dy-inline"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void preview();
          }}
        >
          <input
            className="dy-input"
            aria-label="Postcode to preview"
            placeholder="Postcode"
            value={pv.postcode}
            maxLength={10}
            onChange={(e) => setPv({ ...pv, postcode: e.target.value })}
          />
          <button type="submit" className="dy-btn" disabled={busy === 'preview' || !ready}>
            {busy === 'preview' ? 'Looking…' : 'Preview'}
          </button>
        </form>
        {pv.error && <p className="dy-banner dy-banner--err">{pv.error}</p>}
        {pv.result && (
          <div>
            <p className="dy-muted">
              {typeShort(pv.type)} survey, {pv.result.minutesText}. Customers would{' '}
              {pv.result.mode === 'instant' ? 'be booked straight away' : 'request a time for you to confirm'}.
            </p>
            {pv.result.tooFar && <p className="dy-banner">Too far: they’d be asked to leave their number for a call.</p>}
            {!pv.result.tooFar && !pv.result.days.length && <p className="dy-banner">No times in the next {s.advanced.horizonDays} days.</p>}
            {pv.result.days.map((d) => (
              <p key={d.day} style={{ margin: '4px 0' }}>
                <b>{d.label}</b>: {[...d.morning, ...d.afternoon].map((t) => `${t.time}${t.recommended ? ' (nearby)' : ''}`).join(', ')}
              </p>
            ))}
            {Object.keys(pv.result.reasons).length > 0 && (
              <details className="dy-small">
                <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Why some days have no times</summary>
                <ul className="dy-facts">
                  {Object.entries(pv.result.reasons)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([d, why]) => (
                      <li key={d}>
                        <b>{dayWords(d)}</b>: {why}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Section>

      <Section title="What your diary says" note="Reads your last 10 weeks of Outlook (nothing is changed) and compares it with these settings.">
        {!review ? (
          <div className="dy-row">
            <button type="button" className="dy-btn dy-btn--ghost" disabled={busy === 'review'} onClick={() => readDiary()}>
              {busy === 'review' ? 'Reading…' : 'Read my diary'}
            </button>
          </div>
        ) : (
          <>
            {!review.connected && <p className="dy-banner">Once Microsoft 365 is connected, this reads your Outlook diary and suggests settings.</p>}
            {review.error && <p className="dy-banner dy-banner--err">Outlook couldn’t be read: {review.error}</p>}
            {review.facts.length > 0 && (
              <ul className="dy-facts">
                {review.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            {review.suggestions.length > 0 && (
              <div className="dy-row">
                {review.suggestions.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="dy-btn dy-btn--ghost"
                    disabled={!isAdmin}
                    onClick={() => {
                      change({ ...s, surveyors: g.settings.surveyors });
                      setMsg('Changed above: tap Save to keep it');
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            )}
            <p>
              <b>Ask me to confirm, so far:</b> {review.track.text}
            </p>
            {review.connected && (
              <button type="button" className="dy-link" disabled={busy === 'review'} onClick={() => readDiary(true)}>
                {busy === 'review' ? 'Reading…' : 'Read Outlook again'}
              </button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
