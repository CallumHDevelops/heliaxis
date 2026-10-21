/**
 * Design details for site paperwork: what the designer or office records on the job (Job details →
 * "Design details for site paperwork", crm_projects.system) for the trades' forms and the documents
 * made from them. The site app reads them and never writes them; an empty one stays empty
 * everywhere, and a document that needs it says so.
 *
 * Pure (no imports), so the job API cleans with it, the Overview edits with it, and the site's rules
 * and scripts/test-site-*.mjs read the same values.
 */

export type DesignKind = 'bool' | 'intlist' | 'enum' | 'number' | 'text';

export type DesignField = {
  key: string;
  label: string;
  kind: DesignKind;
  /** Shown for jobs with one of these products (or with a value already). Empty: every job. */
  for: string[];
  options?: { value: string | number; label: string }[];
  /** One line under the box. */
  hint?: string;
  placeholder?: string;
  /** Numbers: the largest it can be. */
  max?: number;
};

const SOLAR = ['solar'];
const BATTERY = ['battery'];

export const DESIGN_FIELDS: DesignField[] = [
  {
    key: 'strings_design',
    label: 'Strings (panels on each)',
    kind: 'intlist',
    for: SOLAR,
    placeholder: '8 + 8',
    hint: 'Panels on each string, e.g. 8 + 8. The roofer sees it, and it heads the F43 columns.',
  },
  { key: 'optimisers', label: 'Optimisers fitted', kind: 'bool', for: SOLAR },
  { key: 'optimiser_model', label: 'Optimiser model', kind: 'text', for: SOLAR },
  {
    key: 'mounting',
    label: 'Mounting',
    kind: 'enum',
    for: SOLAR,
    options: [
      { value: 'on_roof', label: 'On-roof' },
      { value: 'in_roof', label: 'In-roof' },
      { value: 'flat', label: 'Flat roof' },
      { value: 'ground', label: 'Ground mount' },
    ],
  },
  { key: 'roof_faces', label: 'Roof faces', kind: 'text', for: SOLAR, placeholder: 'Rear roof' },
  { key: 'est_kwh_year', label: 'Estimated generation (kWh a year)', kind: 'number', for: SOLAR, max: 1_000_000, hint: 'The MCS estimate from the design.' },
  { key: 'shade_factor', label: 'Shade factor', kind: 'number', for: SOLAR, max: 1, hint: 'From the design (0 to 1).' },
  { key: 'bird_mesh', label: 'Bird mesh sold', kind: 'bool', for: SOLAR },
  { key: 'battery_backup', label: 'Battery gives back-up power in a power cut', kind: 'bool', for: BATTERY },
  {
    key: 'eess_class',
    label: 'Battery system class (MIS 3012)',
    kind: 'enum',
    for: BATTERY,
    options: [
      { value: 1, label: 'Class 1' },
      { value: 2, label: 'Class 2' },
      { value: 3, label: 'Class 3' },
      { value: 4, label: 'Class 4' },
    ],
  },
  { key: 'battery_kw', label: 'Battery maximum power output (kW)', kind: 'number', for: BATTERY, max: 1000 },
  { key: 'pas63100', label: 'PAS 63100 applies (battery in a home)', kind: 'bool', for: BATTERY },
  { key: 'maintenance_plan', label: 'Maintenance plan sold', kind: 'bool', for: ['solar', 'battery'] },
  { key: 'ozev_grant', label: 'OZEV grant claimed', kind: 'bool', for: ['ev'] },
  { key: 'bs7671_edition', label: 'BS 7671 edition', kind: 'text', for: [], placeholder: 'A4:2026', hint: 'Empty means A4:2026.' },
];

export const DESIGN_KEYS = DESIGN_FIELDS.map((f) => f.key);
const BY_KEY = new Map(DESIGN_FIELDS.map((f) => [f.key, f]));
export const designField = (key: string) => BY_KEY.get(key);

/** The BS 7671 edition when the job doesn't say. */
export const DEFAULT_BS7671 = 'A4:2026';

/** Strings as typed: "8 + 8", "8,8", "8 8" → [8, 8]. Null when it isn't whole numbers (1–100 panels, up to 24 strings). */
export function parseIntList(input: unknown): number[] | null {
  if (Array.isArray(input)) return input.every((n) => Number.isInteger(n) && n >= 1 && n <= 100) && input.length <= 24 ? (input as number[]) : null;
  const s = String(input ?? '').trim();
  if (!s) return [];
  const parts = s.split(/[\s+,&/]+|\band\b/i).filter(Boolean);
  if (!parts.length || parts.length > 24 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null;
  const nums = parts.map(Number);
  return nums.every((n) => n >= 1 && n <= 100) ? nums : null;
}

/** [8, 8] → "8 + 8". */
export const intListWords = (list: number[] | null | undefined) => (list ?? []).join(' + ');

export type Cleaned = { ok: true; value: unknown } | { ok: false; error: string };

/** One design value from the job form or API, cleaned. `value: null` clears it. */
export function cleanDesign(key: string, v: unknown): Cleaned {
  const f = BY_KEY.get(key);
  if (!f) return { ok: false, error: 'Unknown field' };
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  switch (f.kind) {
    case 'bool': {
      if (v === true || v === 'true' || v === 'yes') return { ok: true, value: true };
      if (v === false || v === 'false' || v === 'no') return { ok: true, value: false };
      return { ok: false, error: `${f.label}: yes or no` };
    }
    case 'intlist': {
      const list = parseIntList(v);
      if (!list) return { ok: false, error: 'Numbers only, e.g. 8 + 8' };
      return { ok: true, value: list.length ? list : null };
    }
    case 'enum': {
      const hit = f.options?.find((o) => String(o.value) === String(v));
      return hit ? { ok: true, value: hit.value } : { ok: false, error: `${f.label}: choose one of the options` };
    }
    case 'number': {
      const n = Number(String(v).replace(/,/g, ''));
      if (!Number.isFinite(n) || n < 0 || (f.max != null && n > f.max)) return { ok: false, error: `${f.label}: a number${f.max != null ? ` up to ${f.max.toLocaleString('en-GB')}` : ''}` };
      return { ok: true, value: Math.round(n * 1000) / 1000 };
    }
    default:
      return { ok: true, value: String(v).trim().slice(0, 200) || null };
  }
}

/** The design values a site form reads, typed. Missing ones are null, never a guess. */
export type Design = {
  strings_design: number[] | null;
  optimisers: boolean | null;
  optimiser_model: string | null;
  mounting: 'on_roof' | 'in_roof' | 'flat' | 'ground' | null;
  roof_faces: string | null;
  est_kwh_year: number | null;
  shade_factor: number | null;
  bird_mesh: boolean | null;
  battery_backup: boolean | null;
  eess_class: number | null;
  battery_kw: number | null;
  pas63100: boolean | null;
  maintenance_plan: boolean | null;
  ozev_grant: boolean | null;
  /** As set on the job; DEFAULT_BS7671 applies where an edition is printed. */
  bs7671_edition: string | null;
};

export function designOf(system: Record<string, unknown> | null | undefined): Design {
  const s = system ?? {};
  const bool = (k: string) => (typeof s[k] === 'boolean' ? (s[k] as boolean) : null);
  const num = (k: string) => (typeof s[k] === 'number' && Number.isFinite(s[k]) ? (s[k] as number) : null);
  const text = (k: string) => (typeof s[k] === 'string' && (s[k] as string).trim() ? (s[k] as string).trim() : null);
  const strings = parseIntList(s.strings_design);
  const mounting = text('mounting');
  return {
    strings_design: strings && strings.length ? strings : null,
    optimisers: bool('optimisers'),
    optimiser_model: text('optimiser_model'),
    mounting: mounting === 'on_roof' || mounting === 'in_roof' || mounting === 'flat' || mounting === 'ground' ? mounting : null,
    roof_faces: text('roof_faces'),
    est_kwh_year: num('est_kwh_year'),
    shade_factor: num('shade_factor'),
    bird_mesh: bool('bird_mesh'),
    battery_backup: bool('battery_backup'),
    eess_class: num('eess_class'),
    battery_kw: num('battery_kw'),
    pas63100: bool('pas63100'),
    maintenance_plan: bool('maintenance_plan'),
    ozev_grant: bool('ozev_grant'),
    bs7671_edition: text('bs7671_edition'),
  };
}

/** A design value as the job form shows it in its box. */
export function designInput(key: string, v: unknown): string {
  const f = BY_KEY.get(key);
  if (v === null || v === undefined) return '';
  if (f?.kind === 'intlist') return intListWords(parseIntList(v));
  if (f?.kind === 'bool') return v === true ? 'yes' : v === false ? 'no' : '';
  return String(v);
}
