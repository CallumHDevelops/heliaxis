/**
 * Where a website visitor came from (ad click → enquiry). Once the visitor accepts cookies, the
 * landing they arrived on (POST /api/attr) and any later paid/tagged landing (the middleware) are kept
 * in a first-party cookie; /api/quote reads it so every form's enquiries are labelled without each
 * form having to pass anything. Without consent there's no cookie: the browser keeps only the referrer and
 * landing page in session storage (hx_ft) and the forms send it with the enquiry, so its channel is still known.
 */
import { classifyChannel, referrerHost } from '@/lib/search/channel';

export const ATTR_COOKIE = 'hx_attr';
export const ATTR_MAX_AGE = 60 * 60 * 24 * 60; // 60 days

/** The visitor's cookie choice ('yes' | 'no'). Strictly necessary (it only remembers the choice), so it needs no consent. */
export const CONSENT_COOKIE = 'hx_consent';
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180; // 180 days
export const hasConsent = (value: string | null | undefined) => value === 'yes';

/** How hx_attr is set (middleware and /api/attr). httpOnly: only the server reads it. */
export const attrCookieOptions = () => ({
  maxAge: ATTR_MAX_AGE,
  path: '/',
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
});

export type Attribution = {
  s?: string; // utm_source
  m?: string; // utm_medium
  c?: string; // utm_campaign
  a?: string; // utm_content (the ad)
  fb?: 1; // arrived with fbclid (any Meta ad click)
  fbc?: string; // Meta click id in fbc format, for the Conversions API
  g?: 1; // arrived with gclid (Google Ads)
  p?: string; // landing path
  t?: number; // when (ms)
  r?: string; // referrer host on arrival ("google.co.uk"), when another site sent them
  ch?: string; // channel (src/lib/search/channel.ts), worked out when recorded
};

const clip = (v: string | null) => (v ? v.slice(0, 120) : undefined);

/**
 * From a landing URL and the page that sent the visitor; null when neither is worth recording. A tagged landing (UTM, an
 * ad click) always counts; an untagged one counts when another site sent them (Google, Bing, an AI assistant, a referral).
 */
export function attributionFromUrl(url: URL, referrer?: string | null): Attribution | null {
  const q = url.searchParams;
  const a: Attribution = {
    s: clip(q.get('utm_source')),
    m: clip(q.get('utm_medium')),
    c: clip(q.get('utm_campaign')),
    a: clip(q.get('utm_content')),
    ...(q.get('fbclid') ? { fb: 1 as const, fbc: `fb.1.${Date.now()}.${q.get('fbclid')!.slice(0, 200)}` } : {}),
    ...(q.get('gclid') ? { g: 1 as const } : {}),
  };
  const r = referrerHost(referrer, url.host) ?? undefined;
  if (!a.s && !a.fb && !a.g && !r) return null;
  const out: Attribution = { ...a, ...(r ? { r } : {}), p: url.pathname.slice(0, 120), t: Date.now() };
  return { ...out, ch: classifyChannel(out) };
}

/** Tagged by a campaign or ad (rather than only a referrer)? A tagged landing replaces an earlier first touch. */
export const isTagged = (a: Attribution | null) => !!(a && (a.s || a.fb || a.g));

/**
 * Without cookie consent the browser keeps the first touch in session storage ("hx_ft", never a cookie) and the forms send
 * it with the enquiry. Read defensively: it comes from the browser.
 */
export function parseFirstTouch(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 120) : undefined);
  const r = str(o.r)?.toLowerCase().replace(/^www\./, '');
  const p = str(o.p);
  const t = typeof o.t === 'number' && Number.isFinite(o.t) ? o.t : undefined;
  if (!r && !p) return null;
  const a: Attribution = { ...(r ? { r } : {}), ...(p ? { p } : {}), ...(t ? { t } : {}) };
  return { ...a, ch: classifyChannel(a) };
}

export function parseAttribution(raw: string | undefined | null): Attribution | null {
  if (!raw) return null;
  try {
    const a = JSON.parse(decodeURIComponent(raw));
    return a && typeof a === 'object' ? (a as Attribution) : null;
  } catch {
    return null;
  }
}

const META = /^(facebook|fb|instagram|ig|meta|an|messenger)$/i;

/** The enquiry's source label, e.g. "meta-ad: Solar Oct 2026", "google-ads: Brand", "newsletter". */
export function sourceLabel(a: Attribution | null): string | null {
  if (!a) return null;
  const campaign = [a.c, a.a].filter(Boolean).join(' / ');
  const withCampaign = (k: string) => (campaign ? `${k}: ${campaign}` : k);
  if (a.fb || (a.s && META.test(a.s))) return withCampaign('meta-ad');
  if (a.g || (a.s && /^google$/i.test(a.s) && /cpc|ppc|paid/i.test(a.m || ''))) return withCampaign('google-ads');
  if (a.s) return withCampaign(a.s.toLowerCase());
  return null;
}
