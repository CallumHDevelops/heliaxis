/**
 * Package editor logic: parsing a form, validating, and saying exactly what is
 * still missing before a package can go live. Matches the pv_packages columns.
 *
 * Fields the team asked for: number of panels, panel model, panel warranty
 * years, inverter, battery storage; plus panel watts, price and the rest a
 * letter prints.
 */
import { CLAIM_ORDER } from './claims';
import type { ClaimKey, PackageRow } from './types';

export type PackageForm = {
  id?: string;
  name: string;
  minPanels: number;
  maxPanels: number | null;
  panelModel: string;
  panelWatts: number | null;
  panelWarrantyYrs: number | null;
  inverterModel: string;
  batteryKwh: number | null;
  batteryModuleModel: string;
  batteryModuleCount: number | null;
  batteryWarrantyYrs: number | null;
  workmanshipYrs: number | null;
  heatedModule: boolean;
  backupIncluded: boolean;
  mounting: string;
  monitoringApp: string;
  price: number | null;
  financeExample: string;
  description: string;
  claims: ClaimKey[];
  active: boolean;
  displayOrder: number;
};

export const EMPTY_PACKAGE: PackageForm = {
  name: '', minPanels: 8, maxPanels: null, panelModel: '', panelWatts: null, panelWarrantyYrs: null, inverterModel: '',
  batteryKwh: null, batteryModuleModel: '', batteryModuleCount: null, batteryWarrantyYrs: null, workmanshipYrs: null,
  heatedModule: false, backupIncluded: false, mounting: '', monitoringApp: '', price: null, financeExample: '',
  description: '', claims: ['ai_tariff', 'safety', 'expandable', 'all_in_one'], active: false, displayOrder: 0,
};

export type PackageErrors = Partial<Record<keyof PackageForm | 'form', string>>;

/** What a package needs before it can be switched on (these are what letters print). */
export const REQUIRED_FOR_ACTIVE: { key: keyof PackageForm; label: string }[] = [
  { key: 'panelModel', label: 'Panel model' },
  { key: 'panelWatts', label: 'Panel watts' },
  { key: 'panelWarrantyYrs', label: 'Panel warranty (years)' },
  { key: 'inverterModel', label: 'Inverter' },
  { key: 'batteryKwh', label: 'Battery storage (kWh)' },
  { key: 'batteryWarrantyYrs', label: 'Battery warranty (years)' },
  { key: 'monitoringApp', label: 'Monitoring app' },
  { key: 'price', label: 'Price' },
];

export function missingForActive(p: PackageForm): string[] {
  return REQUIRED_FOR_ACTIVE.filter(({ key }) => {
    const v = p[key];
    return v === null || v === '' || v === undefined;
  }).map((r) => r.label);
}

const txt = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

type NumResult = { value: number | null; bad: boolean };
function num(v: unknown): NumResult {
  if (v === null || v === undefined || v === '') return { value: null, bad: false };
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? { value: n, bad: false } : { value: null, bad: true };
}

export function parsePackageForm(raw: Record<string, unknown>): { ok: true; value: PackageForm } | { ok: false; errors: PackageErrors } {
  const errors: PackageErrors = {};
  const field = (key: keyof PackageForm, v: unknown, opts: { min?: number; max?: number; int?: boolean; label: string }) => {
    const r = num(v);
    if (r.bad) errors[key] = `${opts.label} must be a number.`;
    else if (r.value !== null) {
      if (opts.int && !Number.isInteger(r.value)) errors[key] = `${opts.label} must be a whole number.`;
      else if (opts.min !== undefined && r.value < opts.min) errors[key] = `${opts.label} must be at least ${opts.min}.`;
      else if (opts.max !== undefined && r.value > opts.max) errors[key] = `${opts.label} must be ${opts.max} or less.`;
    }
    return r.value;
  };

  const name = txt(raw.name, 60);
  if (name.length < 2) errors.name = 'Give the package a name.';

  const minPanels = field('minPanels', raw.minPanels, { min: 1, max: 100, int: true, label: 'Number of panels' });
  if (minPanels === null && !errors.minPanels) errors.minPanels = 'Enter the number of panels.';
  const maxPanels = field('maxPanels', raw.maxPanels, { min: 1, max: 100, int: true, label: 'Maximum panels' });
  if (minPanels !== null && maxPanels !== null && maxPanels < minPanels && !errors.maxPanels) {
    errors.maxPanels = 'Maximum panels can’t be lower than the minimum.';
  }

  const panelWatts = field('panelWatts', raw.panelWatts, { min: 100, max: 1000, int: true, label: 'Panel watts' });
  const panelWarrantyYrs = field('panelWarrantyYrs', raw.panelWarrantyYrs, { min: 0, max: 50, int: true, label: 'Panel warranty' });
  const batteryKwh = field('batteryKwh', raw.batteryKwh, { min: 0, max: 200, label: 'Battery storage' });
  const batteryModuleCount = field('batteryModuleCount', raw.batteryModuleCount, { min: 0, max: 20, int: true, label: 'Battery modules' });
  const batteryWarrantyYrs = field('batteryWarrantyYrs', raw.batteryWarrantyYrs, { min: 0, max: 50, int: true, label: 'Battery warranty' });
  const workmanshipYrs = field('workmanshipYrs', raw.workmanshipYrs, { min: 0, max: 50, int: true, label: 'Workmanship warranty' });
  const price = field('price', raw.price, { min: 0, max: 1_000_000, label: 'Price' });
  const displayOrder = field('displayOrder', raw.displayOrder, { int: true, label: 'Order' }) ?? 0;

  const claimsIn = Array.isArray(raw.claims) ? raw.claims : [];
  const claims = CLAIM_ORDER.filter((k) => claimsIn.includes(k));

  const value: PackageForm = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : undefined,
    name, minPanels: minPanels ?? 0, maxPanels, panelModel: txt(raw.panelModel), panelWatts, panelWarrantyYrs,
    inverterModel: txt(raw.inverterModel), batteryKwh, batteryModuleModel: txt(raw.batteryModuleModel), batteryModuleCount,
    batteryWarrantyYrs, workmanshipYrs, heatedModule: raw.heatedModule === true || raw.heatedModule === 'on',
    backupIncluded: raw.backupIncluded === true || raw.backupIncluded === 'on', mounting: txt(raw.mounting),
    monitoringApp: txt(raw.monitoringApp), price, financeExample: txt(raw.financeExample, 1000),
    description: txt(raw.description, 300), claims, active: raw.active === true || raw.active === 'on', displayOrder,
  };

  if (value.active) {
    const missing = missingForActive(value);
    if (missing.length) errors.active = `Can’t switch on yet. Still needed: ${missing.join(', ')}.`;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function formToRow(f: PackageForm) {
  return {
    name: f.name,
    min_panels: f.minPanels,
    max_panels: f.maxPanels,
    panel_model: f.panelModel || null,
    panel_watts: f.panelWatts,
    warranty_panel_yrs: f.panelWarrantyYrs,
    esa_inverter_model: f.inverterModel || null,
    usable_kwh: f.batteryKwh,
    battery_module_model: f.batteryModuleModel || null,
    battery_module_count: f.batteryModuleCount,
    warranty_battery_yrs: f.batteryWarrantyYrs,
    warranty_workmanship_yrs: f.workmanshipYrs,
    heated_module: f.heatedModule,
    backup_included: f.backupIncluded,
    mounting: f.mounting || null,
    monitoring_app: f.monitoringApp || null,
    price_inc_vat: f.price,
    finance_example_text: f.financeExample || null,
    short_description: f.description || null,
    claims: f.claims,
    active: f.active,
    display_order: f.displayOrder,
  };
}

export function rowToForm(r: PackageRow): PackageForm {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: r.id, name: r.name, minPanels: r.min_panels, maxPanels: r.max_panels, panelModel: r.panel_model ?? '',
    panelWatts: n(r.panel_watts), panelWarrantyYrs: n(r.warranty_panel_yrs), inverterModel: r.esa_inverter_model ?? '',
    batteryKwh: n(r.usable_kwh), batteryModuleModel: r.battery_module_model ?? '', batteryModuleCount: n(r.battery_module_count),
    batteryWarrantyYrs: n(r.warranty_battery_yrs), workmanshipYrs: n(r.warranty_workmanship_yrs),
    heatedModule: r.heated_module, backupIncluded: r.backup_included, mounting: r.mounting ?? '',
    monitoringApp: r.monitoring_app ?? '', price: n(r.price_inc_vat), financeExample: r.finance_example_text ?? '',
    description: r.short_description ?? '', claims: r.claims, active: r.active, displayOrder: r.display_order,
  };
}

/** Sort key: by size band, so the list reads smallest to largest. */
export const bySize = (a: { minPanels: number; displayOrder: number }, b: { minPanels: number; displayOrder: number }) =>
  a.minPanels - b.minPanels || a.displayOrder - b.displayOrder;

/**
 * Warnings about the panel bands of live packages. A roof gets the largest
 * package whose minimum it can reach, so overlaps still work, but they make
 * the list confusing and usually mean a typo.
 */
export function bandWarnings(packages: PackageForm[]): string[] {
  const live = packages.filter((p) => p.active).sort(bySize);
  const out: string[] = [];
  for (let i = 0; i < live.length - 1; i++) {
    const a = live[i]!;
    const b = live[i + 1]!;
    if (a.minPanels === b.minPanels) out.push(`${a.name} and ${b.name} both start at ${a.minPanels} panels. Roofs will always get ${b.name}.`);
    else if (a.maxPanels !== null && b.minPanels <= a.maxPanels) {
      out.push(`${a.name} (up to ${a.maxPanels}) overlaps ${b.name} (from ${b.minPanels}). A ${b.minPanels}-panel roof gets ${b.name}.`);
    }
  }
  return out;
}

export const bandLabel = (p: Pick<PackageForm, 'minPanels' | 'maxPanels'>) =>
  p.maxPanels === null ? `${p.minPanels}+ panels` : p.maxPanels === p.minPanels ? `${p.minPanels} panels` : `${p.minPanels}–${p.maxPanels} panels`;
