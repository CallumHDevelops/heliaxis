/** Funnel events for the estimator, sent to whichever analytics the page has (Umami, Google). Never throws. Browser only. */
type Win = { umami?: { track?: (e: string, d?: Record<string, unknown>) => void }; gtag?: (...a: unknown[]) => void };

export function track(event: string, data?: Record<string, unknown>) {
  try {
    const w = window as unknown as Win;
    w.umami?.track?.(event, data);
    w.gtag?.('event', event, data);
  } catch {
    // Analytics must never break the page.
  }
}
