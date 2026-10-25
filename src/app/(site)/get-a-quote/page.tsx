import type { Metadata } from 'next';
import '../home.css';
import { StepQuoteForm } from '@/components/quote/StepQuoteForm';
import { SiteFooter } from '@/components/home/SiteFooter';
import { Eyebrow } from '@/components/home/Eyebrow';

export const metadata: Metadata = {
  title: 'Get your free quote | Heliaxis',
  description: 'Free, no-obligation quote for solar panels, battery storage, heat pumps and EV chargers in South Wales. Answer a few quick questions and we’ll call within 1 working day.',
  alternates: { canonical: '/get-a-quote' },
};

const tick = (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/** The quote form on its own page: a few quick questions, one at a time. Link ads and buttons here. */
export default async function GetAQuote({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const q = await searchParams;
  return (
    <>
      <main className="sqp">
        <aside className="sqp-brand">
          <svg className="sqp-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {[0, 90, 180, 270].map((a) => (
              <g key={a} transform={`rotate(${a} 12 12)`}>
                <path d="M11 9.6 L13 9.6 L13 0.8 L11 3 Z" />
              </g>
            ))}
          </svg>
          <Eyebrow>Free, no-obligation quote</Eyebrow>
          <h1>Ready to see what you could save?</h1>
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
        </aside>
        <section className="sqp-form" aria-label="Quote request">
          <StepQuoteForm variant="page" initialWho={q.for === 'business' || q.for === 'home' ? q.for : undefined} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
