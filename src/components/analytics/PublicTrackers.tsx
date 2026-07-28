'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { isTrackableAnalyticsPath } from '@/lib/analytics-paths';
import { ClickHeatmapTracker } from '@/components/analytics/ClickHeatmapTracker';
import { UmamiScript } from '@/components/analytics/UmamiScript';

/**
 * Loads Umami + GA + click heatmap collector on public/user pages.
 * /admin, /login, /register, /pending, /preview never get trackers.
 */
export function PublicTrackers() {
  const pathname = usePathname();
  const isPublic = isTrackableAnalyticsPath(pathname || '');

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
      <ClickHeatmapTracker />
    </>
  );
}
