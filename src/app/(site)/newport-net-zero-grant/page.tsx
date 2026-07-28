import type { Metadata } from 'next';
import '../commercial-funding/commercial-funding.css';
import { Eyebrow } from '@/components/home/Eyebrow';
import { ScrollReveal } from '@/components/home/ScrollReveal';
import { NewportFaq } from './NewportFaq';

export const metadata: Metadata = {
  title: 'Net Zero Newport Decarbonisation Grant — Commercial Solar | Heliaxis',
  description:
    'Match-funded grant of up to £30,000 (50% of costs) for Newport SMEs to install solar, battery and energy-efficiency measures. Full guide by Heliaxis.',
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
          <a href="/">Home</a> / <a href="/commercial-funding">Funding</a> / Newport Net Zero grant
        </div>
        <Eyebrow onDark>Newport · Business grant</Eyebrow>
        <h1>
          Net Zero Newport: up to <span className="y">£30,000</span> toward commercial solar.
        </h1>
        <p className="lead">
          Newport&apos;s decarbonisation programme match-funds SMEs cutting their building&apos;s carbon — and solar and battery are exactly the kind of project it supports. Here&apos;s how it works.
        </p>
        <div className="cbtns">
          <a className="btn btn-solar" href="/#quote">
            Scope an eligible project <ArrowIcon />
          </a>
          <a className="btn btn-light" href="https://www.newport.gov.uk/environment/climate-change/net-zero-newport-decarbonisation-programme" target="_blank" rel="noopener">
            Official council page
          </a>
        </div>
      </div>
    </section>
  );
}

function GrantOverview() {
  return (
    <section className="sec">
      <div className="wrap" style={{ maxWidth: 820 }}>
        <div className="sec-head reveal">
          <Eyebrow>At a glance</Eyebrow>
          <h2>What the programme offers</h2>
        </div>
        <div className="cards reveal" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 24 }}>
          <div className="card"><div className="ix">01</div><h3>Match funding</h3><p>The grant covers up to 50% of eligible project costs, to a maximum of £30,000 per business.</p></div>
          <div className="card"><div className="ix">02</div><h3>Free technical support</h3><p>On-site advice to help you identify and plan the right decarbonisation measures for your building.</p></div>
          <div className="card"><div className="ix">03</div><h3>£250,000 fund</h3><p>Backed by the UK Shared Prosperity Fund and delivered by Newport City Council.</p></div>
          <div className="card"><div className="ix">04</div><h3>For local SMEs</h3><p>Open to small and medium-sized enterprises with premises inside the Newport City Council area.</p></div>
        </div>

        <div style={{ marginTop: 34 }} className="reveal">
          <h2 style={{ fontSize: '1.5rem' }}>How Heliaxis helps you use it</h2>
          <p style={{ color: 'var(--muted)', marginTop: 12 }}>
            A grant is only useful if the project behind it is sound. We survey your site, design a solar and battery system matched to how you actually use energy, and produce the costed proposal and technical detail an application needs. Because we install with our own MCS-certified teams, the numbers you submit are the numbers you get.
          </p>
        </div>

        <div className="callout reveal" style={{ marginTop: 24 }}>
          Applications were shown as <b>closed for 2025/26</b> at the time of writing, but the programme runs in rounds. Register interest early with a scoped project so you&apos;re ready to move when it reopens. Always confirm current eligibility and deadlines on the official Newport City Council page — this guide is indicative and not financial advice.
        </div>

        <div className="sec-head reveal" style={{ marginTop: 44 }}>
          <Eyebrow>Good to know</Eyebrow>
          <h2>Newport grant FAQs</h2>
        </div>
        <NewportFaq />
      </div>
    </section>
  );
}

function GoldCtaBand() {
  return (
    <section className="sec goldband ctaband">
      <div className="wrap">
        <h2>Ready before the next round opens.</h2>
        <p style={{ color: 'var(--ink)', opacity: 0.8 }}>
          We&apos;ll scope a grant-ready solar project for your Newport site — free, and with no obligation.
        </p>
        <div className="b">
          <a className="btn" style={{ background: 'var(--ink)', color: 'var(--paper)' }} href="/#quote">Book a site survey</a>
          <a className="btn btn-ghost" style={{ borderColor: 'var(--ink)' }} href="/commercial-funding">See all funding routes</a>
        </div>
      </div>
    </section>
  );
}

function NewportFooter() {
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

export default function NewportNetZeroGrantPage() {
  return (
    <>
      <PageHero />
      <GrantOverview />
      <GoldCtaBand />
      <NewportFooter />
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
              { '@type': 'Question', name: 'Who can apply for the Net Zero Newport grant?', acceptedAnswer: { '@type': 'Answer', text: 'It\'s aimed at small and medium-sized enterprises that own or occupy a building within the Newport City Council area and want to reduce its carbon emissions. Eligibility criteria apply, so the first step is a conversation with the programme team.' } },
              { '@type': 'Question', name: 'What can the grant be spent on?', acceptedAnswer: { '@type': 'Answer', text: 'Eligible decarbonisation measures — which can include solar PV, battery storage and energy-efficiency works — covering the equipment, its installation and commissioning. We\'ll scope a compliant project with you.' } },
              { '@type': 'Question', name: 'How much is the grant worth?', acceptedAnswer: { '@type': 'Answer', text: 'It\'s match-funded: the grant covers up to 50% of eligible project costs, to a maximum of £30,000, drawn from a total programme fund of £250,000 backed by the UK Shared Prosperity Fund.' } },
              { '@type': 'Question', name: 'Is the grant open right now?', acceptedAnswer: { '@type': 'Answer', text: 'Applications were shown as closed for the 2025/26 year at the time of writing. It\'s a recurring programme, so we recommend registering interest early and lining up a scoped project so you\'re ready for the next round.' } },
              { '@type': 'Question', name: 'Can Heliaxis handle the application?', acceptedAnswer: { '@type': 'Answer', text: 'We can\'t guarantee an award, but we help by scoping an eligible system, preparing the technical documentation and quotes the application needs, and timing it around the funding round.' } },
            ],
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Net Zero Newport decarbonisation grant — commercial solar',
            about: 'Match-funded grant of up to £30,000 (50% of costs) for Newport SMEs to install solar, battery and energy-efficiency measures.',
            provider: { '@type': 'LocalBusiness', name: 'Heliaxis' },
          }),
        }}
      />
    </>
  );
}
