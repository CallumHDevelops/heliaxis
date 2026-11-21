'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WhatsAppIcon, whatsappHref } from '@/components/site/WhatsAppButton';
import { firstTouch } from '@/lib/first-touch';
import { CONSENT_WORDING, type Delivery } from '@/lib/estimator/quote-input';
import { track } from '@/lib/estimator/analytics';

export const PHONE = '01633 965205';
export const PHONE_HREF = 'tel:01633965205';

const PhoneIcon = ({ size = 22 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </svg>
);

export type QuoteDone = { reference: string; enquiryId: string; delivery: Delivery };

/**
 * The "Send me my full quote" form, inline on the results screen or inside the exit-intent dialog. First name, email, mobile and how they
 * want it (email, WhatsApp or both). Asking for the quote is the request, so it needs no tick box; the two boxes are about follow-ups only.
 * The browser sends the answers to the questions, never prices: the server works the figures out again.
 */
export function QuoteCapture({ buildPayload, onDone, onBook, done }: { buildPayload: () => Record<string, unknown>; onDone: (d: QuoteDone) => void; onBook: () => void; done: QuoteDone | null }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [delivery, setDelivery] = useState<Delivery>('both');
  const [emailFollowUps, setEmailFollowUps] = useState(true);
  const [whatsappMarketing, setWhatsappMarketing] = useState(false);
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/estimator/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildPayload(), name, email, phone, delivery, emailFollowUps, whatsappMarketing: whatsappMarketing && delivery !== 'email', company_website: trap, ft: firstTouch() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        setErr(d.error || 'We could not send that just now. Please try again.');
        return;
      }
      track('est_quote_requested', { delivery });
      onDone({ reference: d.reference, enquiryId: d.enquiryId, delivery });
    } catch {
      setErr('We could not send that just now. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const by = done.delivery === 'email' ? 'your email' : done.delivery === 'whatsapp' ? 'WhatsApp' : 'your email and WhatsApp';
    return (
      <div className="est-qdone" role="status">
        <h3>Your quote is on its way</h3>
        <p>
          Check {by} in the next few minutes. Your reference is <b>{done.reference}</b>.
        </p>
        <div className="est-leadbtns">
          <a className="btn btn-solar" href={whatsappHref(`Please send my estimate ${done.reference}`)} target="_blank" rel="noopener noreferrer" onClick={() => track('est_whatsapp_click', { from: 'quote-done' })}>
            <WhatsAppIcon size={20} /> Get it on WhatsApp now
          </a>
          <button type="button" className="btn est-btn-ghost" onClick={onBook}>
            Book my free survey
          </button>
        </div>
        <p className="est-fine">The survey is the next step: we look at your roof, shading and electrics and give a fixed price in writing. No obligation.</p>
      </div>
    );
  }

  return (
    <form className="est-qform" onSubmit={submit} noValidate>
      <div className="est-fields">
        <div>
          <label className="est-lab" htmlFor="qc-name">
            First name
          </label>
          <input id="qc-name" className="est-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
        </div>
        <div>
          <label className="est-lab" htmlFor="qc-email">
            Email
          </label>
          <input id="qc-email" className="est-input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div>
          <label className="est-lab" htmlFor="qc-phone">
            Mobile{delivery === 'email' ? ' (optional)' : ''}
          </label>
          <input id="qc-phone" className="est-input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="07…" required={delivery !== 'email'} />
        </div>
      </div>
      <fieldset className="est-deliver">
        <legend className="est-lab">Send it to me by</legend>
        <div className="est-tog3 seg" role="group" aria-label="How to send your quote">
          {([['email', 'Email'], ['whatsapp', 'WhatsApp'], ['both', 'Both']] as const).map(([k, label]) => (
            <button key={k} type="button" className={delivery === k ? 'on' : ''} aria-pressed={delivery === k} onClick={() => setDelivery(k)}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <input className="est-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} name="company_website" />
      <label className="est-check">
        <input type="checkbox" checked={emailFollowUps} onChange={(e) => setEmailFollowUps(e.target.checked)} /> <span>{CONSENT_WORDING.emailFollowUps}</span>
      </label>
      {delivery !== 'email' && (
        <label className="est-check">
          <input type="checkbox" checked={whatsappMarketing} onChange={(e) => setWhatsappMarketing(e.target.checked)} /> <span>{CONSENT_WORDING.whatsappMarketing}</span>
        </label>
      )}
      {err && (
        <p className="est-err" role="alert">
          {err}
        </p>
      )}
      <div className="est-leadbtns">
        <button type="submit" className="btn btn-solar" disabled={busy}>
          {busy ? 'Sending…' : 'Send me my full quote'}
        </button>
      </div>
      <p className="est-fine">
        {CONSENT_WORDING.quote} See our <Link href="/privacy-policy">privacy policy</Link>.
      </p>
    </form>
  );
}

/** The same form in a dialog (exit intent). */
export function QuoteModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="est-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="est-modal__box" role="dialog" aria-modal="true" aria-label="Get your estimate by email">
        <div className="est-modal__bar">
          <span className="est-modal__lab">Your estimate</span>
          <button type="button" className="est-modal__x" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            <span>Close</span>
          </button>
        </div>
        <div className="est-modal__body">{children}</div>
      </div>
    </div>,
    document.querySelector('.site') ?? document.body,
  );
}

/** Desktop only, once per visitor: the mouse leaves through the top of the window, or nothing has happened for a minute. */
export function useExitIntent(active: boolean, onTrigger: () => void) {
  const fired = useRef(false);
  useEffect(() => {
    if (!active || fired.current) return;
    let seen = false;
    try {
      seen = !!window.localStorage.getItem('hx-est-exit');
    } catch {
      // Not remembered: it can show again next visit.
    }
    if (seen || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const fire = () => {
      if (fired.current) return;
      fired.current = true;
      try {
        window.localStorage.setItem('hx-est-exit', String(Date.now()));
      } catch {
        // Fine.
      }
      onTrigger();
    };
    const out = (e: MouseEvent) => e.clientY <= 0 && !e.relatedTarget && fire();
    let idle = window.setTimeout(fire, 90_000);
    const bump = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(fire, 90_000);
    };
    document.addEventListener('mouseout', out);
    document.addEventListener('mousemove', bump);
    document.addEventListener('keydown', bump);
    return () => {
      window.clearTimeout(idle);
      document.removeEventListener('mouseout', out);
      document.removeEventListener('mousemove', bump);
      document.removeEventListener('keydown', bump);
    };
  }, [active, onTrigger]);
}

/** On a phone: the quote, the phone and WhatsApp stay in reach at the foot of the results. */
export function StickyBar({ onQuote, hidden }: { onQuote: () => void; hidden: boolean }) {
  if (hidden) return null;
  return (
    <div className="est-sticky" role="region" aria-label="Get your quote">
      <button type="button" className="btn btn-solar est-sticky__main" onClick={onQuote}>
        Get my quote PDF
      </button>
      <a className="est-sticky__ic" href={PHONE_HREF} aria-label={`Call ${PHONE}`} onClick={() => track('est_call_click', { from: 'sticky' })}>
        <PhoneIcon />
      </a>
      <a className="est-sticky__ic est-sticky__wa" href={whatsappHref('Hi Heliaxis, I have just used your solar estimator.')} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp us" onClick={() => track('est_whatsapp_click', { from: 'sticky' })}>
        <WhatsAppIcon size={22} />
      </a>
    </div>
  );
}

/** "Prefer to talk?" under the wizard and the results. */
export function TalkLine({ className = '' }: { className?: string }) {
  return (
    <p className={`est-talk ${className}`}>
      Prefer to talk?{' '}
      <a href={PHONE_HREF} onClick={() => track('est_call_click', { from: 'talk-line' })}>
        {PHONE}
      </a>{' '}
      ·{' '}
      <a href={whatsappHref('Hi Heliaxis, I have a question about solar.')} target="_blank" rel="noopener noreferrer" onClick={() => track('est_whatsapp_click', { from: 'talk-line' })}>
        WhatsApp us
      </a>
    </p>
  );
}
