import '../home.css';
import { BrandStrip, CtaBand, FaqAccordion, ProcessSteps, ScrollReveal, SiteFooter, Testimonials, ValueGrid } from '@/components/home';
import { Eyebrow } from '@/components/home/Eyebrow';
import type { Faq } from '@/components/home/FaqAccordion';

const FAQS: Faq[] = [
  { id: 'Q/01', q: 'How accurate is the estimate?', a: 'It is a good guide, not a quote. We use satellite weather data for your postcode and, where we can find your house, the shape, direction and shading of your actual roof. Prices are indicative and your free survey gives the fixed figure.' },
  { id: 'Q/02', q: 'How do you find my roof?', a: 'You pick your address and we look at aerial imagery and height data of your building, then work out each roof face, which way it points, how steep it is and how much shade it gets. If we cannot find your roof, you answer two quick questions instead.' },
  { id: 'Q/03', q: 'What does solar cost, and how long does it take to pay back?', a: 'The estimate shows an installed price range and a payback range for your home. Prices depend on the size of the system, your roof and whether you add a battery. A survey confirms the exact price before you decide anything.' },
  { id: 'Q/04', q: 'Is a battery worth adding?', a: 'A battery stores daytime solar for the evening, so you use more of what you make. The estimate shows the difference for your usage, so you can compare solar on its own with solar and a battery.' },
  { id: 'Q/05', q: 'What do I get paid for the power I export?', a: 'Under the Smart Export Guarantee, energy suppliers pay for the surplus you send to the grid. Rates vary by supplier, from a few pence to around fifteen pence per kWh, so the estimate lets you change the rate.' },
  { id: 'Q/06', q: 'Will I need planning permission?', a: 'For most homes solar is permitted development, so no. Listed buildings, conservation areas and some commercial sites are exceptions, and we confirm this at survey.' },
  { id: 'Q/07', q: 'What happens to my details?', a: 'Only what you choose to send us. We use your details to reply to your enquiry, and we only message you on WhatsApp if you say that is OK. See our privacy policy.' },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

/** The rest of the page under the estimator: how it works, the brands we fit, why Heliaxis, how an install goes, reviews, questions. */
export function EstimatorExtras() {
  return (
    <>
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
      <BrandStrip />
      <ValueGrid />
      <ProcessSteps />
      <Testimonials />
      <FaqAccordion items={FAQS} eyebrow="About the estimator" title="Questions people ask" />
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
