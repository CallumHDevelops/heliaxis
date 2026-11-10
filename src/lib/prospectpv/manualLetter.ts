/**
 * Creating a letter by hand: the staff member types an address and roof
 * details, picks a package, and gets a printable letter with its own code.
 * This is the same output the scan pipeline will produce, so the letters,
 * landing page and tracking all work the same way.
 */
import { buildRoofPlan, type Compass } from './roofSvg';
import { elevationWidthForAspect, type ScaffoldInput } from './scaffolding';
import type { AdminSettings } from './settings';
import type { AssetUrls, LetterInputs } from './letterData';
import type { PackageRow, TemplateKey } from './types';

export const ASPECT_OPTIONS: { value: Compass; label: string }[] = [
  { value: 'S', label: 'South' }, { value: 'SE', label: 'South-east' }, { value: 'SW', label: 'South-west' },
  { value: 'E', label: 'East' }, { value: 'W', label: 'West' },
  { value: 'N', label: 'North' }, { value: 'NE', label: 'North-east' }, { value: 'NW', label: 'North-west' },
];

export type ManualLetterForm = {
  batchName: string;
  line1: string;
  line2: string;
  town: string;
  postcode: string;
  /** Optional real UPRN. Blank for addresses without one. */
  uprn: string;
  panelCount: number;
  packageId: string;
  templateKey: TemplateKey;
  aspect: Compass;
  roofShape: 'Pitched' | 'Flat';
  /** Building plan size, metres: east–west width and north–south depth. */
  widthM: number;
  depthM: number;
  /** Degrees the house is turned clockwise from straight north–south. */
  rotationDeg: number;
  storeys: number;
  /** Estimated yearly generation, kWh. */
  annualKwh: number;
  usableAreaM2: number | null;
};

export type ManualErrors = Partial<Record<keyof ManualLetterForm | 'form', string>>;

/** "np197ab" → "NP19 7AB". null if it isn't a UK postcode. */
export function normalisePostcode(raw: string): string | null {
  const m = raw.toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]}` : null;
}

const toNum = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/,/g, '')) : Number.NaN);
const str = (v: unknown, max = 120) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

export function parseManualLetter(
  raw: Record<string, unknown>,
  opts: { packageIds: string[]; templateKeys: number[] },
): { ok: true; value: ManualLetterForm } | { ok: false; errors: ManualErrors } {
  const errors: ManualErrors = {};
  const line1 = str(raw.line1);
  if (line1.length < 3) errors.line1 = 'Enter the first line of the address, like 12 Transton Road.';
  const town = str(raw.town, 60);
  if (town.length < 2) errors.town = 'Enter the town.';
  const postcode = normalisePostcode(str(raw.postcode, 12));
  if (!postcode) errors.postcode = 'Enter a UK postcode, like NP19 7AB.';

  const uprnRaw = str(raw.uprn, 14);
  if (uprnRaw && !/^\d{5,12}$/.test(uprnRaw)) errors.uprn = 'A UPRN is 5 to 12 digits. Leave it blank if you don’t have one.';

  const int = (key: keyof ManualLetterForm, lo: number, hi: number, label: string) => {
    const n = toNum(raw[key]);
    if (!Number.isInteger(n) || n < lo || n > hi) errors[key] = `${label} must be a whole number from ${lo} to ${hi}.`;
    return n;
  };
  const dec = (key: keyof ManualLetterForm, lo: number, hi: number, label: string) => {
    const n = toNum(raw[key]);
    if (!Number.isFinite(n) || n < lo || n > hi) errors[key] = `${label} must be between ${lo} and ${hi}.`;
    return n;
  };

  const panelCount = int('panelCount', 1, 60, 'Panels');
  const widthM = dec('widthM', 3, 40, 'Width');
  const depthM = dec('depthM', 3, 30, 'Depth');
  const rotationDeg = dec('rotationDeg', -89, 89, 'Rotation');
  const storeys = int('storeys', 1, 4, 'Storeys');
  const annualKwh = dec('annualKwh', 500, 30000, 'Yearly generation');

  const packageId = str(raw.packageId, 60);
  if (!opts.packageIds.includes(packageId)) errors.packageId = 'Choose a package.';
  const templateKey = toNum(raw.templateKey);
  if (!opts.templateKeys.includes(templateKey)) errors.templateKey = 'Choose a template.';
  const aspect = str(raw.aspect, 3) as Compass;
  if (!ASPECT_OPTIONS.some((a) => a.value === aspect)) errors.aspect = 'Choose which way the roof faces.';
  const roofShape = raw.roofShape === 'Flat' ? 'Flat' : 'Pitched';

  const usableRaw = raw.usableAreaM2;
  const usable = usableRaw === '' || usableRaw === null || usableRaw === undefined ? null : toNum(usableRaw);
  if (usable !== null && (!Number.isFinite(usable) || usable < 1 || usable > 500)) errors.usableAreaM2 = 'Usable roof area must be between 1 and 500 m².';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      batchName: str(raw.batchName, 80) || 'Manual letters', line1, line2: str(raw.line2), town, postcode: postcode!, uprn: uprnRaw,
      panelCount, packageId, templateKey: templateKey as TemplateKey, aspect, roofShape, widthM, depthM, rotationDeg, storeys,
      annualKwh, usableAreaM2: usable,
    },
  };
}

/** A rectangular footprint for the roof drawing, turned clockwise by rotationDeg. Local metres. */
export function rectFootprint(widthM: number, depthM: number, rotationDeg: number) {
  const a = (-rotationDeg * Math.PI) / 180;
  const pts: [number, number][] = [[-widthM / 2, -depthM / 2], [widthM / 2, -depthM / 2], [widthM / 2, depthM / 2], [-widthM / 2, depthM / 2]];
  const ring = pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as [number, number]);
  return { coordinates: [[...ring, ring[0]!]] as [number, number][][], crs: 'EPSG:27700' as const };
}

/**
 * Can the roof physically hold this many panels? Uses the same layout as the
 * drawing, so a letter never promises more panels than the picture can show.
 */
export function roofCapacity(f: Pick<ManualLetterForm, 'widthM' | 'depthM' | 'rotationDeg' | 'aspect' | 'roofShape' | 'panelCount'>) {
  const plan = buildRoofPlan({
    ...rectFootprint(f.widthM, f.depthM, f.rotationDeg),
    mainAspect: f.aspect,
    panelCount: f.panelCount,
    roofShape: f.roofShape,
  });
  return { fits: !plan.truncated, drawn: plan.panelsDrawn };
}

/** The most panels the drawing can show for this roof (searches down from the request). */
export function maxPanelsOnRoof(f: Pick<ManualLetterForm, 'widthM' | 'depthM' | 'rotationDeg' | 'aspect' | 'roofShape'>): number {
  let best = 0;
  for (let n = 40; n >= 1; n--) {
    if (roofCapacity({ ...f, panelCount: n }).fits) { best = n; break; }
  }
  return best;
}

export function scaffoldInputFor(f: Pick<ManualLetterForm, 'aspect' | 'widthM' | 'depthM' | 'storeys'>, elevations = 1): ScaffoldInput {
  return { storeys: f.storeys, elevationWidthM: elevationWidthForAspect(f.aspect, f.widthM, f.depthM), elevations };
}

export function manualLetterInputs(
  f: ManualLetterForm,
  ctx: { pkg: PackageRow; letterCode: string; baseUrl: string; now: Date; settings: AdminSettings; assets: AssetUrls; mode: 'print' | 'preview' },
): LetterInputs {
  const watts = ctx.pkg.panel_watts ?? 0;
  return {
    mode: ctx.mode,
    source: 'manual',
    letterCode: ctx.letterCode,
    baseUrl: ctx.baseUrl,
    now: ctx.now,
    property: { uprn: f.uprn || 0, address_line1: f.line1, address_line2: f.line2 || null, town: f.town, postcode: f.postcode },
    building: {
      os_building_id: 'manual', roof_shape: f.roofShape, roof_material: null,
      aspect_n: null, aspect_ne: null, aspect_e: null, aspect_se: null, aspect_s: null, aspect_sw: null, aspect_w: null, aspect_nw: null,
      os_data_date: null,
      footprint: rectFootprint(f.widthM, f.depthM, f.rotationDeg),
    },
    assessment: {
      panel_count: f.panelCount,
      kwp: Math.round((f.panelCount * watts) / 10) / 100,
      indicative_kwh: f.annualKwh,
      usable_area_m2: f.usableAreaM2,
      main_aspect: f.aspect,
    },
    pkg: ctx.pkg,
    finance: ctx.settings.finance,
    company: ctx.settings.company,
    sender: ctx.settings.sender,
    assets: ctx.assets,
  };
}
