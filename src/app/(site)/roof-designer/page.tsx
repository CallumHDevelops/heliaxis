import type { Metadata } from 'next';
import { withSeoOverride } from '@/lib/seo/overrides';
import './roof-designer.css';
import { RoofDesignerApp } from './RoofDesignerApp';

const META: Metadata = {
  title: 'Roof Designer',
  description: 'Draw your roof on the map and see how many solar panels fit, with estimated savings, payback and CO₂ reduction for South Wales.',
};

/** The page's title and description, with any change approved in the SEO report on top. */
export async function generateMetadata(): Promise<Metadata> {
  return withSeoOverride('/roof-designer', META);
}

export default function RoofDesignerPage() {
  return <RoofDesignerApp />;
}
