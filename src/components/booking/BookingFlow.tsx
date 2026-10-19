'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNow } from '@/lib/use-now';
import { minutesWords, type SurveyTypeKey } from '@/lib/crm/stages';
import { ukDate, ukTime, weekday } from '@/lib/booking/engine';
import { WEEKDAY_NAMES } from '@/lib/booking/settings';
import { downloadIcs } from './ics';
import { Turnstile } from './Turnstile';
import './booking.css';

/**
 * The customer's survey booking: what it's for and their postcode → the times that genuinely fit
 * (Morning / Afternoon, "Arrive around …") → Continue holds the time for 10 minutes → their details
 * → done. Used by the website form (/book-a-survey) and by a customer's own link (/book/{token}),
 * where they can also change or cancel a booking they already have. Every check happens on the
 * server again; this only collects the answers.
 */

type SlotTime = { start: string; end: string; time: string; recommended: boolean };
type SlotDay = { day: string; label: string; morning: SlotTime[]; afternoon: SlotTime[] };
type Slots = { mode: 'request' | 'instant'; minutes: number; minutesText: string; days: SlotDay[]; tooFar: boolean; soonest: SlotTime | null };
type Hold = { holdId: string; expiresAt: string; start: string; end: string; label: string; /** How long it's held for. */ mins: number };
type Done = {
  status: 'requested' | 'confirmed';
  start: string;
  end: string;
  firstName?: string;
  notify?: 'whatsapp' | 'email' | 'call';
  changeUrl?: string | null;
  moved?: boolean;
  where?: string;
};
export type ExistingBooking = {
  id: string;
  status: 'requested' | 'confirmed';
  start: string;
  end: string;
  label: string;
  type: SurveyTypeKey;
  postcode: string;
  minutes: number;
};
type Reply = Record<string, unknown> & { error?: string; code?: string; closed?: boolean; days?: SlotDay[] };
type Step = 'start' | 'times' | 'details' | 'done' | 'far' | 'none' | 'callback' | 'callbackDone' | 'closed' | 'manage' | 'cancelled';

export type BookingFlowProps = {
  /** A customer's own link (/book/{token}). None = the public website form. */
  token?: string | null;
  /** Booking switched on, with someone to do the surveys. */
  enabled: boolean;
  firstName?: string;
  /** Link only: their own details, to pre-fill "Is this right?". */
  person?: { name: string; email: string; phone: string };
  initialType: SurveyTypeKey | null;
  initialPostcode: string;
  initialAddress?: string;
  /** Link only: the survey they've already booked or asked for. */
  booking?: ExistingBooking | null;
  /** Link only: still more than the notice period before it, so it can be changed online. */
  canChange?: boolean;
  durations: Record<SurveyTypeKey, number>;
  intro?: string;
  /** Cloudflare Turnstile on the website form, when it's set up. */
  turnstileSiteKey?: string | null;
  /** WhatsApp number as 44…, for the "message us" buttons. */
  whatsapp: string;
  /** The office number for calls. */
  phone: string;
  year: number;
};

const TYPE_CHOICES: { key: SurveyTypeKey; label: string }[] = [
  { key: 'solar', label: 'Solar panels (and battery)' },
  { key: 'ashp', label: 'Heat pump' },
  { key: 'solar_ashp', label: 'Both' },
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const HOLD_KEY = 'hx-book-hold';

/** "Tuesday 3 November" for an ISO time (UK date). */
function longDay(iso: string): string {
  const ymd = ukDate(Date.parse(iso));
  return `${WEEKDAY_NAMES[weekday(ymd)]} ${Number(ymd.slice(8, 10))} ${MONTHS[Number(ymd.slice(5, 7)) - 1]}`;
}
const timeOf = (iso: string) => ukTime(Date.parse(iso));
const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;

function readHold(): string | null {
  try {
    return sessionStorage.getItem(HOLD_KEY);
  } catch {
    return null;
  }
}
function writeHold(id: string | null) {
  try {
    if (id) sessionStorage.setItem(HOLD_KEY, id);
    else sessionStorage.removeItem(HOLD_KEY);
  } catch {
    // Private browsing: the hold simply lapses by itself.
  }
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: Reply }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    const data = (await r.json().catch(() => ({}))) as Reply;
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'We couldn’t connect. Check your signal and try again.' } };
  }
}

export function BookingFlow(p: BookingFlowProps) {
  const isLink = !!p.token;
  const firstStep: Step = p.booking ? 'manage' : p.enabled ? 'start' : 'closed';
  const [step, setStep] = useState<Step>(firstStep);
  const [type, setType] = useState<SurveyTypeKey | null>(p.initialType);
  const [postcode, setPostcode] = useState(p.initialPostcode);
  const [slots, setSlots] = useState<Slots | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [pick, setPick] = useState<SlotTime | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [booking, setBooking] = useState<ExistingBooking | null>(p.booking ?? null);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tsToken, setTsToken] = useState('');
  const [tsReset, setTsReset] = useState(0);
  const [askCancel, setAskCancel] = useState(false);
  const [cancelWhy, setCancelWhy] = useState('');
  const [d, setD] = useState({
    name: p.person?.name ?? '',
    phone: p.person?.phone ?? '',
    email: p.person?.email ?? '',
    address: p.initialAddress ?? '',
    town: '',
    postcode: p.initialPostcode,
    optIn: false,
    notes: '',
    company_website: '',
  });
  const [cb, setCb] = useState({ name: '', phone: '', email: '' });

  // Bots fill the form in within moments of the page loading; people don't.
  const loadedAt = useRef(0);
  useEffect(() => {
    loadedAt.current = Date.now();
  }, []);

  // Move focus to the new step's heading (not on first load).
  const head = useRef<HTMLHeadingElement | null>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    head.current?.focus({ preventScroll: true });
    head.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [step]);
  const go = (s: Step) => {
    focusNext.current = true;
    setStep(s);
  };

  const field = (k: keyof typeof d) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  const surveyType = moving && booking ? booking.type : type;
  const searchPostcode = moving && booking ? booking.postcode : postcode;

  /** New times (also after "That time has just gone"). */
  function showTimes(s: Slots, message = '') {
    setSlots(s);
    setDay(s.days[0]?.day ?? null);
    setPick(null);
    setError(message);
    if (s.days.length) go('times');
    else go(s.tooFar ? 'far' : 'none');
  }

  async function findTimes(message = '') {
    if (!surveyType) return setError('Please choose what the survey is for.');
    if (searchPostcode.replace(/\s/g, '').length < 5) return setError('Please enter your postcode.');
    setBusy(true);
    setError('');
    const r = await post('/api/book/slots', { token: p.token || undefined, postcode: searchPostcode, type: surveyType });
    setBusy(false);
    if (r.data.closed) return go('closed');
    if (!r.ok) {
      if (step !== 'start' && step !== 'manage') go(moving ? 'manage' : 'start');
      return setError(r.data.error || 'Something went wrong. Please try again.');
    }
    showTimes(r.data as unknown as Slots, message);
  }

  /** Fresh times came back with a "that time has gone". */
  function newDays(r: Reply, fallback: string) {
    const msg = r.error || fallback;
    if (Array.isArray(r.days) && slots)
      showTimes({ ...slots, days: r.days, soonest: r.days[0] ? ([...r.days[0].morning, ...r.days[0].afternoon][0] ?? null) : null }, msg);
    else void findTimes(msg);
  }

  async function onContinue() {
    if (!pick || !surveyType) return setError('Please pick a time.');
    setError('');
    if (moving) {
      setBusy(true);
      const r = await post('/api/book/move', { token: p.token, start: pick.start });
      setBusy(false);
      if (r.data.closed) return go('closed');
      if (r.ok && r.data.ok) {
        const status = r.data.status === 'confirmed' ? 'confirmed' : 'requested';
        setDone({
          status,
          start: String(r.data.start),
          end: String(r.data.end),
          moved: true,
          where: [p.initialAddress, p.initialPostcode].filter(Boolean).join(', '),
        });
        setBooking((b) => (b ? { ...b, status, start: String(r.data.start), end: String(r.data.end), label: String(r.data.label || '') } : b));
        return go('done');
      }
      if (r.status === 409 && r.data.days) return newDays(r.data, 'That time has just gone. Here are the latest times.');
      return setError(r.data.error || 'Something went wrong. Please try again.');
    }
    if (p.turnstileSiteKey && !isLink && !tsToken) return setError('Please tick the box to show you’re not a robot.');
    setBusy(true);
    const r = await post('/api/book/hold', {
      token: p.token || undefined,
      postcode,
      type: surveyType,
      start: pick.start,
      releases: hold?.holdId || readHold() || undefined,
      turnstile: tsToken || undefined,
    });
    setBusy(false);
    if (p.turnstileSiteKey && !isLink) {
      setTsToken('');
      setTsReset((n) => n + 1); // each token works once
    }
    if (r.data.closed) return go('closed');
    if (r.ok && typeof r.data.holdId === 'string') {
      const h = r.data as unknown as Hold;
      setHold({ ...h, mins: Math.max(1, Math.round((Date.parse(h.expiresAt) - Date.now()) / 60_000)) });
      writeHold(h.holdId);
      setD((x) => ({ ...x, postcode }));
      return go('details');
    }
    if (r.status === 409 && r.data.days) return newDays(r.data, 'That time has just gone. Here are the latest times.');
    setError(r.data.error || 'Something went wrong. Please try again.');
  }

  async function onConfirm() {
    if (!hold) return;
    if (d.name.trim().length < 2) return setError('Please enter your name.');
    if (d.phone.replace(/\D/g, '').length < 10) return setError('Please check your mobile number.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) return setError('Please check your email address.');
    if (d.address.trim().length < 5) return setError('Please enter your house number and street.');
    setError('');
    setBusy(true);
    const r = await post('/api/book/confirm', {
      holdId: hold.holdId,
      token: p.token || undefined,
      name: d.name,
      email: d.email,
      phone: d.phone,
      address: d.address,
      town: d.town,
      postcode: d.postcode,
      whatsappOptIn: d.optIn,
      notes: d.notes,
      company_website: d.company_website,
      elapsedMs: Date.now() - loadedAt.current,
    });
    setBusy(false);
    if (r.data.closed) return go('closed');
    if (r.ok && r.data.ok) {
      writeHold(null);
      setHold(null);
      const status = r.data.status === 'confirmed' ? 'confirmed' : 'requested';
      setDone({
        status,
        start: String(r.data.start),
        end: String(r.data.end),
        firstName: typeof r.data.firstName === 'string' ? r.data.firstName : '',
        notify: r.data.notify === 'whatsapp' || r.data.notify === 'email' ? r.data.notify : 'call',
        changeUrl: typeof r.data.changeUrl === 'string' ? r.data.changeUrl : null,
        where: [d.address.trim(), d.town.trim(), d.postcode.trim().toUpperCase()].filter(Boolean).join(', '),
      });
      if (isLink)
        setBooking({
          id: hold.holdId,
          status,
          start: String(r.data.start),
          end: String(r.data.end),
          label: '',
          type: surveyType ?? 'solar',
          postcode: d.postcode,
          minutes: slots?.minutes ?? 60,
        });
      return go('done');
    }
    if (r.data.code === 'postcode_changed') {
      writeHold(null);
      setHold(null);
      setPostcode(d.postcode);
      setError('Your postcode has changed, so the times may be different. Please search again.');
      return go('start');
    }
    if (r.status === 409) {
      writeHold(null);
      setHold(null);
      return newDays(r.data, 'Your held time has gone. Please pick again.');
    }
    setError(r.data.error || 'Something went wrong. Please try again.');
  }

  async function onCallback() {
    if (cb.name.trim().length < 2) return setError('Please enter your name.');
    if (cb.phone.replace(/\D/g, '').length < 10) return setError('Please check your phone number.');
    setError('');
    setBusy(true);
    const r = await post('/api/book/callback', { ...cb, postcode, type: type ?? 'solar', company_website: d.company_website });
    setBusy(false);
    if (r.ok && r.data.ok) return go('callbackDone');
    setError(r.data.error || 'Something went wrong. Please call us instead.');
  }

  async function onCancel() {
    setBusy(true);
    setError('');
    const r = await post('/api/book/cancel', { token: p.token, reason: cancelWhy.trim() || undefined });
    setBusy(false);
    if (r.ok && r.data.ok) {
      setBooking(null);
      setAskCancel(false);
      return go('cancelled');
    }
    setError(r.data.error || 'Something went wrong. Please call us to cancel.');
  }

  /** "Change time": search with the booking's own postcode and type. */
  async function findTimesFor(b: ExistingBooking) {
    setBusy(true);
    setError('');
    const r = await post('/api/book/slots', { token: p.token, postcode: b.postcode, type: b.type });
    setBusy(false);
    if (r.data.closed) return go('closed');
    if (!r.ok) {
      setMoving(false);
      return setError(r.data.error || 'Something went wrong. Please try again.');
    }
    showTimes(r.data as unknown as Slots);
  }

  function addToCalendar(start: string, end: string, where?: string) {
    downloadIcs('heliaxis-survey.ics', {
      uid: `survey-${Date.parse(start)}`,
      title: 'Heliaxis survey',
      start,
      end,
      location: where || undefined,
      description: `Your free Heliaxis survey (arriving around ${timeOf(start)}). It helps if we can see your fuse box, meter and loft. To change it, call ${p.phone}.`,
      stamp: Date.now(),
    });
  }

  const contact = (
    <div className="bk-row">
      <a className="bk-btn" href={telHref(p.phone)}>
        Call {p.phone}
      </a>
      <a
        className="bk-btn bk-btn--wa"
        href={`https://wa.me/${p.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Hi, I’d like to book a survey.')}`}
        target="_blank"
        rel="noreferrer"
      >
        WhatsApp us
      </a>
    </div>
  );
  const err = error ? (
    <p className="bk-err" role="alert">
      {error}
    </p>
  ) : null;
  const heading = (children: ReactNode) => (
    <h2 className="bk-h" ref={head} tabIndex={-1}>
      {children}
    </h2>
  );

  const days = slots?.days ?? [];
  const current = days.find((x) => x.day === day) ?? days[0];
  const timeButton = (t: SlotTime) => (
    <button
      key={t.start}
      type="button"
      className={pick?.start === t.start ? 'bk-time is-on' : 'bk-time'}
      aria-pressed={pick?.start === t.start}
      onClick={() => setPick(t)}
    >
      <span>Arrive around {t.time}</span>
      {t.recommended && <small>Good day: we’re nearby</small>}
    </button>
  );

  return (
    <div className="bk">
      {p.intro && (step === 'start' || step === 'manage') && <p className="bk-intro">{p.intro}</p>}

      {step === 'closed' && (
        <section className="bk-card">
          {heading(<>Online booking is coming soon</>)}
          <p>Call {p.phone} or WhatsApp us and we’ll book your free survey.</p>
          {contact}
        </section>
      )}

      {step === 'manage' && booking && (
        <section className="bk-card">
          {heading(
            <>
              Your survey: {longDay(booking.start)}, around {timeOf(booking.start)}
            </>,
          )}
          <p className="bk-muted">
            {booking.status === 'requested' ? 'Waiting for us to confirm. We’ll be in touch shortly.' : `It takes ${minutesWords(booking.minutes)}.`}
          </p>
          {booking.status === 'confirmed' && (
            <button
              type="button"
              className="bk-btn bk-btn--ghost"
              onClick={() => addToCalendar(booking.start, booking.end, p.initialAddress ? `${p.initialAddress}, ${p.initialPostcode}` : p.initialPostcode)}
            >
              Add to my calendar
            </button>
          )}
          {err}
          {p.canChange ? (
            askCancel ? (
              <div className="bk-confirm">
                <p>
                  <b>Cancel your survey on {longDay(booking.start)}?</b>
                </p>
                <label className="bk-label" htmlFor="bk-why">
                  Anything you’d like to tell us? (optional)
                </label>
                <textarea id="bk-why" className="bk-input" rows={2} value={cancelWhy} onChange={(e) => setCancelWhy(e.target.value)} />
                <div className="bk-row">
                  <button type="button" className="bk-btn bk-btn--danger" disabled={busy} onClick={onCancel}>
                    {busy ? 'Cancelling…' : 'Yes, cancel it'}
                  </button>
                  <button type="button" className="bk-btn bk-btn--ghost" onClick={() => setAskCancel(false)}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bk-row">
                  {p.enabled && (
                    <button
                      type="button"
                      className="bk-btn"
                      disabled={busy}
                      onClick={() => {
                        setMoving(true);
                        void findTimesFor(booking);
                      }}
                    >
                      {busy ? 'Finding times…' : 'Change time'}
                    </button>
                  )}
                  <button type="button" className="bk-btn bk-btn--ghost" onClick={() => setAskCancel(true)}>
                    Cancel
                  </button>
                </div>
                {!p.enabled && <p className="bk-muted">To change the time, please call us on {p.phone}.</p>}
              </>
            )
          ) : (
            <>
              <p>To change or cancel it now, please call us on {p.phone}.</p>
              {contact}
            </>
          )}
        </section>
      )}

      {step === 'cancelled' && (
        <section className="bk-card">
          {heading(<>Your survey is cancelled</>)}
          <p>Thanks for letting us know. We’ll be in touch to find another time, or you can pick one now.</p>
          {p.enabled && (
            <button
              type="button"
              className="bk-btn"
              onClick={() => {
                setMoving(false);
                go('start');
              }}
            >
              Book another time
            </button>
          )}
        </section>
      )}

      {step === 'start' && (
        <section className="bk-card">
          {heading('What’s the survey for?')}
          <div className="bk-types" role="group" aria-label="What’s the survey for?">
            {TYPE_CHOICES.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={type === t.key}
                className={type === t.key ? 'bk-type is-on' : 'bk-type'}
                onClick={() => setType(t.key)}
              >
                <b>{t.label}</b>
                <span>{minutesWords(p.durations[t.key])}</span>
              </button>
            ))}
          </div>
          <label className="bk-label" htmlFor="bk-pc">
            Your postcode
          </label>
          <form
            className="bk-pcrow"
            onSubmit={(e) => {
              e.preventDefault();
              void findTimes();
            }}
          >
            <input
              id="bk-pc"
              className="bk-input bk-input--pc"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              autoComplete="postal-code"
              autoCapitalize="characters"
              placeholder="NP20 4AB"
              inputMode="text"
              maxLength={10}
            />
            <button type="submit" className="bk-btn" disabled={busy}>
              {busy ? 'Finding…' : 'Find times'}
            </button>
          </form>
          {err}
        </section>
      )}

      {step === 'times' && slots && (
        <section className="bk-card">
          {heading(slots.mode === 'request' ? 'Pick a time that suits you. We’ll confirm it shortly.' : 'Pick a time that suits you.')}
          <p className="bk-muted">Your survey takes {slots.minutesText}.</p>
          {err}
          {slots.soonest && (
            <button
              type="button"
              className={pick?.start === slots.soonest.start ? 'bk-soonest is-on' : 'bk-soonest'}
              onClick={() => {
                setDay(days[0]?.day ?? null);
                setPick(slots.soonest);
              }}
            >
              <b>Soonest</b> {days[0]?.label}, around {slots.soonest.time}
            </button>
          )}
          <p className="bk-label">Day</p>
          <div className="bk-days">
            {days.map((x) => {
              const [wd, ...rest] = x.label.split(' ');
              return (
                <button
                  key={x.day}
                  type="button"
                  className={current?.day === x.day ? 'bk-day is-on' : 'bk-day'}
                  aria-pressed={current?.day === x.day}
                  onClick={() => {
                    setDay(x.day);
                    setPick((cur) => (cur && ukDate(Date.parse(cur.start)) === x.day ? cur : null));
                  }}
                >
                  <b>{wd}</b>
                  <span>{rest.join(' ')}</span>
                </button>
              );
            })}
          </div>
          {current && (
            <div className="bk-slots">
              {current.morning.length > 0 && (
                <>
                  <p className="bk-label">Morning</p>
                  <div className="bk-times">{current.morning.map(timeButton)}</div>
                </>
              )}
              {current.afternoon.length > 0 && (
                <>
                  <p className="bk-label">Afternoon</p>
                  <div className="bk-times">{current.afternoon.map(timeButton)}</div>
                </>
              )}
            </div>
          )}
          {!moving && p.turnstileSiteKey && !isLink && <Turnstile siteKey={p.turnstileSiteKey} onToken={setTsToken} resetKey={tsReset} />}
          <div className="bk-bar">
            <button type="button" className="bk-btn bk-btn--wide" disabled={busy || !pick} onClick={onContinue}>
              {busy ? 'Just a moment…' : pick ? `Continue: ${current?.label ?? ''}, around ${pick.time}` : 'Pick a time'}
            </button>
            <button
              type="button"
              className="bk-link"
              onClick={() => {
                setError('');
                go(moving ? 'manage' : 'start');
                if (moving) setMoving(false);
              }}
            >
              {moving ? 'Keep my current time' : 'Change postcode or survey'}
            </button>
          </div>
        </section>
      )}

      {step === 'details' && hold && (
        <section className="bk-card">
          <HoldBanner
            hold={hold}
            onPickAgain={() => {
              writeHold(null);
              setHold(null);
              void findTimes('Your held time has gone. Please pick again.');
            }}
          />
          {heading(isLink ? 'Is this right?' : 'Your details')}
          <form
            className="bk-form"
            onSubmit={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            <label className="bk-label" htmlFor="bk-name">
              Your name
            </label>
            <input id="bk-name" className="bk-input" value={d.name} onChange={field('name')} autoComplete="name" required />
            <label className="bk-label" htmlFor="bk-phone">
              Mobile
            </label>
            <input id="bk-phone" className="bk-input" type="tel" value={d.phone} onChange={field('phone')} autoComplete="tel" inputMode="tel" required />
            <label className="bk-label" htmlFor="bk-email">
              Email
            </label>
            <input id="bk-email" className="bk-input" type="email" value={d.email} onChange={field('email')} autoComplete="email" required />
            <label className="bk-label" htmlFor="bk-addr">
              House number and street
            </label>
            <input id="bk-addr" className="bk-input" value={d.address} onChange={field('address')} autoComplete="address-line1" required />
            <div className="bk-two">
              <div>
                <label className="bk-label" htmlFor="bk-town">
                  Town (optional)
                </label>
                <input id="bk-town" className="bk-input" value={d.town} onChange={field('town')} autoComplete="address-level2" />
              </div>
              <div>
                <label className="bk-label" htmlFor="bk-pc2">
                  Postcode
                </label>
                <input
                  id="bk-pc2"
                  className="bk-input"
                  value={d.postcode}
                  onChange={field('postcode')}
                  autoComplete="postal-code"
                  autoCapitalize="characters"
                  maxLength={10}
                  required
                />
              </div>
            </div>
            <label className="bk-check">
              <input type="checkbox" checked={d.optIn} onChange={(e) => setD((x) => ({ ...x, optIn: e.target.checked }))} />
              <span>OK to message me on WhatsApp about my survey</span>
            </label>
            <label className="bk-label" htmlFor="bk-notes">
              Anything we should know? (parking, access, pets)
            </label>
            <textarea id="bk-notes" className="bk-input" rows={3} value={d.notes} onChange={field('notes')} maxLength={1000} />
            {/* Left empty by people; bots fill it in. */}
            <div className="bk-hp" aria-hidden="true">
              <label htmlFor="bk-cw">Company website</label>
              <input id="bk-cw" tabIndex={-1} autoComplete="off" value={d.company_website} onChange={field('company_website')} />
            </div>
            <p className="bk-small">
              We use your details to arrange and carry out your survey. See our{' '}
              <a href="/privacy-policy" target="_blank" rel="noreferrer">
                privacy policy
              </a>
              .
            </p>
            {err}
            <div className="bk-bar">
              <button type="submit" className="bk-btn bk-btn--wide" disabled={busy}>
                {busy ? 'Booking…' : slots?.mode === 'instant' ? 'Book my survey' : 'Send my request'}
              </button>
            </div>
          </form>
        </section>
      )}

      {step === 'done' && done && (
        <section className="bk-card bk-card--done">
          {done.moved ? (
            <>
              {heading(
                done.status === 'confirmed'
                  ? `Done: your survey is now ${longDay(done.start)}, arriving around ${timeOf(done.start)}`
                  : `Thanks! We’ve got your request to move to ${longDay(done.start)}, around ${timeOf(done.start)}`,
              )}
              {done.status === 'requested' && <p>We’ll confirm by WhatsApp, email or a quick call, usually within a few working hours.</p>}
            </>
          ) : done.status === 'confirmed' ? (
            <>
              {heading(`You’re booked: ${longDay(done.start)}, arriving around ${timeOf(done.start)} (${minutesWords(slots?.minutes ?? 60)}).`)}
              {done.where && (
                <p>
                  {done.firstName || 'We'} will come to {done.where}.
                </p>
              )}
              {done.notify !== 'call' && <p>We’ll send you a reminder the day before by {done.notify === 'email' ? 'email' : 'WhatsApp'}.</p>}
              <p>It helps if we can see your fuse box, meter and loft.</p>
            </>
          ) : (
            <>
              {heading(`Thanks! We’ve got your request for ${longDay(done.start)}, around ${timeOf(done.start)}.`)}
              <p>We’ll confirm by WhatsApp, email or a quick call, usually within a few working hours.</p>
            </>
          )}
          {done.status === 'confirmed' && (
            <button type="button" className="bk-btn bk-btn--ghost" onClick={() => addToCalendar(done.start, done.end, done.where)}>
              Add to my calendar
            </button>
          )}
          {done.changeUrl && (
            <p className="bk-change">
              Need to change it? <a href={done.changeUrl}>Use this link</a>
            </p>
          )}
          {isLink && !done.changeUrl && booking && (
            <button type="button" className="bk-link" onClick={() => go('manage')}>
              See my booking
            </button>
          )}
        </section>
      )}

      {step === 'far' && (
        <section className="bk-card">
          {heading(<>You’re a little further than we can book online</>)}
          {isLink ? (
            <>
              <p>Call us or message us on WhatsApp and we’ll find a time that works.</p>
              {contact}
            </>
          ) : (
            <>
              <p>Leave your number and we’ll call to arrange it.</p>
              <button type="button" className="bk-btn" onClick={() => go('callback')}>
                Ask us to call me
              </button>
            </>
          )}
          <button type="button" className="bk-link" onClick={() => go('start')}>
            Change postcode
          </button>
        </section>
      )}

      {step === 'none' && (
        <section className="bk-card">
          {heading(<>We don’t have any times online in the next 3 weeks</>)}
          {isLink ? (
            <>
              <p>Call us or message us on WhatsApp and we’ll find a time that works.</p>
              {contact}
            </>
          ) : (
            <>
              <p>Leave your number and we’ll call you to find a time.</p>
              <button type="button" className="bk-btn" onClick={() => go('callback')}>
                Ask us to call me
              </button>
            </>
          )}
          <button type="button" className="bk-link" onClick={() => go(moving ? 'manage' : 'start')}>
            {moving ? 'Keep my current time' : 'Change postcode or survey'}
          </button>
        </section>
      )}

      {step === 'callback' && (
        <section className="bk-card">
          {heading(<>We’ll call you to arrange it</>)}
          <form
            className="bk-form"
            onSubmit={(e) => {
              e.preventDefault();
              void onCallback();
            }}
          >
            <label className="bk-label" htmlFor="cb-name">
              Your name
            </label>
            <input id="cb-name" className="bk-input" value={cb.name} onChange={(e) => setCb({ ...cb, name: e.target.value })} autoComplete="name" required />
            <label className="bk-label" htmlFor="cb-phone">
              Phone number
            </label>
            <input
              id="cb-phone"
              className="bk-input"
              type="tel"
              value={cb.phone}
              onChange={(e) => setCb({ ...cb, phone: e.target.value })}
              autoComplete="tel"
              inputMode="tel"
              required
            />
            <label className="bk-label" htmlFor="cb-email">
              Email (optional)
            </label>
            <input
              id="cb-email"
              className="bk-input"
              type="email"
              value={cb.email}
              onChange={(e) => setCb({ ...cb, email: e.target.value })}
              autoComplete="email"
            />
            <div className="bk-hp" aria-hidden="true">
              <label htmlFor="cb-cw">Company website</label>
              <input id="cb-cw" tabIndex={-1} autoComplete="off" value={d.company_website} onChange={field('company_website')} />
            </div>
            <p className="bk-small">
              Postcode {postcode.toUpperCase()}. See our{' '}
              <a href="/privacy-policy" target="_blank" rel="noreferrer">
                privacy policy
              </a>
              .
            </p>
            {err}
            <button type="submit" className="bk-btn bk-btn--wide" disabled={busy}>
              {busy ? 'Sending…' : 'Please call me'}
            </button>
          </form>
        </section>
      )}

      {step === 'callbackDone' && (
        <section className="bk-card bk-card--done">
          {heading(<>Thanks{cb.name.trim() ? `, ${cb.name.trim().split(/\s+/)[0]}` : ''}. We’ll call you soon</>)}
          <p>We’ll ring you to arrange your free survey, usually within a working day.</p>
        </section>
      )}

      <p className="bk-legal">
        Postcode lookups contain OS data © Crown copyright and database right {p.year}, Royal Mail data © Royal Mail copyright and database right {p.year}.
      </p>
    </div>
  );
}

/** "We're holding … for 10 minutes", counting down; when it lapses, "Pick again". */
function HoldBanner({ hold, onPickAgain }: { hold: Hold; onPickAgain: () => void }) {
  const now = useNow(1000);
  const left = now ? Date.parse(hold.expiresAt) - now : null;
  if (left != null && left <= 0) {
    return (
      <div className="bk-hold bk-hold--gone" role="alert">
        <p>Your held time has gone.</p>
        <button type="button" className="bk-btn" onClick={onPickAgain}>
          Pick again
        </button>
      </div>
    );
  }
  const secs = left == null ? null : Math.ceil(left / 1000);
  const mins = secs == null ? null : Math.ceil(secs / 60);
  return (
    <div className="bk-hold">
      <p>
        We’re holding <b>{`${longDay(hold.start)}, around ${timeOf(hold.start)}`}</b> for {hold.mins} minutes.
      </p>
      {secs != null && (
        <p className="bk-clock">
          <span aria-hidden="true">
            {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} left
          </span>
          <span className="bk-sr" aria-live="polite">
            {mins} minute{mins === 1 ? '' : 's'} left
          </span>
        </p>
      )}
    </div>
  );
}
