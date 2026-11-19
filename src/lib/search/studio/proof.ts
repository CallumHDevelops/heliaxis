import type { Brief, Proof, ProofPackage } from './types';
import { EMPTY_PROOF } from './types';

/**
 * The proof pack (spec §5 M4.2): Heliaxis-only facts people fill in. Drafting stays locked until the required items are
 * in. Pure.
 */

export type ProofKey = 'projects' | 'photos' | 'dno' | 'council' | 'packages' | 'reviews' | 'author' | 'figures' | 'findings';

export const PROOF_LABEL: Record<ProofKey, string> = {
  projects: 'A real project near here',
  photos: 'A photo we have permission to use',
  dno: 'The local network operator',
  council: 'The local council',
  packages: 'Prices picked from the packages',
  reviews: 'A real review',
  author: 'The author (Settings › Author)',
  figures: 'Figures with their source and date',
  findings: 'What our surveys find here',
};

/** Services the PV packages price. Other services have no package, so "prices" is not required for them. */
const PACKAGED = new Set(['solar', 'battery', 'general', '']);

/**
 * Required items: Settings › Content rules (when it lists them), else a sensible default for the page. The town items
 * apply only when the page has a town.
 */
export function requiredProof(brief: Pick<Brief, 'target'> | null, configured?: string[] | null): ProofKey[] {
  const known = new Set(Object.keys(PROOF_LABEL));
  const fromSettings = (configured ?? []).filter((k): k is ProofKey => known.has(k));
  const t = brief?.target;
  const base: ProofKey[] = fromSettings.length ? fromSettings : ['projects', 'photos', 'dno', 'packages', 'reviews', 'author'];
  const out = new Set<ProofKey>(base);
  if (!fromSettings.length && t?.town) out.add('council');
  if (!fromSettings.length && !PACKAGED.has(t?.service ?? '')) out.delete('packages');
  if (!fromSettings.length && (t?.pageType === 'cost_guide' || t?.pageType === 'comparison')) out.add('figures');
  // The author is always named (decided 19 November).
  out.add('author');
  return [...out];
}

export type ProofItem = { key: ProofKey; label: string; required: boolean; done: boolean; detail: string };

export function proofStatus(proof: Proof, required: ProofKey[]): { ready: boolean; items: ProofItem[]; missing: string[] } {
  const p = normaliseProof(proof);
  const has: Record<ProofKey, [boolean, string]> = {
    projects: [p.projects.some((x) => x.town.trim() && x.summary.trim()), `${p.projects.length} project${p.projects.length === 1 ? '' : 's'}`],
    photos: [p.projects.some((x) => x.photoUrl.trim() && x.photoPermission), `${p.projects.filter((x) => x.photoUrl && x.photoPermission).length} with permission`],
    dno: [!!p.dno.trim(), p.dno || 'Not set'],
    council: [!!p.council.trim(), p.council || 'Not set'],
    packages: [p.packages.length > 0, p.packages.map((x) => x.name).join(', ') || 'None picked'],
    reviews: [p.reviews.some((r) => r.quote.trim() && r.name.trim() && r.source.trim()), `${p.reviews.length} review${p.reviews.length === 1 ? '' : 's'}`],
    author: [!!(p.author.name.trim() && p.author.bio.trim()), p.author.name ? `${p.author.name}${p.author.bio ? '' : ' (no bio yet: Settings › Author)'}` : 'Set it in Settings › Author'],
    figures: [p.figures.some((f) => f.value.trim() && f.source.trim() && f.checked.trim()), `${p.figures.length} figure${p.figures.length === 1 ? '' : 's'}`],
    findings: [p.findings.trim().length >= 40, p.findings.trim() ? `${p.findings.trim().length} characters` : 'Not written'],
  };
  const items = (Object.keys(PROOF_LABEL) as ProofKey[]).map((key) => ({ key, label: PROOF_LABEL[key], required: required.includes(key), done: has[key][0], detail: has[key][1] }));
  const missing = items.filter((i) => i.required && !i.done).map((i) => i.label);
  return { ready: missing.length === 0, items, missing };
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown) => {
  if (v === '' || v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

/** A proof pack read from jsonb (or a form), with every field present and typed. */
export function normaliseProof(raw: unknown): Proof {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const a = (o.author && typeof o.author === 'object' ? o.author : {}) as Record<string, unknown>;
  return {
    ...EMPTY_PROOF,
    projects: arr(o.projects).map((x: Record<string, unknown>) => ({
      town: str(x.town).trim(),
      sizeKwp: num(x.sizeKwp),
      batteryKwh: num(x.batteryKwh),
      date: str(x.date),
      summary: str(x.summary).trim(),
      photoUrl: str(x.photoUrl).trim(),
      photoPermission: x.photoPermission === true,
    })),
    reviews: arr(o.reviews).map((x: Record<string, unknown>) => ({ quote: str(x.quote).trim(), name: str(x.name).trim(), town: str(x.town).trim(), source: str(x.source).trim(), date: str(x.date), stars: num(x.stars) })),
    packages: arr(o.packages).map((x: Record<string, unknown>) => ({ id: str(x.id), name: str(x.name), priceIncVat: num(x.priceIncVat), kwp: num(x.kwp), usableKwh: num(x.usableKwh), panels: str(x.panels), warranties: str(x.warranties), checkedAt: str(x.checkedAt) })),
    figures: arr(o.figures).map((x: Record<string, unknown>) => ({ label: str(x.label).trim(), value: str(x.value).trim(), source: str(x.source).trim(), checked: str(x.checked), money: x.money === true })),
    dno: str(o.dno).trim(),
    council: str(o.council).trim(),
    findings: str(o.findings),
    author: { name: str(a.name), role: str(a.role), bio: str(a.bio), photo: str(a.photo) },
    updatedAt: o.updatedAt ? str(o.updatedAt) : null,
    updatedBy: o.updatedBy ? str(o.updatedBy) : null,
  };
}

export type PackageRow = { id: string; name: string; min_panels: number; max_panels: number | null; panel_watts: number | null; usable_kwh: number | null; price_inc_vat: number | null; active: boolean; warranty_panel_yrs?: number | null; warranty_battery_yrs?: number | null; warranty_workmanship_yrs?: number | null };

/** A package picked into the proof pack: its price and size exactly as pv_packages holds them (never typed). */
export function packageProof(row: PackageRow, today: string): ProofPackage {
  const kwp = row.panel_watts ? Math.round(((row.min_panels * row.panel_watts) / 1000) * 100) / 100 : null;
  return {
    id: row.id,
    name: row.name,
    priceIncVat: row.price_inc_vat == null ? null : Number(row.price_inc_vat),
    kwp,
    usableKwh: row.usable_kwh == null ? null : Number(row.usable_kwh),
    panels: row.max_panels && row.max_panels !== row.min_panels ? `${row.min_panels}–${row.max_panels}` : String(row.min_panels),
    warranties: [
      row.warranty_panel_yrs ? `panels ${row.warranty_panel_yrs} years` : '',
      row.warranty_battery_yrs ? `battery ${row.warranty_battery_yrs} years` : '',
      row.warranty_workmanship_yrs ? `workmanship ${row.warranty_workmanship_yrs} years` : '',
    ].filter(Boolean).join(', '),
    checkedAt: today,
  };
}

/** The UK's distribution network operators, to pick from (the one for most of our area is shown first). */
export const DNOS = [
  'National Grid Electricity Distribution (South Wales)',
  'National Grid Electricity Distribution (South West)',
  'SP Energy Networks (Manweb)',
  'National Grid Electricity Distribution (West Midlands)',
  'Scottish and Southern Electricity Networks',
  'UK Power Networks',
  'Electricity North West',
  'Northern Powergrid',
];
