import type { Metadata } from 'next';
import '../commercial-funding/commercial-funding.css';
import { Eyebrow } from '@/components/home/Eyebrow';
import { ScrollReveal } from '@/components/home/ScrollReveal';
import { WarehousingFaq } from './WarehousingFaq';

export const metadata: Metadata = {
  title: 'Warehouse & Industrial Solar — Large Roof Systems | Heliaxis',
  description:
    'Rooftop and ground-mounted commercial solar PV, battery storage and EV charging for warehouses and industrial units across South Wales, with CapEx, finance and PPA funding.',
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function PageHero() {
  return (
    <section className="phero">
      <div className="glow" />
      <div className="wrap">
        <div className="crumb">
          <a href="/">Home</a> / <a href="/commercial-funding">Commercial</a> / Warehousing &amp; industrial
        </div>
        <Eyebrow onDark>Sector · Warehousing &amp; industrial</Eyebrow>
        <h1>
          Turn a big industrial roof into <span className="y">your cheapest energy.</span>
        </h1>
        <p className="lead">
          Warehouses and industrial units have exactly what solar loves: large, unshaded roofs and heavy daytime demand. That combination often delivers the fastest payback of any sector.
        </p>
        <div className="cbtns">
          <a className="btn btn-solar" href="/#quote">
            Book a free roof assessment <ArrowIcon />
          </a>
          <a className="btn btn-light" href="/solar-estimator">Estimate savings</a>
        </div>
        <div className="metrics">
          <div className="m"><div className="n">3–5 yr</div><div className="k">Typical payback</div></div>
          <div className="m"><div className="n">Up to 75%</div><div className="k">Off your unit cost*</div></div>
          <div className="m"><div className="n">25 yr+</div><div className="k">Generation lifespan</div></div>
        </div>
      </div>
    </section>
  );
}

function WhyItWorks() {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="sec-head reveal">
          <Eyebrow>Why it works</Eyebrow>
          <h2>Built for high daytime demand</h2>
          <p>The more power you use while the sun is up, the more of your own generation you consume directly — and the faster the system pays for itself.</p>
        </div>
        <div className="grid3 reveal" style={{ marginTop: 26 }}>
          <div className="gcell">
            <div className="tagline">Roof area</div>
            <h3>Scale on tap</h3>
            <p>Expansive, largely unshaded roofs allow big arrays — from tens to hundreds of kWp — without planning headaches on most sites.</p>
          </div>
          <div className="gcell">
            <div className="tagline">Load match</div>
            <h3>Use it as you make it</h3>
            <p>Machinery, refrigeration, lighting and charging run through the day, so most generation is self-consumed at full value.</p>
          </div>
          <div className="gcell">
            <div className="tagline">Resilience</div>
            <h3>Battery &amp; backup</h3>
            <p>Add storage to shift solar into peak-price periods, cut demand charges, and keep critical loads running if the grid dips.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProcessBand() {
  return (
    <section className="sec band">
      <div className="glow" />
      <div className="wrap">
        <div className="sec-head reveal">
          <Eyebrow onDark>The process</Eyebrow>
          <h2 style={{ color: 'var(--paper)' }}>From roof survey to switch-on</h2>
        </div>
        <div className="cf-steps reveal" style={{ marginTop: 24 }}>
          <div className="step" style={{ borderColor: 'var(--line-d)' }}>
            <span className="n">01</span>
            <h4 style={{ color: 'var(--paper)' }}>Energy assessment</h4>
            <p style={{ color: 'var(--muted-d)' }}>We analyse your bills, load profile, roof and grid connection.</p>
          </div>
          <div className="step" style={{ borderColor: 'var(--line-d)' }}>
            <span className="n">02</span>
            <h4 style={{ color: 'var(--paper)' }}>Design &amp; funding</h4>
            <p style={{ color: 'var(--muted-d)' }}>A system sized to your demand, with CapEx, finance or PPA options and any grants.</p>
          </div>
          <div className="step" style={{ borderColor: 'var(--line-d)' }}>
            <span className="n">03</span>
            <h4 style={{ color: 'var(--paper)' }}>Install</h4>
            <p style={{ color: 'var(--muted-d)' }}>Our own MCS teams fit it around your operations, with minimal disruption.</p>
          </div>
          <div className="step" style={{ borderColor: 'var(--line-d)' }}>
            <span className="n">04</span>
            <h4 style={{ color: 'var(--paper)' }}>Monitor &amp; maintain</h4>
            <p style={{ color: 'var(--muted-d)' }}>Performance monitoring and O&amp;M to protect your investment for the long term.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="sec-head reveal">
          <Eyebrow>Good to know</Eyebrow>
          <h2>Warehousing solar FAQs</h2>
        </div>
        <WarehousingFaq />
        <p className="mono" style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 18 }}>
          *Indicative — actual savings depend on your tariff, usage and system design.
        </p>
      </div>
    </section>
  );
}

function GoldCtaBand() {
  return (
    <section className="sec goldband ctaband">
      <div className="wrap">
        <h2>See what your roof could generate.</h2>
        <p style={{ color: 'var(--ink)', opacity: 0.8 }}>
          Book a free assessment for your warehouse or industrial unit — exact system size, savings and payback, in GBP.
        </p>
        <div className="b">
          <a className="btn" style={{ background: 'var(--ink)', color: 'var(--paper)' }} href="/#quote">Book my assessment</a>
          <a className="btn btn-ghost" style={{ borderColor: 'var(--ink)' }} href="/commercial-funding">Funding options</a>
        </div>
      </div>
    </section>
  );
}

function WarehousingFooter() {
  return (
    <footer>
      <div className="wrap">
        <div className="cols">
          <div>
            <p style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: '1.3rem', color: 'var(--paper)', marginBottom: 14 }}>Heliaxis</p>
            <p style={{ maxWidth: '34ch' }}>
              MCS-certified solar, battery, heat pump, EV and LED installation for homes and businesses across South Wales.
            </p>
          </div>
          <div>
            <h4>Areas we cover</h4>
            <a href="/">Solar Panels Cardiff</a>
            <a href="/">Solar Panels Swansea</a>
            <a href="/">Solar Panels Newport</a>
            <a href="/">Solar Panels Bridgend</a>
            <a href="/">Vale of Glamorgan</a>
          </div>
          <div>
            <h4>Business</h4>
            <a href="/commercial-funding">Funding &amp; finance</a>
            <a href="/newport-net-zero-grant">Newport Net Zero grant</a>
            <a href="/warehousing">Warehousing &amp; industrial</a>
            <a href="/solar-estimator">Solar estimator</a>
          </div>
        </div>
        <div className="base">
          <span>© 2026 Heliaxis. MCS-certified · RECC · Covering South Wales.</span>
          <span className="mono">heliaxis.co.uk</span>
        </div>
      </div>
    </footer>
  );
}

export default function WarehousingPage() {
  return (
    <>
      <PageHero />
      <WhyItWorks />
      <ProcessBand />
      <FaqSection />
      <GoldCtaBand />
      <WarehousingFooter />
      <ScrollReveal />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'LocalBusiness',
            name: 'Heliaxis',
            description: 'MCS-certified installer of solar PV, battery storage, heat pumps, EV chargers and LED lighting for homes and businesses across South Wales.',
            areaServed: ['Cardiff', 'Swansea', 'Newport', 'Bridgend', 'Vale of Glamorgan', 'South Wales'],
            url: 'https://heliaxis.co.uk',
            telephone: '01633 965205',
            address: { '@type': 'PostalAddress', addressRegion: 'South Wales', addressCountry: 'GB' },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              { '@type': 'Question', name: 'How big a system can my warehouse roof take?', acceptedAnswer: { '@type': 'Answer', text: 'Large industrial roofs often suit systems from tens of kWp up to several hundred kWp. The limit is usually roof area, structure and your grid connection rather than demand — we assess all three at survey.' } },
              { '@type': 'Question', name: 'Will installation disrupt operations?', acceptedAnswer: { '@type': 'Answer', text: 'Rarely. The bulk of the work happens on the roof, so day-to-day operations usually continue underneath. We plan around your shifts and any access or safety requirements.' } },
              { '@type': 'Question', name: 'What about the power we don\'t use on site?', acceptedAnswer: { '@type': 'Answer', text: 'Surplus can be stored in a battery for later, or exported to the grid for income under the Smart Export Guarantee. For most warehouses, high daytime demand means you self-consume a large share directly.' } },
              { '@type': 'Question', name: 'Can we fund it without capital outlay?', acceptedAnswer: { '@type': 'Answer', text: 'Yes — warehousing and industrial sites are a strong fit for a Power Purchase Agreement, as well as asset finance or outright purchase. See our funding guide for the trade-offs.' } },
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Service',
            serviceType: 'Commercial solar PV for warehousing and industrial sites',
            provider: { '@type': 'LocalBusiness', name: 'Heliaxis' },
            areaServed: 'South Wales',
            description: 'Rooftop and ground-mounted commercial solar PV, battery storage and EV charging for warehouses and industrial units across South Wales, with CapEx, finance and PPA funding.',
          }),
        }}
      />
    </>
  );
}
