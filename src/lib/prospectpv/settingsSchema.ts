/**
 * The settings screens, described as data: which fields exist, how they're
 * labelled, and how a typed value becomes the stored JSON. Used by the form
 * and by the save action so they can't disagree.
 */
import { CLAIM_ORDER } from './claims';

export type FieldDef = {
  key: string; // pv_settings key
  prop: string; // property inside the JSON value
  label: string;
  type: 'number' | 'text' | 'longtext' | 'bool' | 'select';
  unit?: string;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  /** stored = typed × scale (e.g. pence typed, pounds stored). */
  scale?: number;
  /** Blank is allowed and stored as null ([TBC]). */
  nullable?: boolean;
  integer?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
};

export type SectionDef = { id: string; title: string; blurb: string; fields: FieldDef[] };

const f = (key: string, prop: string, label: string, rest: Partial<FieldDef> & Pick<FieldDef, 'type'>): FieldDef => ({ key, prop, label, ...rest });

export const SETTINGS_SECTIONS: SectionDef[] = [
  {
    id: 'savings',
    title: 'Savings assumptions',
    blurb: 'Used by the landing page calculator and the estimator. The calculator stays hidden until the first three are set. Check these against RECC guidance before launch.',
    fields: [
      f('calc.assumptions', 'seg_rate_gbp_per_kwh', 'Export rate (SEG)', { type: 'number', unit: 'p per kWh', scale: 0.01, min: 0, max: 100, step: 0.1, nullable: true, help: 'What you pay customers for each kWh they send to the grid.' }),
      f('calc.assumptions', 'off_peak_spread_gbp_per_kwh', 'Smart tariff saving', { type: 'number', unit: 'p per kWh', scale: 0.01, min: 0, max: 100, step: 0.1, nullable: true, help: 'Difference between peak and off-peak unit rates.' }),
      f('calc.assumptions', 'standing_charge_gbp_per_year', 'Standing charge', { type: 'number', unit: '£ per year', min: 0, max: 2000, step: 1, nullable: true }),
      f('generation', 'yield_kwh_per_kwp', 'Yearly yield', { type: 'number', unit: 'kWh per kWp', min: 300, max: 1500, step: 10, nullable: true, help: 'Pre-fills yearly generation on new letters (array size × this). Use your MCS or PVGIS figure for a typical south-facing roof.' }),
    ],
  },
  {
    id: 'scaffolding',
    title: 'Scaffolding',
    blurb: 'Rough scaffolding cost for a job: length × height × rate, plus a fixed fee, never less than the minimum charge. Enter the rates your scaffolder charges.',
    fields: [
      f('scaffolding', 'rate_per_m2_gbp', 'Rate', { type: 'number', unit: '£ per m²', min: 0, max: 500, step: 0.5, nullable: true, help: 'Erect, hire and dismantle, per m² of scaffold face.' }),
      f('scaffolding', 'fixed_fee_gbp', 'Fixed fee per job', { type: 'number', unit: '£', min: 0, max: 10000, step: 5, nullable: true, help: 'Delivery, handling or inspection charge. Leave blank if none.' }),
      f('scaffolding', 'min_charge_gbp', 'Minimum charge', { type: 'number', unit: '£', min: 0, max: 10000, step: 5, nullable: true }),
      f('scaffolding', 'storey_height_m', 'Storey height', { type: 'number', unit: 'metres', min: 2, max: 4, step: 0.1, help: 'Assumption used to turn storeys into eaves height.' }),
      f('scaffolding', 'top_lift_m', 'Extra height at the top', { type: 'number', unit: 'metres', min: 0, max: 3, step: 0.1, help: 'Top platform and guard rail above the eaves.' }),
      f('scaffolding', 'end_return_m', 'Extra length at each end', { type: 'number', unit: 'metres', min: 0, max: 3, step: 0.1 }),
    ],
  },
  {
    id: 'battery',
    title: 'Battery modules',
    blurb: 'For the “Bigger battery” stepper on the landing page. It stays hidden until both the price and the maximum are set.',
    fields: [
      f('battery', 'module_kwh', 'Module size', { type: 'number', unit: 'kWh', min: 1, max: 20, step: 0.5 }),
      f('battery', 'module_price_gbp', 'Price per module', { type: 'number', unit: '£', min: 0, max: 20000, step: 10, nullable: true }),
      f('battery', 'max_kwh', 'System maximum', { type: 'number', unit: 'kWh', min: 1, max: 200, step: 0.5, nullable: true, help: 'The most usable storage one GoodWe ESA system can take.' }),
    ],
  },
  {
    id: 'company',
    title: 'Company, sender and footer',
    blurb: 'Printed in letter footers and used on the landing page. Letters can’t be created until the required items are set.',
    fields: [
      f('company', 'phone', 'Phone number', { type: 'text' }),
      f('company', 'website', 'Website', { type: 'text', nullable: true, placeholder: 'heliaxis.co.uk' }),
      f('company', 'registered_details', 'Registered company details', { type: 'longtext', nullable: true, help: 'Printed after “Heliaxis Limited,” in the footer. For example: registered in England and Wales, company no. …, registered office …' }),
      f('company', 'business_address', 'Business address', { type: 'text', nullable: true, help: 'Shown on the personal letter template.' }),
      f('company', 'opt_out_url', 'Opt-out web address', { type: 'text', nullable: true, placeholder: 'heliaxis.co.uk/optout', help: 'Printed on every letter.' }),
      f('company', 'privacy_url', 'Privacy notice web address', { type: 'text', nullable: true, placeholder: 'https://heliaxis.co.uk/privacy', help: 'Linked from the landing page.' }),
      f('sender', 'name', 'Letter signed by', { type: 'text', nullable: true, placeholder: 'Full name' }),
      f('sender', 'role', 'Their role', { type: 'text', placeholder: 'Director' }),
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    blurb: 'Finance wording is an FCA-regulated promotion. Keep this off until you have credit-broking permission or a lender arrangement, and the lender has approved the wording. Each package also needs its approved example text.',
    fields: [
      f('finance', 'enabled', 'Show finance wording on letters and pages', { type: 'bool' }),
      f('finance', 'lender_name', 'Lender', { type: 'text', nullable: true }),
      f('finance', 'fca_wording', 'FCA status wording', { type: 'longtext', nullable: true }),
    ],
  },
  {
    id: 'landing',
    title: 'Landing page content',
    blurb: 'Optional extras for “Get to know us”. Anything left blank is simply not shown.',
    fields: [
      f('landing', 'team_story', 'Two or three lines about Heliaxis', { type: 'longtext', nullable: true }),
      f('landing', 'review_rating', 'Review rating', { type: 'text', nullable: true, placeholder: '4.9★' }),
      f('landing', 'review_quote', 'Customer quote', { type: 'longtext', nullable: true }),
      f('landing', 'review_name', 'Who said it', { type: 'text', nullable: true, placeholder: 'Name, town' }),
      f('landing', 'walk_in_lookup_enabled', 'Show “Not your address? Check another”', { type: 'bool' }),
    ],
  },
  {
    id: 'letters',
    title: 'Letter defaults',
    blurb: 'How letters are produced and how long their links last.',
    fields: [
      f('letters', 'default_template', 'Default template', { type: 'select', options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: ['Classic', 'Bold Dark', 'Personal Letter', 'Roof Report', 'Brand Hero'][n - 1]! })) }),
      f('letters', 'remail_window_months', 'One letter per address every', { type: 'number', unit: 'months', min: 1, max: 60, integer: true, help: 'Blocks writing to the same address again inside this window.' }),
      f('letters', 'bleed_mm', 'Print bleed', { type: 'select', options: [{ value: '0', label: 'None' }, { value: '3', label: '3 mm' }], help: 'Ask your print provider which they need.' }),
      f('codes', 'expiry_months', 'Letter links last', { type: 'number', unit: 'months', min: 1, max: 60, integer: true }),
    ],
  },
];

export const SETTINGS_KEYS = [...new Set(SETTINGS_SECTIONS.flatMap((s) => s.fields.map((x) => x.key)))];

export const fieldId = (fd: FieldDef) => `${fd.key}::${fd.prop}`;

export type FormValues = Record<string, string | boolean>;

type Raw = Record<string, unknown>;

/** Stored JSON → what the form shows. */
export function readSection(section: SectionDef, settings: Raw): FormValues {
  const out: FormValues = {};
  for (const fd of section.fields) {
    const stored = (settings[fd.key] as Raw | undefined)?.[fd.prop];
    if (fd.type === 'bool') out[fieldId(fd)] = stored === true;
    else if (stored === null || stored === undefined) out[fieldId(fd)] = '';
    else if (fd.type === 'number') out[fieldId(fd)] = String(Math.round((Number(stored) / (fd.scale ?? 1)) * 10000) / 10000);
    else out[fieldId(fd)] = String(stored);
  }
  return out;
}

export type SectionResult =
  | { ok: true; patches: Record<string, Record<string, unknown>> }
  | { ok: false; errors: Record<string, string> };

/** What the form sent → JSON patches per settings key. */
export function coerceSection(section: SectionDef, raw: Raw): SectionResult {
  const errors: Record<string, string> = {};
  const patches: Record<string, Record<string, unknown>> = {};
  for (const fd of section.fields) {
    const id = fieldId(fd);
    const v = raw[id];
    let value: unknown;
    if (fd.type === 'bool') value = v === true || v === 'on';
    else if (fd.type === 'number') {
      const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
      if (s === '') {
        if (!fd.nullable) errors[id] = `${fd.label} is needed.`;
        value = null;
      } else {
        const n = Number(s.replace(/[£,]/g, ''));
        if (!Number.isFinite(n)) errors[id] = `${fd.label} must be a number.`;
        else if (fd.integer && !Number.isInteger(n)) errors[id] = `${fd.label} must be a whole number.`;
        else if (fd.min !== undefined && n < fd.min) errors[id] = `${fd.label} must be at least ${fd.min}.`;
        else if (fd.max !== undefined && n > fd.max) errors[id] = `${fd.label} must be ${fd.max} or less.`;
        value = Number.isFinite(n) ? Math.round(n * (fd.scale ?? 1) * 1_000_000) / 1_000_000 : null;
      }
    } else if (fd.type === 'select') {
      const s = String(v ?? '');
      if (!fd.options?.some((o) => o.value === s)) errors[id] = `Choose a value for ${fd.label}.`;
      value = fd.key === 'letters' || fd.key === 'codes' ? Number(s) : s;
    } else {
      const s = typeof v === 'string' ? v.trim().slice(0, fd.type === 'longtext' ? 1500 : 300) : '';
      if (s === '' && !fd.nullable) errors[id] = `${fd.label} is needed.`;
      value = s === '' ? null : s;
    }
    (patches[fd.key] ??= {})[fd.prop] = value;
  }
  // Finance can't be switched on without the wording that makes it compliant to show.
  if (section.id === 'finance') {
    const p = patches['finance'] ?? {};
    if (p.enabled === true && (!p.lender_name || !p.fca_wording)) {
      errors[`finance::enabled`] = 'Set the lender and the FCA status wording before switching finance on.';
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, patches };
}

export { CLAIM_ORDER };
