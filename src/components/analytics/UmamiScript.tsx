'use client';

import Script from 'next/script';

/**
 * Umami pageview tracker — mounted only via PublicTrackers (never on /admin).
 * before-send is a second line of defense for SPA navigations.
 */
export function UmamiScript() {
  const websiteId = (process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '').trim();
  const scriptUrl = (
    process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || 'https://cloud.umami.is/script.js'
  ).trim();
  const domains = (process.env.NEXT_PUBLIC_UMAMI_DOMAINS || '').trim();
  const trackDev = process.env.NEXT_PUBLIC_UMAMI_TRACK_DEV === '1';
  const isDev = process.env.NODE_ENV === 'development';

  if (!websiteId || !scriptUrl) return null;
  if (isDev && !trackDev) return null;

  const domainFilter = isDev && trackDev ? '' : domains;

  return (
    <>
      <Script id="umami-before-send" strategy="afterInteractive">
        {`
          window.__heliaxisUmamiBeforeSend = function (type, payload) {
            try {
              var raw = (payload && payload.url) || (typeof location !== 'undefined' ? location.pathname : '/');
              var path = '/';
              if (typeof raw === 'string' && raw) {
                if (raw.indexOf('http') === 0) path = new URL(raw).pathname || '/';
                else path = String(raw).split('?')[0].split('#')[0] || '/';
              }
              if (path.charAt(0) !== '/') path = '/' + path;

              if (path === '/login' || path === '/register' || path === '/pending' || path === '/preview') return false;
              if (path === '/admin' || path.indexOf('/admin/') === 0) return false;
              if (path.indexOf('/login/') === 0 || path.indexOf('/register/') === 0) return false;
              if (path.indexOf('/pending/') === 0 || path.indexOf('/preview/') === 0) return false;
              if (path.indexOf('/api/') === 0) return false;

              return payload;
            } catch (e) {
              return false;
            }
          };
        `}
      </Script>
      <Script
        src={scriptUrl}
        data-website-id={websiteId}
        data-before-send="__heliaxisUmamiBeforeSend"
        {...(domainFilter ? { 'data-domains': domainFilter } : {})}
        strategy="afterInteractive"
      />
    </>
  );
}
