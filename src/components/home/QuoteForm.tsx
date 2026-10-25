'use client';

import { StepQuoteForm } from '@/components/quote/StepQuoteForm';
import { Eyebrow } from './Eyebrow';
import Link from 'next/link';

export function QuoteForm() {
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
              <div><b>Your details stay private</b><span>We never sell your details. No spam, no obligation. <Link href="/privacy-policy">Privacy policy</Link></span></div>
            </div>
            <div className="callnow">
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.68rem', letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>Prefer to talk?</div>
                <a className="tel" href="tel:01633965205">01633 965205</a>
              </div>
              <a className="btn btn-ghost" href="tel:01633965205">Call us now</a>
            </div>
          </div>
          <div className="formcard reveal d1" id="quoteCard">
            <StepQuoteForm variant="card" />
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
