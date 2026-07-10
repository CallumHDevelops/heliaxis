import type { Metadata } from 'next';
import './home.css';
import {
  Hero,
  ValueGrid,
  ServicesGrid,
  BrandStrip,
  SplitCards,
  EstimatorBand,
  ProcessSteps,
  Testimonials,
  Gallery,
  FinanceSection,
  FaqAccordion,
  QuoteForm,
  FinalCta,
  SiteFooter,
  MobileCta,
  ScrollReveal,
  AnimatedCounters,
} from '@/components/home';
import { findCmsPage, getCmsRendered, hasCmsHomeContent } from '@/lib/cms-rendered';

export const dynamic = 'force-dynamic';

const FALLBACK_METADATA: Metadata = {
  title: 'Solar Panels South Wales | Cut Your Bills with Heliaxis — Free Quote',
  description:
    'MCS-certified solar panel, battery storage, heat pump & EV charger installation across South Wales. Free survey, no obligation. Call 01633 965205.',
};

export async function generateMetadata(): Promise<Metadata> {
  const rendered = await getCmsRendered();
  const page = findCmsPage(rendered, '/');
  if (!hasCmsHomeContent(page) || !page) return FALLBACK_METADATA;
  return {
    title: page.seo?.title || `${page.name} — Heliaxis`,
    description: page.seo?.desc || FALLBACK_METADATA.description,
    robots: page.seo?.noindex ? { index: false, follow: false } : undefined,
  };
}

function MarketingHome() {
  return (
    <>
      <Hero />
      <ValueGrid />
      <ServicesGrid />
      <BrandStrip />
      <SplitCards />
      <EstimatorBand />
      <ProcessSteps />
      <Testimonials />
      <Gallery />
      <FinanceSection />
      <FaqAccordion />
      <QuoteForm />
      <FinalCta />
      <SiteFooter />
      <MobileCta />
      <ScrollReveal />
      <AnimatedCounters />
    </>
  );
}

export default async function HomePage() {
  const rendered = await getCmsRendered();
  const page = findCmsPage(rendered, '/');

  if (rendered && hasCmsHomeContent(page) && page) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: rendered.css }} />
        <div
          className={page.theme === 'dark' ? 'dk' : ''}
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
      </>
    );
  }

  return <MarketingHome />;
}
