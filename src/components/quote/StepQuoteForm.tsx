'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import './step-quote.css';

/**
 * The quote form, one question at a time (the "Split" design, 25 Oct 2026). Home or business → what
 * they want (or the kind of site) → postcode → name → phone and email → WhatsApp yes/no → sent.
 * Same endpoint as the old single-page form (/api/quote), so leads land in the CRM exactly as before.
 * The WhatsApp permission is an explicit choice, never pre-selected.
 */

type Who = 'home' | 'business' | '';
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const INTERESTS = ['Solar panels', 'Battery storage', 'Heat pump', 'EV charger', 'Not sure yet'];
const SITES = ['Warehouse or industrial', 'Office or retail', 'Farm or rural', 'Something else'];
const QUESTIONS = 6;
const LETTERS = 'ABCDEFGH';

const spark = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
    {[0, 90, 180, 270].map((a) => (
      <g key={a} transform={`rotate(${a} 12 12)`}>
        <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
      </g>
    ))}
  </svg>
);

function track(step: number) {
  try {
    const u = (window as unknown as { umami?: { track?: (e: string, d?: Record<string, unknown>) => void } }).umami;
    u?.track?.('quote-step', { step });
  } catch {
    // Analytics must never break the form.
  }
}

export function StepQuoteForm({ variant = 'card' }: { variant?: 'card' | 'page' }) {
  const [step, setStep] = useState<Step>(1);
  const [who, setWho] = useState<Who>('');
  const [picks, setPicks] = useState<string[]>([]);
  const [site, setSite] = useState('');
  const [postcode, setPostcode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [trap, setTrap] = useState('');
  const [firstNameDone, setFirstNameDone] = useState('');

  // Move focus to the new question (not on first load, so embedding it never steals focus).
  const moved = useRef(false);
  const head = useRef<HTMLHeadingElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!moved.current) return;
    (input.current ?? head.current)?.focus({ preventScroll: true });
    track(step);
  }, [step]);

  const first = name.trim().split(/\s+/)[0] ?? '';
  const home = who === 'home';

  const go = (s: Step) => {
    moved.current = true;
    setErr('');
    setStep(s);
  };

  function next() {
    let e = '';
    if (step === 2 && home && !picks.length) e = 'Pick at least one, or choose “Not sure yet”.';
    if (step === 3 && postcode.replace(/\s/g, '').length < 5) e = 'Please enter your postcode.';
    if (step === 4 && name.trim().length < 2) e = 'Please enter your name.';
    if (step === 5) {
      if (phone.replace(/\D/g, '').length < 10) e = 'Please check your phone number.';
      else if (!/^\S+@\S+\.\S+$/.test(email.trim())) e = 'Please check your email address.';
    }
    if (e) return setErr(e);
    go((step + 1) as Step);
  }

  async function submit(whatsapp: boolean) {
    setErr('');
    setSending(true);
    try {
      const r = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          postcode: postcode.trim(),
          propertyType: who,
          interests: home ? picks : [],
          sector: home ? '' : site,
          whatsappOptIn: whatsapp,
          company_website: trap,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (r.ok && d.success) {
        setFirstNameDone(first);
        moved.current = true;
        setStep(7);
      } else {
        setErr(d.error || 'Something went wrong. Please try again, or call us on 01633 965205.');
      }
    } catch {
      setErr('That didn’t send. Check your signal and try again, or call us on 01633 965205.');
    } finally {
      setSending(false);
    }
  }

  function restart() {
    setWho('');
    setPicks([]);
    setSite('');
    setPostcode('');
    setName('');
    setPhone('');
    setEmail('');
    setFirstNameDone('');
    go(1);
  }

  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      next();
    }
  };

  const titles: Record<number, string> = {
    1: 'Who’s the quote for?',
    2: home ? 'What are you interested in?' : 'What sort of site is it?',
    3: home ? 'Where’s the property?' : 'Where’s the site?',
    4: 'What should we call you?',
    5: `Thanks, ${first || 'there'}. How can we reach you?`,
    6: 'Last one. Can we message you on WhatsApp?',
  };
  const hints: Record<number, string> = {
    1: 'It takes about a minute. No obligation.',
    2: home ? 'Choose as many as you like.' : 'Choose the closest one.',
    3: 'Just the postcode for now.',
    4: 'Your first and last name.',
    5: 'We’ll call, and email you the details.',
    6: 'Only about your enquiry. If you’d rather not, we’ll just call.',
  };

  const tile = (label: string, letter: string, on: boolean, onClick: () => void, sub?: string, disabled = false) => (
    <button key={label} type="button" className={on ? 'sq-tile is-on' : 'sq-tile'} aria-pressed={on} onClick={onClick} disabled={disabled}>
      <span className="sq-key" aria-hidden="true">{letter}</span>
      <span className="sq-tile-text">
        <b>{label}</b>
        {sub && <span>{sub}</span>}
      </span>
    </button>
  );

  const togglePick = (l: string) => {
    setErr('');
    setPicks((cur) => {
      const has = cur.includes(l);
      if (l === 'Not sure yet') return has ? [] : ['Not sure yet'];
      const without = cur.filter((x) => x !== 'Not sure yet');
      return has ? without.filter((x) => x !== l) : [...without, l];
    });
  };

  const showOk = (step === 2 && home) || step === 3 || step === 4 || step === 5;
  const asking = step <= QUESTIONS;
  const inputId = `sq-${variant}-in`;
  const headId = `sq-${variant}-h`;

  return (
    <div className={`sq sq--${variant}`}>
      {asking && (
        <div className="sq-top">
          <span className="sq-count">0{step} / 0{QUESTIONS}</span>
          <div className="sq-bar" role="progressbar" aria-label="Progress" aria-valuemin={1} aria-valuemax={QUESTIONS} aria-valuenow={step}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <span key={n} className={n < step ? 'is-done' : n === step ? 'is-now' : ''} />
            ))}
          </div>
        </div>
      )}

      <div className="sq-body">
        {asking && (
          <>
            <h2 className="sq-q" id={headId} ref={head} tabIndex={-1}>
              {titles[step]}
            </h2>
            <p className="sq-hint">{hints[step]}</p>
          </>
        )}

        {step === 1 && (
          <div className="sq-tiles sq-tiles--col">
            {tile('For my home', 'A', home, () => { setWho('home'); setPicks([]); setSite(''); go(2); }, 'House, flat or bungalow')}
            {tile('For my business', 'B', who === 'business', () => { setWho('business'); setPicks([]); setSite(''); go(2); }, 'Warehouse, office, farm or shop')}
          </div>
        )}

        {step === 2 && home && (
          <div className="sq-tiles">{INTERESTS.map((l, i) => tile(l, LETTERS[i], picks.includes(l), () => togglePick(l)))}</div>
        )}
        {step === 2 && !home && (
          <div className="sq-tiles">{SITES.map((l, i) => tile(l, LETTERS[i], site === l, () => { setSite(l); go(3); }))}</div>
        )}

        {step === 3 && (
          <input ref={input} id={inputId} className="sq-in" aria-labelledby={headId} value={postcode} onChange={(e) => { setPostcode(e.target.value); setErr(''); }} onKeyDown={onEnter} placeholder="NP20 4AB" autoComplete="postal-code" autoCapitalize="characters" maxLength={10} />
        )}
        {step === 4 && (
          <input ref={input} id={inputId} className="sq-in" aria-labelledby={headId} value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} onKeyDown={onEnter} placeholder="Your first and last name" autoComplete="name" maxLength={120} />
        )}
        {step === 5 && (
          <>
            <div className="sq-pair">
              <div>
                <label className="sq-label" htmlFor={`${inputId}-phone`}>Phone</label>
                <input ref={input} id={`${inputId}-phone`} className="sq-in sq-in--sm" value={phone} onChange={(e) => { setPhone(e.target.value); setErr(''); }} onKeyDown={onEnter} placeholder="07700 900123" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} />
              </div>
              <div>
                <label className="sq-label" htmlFor={`${inputId}-email`}>Email</label>
                <input id={`${inputId}-email`} className="sq-in sq-in--sm" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} onKeyDown={onEnter} placeholder="you@email.com" type="email" autoComplete="email" maxLength={200} />
              </div>
            </div>
            <p className="sq-small">
              We’ll use your details to reply to your enquiry. See our <Link href="/privacy-policy">privacy policy</Link>.
            </p>
          </>
        )}
        {step === 6 && (
          <div className="sq-tiles sq-tiles--col">
            {tile('Yes, WhatsApp is fine', 'A', false, () => void submit(true), undefined, sending)}
            {tile('No thanks, just call', 'B', false, () => void submit(false), undefined, sending)}
            {sending && <p className="sq-small" role="status">Sending…</p>}
          </div>
        )}

        <div className="sq-trap" aria-hidden="true">
          <label>
            Company website
            <input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
          </label>
        </div>

        {err && (
          <p className="sq-err" role="alert">
            {err}
          </p>
        )}

        {showOk && (
          <div className="sq-actions">
            <button type="button" className="btn btn-solar" onClick={next}>
              OK
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
            {step >= 3 && step <= 5 && <span className="sq-enter">press <b>Enter ↵</b></span>}
          </div>
        )}

        {step === 7 && (
          <div className="sq-done" role="status">
            <span className="sq-done-tag">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Request received
            </span>
            <h2 className="sq-q" id={headId} ref={head} tabIndex={-1}>
              Thanks{firstNameDone ? `, ${firstNameDone}` : ''}.
            </h2>
            <p className="sq-hint">We’ll call within 1 working day, at a time that suits you.</p>
            <button type="button" className="btn btn-ghost" onClick={restart}>
              Send another request
            </button>
          </div>
        )}
      </div>

      {step > 1 && step < 7 && (
        <div className="sq-foot">
          <button type="button" className="sq-back" onClick={() => go((step - 1) as Step)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            Back
          </button>
        </div>
      )}
      <span className="sq-spark" aria-hidden="true">{spark}</span>
    </div>
  );
}
