/** Meta Pixel events from the browser. A no-op unless the Pixel is loaded, which only happens after the visitor accepted cookies. Never throws. */
type Fbq = (action: 'track' | 'trackCustom', event: string, data?: Record<string, unknown>, options?: { eventID?: string }) => void;

export function pixel(event: string, data?: Record<string, unknown>, eventID?: string) {
  try {
    const fbq = (window as unknown as { fbq?: Fbq }).fbq;
    fbq?.('track', event, data, eventID ? { eventID } : undefined);
  } catch {
    // Tracking must never break the page.
  }
}
