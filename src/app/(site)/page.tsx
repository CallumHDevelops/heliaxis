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
  Gallery,
  FinanceSection,
  FaqAccordion,
  QuoteForm,
  CtaBand,
  TALK_LINKS,
  FinalCta,
  SiteFooter,
  MobileCta,
  ScrollReveal,
  AnimatedCounters,
} from '@/components/home';
import { findCmsPage, getCmsRendered, hasCmsHomeContent } from '@/lib/cms-rendered';
import { CmsFormRuntime } from '@/components/cms/CmsFormRuntime';
import { LIVE_FIXES_CSS } from '@/lib/cms-ctas';
import { CmsBody } from '@/components/cms/CmsBody';
import { HOME_TITLE, withoutBrand } from '@/lib/seo/title';

export const dynamic = 'force-dynamic';

const FALLBACK_METADATA: Metadata = {
  title: { absolute: HOME_TITLE },
  description:
    'MCS-certified solar panel, battery storage, heat pump & EV charger installation across South Wales. Free survey, no obligation. Call 01633 965205.',
};

/** The home page's title: the CMS one without the brand, or the standard one when the CMS has only a placeholder ("Home Page"). */
function homeTitle(raw: string): Metadata['title'] {
  const t = withoutBrand(raw);
  return !t || /^home( page)?$/i.test(t) ? { absolute: HOME_TITLE } : t;
}

export async function generateMetadata(): Promise<Metadata> {
  const rendered = await getCmsRendered();
  const page = findCmsPage(rendered, '/');
  if (!hasCmsHomeContent(page) || !page) return FALLBACK_METADATA;
  return {
    title: homeTitle(page.seo?.title || page.name),
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
      <CtaBand
        variant="solar"
        eyebrow="Step one is free"
        title="Book your free home survey"
        text="Pick a time that suits you. We come to you, look at your home and give honest figures. No obligation."
        primary={{ label: 'Book a free survey', href: '/book-a-survey' }}
        secondary={{ label: 'Get a quote in a minute', href: '/get-a-quote' }}
      />
      <Gallery />
      <FinanceSection />
      <FaqAccordion />
      <CtaBand
        variant="paper"
        eyebrow="Still got a question?"
        title="Talk to a real person"
        text="Ring us, book a call or a video chat, or message us on WhatsApp. No pressure, no sales scripts."
        primary={{ label: 'Book a call', href: '/book-a-call' }}
        secondary={{ label: 'Get my free quote', href: '/get-a-quote' }}
        links={TALK_LINKS}
      />
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
        <style dangerouslySetInnerHTML={{ __html: rendered.css + LIVE_FIXES_CSS }} />
        <CmsBody html={page.html} className={page.theme === 'dark' ? 'dk' : ''} ctas />
        <CmsFormRuntime />
      </>
    );
  }

  return <MarketingHome />;
}
