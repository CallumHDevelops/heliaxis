import { Eyebrow } from './Eyebrow';

export function ValueGrid() {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="sec-head center reveal">
          <Eyebrow>Why Heliaxis</Eyebrow>
          <h2>The local team that does it properly</h2>
          <p>No subcontractors, no hard sell — just accredited engineers and honest advice from first call to long-term aftercare.</p>
        </div>
        <div className="vgrid">
          <div className="vcard reveal">
            <span className="ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <circle className="f" cx="12" cy="12" r="8.5" fill="var(--solar)" stroke="none" />
                <circle cx="12" cy="12" r="8.5" />
                <path d="M14.5 9.2a3 3 0 0 0-5 2.3c0 3 5 2 5 4.2a3 3 0 0 1-5 1.6" />
              </svg>
            </span>
            <h3>Lower your bills</h3>
            <p>Generate your own power and protect against rising energy prices for decades.</p>
          </div>
          <div className="vcard reveal d1">
            <span className="ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path className="f" d="M5 10.5h14V19H5z" fill="var(--solar)" stroke="none" />
                <path d="M3 11l9-7 9 7" />
                <path d="M5 10v9h14v-9" />
              </svg>
            </span>
            <h3>Your own local team</h3>
            <p>Surveyed and installed by our MCS engineers — never subcontracted out.</p>
          </div>
          <div className="vcard reveal d2">
            <span className="ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path className="f" d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" fill="var(--solar)" stroke="none" />
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </span>
            <h3>Fully guaranteed</h3>
            <p>Insurance-backed workmanship and 25-year panel warranties as standard.</p>
          </div>
          <div className="vcard reveal d3">
            <span className="ic">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <rect className="f" x="7" y="3" width="10" height="18" rx="1.5" fill="var(--solar)" stroke="none" />
                <rect x="7" y="3" width="10" height="18" rx="1.5" />
                <path d="M10 18h4" />
                <path d="M9.5 11l2 2.5 1.5-2 2 3" />
              </svg>
            </span>
            <h3>Aftercare that lasts</h3>
            <p>App monitoring and real support for years — not a company that vanishes after handover.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
