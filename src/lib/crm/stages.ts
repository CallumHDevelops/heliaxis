/** CRM pipeline and labels. Safe for server and client code. */

export const STAGES = [
  { key: 'lead', label: 'Lead', group: 'sales' },
  { key: 'contacted', label: 'Contacted', group: 'sales' },
  { key: 'survey_booked', label: 'Survey booked', group: 'sales' },
  { key: 'surveyed', label: 'Surveyed', group: 'sales' },
  { key: 'quote_sent', label: 'Quote sent', group: 'sales' },
  { key: 'won', label: 'Won', group: 'delivery' },
  { key: 'design', label: 'Design & approvals', group: 'delivery' },
  { key: 'ready', label: 'Ready to book', group: 'delivery' },
  { key: 'install_booked', label: 'Install booked', group: 'delivery' },
  { key: 'installing', label: 'Installing', group: 'delivery' },
  { key: 'commissioning', label: 'Commissioning', group: 'delivery' },
  { key: 'handover', label: 'Paperwork & handover', group: 'delivery' },
  { key: 'complete', label: 'Complete', group: 'done' },
  { key: 'lost', label: 'Lost', group: 'done' },
] as const;

export type StageKey = (typeof STAGES)[number]['key'];
export const STAGE_KEYS = STAGES.map((s) => s.key) as StageKey[];
/** Staff screens: one name per stage (Won, Lost). */
export const stageLabel = (k: string) => STAGES.find((s) => s.key === k)?.label ?? k;
/** Position in the pipeline (-1 if unknown), for "has it got past …" checks. */
export const stageIndex = (k: string): number => STAGE_KEYS.indexOf(k as StageKey);
export const SALES_STAGES: StageKey[] = ['lead', 'contacted', 'survey_booked', 'surveyed', 'quote_sent'];
export const DELIVERY_STAGES: StageKey[] = ['won', 'design', 'ready', 'install_booked', 'installing', 'commissioning', 'handover'];
/** A project is the job from Won onwards. Keep in step with the trigger in supabase/crm-v3.sql. */
export const PROJECT_STAGES: StageKey[] = [...DELIVERY_STAGES, 'complete'];
/** Where a job can be started from the Projects page ("already in progress" jobs). Sales starts stay on CRM "+ New". */
export const PROJECT_START_STAGES: StageKey[] = ['won', 'design', 'ready', 'install_booked', 'installing'];
export const isProjectStage = (s?: string | null): boolean => !!s && (PROJECT_STAGES as string[]).includes(s);
/** Counts as a sale in reports. */
export const isWonStage = isProjectStage;
/** Customer portal tracker only. Staff screens use stageLabel (Won / Lost). */
export const portalStageLabel = (k: string): string => (k === 'won' ? 'Order confirmed' : stageLabel(k));
/** The full customer portal exists once the job has started (Won onwards). */
export const PORTAL_STAGES: readonly string[] = PROJECT_STAGES;
export const portalOpen = (s?: string | null): boolean => isProjectStage(s);
/** 'quote': the quote-only page while it's waiting to be signed; 'full': the portal from Won onwards. */
export const portalMode = (s?: string | null): 'quote' | 'full' | null => (isProjectStage(s) ? 'full' : s === 'quote_sent' ? 'quote' : null);
export const PORTAL_CLOSED_MSG = 'The customer’s link opens when you send the quote for signing, or when the job is Won.';
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

export const SURVEY_TYPES = [
  { key: 'solar', label: 'Solar panels and battery', short: 'Solar' },
  { key: 'ashp', label: 'Air source heat pump', short: 'Heat pump' },
  { key: 'solar_ashp', label: 'Solar and heat pump', short: 'Solar + heat pump' },
] as const;
export type SurveyTypeKey = (typeof SURVEY_TYPES)[number]['key'];
export const isSurveyType = (k: unknown): k is SurveyTypeKey => k === 'solar' || k === 'ashp' || k === 'solar_ashp';
export const DEFAULT_SURVEY_MINUTES: Record<SurveyTypeKey, number> = { solar: 60, ashp: 60, solar_ashp: 90 };
export const surveyTypeLabel = (k: string): string => SURVEY_TYPES.find((t) => t.key === k)?.label ?? k;
/** "about an hour" / "about 1½ hours", for messages and the booking form. */
export const minutesWords = (m: number): string => (m === 90 ? 'about 1½ hours' : m === 60 ? 'about an hour' : `about ${m} minutes`);
/** Solar or battery → solar survey; heat pump → SimpliHeat; both → 90 min. EV-only, infrared, LED → null (no survey booked by default). */
export function surveyTypeFor(products: string[]): SurveyTypeKey | null {
  const solar = products.some((p) => p === 'solar' || p === 'battery');
  const heat = products.includes('heatpump');
  return solar && heat ? 'solar_ashp' : heat ? 'ashp' : solar ? 'solar' : null;
}

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
