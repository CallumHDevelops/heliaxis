import { Eyebrow } from './Eyebrow';

export function FinanceSection() {
  return (
    <section className="sec finance">
      <div className="glow" />
      <div className="wrap">
        <div className="sec-head reveal">
          <Eyebrow onDark>Funding &amp; finance</Eyebrow>
          <h2 style={{ color: 'var(--paper)' }}>Solar within reach, whatever your budget</h2>
          <p style={{ color: 'var(--muted-d)' }}>Buy outright, spread the cost, or pay nothing upfront — plus the Welsh grants worth knowing about.</p>
        </div>
        <div className="fgrid">
          <div className="fcard reveal">
            <h3>0% VAT on home solar</h3>
            <p>Residential installs carry 0% VAT until 31 March 2027 — a saving worth locking in.</p>
          </div>
          <div className="fcard reveal d1">
            <h3>Finance &amp; PPA options</h3>
            <p>Spread the cost, or let a funder cover it entirely with Solar-as-a-Service for businesses.</p>
          </div>
          <div className="fcard reveal d2">
            <h3>Welsh &amp; local grants</h3>
            <p>From the Nest scheme to Newport&rsquo;s SME decarbonisation grant — we&rsquo;ll help you find and time it.</p>
          </div>
        </div>
        <a className="urgency reveal" href="/commercial-funding">
          <span className="dot" />
          0% VAT ends March 2027 — see all funding routes →
        </a>
      </div>
    </section>
  );
}
