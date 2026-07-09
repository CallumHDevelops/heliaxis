import type { Metadata } from 'next';
import './solar-estimator.css';
import { SolarEstimatorApp } from './SolarEstimatorApp';

export const metadata: Metadata = {
  title: 'Heliaxis — Solar Estimator',
  description: 'Estimate your solar system size, annual savings, payback and CO₂ reduction in South Wales with the Heliaxis solar estimator.',
};

export default function SolarEstimatorPage() {
  return <SolarEstimatorApp />;
}
