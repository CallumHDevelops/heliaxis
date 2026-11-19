'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { isTrackableAnalyticsPath } from '@/lib/analytics-paths';
import { ClickHeatmapTracker } from '@/components/analytics/ClickHeatmapTracker';
import { CookieBanner, useConsent } from '@/components/analytics/CookieBanner';
import { UmamiScript } from '@/components/analytics/UmamiScript';

const GA_ID = 'G-6LLJCP5HG6';

/**
 * The first touch of this visit, for enquiries from visitors who haven't accepted cookies: only the site that sent them
 * (its host) and the page they landed on, in session storage (gone when the tab closes, never a cookie). The forms send it
 * with the enquiry so Search can tell organic leads from the rest (src/lib/attribution.ts parseFirstTouch).
 */
function rememberFirstTouch() {
  try {
    if (sessionStorage.getItem('hx_ft')) return;
    let r = '';
    try {
      const h = document.referrer ? new URL(document.referrer).hostname : '';
      if (h && h !== window.location.hostname) r = h;
    } catch {
      /* no referrer */
    }
    sessionStorage.setItem('hx_ft', JSON.stringify({ r, p: window.location.pathname.slice(0, 120), t: Date.now() }));
  } catch {
    /* storage blocked: nothing kept */
  }
}
if (typeof window !== 'undefined') rememberFirstTouch();

/**
 * Loads Umami + click heatmap collector (no cookies) and the cookie banner on public/user pages, and
 * Google Analytics only once the visitor has accepted cookies.
 * /admin, /login, /register, /pending, /preview and the personal /my/ and /book/ links never get trackers.
 */
export function PublicTrackers() {
  const pathname = usePathname();
  const isPublic = isTrackableAnalyticsPath(pathname || '');
  const consent = useConsent();

  // GA already loaded earlier in this visit stays quiet after a Reject, and on any personal link
  // reached by a client-side navigation.
  useEffect(() => {
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = !isPublic || consent !== 'yes';
  }, [isPublic, consent]);

  if (!isPublic) return null;

  return (
    <>
      {consent === 'yes' && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="google-analytics-public" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { send_page_view: true });
            `}
          </Script>
        </>
      )}
      <UmamiScript />
      <ClickHeatmapTracker />
      <CookieBanner consent={consent} />
    </>
  );
}
