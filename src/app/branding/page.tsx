import { readFileSync } from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import { BrandContent } from './BrandContent';
import { BrandGate } from './BrandGate';
import { getBrandPagePassword, canViewBrand } from '@/lib/brand-access';
import './brand-from-html.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Heliaxis Brand Guidelines',
  description:
    'Brand guidelines for Heliaxis — logo, colour palette, typography, iconography, social media templates, and usage rules.',
  robots: { index: false, follow: false },
};

function loadBrandHtml() {
  return readFileSync(
    path.join(process.cwd(), 'src/app/branding/brand-body.html'),
    'utf8',
  );
}

export default async function BrandPage() {
  const configured = !!getBrandPagePassword();

  // Signed-in staff with Branding access (admins always) view it via their
  // backend session — no partner password needed. External partners still use
  // the shared BRAND_PAGE_PASSWORD.
  const allowed = await canViewBrand();

  if (!allowed) {
    return <BrandGate configured={configured} />;
  }

  return <BrandContent html={loadBrandHtml()} />;
}
