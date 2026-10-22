import type { Metadata } from 'next';
import Link from 'next/link';
import '../home.css';
import './case-studies.css';
import { SiteFooter } from '@/components/home/SiteFooter';
import { getPublicCaseStudies, type CaseStudyCard } from '@/lib/case-studies';

export const metadata: Metadata = {
  title: 'Solar & Battery Case Studies South Wales | Heliaxis',
  description:
    'Real Heliaxis installations across South Wales: system specifications, installation details, and measured or clearly labelled estimated results.',
};

export const dynamic = 'force-dynamic';

function Card({ cs }: { cs: CaseStudyCard }) {
  return (
    <li>
      <Link href={cs.slug} className="cs-card">
        <div className="cs-card-media">
          {cs.image ? (
            // CMS images may be data: URIs or any remote host, so a plain img (not next/image).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cs.image.src} alt={cs.image.alt} loading="lazy" decoding="async" />
          ) : (
            <span className="cs-card-ph" aria-hidden="true" />
          )}
        </div>
        <div className="cs-card-body">
          {cs.tags.length > 0 && (
            <ul className="cs-tags" aria-label="Project type">
              {cs.tags.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <h2>{cs.title}</h2>
          {cs.summary && <p>{cs.summary}</p>}
          <span className="cs-card-more">
            Read the case study <span aria-hidden="true">→</span>
          </span>
        </div>
      </Link>
    </li>
  );
}

export default async function CaseStudiesPage() {
  const studies = await getPublicCaseStudies();

  return (
    <>
      <section className="cs-hero">
        <div className="wrap">
          <span className="eyebrow on-dark">Our work</span>
          <h1>
            Real installations, <span className="y">real evidence.</span>
          </h1>
          <p className="lead">
            Solar, battery and energy projects we have designed and installed across South Wales — with the system
            specification, how the installation went, and results that are clearly labelled as measured or estimated.
          </p>
          <div className="cs-hero-btns">
            <Link className="btn btn-solar" href="/book-a-survey">
              Get a quote
            </Link>
            <Link className="btn btn-light" href="/solar-estimator">
              Estimate my savings
            </Link>
          </div>
        </div>
      </section>

      <section className="cs-list">
        <div className="wrap">
          {studies.length > 0 ? (
            <ul className="cs-grid">
              {studies.map((cs) => (
                <Card key={cs.slug} cs={cs} />
              ))}
            </ul>
          ) : (
            <div className="cs-empty">
              <h2>Case studies are on their way</h2>
              <p>
                We are writing up recent installations with full specifications and results. In the meantime, book a
                free survey and we will talk you through projects similar to yours.
              </p>
              <Link className="btn btn-solar" href="/book-a-survey">
                Book a free survey
              </Link>
            </div>
          )}
          <p className="cs-note">
            Results depend on each property, its energy use, tariffs and the weather. Where a figure is an estimate or
            projection, the case study says so and explains how it was worked out.
          </p>
        </div>
      </section>

      <section className="cs-cta">
        <div className="wrap">
          <h2>Want to know what solar could do for your property?</h2>
          <p>A free, no-obligation survey — and a design based on your roof and how you use energy.</p>
          <div className="cs-hero-btns">
            <Link className="btn btn-solar" href="/book-a-survey">
              Book a free survey
            </Link>
            <a className="btn btn-ghost cs-ghost" href="tel:01633965205">
              Call 01633 965205
            </a>
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
