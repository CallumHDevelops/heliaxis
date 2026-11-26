'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

const ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/**
 * The Meta Pixel. Rendered by PublicTrackers only while the visitor's cookie choice is "yes", so it loads the moment they click Accept and never
 * for someone who rejected. Off until NEXT_PUBLIC_META_PIXEL_ID is set. Fires PageView on load and on each client-side page change; the estimator
 * adds ViewContent and Lead (src/lib/meta-pixel.ts).
 */
export function MetaPixel() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq?.('track', 'PageView');
  }, [pathname]);
  if (!ID || !/^\d{6,20}$/.test(ID)) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${ID}');fbq('track','PageView');`}
    </Script>
  );
}
