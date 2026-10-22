/**
 * Website conversion events (quote submissions, phone / email / WhatsApp clicks, case-study views).
 * Sent to Umami (cookieless) and, when the visitor has accepted cookies and GA has loaded, to GA4
 * as well. Never throws: analytics must not get in the way of an enquiry.
 */
export type ConversionEvent =
  | 'quote-submit'
  | 'phone-click'
  | 'email-click'
  | 'whatsapp-click'
  | 'case-study-click'
  | 'case-study-view';

export function trackConversion(name: ConversionEvent, data: Record<string, string> = {}) {
  if (typeof window === 'undefined') return;
  const payload = { path: window.location.pathname, ...data };
  try {
    window.umami?.track(name, payload);
  } catch {
    /* ignore */
  }
  try {
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.('event', name.replace(/-/g, '_'), payload);
  } catch {
    /* ignore */
  }
}

/** Classify a clicked link as a conversion, or null. */
export function conversionForHref(href: string): { name: ConversionEvent; data: Record<string, string> } | null {
  const h = href.trim();
  if (/^tel:/i.test(h)) return { name: 'phone-click', data: { number: h.slice(4) } };
  if (/^mailto:/i.test(h)) return { name: 'email-click', data: {} };
  if (/^(https?:)?\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(h)) return { name: 'whatsapp-click', data: {} };
  try {
    const u = new URL(h, window.location.href);
    if (u.origin === window.location.origin && /^\/case-studies(\/|$)/.test(u.pathname)) {
      return { name: 'case-study-click', data: { target: u.pathname } };
    }
  } catch {
    /* not a URL */
  }
  return null;
}
