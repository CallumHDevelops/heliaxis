import type { Metadata } from 'next';
import './solar-estimator.css';
import { readEstimatorSettings } from '@/lib/estimator/settings';
import { SolarEstimatorApp } from './SolarEstimatorApp';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Solar Panel Calculator for South Wales | Heliaxis',
  description: 'Free solar estimator: six quick questions for the system size, yearly saving, cost and payback for your home or business in South Wales, using satellite weather data for your postcode.',
  alternates: { canonical: '/solar-estimator' },
};

export default async function SolarEstimatorPage() {
  return <SolarEstimatorApp settings={await readEstimatorSettings()} roofLookup={!!process.env.GOOGLE_SOLAR_API_KEY} addressPicker={!!process.env.GETADDRESS_API_KEY} />;
}
