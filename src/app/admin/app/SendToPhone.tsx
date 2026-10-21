'use client';

import { useState } from 'react';

/** Get the app onto a phone from a computer: scan the QR, or email yourself the personal link. */
export function SendToPhone({ qrSvg, email, days }: { qrSvg: string; email: string; days: number }) {
  const [to, setTo] = useState(email);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    try {
      const r = await fetch('/api/app-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not send the email');
      setState('sent');
      setMsg(`Sent to ${d.to}. Open it on your phone and tap “Download the app”.`);
    } catch (err) {
      setState('error');
      setMsg((err as Error).message);
    }
  }

  return (
    <section className="ad-card stp">
      <h2 className="stp-h">Send it to your phone</h2>
      <div className="stp-grid">
        <div className="stp-qr">
          <div className="stp-qr-img" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <span>Scan with your phone&apos;s camera</span>
        </div>
        <form className="stp-form" onSubmit={send}>
          <label htmlFor="stp-email">Or email yourself a download link</label>
          <input
            id="stp-email"
            type="email"
            required
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              if (state !== 'sending') setState('idle');
            }}
            placeholder="you@example.com"
          />
          <button type="submit" className="ad-btn stp-btn" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Email me the link'}
          </button>
          {(state === 'sent' || state === 'error') && (
            <p className={`stp-msg${state === 'error' ? ' is-error' : ''}`} role="status">
              {msg}
            </p>
          )}
          <p className="ad-hint">
            A personal link, valid for {days} days. Use any address you read on your phone — it opens a page with a
            one-tap download, no sign-in needed.
          </p>
        </form>
      </div>
      <style>{`
        .stp-h { margin-top: 0 !important; }
        .stp-grid { display: grid; grid-template-columns: 170px 1fr; gap: 22px; align-items: start; }
        .stp-qr { text-align: center; font-size: .78rem; color: var(--muted); }
        /* The code itself stays dark on light in both themes, so phones can scan it. */
        .stp-qr-img svg { width: 170px; height: 170px; display: block; border: 1px solid var(--border); border-radius: 4px; }
        .stp-qr span { display: block; margin-top: 6px; }
        .stp-form { display: flex; flex-direction: column; gap: 8px; }
        .stp-form label { font-weight: 700; font-size: .92rem; }
        .stp-form input { font: inherit; font-size: .95rem; padding: .6rem .7rem; border: 1px solid var(--border-strong);
          border-radius: 2px; background: var(--field); color: var(--text); min-width: 0; }
        .stp-btn { border: 0; cursor: pointer; font: inherit; font-weight: 800; }
        .stp-btn:disabled { opacity: .6; cursor: default; }
        .stp-msg { margin: 0; font-size: .85rem; color: var(--ok); font-weight: 600; }
        .stp-msg.is-error { color: var(--danger); }
        @media (max-width: 560px) {
          .stp-grid { grid-template-columns: 1fr; }
          .stp-qr { display: none; }
        }
      `}</style>
    </section>
  );
}
