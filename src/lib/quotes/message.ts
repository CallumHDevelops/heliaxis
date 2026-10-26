/** The words that go with a quote: the email and WhatsApp the customer gets, with their portal link. Pure. */

export const firstOf = (name: string) => (name || '').trim().split(/\s+/)[0] || '';

/** The editable message. The link is added under it (a button in the email, a line in WhatsApp). */
export function defaultQuoteMessage(name: string, title: string): string {
  const first = firstOf(name);
  return `Dear ${first || 'customer'},\n\nWe are pleased to send you your quote${title && !/^your heliaxis quote$/i.test(title.trim()) ? ` for ${title.trim()}` : ''}. It sets out what we propose, the price, and our terms.\n\nClick below to access your private portal, where you can view your quote, accept it, or raise a query with us at any time.\n\nKind regards,\nThe Heliaxis team`;
}

export const quoteSubject = 'Your Heliaxis quote';

/** The WhatsApp wording: the message, then the link. */
export const quoteWhatsApp = (message: string, url: string) => `${message.trim()}\n\nClick here to access your portal and view your quote: ${url}`;
