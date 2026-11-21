import type { Metadata } from 'next';
import { withSeoOverride } from '@/lib/seo/overrides';
import './solar-estimator.css';
import './estimator-v3.css';
import { publicSettings } from '@/lib/estimator/calc';
import { readEstimatorSettings } from '@/lib/estimator/settings';
import { SolarEstimatorApp } from './SolarEstimatorApp';
import { EstimatorExtras } from './EstimatorExtras';

export const revalidate = 300;

const META: Metadata = {
  title: 'Solar Panel Calculator for South Wales',
  description: 'Free solar estimator: six quick questions for the system size, yearly saving, cost and payback for your home or business in South Wales, using satellite weather data for your postcode.',
  alternates: { canonical: '/solar-estimator' },
};

/** The page's title and description, with any change approved in the SEO report on top. */
export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride('/solar-estimator', META);
}

export default async function SolarEstimatorPage() {
  return (
    <>
      <SolarEstimatorApp settings={publicSettings(await readEstimatorSettings())} roofLookup={!!process.env.GOOGLE_SOLAR_API_KEY} addressPicker={!!process.env.IDEAL_POSTCODES_API_KEY} />
      <EstimatorExtras />
    </>
  );
}
