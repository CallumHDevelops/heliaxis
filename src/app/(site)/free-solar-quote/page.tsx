import type { Metadata } from 'next';
import Link from 'next/link';
import '../home.css';
import './free-solar-quote.css';
import { StepQuoteForm } from '@/components/quote/StepQuoteForm';
import { PackagesBand, QUOTE_LABEL } from '@/components/quote/PackagesBand';
import { SiteFooter } from '@/components/home/SiteFooter';
import { Eyebrow } from '@/components/home/Eyebrow';
import { FaqAccordion } from '@/components/home/FaqAccordion';
import { ScrollReveal } from '@/components/home/ScrollReveal';
import { WhatsAppIcon, whatsappHref } from '@/components/site/WhatsAppButton';
import { FAQS, FAQS_CHECKED } from './faqs';

// The root layout adds " | Heliaxis" to the title.
export const metadata: Metadata = {
  title: 'Free Solar Quote: South Wales and the South West',
  description:
    'A free, no-obligation solar quote from an MCS-certified installer: a real survey of your roof, a fixed price in writing, and a call within one working day.',
  alternates: { canonical: '/free-solar-quote' },
  robots: { index: true, follow: true },
};

const PHONE = '01633 965205';
const PHONE_HREF = 'tel:01633965205';
const WA_TEXT = "Hi Heliaxis, I'd like a free solar quote.";
/** The edge towns Cal named (16 Nov 2026). Do not add towns he has not confirmed. */
const AREA_TOWNS = ['Swindon', 'Bath', 'Bristol', 'Weston-super-Mare', 'Gloucester', 'Cheltenham'];

/** ?for= starts the form on the right question: home or business, or a product (the property is then a home). */
function formStart(f: string | undefined): { who?: 'home' | 'business'; picks?: string[] } {
  if (f === 'home' || f === 'business') return { who: f };
  const pick = { battery: 'Battery storage', heatpump: 'Heat pump', ev: 'EV charger', solar: 'Solar panels' }[f ?? ''];
  return pick ? { who: 'home', picks: [pick] } : {};
}

const tick = (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const WHY = [
  { h: 'A real survey, not a guess', p: 'We look at your roof, any shading and your electrics before we price anything, so the price fits your home.' },
  { h: 'A fixed price in writing', p: 'After the survey you get a written price for the system we designed, so you know exactly what you are agreeing to.' },
  { h: 'No pushy sales', p: 'You get honest advice and time to decide. If solar is not a good fit for your home, we will tell you.' },
  {
    h: 'MCS-certified installation',
    p: 'MCS is the recognised standard for small-scale renewable installations. An MCS-certified system is what lets you claim payments for exported power under the Smart Export Guarantee.',
  },
];

const STEPS = [
  { h: 'Ask for a quote', p: 'Answer a few quick questions. It takes about a minute.' },
  { h: 'We call you', p: 'We call within one working day to talk it through and book a time.' },
  { h: 'Free survey', p: 'We check the roof, shading, electrics and how you use power.' },
  { h: 'Fixed price, then install', p: 'You get a fixed written price. If you go ahead, we book the installation.' },
];

const PRICE_FACTORS = [
  { h: 'Roof size and direction', p: 'How many panels fit, and how much sun the roof faces.' },
  { h: 'Shading', p: 'Trees, chimneys and nearby buildings change the layout and the output.' },
  { h: 'How much electricity you use', p: 'This sets the size of system that makes sense for you.' },
  { h: 'Battery size', p: 'A battery adds to the price; its size depends on your evening use.' },
  { h: 'Scaffold access', p: 'How easy the roof is to reach affects the scaffolding needed.' },
];

export default async function FreeSolarQuote({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const q = await searchParams;
  const start = formStart(q.for);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        '@id': 'https://heliaxis.co.uk/#business',
        name: 'Heliaxis',
        legalName: 'Heliaxis Limited',
        description: 'MCS-certified installer of solar panels, battery storage, heat pumps and EV chargers for homes and businesses in South Wales and the South West.',
        url: 'https://heliaxis.co.uk',
        telephone: '+44 1633 965205',
        address: { '@type': 'PostalAddress', addressRegion: 'South Wales', addressCountry: 'GB' },
        areaServed: [
          { '@type': 'AdministrativeArea', name: 'South Wales' },
          { '@type': 'AdministrativeArea', name: 'South West England' },
          ...AREA_TOWNS.map((name) => ({ '@type': 'City', name })),
        ],
        openingHoursSpecification: [
          { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '18:00' },
          { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'], opens: '10:00', closes: '15:00' },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  };

  return (
    <>
      <main className="fsq">
        {/* 1. Hero: what they get, and the form */}
        <div className="sqp fsq-hero">
          <aside className="sqp-brand">
            <svg className="sqp-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {[0, 90, 180, 270].map((a) => (
                <g key={a} transform={`rotate(${a} 12 12)`}>
                  <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
                </g>
              ))}
            </svg>
            <Eyebrow>Free, no-obligation quote</Eyebrow>
            <h1>A free solar quote for your home in South Wales or the South West</h1>
            <p className="fsq-lede">No obligation, a real survey of your roof and electrics, and we call within one working day.</p>
            <div className="sqp-point">
              {tick}
              <div>
                <b>A real survey, not a sales pitch</b>
                <span>We assess your property and give honest figures.</span>
              </div>
            </div>
            <div className="sqp-point">
              {tick}
              <div>
                <b>We call within 1 working day</b>
                <span>Quick, friendly, and only when it suits you.</span>
              </div>
            </div>
            <Link className="fsq-quiet" href="/solar-estimator">
              Not ready? Try the solar estimator
            </Link>
          </aside>
          <section className="sqp-form" id="quote" aria-label="Quote request">
            <StepQuoteForm variant="page" source="landing-free-solar-quote" initialWho={start.who} initialPicks={start.picks} />
          </section>
        </div>

        {/* 2. Why this quote is different */}
        <section className="sec" aria-labelledby="fsq-why">
          <div className="wrap">
            <div className="sec-head center reveal">
              <Eyebrow>Why this quote</Eyebrow>
              <h2 id="fsq-why">A quote you can rely on</h2>
            </div>
            <div className="fsq-why reveal">
              {WHY.map((w) => (
                <div key={w.h} className="fsq-card">
                  {tick}
                  <h3>{w.h}</h3>
                  <p>{w.p}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Packages (hidden until Cal has entered some with prices) */}
        <PackagesBand quoteHref="#quote" />

        {/* 4. How it works */}
        <section className="sec fsq-alt" aria-labelledby="fsq-how">
          <div className="wrap">
            <div className="sec-head reveal">
              <Eyebrow>How it works</Eyebrow>
              <h2 id="fsq-how">From quote request to installation</h2>
            </div>
            <ol className="steps fsq-steps reveal">
              {STEPS.map((s, i) => (
                <li key={s.h} className="pstep">
                  <span className="n">0{i + 1}</span>
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 5. What affects the price */}
        <section className="sec" aria-labelledby="fsq-price">
          <div className="wrap fsq-split">
            <div className="sec-head reveal">
              <Eyebrow>Your price</Eyebrow>
              <h2 id="fsq-price">What affects the price</h2>
              <p>
                Every home is different, which is why the survey sets the final price. For a figure for your own roof now, use the{' '}
                <Link href="/solar-estimator">solar estimator</Link>, or read our guide{' '}
                <Link href="/blog/what-size-solar-system-do-i-need">What size solar system do I need?</Link>
              </p>
            </div>
            <ul className="fsq-factors reveal">
              {PRICE_FACTORS.map((f) => (
                <li key={f.h}>
                  <b>{f.h}</b>
                  <span>{f.p}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 6. Questions */}
        <div className="fsq-alt">
          <FaqAccordion items={FAQS} eyebrow="Questions" title="Questions before you ask for a quote" />
          <p className="fsq-checked">Last checked: {FAQS_CHECKED}.</p>
        </div>

        {/* 7. Final call to action */}
        <section className="fsq-final" aria-labelledby="fsq-final-h">
          <div className="wrap">
            <Eyebrow onDark>Ready when you are</Eyebrow>
            <h2 id="fsq-final-h">Get your free solar quote</h2>
            <p>
              We cover South Wales and the South West, including {AREA_TOWNS.slice(0, -1).join(', ')} and {AREA_TOWNS[AREA_TOWNS.length - 1]}. Lines are open Monday to
              Friday 8am to 6pm, and weekends 10am to 3pm.
            </p>
            <div className="fsq-final-ctas">
              <a className="btn btn-solar" href="#quote">
                {QUOTE_LABEL}
              </a>
              <a className="btn btn-light" href={PHONE_HREF}>
                Call {PHONE}
              </a>
              <a className="btn fsq-btn-line" href={whatsappHref(WA_TEXT)} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon size={18} />
                Message us on WhatsApp
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
      <ScrollReveal />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </>
  );
}
