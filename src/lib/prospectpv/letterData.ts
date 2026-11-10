/**
 * Builds the LetterData merge fields (spec 6.2) for one home from stored rows.
 *
 * Two modes:
 *  - 'print'   every value a letter prints must be real. Missing [TBC] config
 *              throws a LetterDataError listing everything still needed, so the
 *              admin can show one clear message.
 *  - 'preview' fills gaps with visible "[TBC …]" markers, so templates can be
 *              previewed before packages, prices and footer details are final.
 *
 * The result is stored as pv_letters.printed_values (audit trail) and read
 * back by the landing page, so letter and page always agree.
 */
import { resolveClaims } from './claims';
import { letterDate } from './format';
import { arrayKwp } from './packages';
import { buildRoofPlan, COMPASS_NAMES, mainAspectFromAreas, type Compass, type RoofPlanInput } from './roofSvg';
import { financeAllowed, type CompanySettings, type FinanceSettings } from './settings';
import { landingUrl } from './shortCode';
import type { AssessmentRow, BuildingRow, LetterData, PackageRow, PropertyRow } from './types';

export class LetterDataError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Letter can't be generated until these are set: ${missing.join(', ')}`);
    this.name = 'LetterDataError';
  }
}

export type AssetUrls = Partial<
  Record<'logo' | 'logo_white' | 'accreditations' | 'hero' | 'install' | 'team' | 'signature' | 'director_photo' | 'esa_unit' | 'package_image', string | null>
>;

export type LetterInputs = {
  mode: 'print' | 'preview';
  letterCode: string;
  baseUrl: string;
  now: Date;
  property: PropertyRow;
  building: BuildingRow & { footprint: Pick<RoofPlanInput, 'coordinates' | 'crs'> };
  assessment: AssessmentRow;
  pkg: PackageRow;
  finance: FinanceSettings;
  company: CompanySettings;
  sender: { name: string | null; role: string | null };
  assets: AssetUrls;
  /** 'manual' for addresses entered by staff rather than scanned from OS data. */
  source?: 'os' | 'manual';
};

export type BuiltLetter = {
  data: LetterData;
  /** Stored in pv_letters.data_dates for the audit trail. */
  dataDates: { os_data_date: string | null; generated_at: string };
  roofPanelsDrawn: number;
};

const ASPECT_KEYS: Record<Compass, keyof BuildingRow> = {
  N: 'aspect_n', NE: 'aspect_ne', E: 'aspect_e', SE: 'aspect_se',
  S: 'aspect_s', SW: 'aspect_sw', W: 'aspect_w', NW: 'aspect_nw',
};

const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s|-)\S/g, (m) => m.toUpperCase());

export function buildLetterData(input: LetterInputs): BuiltLetter {
  const { pkg, property, building, assessment, mode } = input;
  const missing: string[] = [];

  function need<T>(value: T | null | undefined, label: string, placeholder: T): T {
    if (value === null || value === undefined || value === '') {
      missing.push(label);
      return placeholder;
    }
    return value;
  }
  const tbc = (label: string) => `[TBC: ${label}]`;

  // Roof
  const areas = Object.fromEntries(
    (Object.keys(ASPECT_KEYS) as Compass[]).map((k) => [k, building[ASPECT_KEYS[k]] as number | null]),
  ) as Record<Compass, number | null>;
  const aspect: Compass =
    (assessment.main_aspect as Compass | null) ?? mainAspectFromAreas(areas) ?? 'S';
  const usableAreaM2 =
    assessment.usable_area_m2 ??
    (['S', 'SE', 'SW', 'E', 'W'] as Compass[]).reduce((sum, k) => sum + (areas[k] ?? 0), 0);

  const plan = buildRoofPlan({
    ...building.footprint,
    mainAspect: aspect,
    panelCount: assessment.panel_count,
    roofShape: building.roof_shape,
  });

  // Package (every field a letter prints)
  const panelWatts = need(pkg.panel_watts, `${pkg.name} panel watts`, 0);
  const priceIncVat = need(pkg.price_inc_vat, `${pkg.name} price`, 0);
  const usableKwh = need(pkg.usable_kwh, `${pkg.name} usable battery kWh`, 0);

  const pkgOut: LetterData['package'] = {
    name: pkg.name,
    description: pkg.short_description ?? '',
    priceIncVat,
    panelModel: need(pkg.panel_model, `${pkg.name} panel model`, tbc('panel model')),
    panelWatts,
    esaModel: need(pkg.esa_inverter_model, `${pkg.name} ESA model`, tbc('ESA model')),
    monitoringApp: need(pkg.monitoring_app, `${pkg.name} monitoring app`, tbc('app')),
    warrantyPanelYrs: need(pkg.warranty_panel_yrs, `${pkg.name} panel warranty`, 0),
    warrantyBatteryYrs: need(pkg.warranty_battery_yrs, `${pkg.name} battery warranty`, 0),
    claims: resolveClaims(pkg),
    mounting: pkg.mounting ?? undefined,
    batteryModuleModel: pkg.battery_module_model ?? undefined,
    batteryModuleCount: pkg.battery_module_count ?? undefined,
    warrantyWorkmanshipYrs: pkg.warranty_workmanship_yrs ?? undefined,
  };

  // Finance: only when switched on, lender + FCA wording set, and the package
  // has lender-approved example text. Otherwise the block is off.
  const financeOn = financeAllowed(input.finance) && !!pkg.finance_example_text;

  const company: LetterData['company'] = {
    phone: need(input.company.phone, 'company phone', tbc('phone')),
    registeredDetails: need(input.company.registered_details, 'registered company details', tbc('registered details')),
    optOutUrl: need(input.company.opt_out_url, 'opt-out URL', tbc('opt-out URL')),
    website: input.company.website ?? undefined,
    businessAddress: input.company.business_address ?? undefined,
  };

  const data: LetterData = {
    source: input.source ?? 'os',
    letterCode: input.letterCode,
    qrUrl: landingUrl(input.baseUrl, input.letterCode),
    date: letterDate(input.now),
    address: {
      line1: property.address_line1,
      line2: property.address_line2 ?? undefined,
      town: property.town,
      postcode: property.postcode,
    },
    roof: {
      footprintSvgPath: plan.footprintSvgPath,
      panelAreaSvg: plan.panelAreaSvg,
      mainAspect: COMPASS_NAMES[aspect],
      roofShape: building.roof_shape ? titleCase(building.roof_shape) : 'Not recorded',
      usableAreaM2: Math.round(usableAreaM2),
    },
    estimate: {
      panelCount: assessment.panel_count,
      kwp: panelWatts ? arrayKwp(assessment.panel_count, panelWatts) : assessment.kwp,
      batteryKwh: usableKwh,
      annualKwh: Math.round(assessment.indicative_kwh),
    },
    package: pkgOut,
    finance: {
      enabled: financeOn,
      exampleText: financeOn ? pkg.finance_example_text! : '',
      lenderName: financeOn ? input.finance.lender_name! : '',
      fcaWording: financeOn ? input.finance.fca_wording! : '',
    },
    sender: {
      name: need(input.sender.name, 'sender name', tbc('sender name')),
      role: input.sender.role ?? 'Director',
      signatureUrl: input.assets.signature ?? undefined,
      photoUrl: input.assets.director_photo ?? undefined,
    },
    company,
    images: {
      hero: input.assets.hero ?? undefined,
      install: input.assets.install ?? undefined,
      team: input.assets.team ?? undefined,
      logo: input.assets.logo ?? '',
      logoWhite: input.assets.logo_white ?? undefined,
      accreditations: input.assets.accreditations ?? '',
      esaUnit: input.assets.esa_unit ?? undefined,
      package: input.assets.package_image ?? undefined,
    },
  };

  if (mode === 'print') {
    if (!input.assets.accreditations) missing.push('accreditation logos image');
    // The QR leads to the landing page, which must link a privacy notice (spec 9).
    if (!input.company.privacy_url) missing.push('privacy notice URL');
    if (missing.length) throw new LetterDataError(missing);
  }

  return {
    data,
    dataDates: { os_data_date: building.os_data_date, generated_at: input.now.toISOString() },
    roofPanelsDrawn: plan.panelsDrawn,
  };
}
