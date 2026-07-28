import type { Metadata } from 'next';
import './roof-designer.css';
import { RoofDesignerApp } from './RoofDesignerApp';

export const metadata: Metadata = {
  title: 'Heliaxis — Roof Designer',
  description: 'Draw your roof on the map and see how many solar panels fit, with estimated savings, payback and CO₂ reduction for South Wales.',
};

export default function RoofDesignerPage() {
  return <RoofDesignerApp />;
}
