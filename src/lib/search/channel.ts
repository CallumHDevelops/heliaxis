/**
 * Which channel an enquiry came from (spec M8), in this order: paid Meta (fbclid), paid Google (gclid), the Google
 * Business Profile (utm_campaign=gbp on its website link), AI assistants (by referrer or utm_source=chatgpt.com),
 * organic Google, organic Bing, other referrals, then direct. Pure: safe for middleware, server and client code.
 */

export const CHANNELS = ['paid_meta', 'paid_google', 'gbp', 'ai_assistant', 'organic_google', 'organic_bing', 'referral', 'direct'] as const;
export type Channel = (typeof CHANNELS)[number];

/** The channels Search counts as "organic enquiries" on the Overview. */
export const ORGANIC_CHANNELS: Channel[] = ['organic_google', 'organic_bing', 'gbp', 'ai_assistant'];

export const CHANNEL_LABEL: Record<Channel, string> = {
  paid_meta: 'Meta ads',
  paid_google: 'Google Ads',
  gbp: 'Business Profile',
  ai_assistant: 'AI assistants',
  organic_google: 'Google search',
  organic_bing: 'Bing search',
  referral: 'Other websites',
  direct: 'Direct or unknown',
};

const AI_HOSTS = ['chatgpt.com', 'chat.openai.com', 'perplexity.ai', 'gemini.google.com', 'copilot.microsoft.com', 'claude.ai', 'you.com', 'meta.ai'];
const OUR_HOSTS = ['heliaxis.co.uk'];
const META_SOURCE = /^(facebook|fb|instagram|ig|meta|an|messenger)$/i;

/** "www.google.co.uk" from a full referrer URL; null for none, our own site, or something unreadable. */
export function referrerHost(referrer: string | null | undefined, ownHost?: string | null): string | null {
  if (!referrer) return null;
  try {
    const h = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    if (!h) return null;
    const own = [...OUR_HOSTS, ...(ownHost ? [ownHost.toLowerCase().replace(/^www\./, '').split(':')[0]] : [])];
    if (own.some((o) => h === o || h.endsWith(`.${o}`))) return null;
    return h.slice(0, 120);
  } catch {
    return null;
  }
}

const hostIs = (h: string, d: string) => h === d || h.endsWith(`.${d}`);

export function classifyChannel(a: { fb?: unknown; g?: unknown; s?: string | null; m?: string | null; c?: string | null; r?: string | null } | null | undefined): Channel {
  if (!a) return 'direct';
  const s = (a.s ?? '').toLowerCase();
  const r = (a.r ?? '').toLowerCase().replace(/^www\./, '');
  if (a.fb || (s && META_SOURCE.test(s))) return 'paid_meta';
  if (a.g || (s === 'google' && /cpc|ppc|paid/i.test(a.m ?? ''))) return 'paid_google';
  if ((a.c ?? '').toLowerCase() === 'gbp') return 'gbp';
  if (s === 'chatgpt.com' || AI_HOSTS.some((d) => hostIs(s, d)) || (r && AI_HOSTS.some((d) => hostIs(r, d)))) return 'ai_assistant';
  if (r && /(^|\.)google\.[a-z.]+$/.test(r)) return 'organic_google';
  if (r && (hostIs(r, 'bing.com') || hostIs(r, 'duckduckgo.com') || /(^|\.)search\.yahoo\./.test(r) || hostIs(r, 'ecosia.org'))) return r.includes('bing') ? 'organic_bing' : 'referral';
  if (r) return 'referral';
  if (s) return 'referral';
  return 'direct';
}
