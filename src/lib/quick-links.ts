/** Links to the public booking forms, to drop into a WhatsApp reply or an email. Tagged so the source shows in analytics, and the postcode pre-filled when we have it. */

export type QuickLink = { id: string; label: string; path: string; params?: Record<string, string>; words: string };

export const QUICK_LINKS: QuickLink[] = [
  { id: 'survey', label: 'Book a survey', path: '/book-a-survey', words: 'You can pick a time for a free survey here:' },
  { id: 'call', label: 'Book a call', path: '/book-a-call', words: 'You can pick a time for a call here:' },
  { id: 'video', label: 'Book a video call', path: '/book-a-survey', params: { mode: 'video' }, words: 'You can pick a time for a video call here:' },
  { id: 'quote', label: 'Get a quote', path: '/get-a-quote', words: 'You can get a free quote here, it takes a minute:' },
  { id: 'estimator', label: 'Savings estimator', path: '/solar-estimator', words: 'You can see what solar could save you here:' },
];

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliaxis.co.uk').replace(/\/$/, '');

/** The link and a lead-in sentence, ready to insert. `via` tags where it was sent from (whatsapp, email). */
export function quickLinkText(l: QuickLink, o: { via: 'whatsapp' | 'email'; postcode?: string | null }): string {
  const q = new URLSearchParams({ ...(l.params ?? {}), utm_source: o.via, utm_medium: 'message', utm_campaign: 'crm_quick_link' });
  const pc = (o.postcode || '').replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, 10);
  if (pc && l.path !== '/solar-estimator') q.set('postcode', pc);
  return `${l.words}\n${SITE}${l.path}?${q.toString()}`;
}

/** Add text to a message on its own lines. */
export const appendBlock = (cur: string, add: string) => (cur.trim() ? `${cur.replace(/\s+$/, '')}\n\n${add}` : add);
