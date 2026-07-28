'use client';

import { useState, useRef } from 'react';
import { Eyebrow } from './Eyebrow';

export function QuoteForm() {
  const [segment, setSegment] = useState<'home' | 'business'>('home');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  async function handleSubmit() {
    const name = (document.getElementById('q-name') as HTMLInputElement)?.value.trim() ?? '';
    const email = (document.getElementById('q-email') as HTMLInputElement)?.value.trim() ?? '';
    const phone = (document.getElementById('q-phone') as HTMLInputElement)?.value.trim() ?? '';
    const postcode = (document.getElementById('q-postcode') as HTMLInputElement)?.value.trim() ?? '';
    const interest = (document.getElementById('q-interest') as HTMLTextAreaElement)?.value.trim() ?? '';

    if (!name) { setMsg({ text: 'Please enter your name.', ok: false }); return; }
    if (!email || email.indexOf('@') < 1) { setMsg({ text: 'Please enter a valid email.', ok: false }); return; }

    setSubmitting(true);
    try {
      const r = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, postcode, interest, propertyType: segment }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setMsg({ text: "Thank you — we've received your request and will be in touch shortly.", ok: true });
        ['q-name', 'q-phone', 'q-email', 'q-postcode', 'q-interest'].forEach((id) => {
          const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;
          if (el) el.value = '';
        });
        setSubmitted(true);
      } else {
        setMsg({ text: d.error || 'Something went wrong. Please try again or call us.', ok: false });
      }
    } catch {
      setMsg({ text: 'Failed to send. Please try again or call us.', ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="sec quote" id="quote">
      <div className="wrap">
        <div className="grid">
          <div className="why reveal">
            <Eyebrow>Free, no-obligation quote</Eyebrow>
            <h2 style={{ marginTop: 12 }}>Ready to see what you could save?</h2>
            <div className="pt">
              <span className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <div><b>A real survey, not a sales pitch</b><span>We assess your property and give honest figures.</span></div>
            </div>
            <div className="pt">
              <span className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <div><b>We call within 1 working day</b><span>Quick, friendly, and only when it suits you.</span></div>
            </div>
            <div className="pt">
              <span className="ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              <div><b>Your details stay private</b><span>No spam, no third parties, no obligation.</span></div>
            </div>
            <div className="callnow">
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.68rem', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>Prefer to talk?</div>
                <a className="tel" href="tel:01633965205">01633 965205</a>
              </div>
              <a className="btn btn-ghost" href="tel:01633965205">Call us now</a>
            </div>
          </div>
          <div className="formcard reveal d1" id="quoteCard" ref={formRef}>
            <div className="seg">
              <button className={segment === 'home' ? 'on' : ''} onClick={() => setSegment('home')}>For my home</button>
              <button className={segment === 'business' ? 'on' : ''} onClick={() => setSegment('business')}>For my business</button>
            </div>
            <div className="field"><label>Full name</label><input id="q-name" type="text" placeholder="Your name" /></div>
            <div className="field"><label>Phone</label><input id="q-phone" type="tel" placeholder="Mobile or landline" /></div>
            <div className="field"><label>Email</label><input id="q-email" type="email" placeholder="you@email.com" /></div>
            <div className="field"><label>Postcode</label><input id="q-postcode" type="text" placeholder="e.g. CF10 1AA" /></div>
            <div className="field"><label>What are you interested in? (optional)</label><textarea id="q-interest" rows={2} placeholder="Solar, battery, heat pump, EV…" /></div>
            {msg && (
              <div style={{
                display: 'block',
                marginBottom: '.6rem',
                padding: '.7rem .9rem',
                borderRadius: 2,
                fontSize: '.9rem',
                background: msg.ok ? 'rgba(63,125,78,.12)' : 'rgba(199,127,4,.12)',
                color: msg.ok ? '#2f5f3b' : '#8a5a02',
              }}>
                {msg.text}
              </div>
            )}
            {!submitted && (
              <button
                type="button"
                className="btn btn-solar"
                style={{ width: '100%' }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? 'Sending…' : (
                  <>
                    Get my free quote
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </>
                )}
              </button>
            )}
            <p className="form-re">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path className="f" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" fill="var(--solar)" stroke="none" />
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              No obligation and no pushy sales — we&rsquo;ll simply arrange a free survey.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
