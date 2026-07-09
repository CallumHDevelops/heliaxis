import type { Metadata } from 'next';
import './brand.css';
import { BrandContent } from './BrandContent';

export const metadata: Metadata = {
  title: 'Heliaxis Brand Guidelines',
  description:
    'Brand guidelines for Heliaxis — logo, colour palette, typography, iconography, social media templates, and usage rules.',
};

export default function BrandPage() {
  return <BrandContent />;
}
