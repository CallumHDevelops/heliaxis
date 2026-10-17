/**
 * Where a website visitor came from (ad click → enquiry). The middleware stores the last paid/tagged
 * landing in a first-party cookie; /api/quote reads it so every form's enquiries are labelled
 * without each form having to pass anything.
 */
export const ATTR_COOKIE = 'hx_attr';
export const ATTR_MAX_AGE = 60 * 60 * 24 * 60; // 60 days

export type Attribution = {
  s?: string; // utm_source
  m?: string; // utm_medium
  c?: string; // utm_campaign
  a?: string; // utm_content (the ad)
  fb?: 1; // arrived with fbclid (any Meta ad click)
  g?: 1; // arrived with gclid (Google Ads)
  p?: string; // landing path
  t?: number; // when (ms)
};

const clip = (v: string | null) => (v ? v.slice(0, 120) : undefined);

/** From a landing URL; null when it carries nothing worth recording. */
export function attributionFromUrl(url: URL): Attribution | null {
  const q = url.searchParams;
  const a: Attribution = {
    s: clip(q.get('utm_source')),
    m: clip(q.get('utm_medium')),
    c: clip(q.get('utm_campaign')),
    a: clip(q.get('utm_content')),
    ...(q.get('fbclid') ? { fb: 1 as const } : {}),
    ...(q.get('gclid') ? { g: 1 as const } : {}),
  };
  if (!a.s && !a.fb && !a.g) return null;
  return { ...a, p: url.pathname.slice(0, 120), t: Date.now() };
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
