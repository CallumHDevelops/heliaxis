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
            <h3>0% VAT on qualifying home solar</h3>
            <p>
              Qualifying residential solar and battery installations may benefit from 0% VAT until 31 March 2027,
              subject to{' '}
              <a href="https://www.gov.uk/guidance/vat-rates-on-different-goods-and-services" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--solar)' }}>
                HMRC rules
              </a>
              . We confirm eligibility in your quote.
            </p>
          </div>
          <div className="fcard reveal d1">
            <h3>Finance &amp; PPA options</h3>
            <p>Spread the cost, or let a funder cover it entirely with Solar-as-a-Service for businesses.</p>
          </div>
          <div className="fcard reveal d2">
            <h3>Welsh &amp; local grants</h3>
            <p>Grant schemes open and close. We check what&rsquo;s currently available for your home or business, and whether you&rsquo;re eligible.</p>
          </div>
        </div>
        <a className="urgency reveal" href="/commercial-funding">
          <span className="dot" />
          See all funding routes →
        </a>
      </div>
    </section>
  );
}
