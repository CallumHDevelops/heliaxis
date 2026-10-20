import { isMetaSource } from './ad-spend';
import { adNameNow, type AdNameLookup } from './ad-names';

/**
 * Where an enquiry came from (enquiries.source), in plain words, and the four groups the Enquiries
 * list filters by. Pure, so it runs in the browser and in scripts/test-lead-source.mjs.
 *
 * What gets written there:
 *  - Meta: its lead forms "meta: <ad name>", "meta-lead-ad" (the ad wasn't named) and "meta-organic"
 *    (a form not on an ad, src/lib/whatsapp/leads.ts); the website's ad links "meta-ad: <campaign> /
 *    <ad>" or "meta-ad" (src/lib/attribution.ts); "whatsapp-ad", a chat started from an ad.
 *  - Website: the forms' own "quote-form", "cms-form" and "website-booking" (older rows "website"),
 *    and Google ad clicks ("google-ads: <campaign>"), which arrive through the same forms.
 *  - WhatsApp: "whatsapp" (they messaged us) and "whatsapp-import" (an imported chat).
 *  - Other: "crm" (added by staff) and anything else, e.g. a website visit tagged "newsletter".
 */

export type SourceGroup = 'meta' | 'website' | 'whatsapp' | 'other';

/** The Enquiries list's source buttons, in order. */
export const SOURCE_GROUPS: { key: SourceGroup; label: string }[] = [
  { key: 'meta', label: 'Meta' },
  { key: 'website', label: 'Website' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'other', label: 'Other' },
];

const tidy = (s: string | null | undefined) => (s ?? '').trim();
const ORGANIC = /^meta-organic\s*$/i;
const WEBSITE = /^(?:website|website-booking|quote-form|cms-form)?\s*$/i;
const GOOGLE = /^google-ads\s*(?::|$)/i;

/** A lead from Meta: an ad (isMetaSource, as Reports counts them) or one of its forms not on an ad. */
export const isMetaLead = (source: string | null | undefined): boolean => isMetaSource(tidy(source)) || ORGANIC.test(tidy(source));

/** The ad a Meta lead form came from: "Video 4" from "meta: Video 4". Null for anything else. */
export function metaAdName(source: string | null | undefined): string | null {
  const m = /^meta\s*:(.*)$/i.exec(tidy(source));
  return m?.[1].trim() || null;
}

export function sourceGroup(source: string | null | undefined): SourceGroup {
  const s = tidy(source);
  if (isMetaLead(s)) return 'meta';
  if (WEBSITE.test(s) || GOOGLE.test(s)) return 'website';
  if (/^whatsapp(?:-import)?\s*$/i.test(s)) return 'whatsapp';
  return 'other';
}

/** ?source=meta (website, whatsapp, other) on the Enquiries list. Anything else, or nothing, is '' (everyone). */
export function sourceFromParam(v: string | null | undefined): SourceGroup | '' {
  const s = tidy(v).toLowerCase();
  return SOURCE_GROUPS.some((g) => g.key === s) ? (s as SourceGroup) : '';
}

/** "Esther" → "Esther", "newsletter" → "Newsletter". */
const upFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** What follows the colon ("meta-ad: Solar Oct / Video 4" → "Solar Oct / Video 4"), or ''. */
const afterColon = (s: string) => (s.includes(':') ? s.slice(s.indexOf(':') + 1).trim() : '');

/**
 * What a Meta lead's row says about the ad: its name ("Video 4"), "Organic", "WhatsApp ad", the website
 * link's campaign ("Website · Solar Oct"), or "Ad not known" when Meta didn't say. Null for other leads.
 */
export function metaAdLabel(source: string | null | undefined): string | null {
  const s = tidy(source);
  if (!isMetaLead(s)) return null;
  const ad = metaAdName(s);
  if (ad) return ad;
  if (ORGANIC.test(s)) return 'Organic';
  if (/^whatsapp-ad/i.test(s)) return 'WhatsApp ad';
  if (/^meta-ad/i.test(s)) return afterColon(s) ? `Website · ${afterColon(s)}` : 'Website ad link';
  return 'Ad not known';
}

/** Any source in a few plain words: "Meta ad · Video 4", "Meta (organic)", "Website", "WhatsApp"… */
export function leadSourceLabel(source: string | null | undefined): string {
  const s = tidy(source);
  const lower = s.toLowerCase();
  if (isMetaLead(s)) {
    if (ORGANIC.test(s)) return 'Meta (organic)';
    if (/^whatsapp-ad/i.test(s)) return 'Meta ad (WhatsApp)';
    if (/^meta-ad/i.test(s)) return afterColon(s) ? `Meta ad (website) · ${afterColon(s)}` : 'Meta ad (website)';
    const ad = metaAdName(s);
    return ad ? `Meta ad · ${ad}` : 'Meta ad';
  }
  if (lower === 'website-booking') return 'Website booking';
  if (WEBSITE.test(s)) return 'Website';
  if (GOOGLE.test(s)) return afterColon(s) ? `Google ad · ${afterColon(s)}` : 'Google ad';
  if (lower === 'whatsapp') return 'WhatsApp';
  if (lower === 'whatsapp-import') return 'WhatsApp (imported)';
  if (lower === 'crm') return 'Added by staff';
  // A website visit tagged by its link (utm_source), e.g. "newsletter: October".
  const [head, ...rest] = s.split(':');
  const name = upFirst(head.trim()) || 'Other';
  const tail = rest.join(':').trim();
  return tail ? `${name} · ${tail}` : name;
}

/** A lead's source as the CRM shows it, with its Meta ad's name now (sourceNow). */
export type SourceNow = {
  /** "Meta ad · Tim Facts", "Meta (organic)", "Website"… (leadSourceLabel). */
  label: string;
  /** A Meta lead's tag: the ad's name now, "Organic", "WhatsApp ad"… (metaAdLabel). Null for other leads. */
  ad: string | null;
  /** "was Video 1" when the ad has been renamed since they came in. */
  note: string | null;
};

/** Leads a Meta ad's name can be found for: its lead forms (named or not) and WhatsApp chats started from an ad. */
const AD_LEAD = /^(?:meta\s*:|meta-lead-ad\s*$|whatsapp-ad\s*$)/i;
export const isAdLead = (source: string | null | undefined) => AD_LEAD.test(tidy(source));

/**
 * leadSourceLabel and metaAdLabel with the ad's name now: enquiries.source keeps the name the ad had
 * when they came in ("meta: Video 1"), which Ads Manager may have changed since ("Tim Facts"). By the
 * lead's ad id when known (ad-spend.sql), else by the names the CRM has seen (src/lib/ad-names.ts
 * adNameNow). `names` null (none kept yet, or they couldn't be read): the lead's own name.
 */
export function sourceNow(source: string | null | undefined, metaAdId: string | null | undefined, names: AdNameLookup | null): SourceNow {
  const s = tidy(source);
  const plain: SourceNow = { label: leadSourceLabel(s), ad: metaAdLabel(s), note: null };
  if (!names || !isAdLead(s)) return plain;
  const chat = /^whatsapp-ad/i.test(s);
  // A WhatsApp ad chat only has its ad id: Meta doesn't send the ad's name with it.
  const now = adNameNow(names, chat ? null : metaAdName(s), metaAdId);
  if (!now) return plain;
  if (chat) return { label: `Meta ad (WhatsApp) · ${now.name}`, ad: `WhatsApp ad · ${now.name}`, note: null };
  return { label: `Meta ad · ${now.name}`, ad: now.name, note: now.note };
}

/** Leads from one group ('' = everyone), in the order given. */
export function inSource<T extends { src: string }>(leads: T[], group: SourceGroup | ''): T[] {
  return group ? leads.filter((l) => sourceGroup(l.src) === group) : leads;
}

/** How many leads in each group. */
export function sourceCounts(leads: { src: string }[]): Record<SourceGroup, number> {
  const c: Record<SourceGroup, number> = { meta: 0, website: 0, whatsapp: 0, other: 0 };
  for (const l of leads) c[sourceGroup(l.src)]++;
  return c;
}
