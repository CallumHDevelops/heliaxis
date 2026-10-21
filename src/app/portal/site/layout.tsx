import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './site.css';

export const metadata: Metadata = {
  title: 'Heliaxis Site',
  robots: { index: false, follow: false },
  manifest: '/portal/site/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Heliaxis Site', statusBarStyle: 'default' },
  icons: { apple: '/apple-touch-icon.png' },
};

// Light only: it's read in sunlight.
export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#211F18',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** The site app for trades (src/app/portal/site/ui/SiteApp.tsx). Every page is the same shell: the job data lives on the phone. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <div className="sa">{children}</div>;
}
