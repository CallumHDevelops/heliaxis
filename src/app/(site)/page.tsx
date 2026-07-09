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

export const metadata: Metadata = {
  title: 'Solar Panels South Wales | Cut Your Bills with Heliaxis — Free Quote',
  description:
    'MCS-certified solar panel, battery storage, heat pump & EV charger installation across South Wales. Free survey, no obligation. Call 01633 965205.',
};

export default function HomePage() {
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
