/**
 * The first WhatsApp to a new Meta lead, chosen by the ad (the video) they came from: WhatsApp
 * templates → First messages. Whether it goes by itself, how long after the lead comes in, and which
 * template each ad's leads get. An ad with none set gets the general first message (WhatsApp
 * templates → Use for → First message to new Meta leads).
 *
 * Ads get renamed in Ads Manager ("Video 4" → "Valley Vets Off Grid"), so each ad's choice keeps
 * Meta's ids for it as well as its name: a lead matches by its ad's id, else by any name its ad has
 * had. Pure (no imports), so scripts/test-wa-first-messages.mjs loads it straight into node.
 */

/** One ad's first message: `name` the ad's name when it was chosen, `ids` Meta's ids for ads with that name then. */
export type AdMessage = { name: string; ids: string[]; template: string };

export type FirstMessages = {
  /** Send it by itself. WHATSAPP_AUTO_FIRST_MESSAGE=true in Vercel switches it on too, as it always has. */
  auto: boolean;
  /** It goes at a random time this many minutes after the lead comes in (then quiet hours, if they hold it). */
  minMinutes: number;
  maxMinutes: number;
  byAd: AdMessage[];
};

export const DEFAULT_FIRST: FirstMessages = { auto: false, minMinutes: 8, maxMinutes: 13, byAd: [] };

const MAX_ADS = 100;
const MAX_IDS = 50;
const MAX_MINUTES = 120;
const TEMPLATE = /^[a-z0-9_]{1,512}$/;
const AD_ID = /^\d{1,30}$/;

/** "  Video   4 " → "Video 4"; "" for anything that isn't a name. */
export const tidyAdName = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 200) : '');
const norm = (s: string) => tidyAdName(s).toLowerCase();

/** One ad's choice from a page or cms_kv: null when it isn't one (no name, or no template). */
function cleanAd(v: unknown): AdMessage | null {
  const x = (v ?? {}) as Partial<Record<keyof AdMessage, unknown>>;
  const name = tidyAdName(x.name);
  const template = typeof x.template === 'string' ? x.template.trim() : '';
  if (!name || !TEMPLATE.test(template)) return null;
  const ids = Array.isArray(x.ids) ? [...new Set(x.ids.map((id) => String(id ?? '').trim()).filter((id) => AD_ID.test(id)))].slice(0, MAX_IDS) : [];
  return { name, ids, template };
}

/** Ready to use or save: defaults filled in, times in range (the later one never before the earlier), one choice per ad name. */
export function cleanFirst(v: unknown): FirstMessages {
  const b = (v ?? {}) as Partial<Record<keyof FirstMessages, unknown>>;
  const d = DEFAULT_FIRST;
  const minutes = (n: unknown, fallback: number) => {
    // Number(null) and Number('') are 0: a box left empty keeps the default instead.
    const x = n === null || n === '' ? NaN : Number(n);
    return Number.isFinite(x) ? Math.round(Math.min(MAX_MINUTES, Math.max(0, x))) : fallback;
  };
  const min = minutes(b.minMinutes, d.minMinutes);
  const max = Math.max(min, minutes(b.maxMinutes, Math.max(min, d.maxMinutes)));
  const byAd: AdMessage[] = [];
  const seen = new Set<string>();
  for (const x of Array.isArray(b.byAd) ? b.byAd : []) {
    const ad = cleanAd(x);
    if (!ad || seen.has(norm(ad.name))) continue;
    seen.add(norm(ad.name));
    byAd.push(ad);
    if (byAd.length >= MAX_ADS) break;
  }
  return { auto: b.auto === true, minMinutes: min, maxMinutes: max, byAd };
}

/** A lead's ad: Meta's id for it (when known) and the names it's had (when they came in, now). */
export type LeadAd = { id?: string | null; names: (string | null | undefined)[] };

/** The choice for a lead from this ad: by Meta's id, else by any of its names. Null: the general first message. */
export function adMessageFor(byAd: AdMessage[], ad: LeadAd): AdMessage | null {
  const id = ad.id ? String(ad.id) : '';
  if (id) {
    const byId = byAd.find((m) => m.ids.includes(id));
    if (byId) return byId;
  }
  const names = new Set(ad.names.map((n) => norm(n ?? '')).filter(Boolean));
  return byAd.find((m) => names.has(norm(m.name))) ?? null;
}

/** An ad as the First messages list shows it: its name now, the names it had before, and Meta's ids for it. */
export type AdKey = { name: string; was?: string[]; ids: string[] };

/** The choices that are for this ad: any by one of its ids, or by its name now or a name it had. */
export function choicesFor(byAd: AdMessage[], ad: AdKey): AdMessage[] {
  const names = new Set([ad.name, ...(ad.was ?? [])].map(norm).filter(Boolean));
  return byAd.filter((m) => m.ids.some((id) => ad.ids.includes(id)) || names.has(norm(m.name)));
}

/** byAd with this ad's choice set, or with no template taken off. Any earlier choice for it (an older name, say) goes. */
export function withAdMessage(byAd: AdMessage[], ad: AdKey, template: string): AdMessage[] {
  const was = choicesFor(byAd, ad);
  const rest = byAd.filter((m) => !was.includes(m));
  const name = tidyAdName(ad.name);
  if (!template || !name) return rest;
  const ids = [...new Set([...ad.ids, ...was.flatMap((m) => m.ids)].filter((id) => AD_ID.test(id)))].slice(0, MAX_IDS);
  return [...rest, { name, ids, template }];
}

/** "8–13 minutes", "10 minutes", "straight away". */
export function delayWords(f: Pick<FirstMessages, 'minMinutes' | 'maxMinutes'>): string {
  if (f.maxMinutes === 0) return 'straight away';
  if (f.minMinutes === f.maxMinutes) return `${f.minMinutes} minute${f.minMinutes === 1 ? '' : 's'}`;
  return `${f.minMinutes}–${f.maxMinutes} minutes`;
}
