import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { INK_BAR } from '@/lib/theme/routes';
import './site.css';
import './form.css';
import './electrician.css';

export const metadata: Metadata = {
  title: 'Heliaxis Site',
  robots: { index: false, follow: false },
  manifest: '/portal/site/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Heliaxis Site', statusBarStyle: 'default' },
  icons: { apple: '/apple-touch-icon.png' },
};

// color-scheme comes from the root layout, which follows the person's Light / Dark / Match phone
// choice (src/lib/theme). The status bar is the ink top bar in both themes; said here too because the
// home and offline shell are built ahead of time, with no request for the root to read.
export const viewport: Viewport = {
  themeColor: INK_BAR[0],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** The site app for trades (src/app/portal/site/ui/SiteApp.tsx). Every page is the same shell: the job data lives on the phone. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <div className="sa">{children}</div>;
}
