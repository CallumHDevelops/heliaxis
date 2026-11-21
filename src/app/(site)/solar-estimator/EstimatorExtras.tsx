import '../home.css';
import Link from 'next/link';
import { CtaBand, FaqAccordion, ScrollReveal, SiteFooter } from '@/components/home';
import { Eyebrow } from '@/components/home/Eyebrow';
import type { Faq } from '@/components/home/FaqAccordion';
import { whatsappHref } from '@/components/site/WhatsAppButton';
import type { EstimatorSettings } from '@/lib/estimator/calc';
import { brandAlt, type BrandLogo } from '@/lib/brand-logos';
import { TIMELINE } from '@/lib/estimator/copy';
import { homePrice, monthlyPayment } from '@/lib/estimator/pricing';
import { AddToQuote, ToEstimator } from './AddToQuote';

const PHONE = '01633 965205';

/** The notices that are still in date: each hides itself after its expiry (YYYY-MM-DD, the end of that day). */
export function liveNotices(n: EstimatorSettings['notices'], now = new Date()): string[] {
  const live = (line: string, expires: string) => !!line.trim() && (!expires || now.getTime() <= new Date(`${expires}T23:59:59Z`).getTime());
  return [live(n.vatLine, n.vatExpires) ? n.vatLine.trim() : '', live(n.priceRiseLine, n.priceRiseExpires) ? n.priceRiseLine.trim() : ''].filter(Boolean);
}

const faqs = (s: EstimatorSettings): Faq[] => [
  { id: 'Q/01', q: 'How accurate is this?', a: 'It is a good guide, not a quote. We use satellite weather data for your postcode and, where we can find your house, the shape, direction and shading of your actual roof. The price is a range, and your free survey gives the fixed figure.' },
  { id: 'Q/02', q: 'Do I need planning permission?', a: 'For most homes solar is permitted development, so no. Listed buildings, conservation areas and some commercial sites are exceptions, and we confirm this at survey.' },
  { id: 'Q/03', q: 'What is G99, and will you handle it?', a: 'G98 and G99 are the rules for connecting solar to the grid. A single-phase system with an inverter up to 3.68 kW just needs your network operator told after the install (G98). Anything bigger needs their approval before we install (G99). Either way, we handle the application for you.' },
  { id: 'Q/04', q: 'What happens on the survey?', a: 'We visit, look at your roof, shading, electrics and meter, talk through your options and give you a fixed price in writing. It is free, with no obligation and no pushy sales.' },
  { id: 'Q/05', q: 'Can I add a battery later?', a: 'Yes. We fit a GoodWe hybrid inverter on home systems, so it is ready for a battery whether or not you fit one now. If you already have solar, we can add a battery on its own.' },
  { id: 'Q/06', q: 'What warranties come with GoodWe kit?', a: `GoodWe’s own manufacturer warranty covers the inverter and battery. The length depends on the model, and we put the exact terms in your quote.${s.workmanshipYears > 0 ? ` Our workmanship is covered for ${s.workmanshipYears} years.` : ''}` },
  { id: 'Q/07', q: 'How long does the install take?', a: 'Usually one to two days for a home system. The grid application, which we handle, runs alongside the planning of your install.' },
  { id: 'Q/08', q: 'What happens to my details?', a: 'Only what you choose to send us. We use your details to send you your quote and reply to your enquiry. We only message you on WhatsApp if you say that is OK. See our privacy policy.' },
];

const MORE = [
  { key: 'battery', title: 'Battery storage', text: 'Keep the daytime solar you do not use and spend it in the evening.', add: 'battery' as const },
  { key: 'heatpump', title: 'Heat pumps', text: 'Warm your home with electricity. A £7,500 Boiler Upgrade Scheme grant is available in England and Wales.', add: 'heatpump' as const },
  { key: 'ev', title: 'EV chargers', text: 'Charge your car at home, from your own solar when the sun is out.', add: 'ev' as const },
  { key: 'retrofit', title: 'Battery for existing solar', text: 'Already have panels? A battery on its own makes more of what you already generate.', add: 'battery' as const },
];

function Brands({ logos }: { logos: BrandLogo[] }) {
  return (
    <section className="sec est-brands" aria-labelledby="est-brands-h">
      <div className="wrap">
        <div className="sec-head center">
          <Eyebrow>Brands we install</Eyebrow>
          <h2 id="est-brands-h">Trusted technology, fitted properly</h2>
        </div>
        <ul className="est-brands__row">
          {logos.map((b, i) => (
            <li key={b.name} className={i === 0 ? 'est-brands__first' : ''}>
              {b.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.img} alt={brandAlt(b)} height={40} loading="lazy" decoding="async" />
              ) : (
                <span className="est-brands__name">{b.name}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The rest of the page under the estimator: what we handle, the award, the brands, more than solar, why now, finance, questions, the last call to action. */
export function EstimatorExtras({ settings, logos }: { settings: EstimatorSettings; logos: BrandLogo[] }) {
  const notices = liveNotices(settings.notices);
  const f = settings.finance;
  // The representative example (only when the admin has switched figures on and given a rate): a typical home system, at the middle price.
  const eg = f.figuresOn ? homePrice(settings, 10, { batteryKwh: settings.batteries.find((b) => b.active)?.kwh ?? 0 }) : null;
  const loan = eg ? Math.round(eg.mid / 50) * 50 : 0;
  const monthly = eg ? monthlyPayment(loan, f.aprPct, f.termYears) : 0;
  const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
  const questions = faqs(settings);
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })),
  };
  return (
    <>
      <section className="sec est-handle" aria-labelledby="est-handle-h">
        <div className="wrap">
          <div className="sec-head center reveal">
            <Eyebrow>What we handle for you</Eyebrow>
            <h2 id="est-handle-h">From the first visit to your first bill</h2>
            <p>One team does all of it, so there is nothing for you to chase.</p>
          </div>
          <ol className="est-tl">
            {TIMELINE.map((s, i) => (
              <li key={s.title} className="reveal">
                <span className="est-tl__n">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="est-cta-row">
            <ToEstimator from="timeline">Get my estimate</ToEstimator>
            <Link className="btn est-btn-line" href="/book-a-survey?type=solar">
              Book my free survey
            </Link>
          </div>
        </div>
      </section>

      {settings.award.on && (
        <section className="sec est-award" aria-label="GoodWe award">
          <div className="wrap est-award__in">
            {settings.award.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.award.imageUrl} alt={settings.award.title || 'GoodWe award'} width={140} height={140} loading="lazy" />
            )}
            <div>
              {settings.award.title && <h2>{settings.award.title}</h2>}
              <p>{settings.award.wording}</p>
              {settings.award.link && (
                <a className="est-link" href={settings.award.link} target="_blank" rel="noopener noreferrer">
                  Read more from GoodWe
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <Brands logos={logos} />

      <section className="sec est-more" aria-labelledby="est-more-h">
        <div className="wrap">
          <div className="sec-head center reveal">
            <Eyebrow>More than solar</Eyebrow>
            <h2 id="est-more-h">Add it to your quote</h2>
          </div>
          <div className="est-more__grid">
            {MORE.map((m) => (
              <div key={m.key} className="vcard reveal">
                <h3>{m.title}</h3>
                <p>{m.text}</p>
                <div className="est-more__acts">
                  <AddToQuote what={m.add}>Add to my quote</AddToQuote>
                  <Link className="est-link" href="/#services">
                    Learn more
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {notices.length > 0 && (
        <section className="est-why" aria-label="Why now">
          <div className="wrap est-why__in">
            {notices.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        </section>
      )}

      {(f.askOn || eg) && (
        <section className="sec est-finance" aria-labelledby="est-fin-h">
          <div className="wrap">
            <div className="sec-head center">
              <Eyebrow>Paying monthly</Eyebrow>
              <h2 id="est-fin-h">{eg ? `From ${gbp(monthly)} a month` : 'Ask us about paying monthly'}</h2>
              {f.askOn && <p>Ask us about paying monthly, including the Government&rsquo;s Warm Homes Loan.</p>}
            </div>
            {eg && (
              <p className="est-finance__eg">
                Representative example: borrowing {gbp(loan)} over {f.termYears} years at {f.aprPct}% APR representative, you would pay {gbp(monthly)} a month and {gbp(monthly * f.termYears * 12)} in total. Subject to status.
              </p>
            )}
            <div className="est-cta-row">
              <Link className="btn btn-solar" href="/book-a-call">
                Ask us about it
              </Link>
              {f.link && (
                <a className="btn est-btn-line" href={f.link} target="_blank" rel="noopener noreferrer">
                  The official scheme page
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="sec">
        <div className="wrap">
          <div className="sec-head center reveal">
            <Eyebrow>How the estimator works</Eyebrow>
            <h2>Real data about your roof, not a rule of thumb</h2>
            <p>Most online calculators guess from a postcode. We look at your building.</p>
          </div>
          <div className="vgrid est-three">
            <div className="vcard reveal">
              <h3>1. We find your roof</h3>
              <p>Pick your address and we study aerial imagery and height data to find each face of your roof, its direction, its pitch and its shade.</p>
            </div>
            <div className="vcard reveal d1">
              <h3>2. We measure the sunshine</h3>
              <p>Europe’s PVGIS satellite data gives the yearly output for your exact location, roof direction and pitch.</p>
            </div>
            <div className="vcard reveal d2">
              <h3>3. We work out your numbers</h3>
              <p>Your electricity use and who is home in the day set the size, the saving and the payback, with and without a battery.</p>
            </div>
          </div>
        </div>
      </section>

      <FaqAccordion items={questions} eyebrow="About the estimator" title="Questions people ask" />
      <p className="est-talk est-talk--page">
        Still unsure? Call <a href="tel:01633965205">{PHONE}</a> or{' '}
        <a href={whatsappHref('Hi Heliaxis, I have a question about solar.')} target="_blank" rel="noopener noreferrer">
          WhatsApp us
        </a>
        .
      </p>
      <CtaBand
        variant="solar"
        eyebrow="Step one is free"
        title="Ready for exact figures?"
        text="Book a free survey. We come to you, look at your roof and give a fixed price. No obligation."
        primary={{ label: 'Book a free survey', href: '/book-a-survey?type=solar' }}
        secondary={{ label: 'Get a quote in a minute', href: '/get-a-quote' }}
      />
      <SiteFooter />
      <ScrollReveal />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    </>
  );
}
