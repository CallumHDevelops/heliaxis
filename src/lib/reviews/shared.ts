/**
 * Asking customers for reviews. The same request goes to everyone and the page it opens gives everyone the same choices (Google, Trustpilot, or
 * tell us privately): customers are never asked how happy they are first and then sent to a public site only if they are. That is "review gating",
 * which Google and Trustpilot forbid, and it is why there is no rating question and no incentive on this page. Pure: used by the page, the
 * messages and the tests.
 */
export type ReviewSettings = {
  /** Where "Review us on Google" goes (the Google review link from the Business Profile). */
  googleUrl: string;
  /** Where "Review us on Trustpilot" goes (https://www.trustpilot.com/evaluate/<your domain>). */
  trustpilotUrl: string;
  emailSubject: string;
  emailBody: string;
  smsText: string;
};

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  googleUrl: '',
  trustpilotUrl: '',
  emailSubject: 'How did we do, {first}?',
  emailBody: 'Thank you for choosing Heliaxis. If you have two minutes, a review helps other people deciding who to trust with their roof, and it tells us what we got right and what we can do better.\n\nYou can review us on Google or Trustpilot, or tell us privately if you would rather. Whatever you say, we would like to hear it.',
  smsText: 'Hi {first}, thanks for choosing Heliaxis. If you have two minutes, we would really value your feedback: {link}  Thank you.',
};

const https = (v: unknown) => {
  const s = String(v ?? '').trim().slice(0, 500);
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
};
const text = (v: unknown, n: number, fallback: string) => {
  const s = String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
  return s || fallback;
};

export function cleanReviewSettings(v: unknown): ReviewSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    googleUrl: https(o.googleUrl),
    trustpilotUrl: https(o.trustpilotUrl),
    emailSubject: text(o.emailSubject, 120, DEFAULT_REVIEW_SETTINGS.emailSubject),
    emailBody: text(o.emailBody, 1500, DEFAULT_REVIEW_SETTINGS.emailBody),
    smsText: text(o.smsText, 320, DEFAULT_REVIEW_SETTINGS.smsText),
  };
}

/** "{first}" and "{link}" filled in. */
export const fillTemplate = (t: string, v: { first: string; link: string }) => t.replace(/\{first\}/g, v.first || 'there').replace(/\{link\}/g, v.link);

export const reviewLink = (site: string, token: string) => `${site.replace(/\/$/, '')}/review/${token}`;

/** The Google "write a review" link for a Place ID, for people who only have the ID. */
export const googleReviewFromPlaceId = (placeId: string) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId.trim())}`;

export type ReviewRequestRow = {
  id: string;
  token: string;
  enquiry_id: string;
  project_id: string | null;
  channel: 'email' | 'sms' | 'whatsapp' | 'link';
  sent_at: string;
  opened_at: string | null;
  clicked_google_at: string | null;
  clicked_trustpilot_at: string | null;
  feedback: string | null;
  feedback_at: string | null;
};
