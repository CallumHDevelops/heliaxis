/** CRM pipeline and labels. Safe for server and client code. */

export const STAGES = [
  { key: 'lead', label: 'Lead', group: 'sales' },
  { key: 'contacted', label: 'Contacted', group: 'sales' },
  { key: 'survey_booked', label: 'Survey booked', group: 'sales' },
  { key: 'surveyed', label: 'Surveyed', group: 'sales' },
  { key: 'quote_sent', label: 'Quote sent', group: 'sales' },
  { key: 'won', label: 'Won', group: 'delivery' },
  { key: 'install_booked', label: 'Install booked', group: 'delivery' },
  { key: 'installing', label: 'Installing', group: 'delivery' },
  { key: 'complete', label: 'Complete', group: 'done' },
  { key: 'lost', label: 'Lost', group: 'done' },
] as const;

export type StageKey = (typeof STAGES)[number]['key'];
export const STAGE_KEYS = STAGES.map((s) => s.key) as StageKey[];
export const stageLabel = (k: string) => STAGES.find((s) => s.key === k)?.label ?? k;
/** The customer portal only exists once the job has started (Won onwards). */
export const PORTAL_STAGES: readonly string[] = ['won', 'install_booked', 'installing', 'complete'];
export const portalOpen = (stage: string | null | undefined) => !!stage && PORTAL_STAGES.includes(stage);
export const PORTAL_CLOSED_MSG = 'The customer portal opens when the job starts — move the opportunity to Won first.';
export const isStage = (k: unknown): k is StageKey => typeof k === 'string' && (STAGE_KEYS as string[]).includes(k);

export const PRODUCTS = [
  { key: 'solar', label: 'Solar PV' },
  { key: 'battery', label: 'Battery' },
  { key: 'heatpump', label: 'Heat pump' },
  { key: 'ev', label: 'EV charger' },
  { key: 'infrared', label: 'Infrared heating' },
  { key: 'led', label: 'LED lighting' },
  { key: 'other', label: 'Other' },
] as const;
export const PRODUCT_KEYS = PRODUCTS.map((p) => p.key) as string[];
export const productLabel = (k: string) => PRODUCTS.find((p) => p.key === k)?.label ?? k;

export const PHOTO_CATEGORIES = [
  { key: 'survey', label: 'Survey' },
  { key: 'site', label: 'Site' },
  { key: 'progress', label: 'Progress' },
  { key: 'snag', label: 'Snags' },
  { key: 'completion', label: 'Completion' },
  { key: 'other', label: 'Other' },
] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]['key'];
export const PHOTO_KEYS = PHOTO_CATEGORIES.map((c) => c.key) as string[];
export const photoLabel = (k: string) => PHOTO_CATEGORIES.find((c) => c.key === k)?.label ?? k;

export const ACTIVITY_KINDS = ['note', 'call', 'visit', 'email'] as const;
export const ACTIVITY_LABEL: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  visit: 'Site visit',
  email: 'Email',
  stage: 'Stage',
  photo: 'Photos',
  system: 'Update',
  whatsapp: 'WhatsApp',
};

export function money(v: number | null | undefined) {
  if (v == null || !Number.isFinite(Number(v))) return '';
  return Number(v).toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
}

/** Products from an enquiry's free-text interest ("Solar PV Installation, Battery Storage"). */
export function guessProducts(interest: string | null | undefined): string[] {
  const s = (interest || '').toLowerCase();
  const out: string[] = [];
  if (/solar|\bpv\b/.test(s)) out.push('solar');
  if (/batter/.test(s)) out.push('battery');
  if (/heat ?pump|ashp|air source/.test(s)) out.push('heatpump');
  if (/infrared/.test(s)) out.push('infrared');
  if (/\bev\b|charger/.test(s)) out.push('ev');
  if (/\bled\b|lighting/.test(s)) out.push('led');
  return out;
}
