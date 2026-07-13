'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { isTrackableAnalyticsPath } from '@/lib/analytics-paths';
import { UmamiScript } from '@/components/analytics/UmamiScript';
import { ClarityScript } from '@/components/analytics/ClarityScript';

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Loads Umami + Clarity + GA only on public/user pages.
 * /admin, /login, /register, /pending, /preview never get trackers.
 */
export function PublicTrackers() {
  const pathname = usePathname();
  const isPublic = isTrackableAnalyticsPath(pathname || '');

  useEffect(() => {
    try {
      if (isPublic) {
        // Resume after leaving admin (stop() is avoided — it kills Clarity until reload)
        window.clarity?.('consent', true);
        window.clarity?.('set', 'area', 'public');
      } else {
        window.clarity?.('consent', false);
        window.clarity?.('set', 'area', 'admin');
      }
    } catch {
      /* ignore */
    }
  }, [isPublic]);

  if (!isPublic) return null;

  return (
    <>
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-6LLJCP5HG6"
        strategy="afterInteractive"
      />
      <Script id="google-analytics-public" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-6LLJCP5HG6', { send_page_view: true });
        `}
      </Script>
      <UmamiScript />
      <ClarityScript />
    </>
  );
}
