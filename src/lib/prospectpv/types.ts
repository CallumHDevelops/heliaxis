/**
 * ProspectPV shared types.
 *
 * `LetterData` is the merge-field contract from spec section 6.2. Every letter
 * template and the landing page read from it. A snapshot is stored on each
 * letter (`pv_letters.printed_values`) so the landing page shows exactly what
 * was printed.
 *
 * Additions to the spec contract are marked "ADDED" and are all optional, so
 * data built to the original shape still type-checks.
 */

export type TemplateKey = 1 | 2 | 3 | 4 | 5;

export type ClaimKey = 'ai_tariff' | 'safety' | 'heating' | 'expandable' | 'backup' | 'all_in_one';

export type LetterData = {
  /** ADDED: where the roof data came from. Drives the wording ("aerial roof data" is only true for 'os'). */
  source?: 'os' | 'manual';
  letterCode: string; // e.g. "7KQ4M2XA"
  qrUrl: string; // `${PUBLIC_BASE_URL}/r/${letterCode}`
  date: string; // "9 November 2026"
  address: { line1: string; line2?: string; town: string; postcode: string };
  roof: {
    footprintSvgPath: string; // generated from OS polygon, in ROOF_VIEWBOX space
    panelAreaSvg: string; // ridge + indicative panel layout, SVG fragment in ROOF_VIEWBOX space
    mainAspect: string; // e.g. "South"
    roofShape: string; // e.g. "Pitched"
    usableAreaM2: number;
  };
  estimate: { panelCount: number; kwp: number; batteryKwh: number; annualKwh: number };
  package: {
    name: string;
    description: string;
    priceIncVat: number;
    panelModel: string;
    panelWatts: number;
    esaModel: string;
    monitoringApp: string;
    warrantyPanelYrs: number;
    warrantyBatteryYrs: number;
    claims: ClaimKey[];
    /** ADDED: shown on the Roof Report and Bold Dark spec lists. */
    mounting?: string;
    /** ADDED */
    batteryModuleModel?: string;
    /** ADDED */
    batteryModuleCount?: number;
    /** ADDED */
    warrantyWorkmanshipYrs?: number;
  };
  finance: { enabled: boolean; exampleText: string; lenderName: string; fcaWording: string };
  sender: { name: string; role: string; signatureUrl?: string; photoUrl?: string };
  company: {
    phone: string;
    registeredDetails: string;
    optOutUrl: string;
    /** ADDED: e.g. "heliaxis.co.uk", shown in letter headers. */
    website?: string;
    /** ADDED: Personal Letter header. */
    businessAddress?: string;
  };
  images: {
    hero?: string;
    install?: string;
    team?: string;
    logo: string;
    /** ADDED: white logo for dark bands. Falls back to the built-in wordmark. */
    logoWhite?: string;
    accreditations: string;
    /** ADDED: GoodWe ESA product photo used on every back page. */
    esaUnit?: string;
  };
};

/** Row shapes (subset of columns the TS code uses). */
export type PackageRow = {
  id: string;
  name: string;
  min_panels: number;
  max_panels: number | null;
  panel_model: string | null;
  panel_watts: number | null;
  esa_inverter_model: string | null;
  battery_module_model: string | null;
  battery_module_count: number | null;
  usable_kwh: number | null;
  heated_module: boolean;
  backup_included: boolean;
  mounting: string | null;
  monitoring_app: string | null;
  warranty_panel_yrs: number | null;
  warranty_battery_yrs: number | null;
  warranty_workmanship_yrs: number | null;
  price_inc_vat: number | null;
  finance_example_text: string | null;
  short_description: string | null;
  claims: ClaimKey[];
  active: boolean;
  display_order: number;
};

export type ExtraRow = {
  key: string;
  name: string;
  description: string | null;
  price: number | null;
  effect: { diverter?: boolean; backup?: boolean; battery_kwh?: number };
};

export type BuildingRow = {
  os_building_id: string;
  roof_shape: string | null;
  roof_material: string | null;
  aspect_n: number | null;
  aspect_ne: number | null;
  aspect_e: number | null;
  aspect_se: number | null;
  aspect_s: number | null;
  aspect_sw: number | null;
  aspect_w: number | null;
  aspect_nw: number | null;
  os_data_date: string | null;
};

export type PropertyRow = {
  uprn: number | string;
  address_line1: string;
  address_line2: string | null;
  town: string;
  postcode: string;
};

export type AssessmentRow = {
  panel_count: number;
  kwp: number;
  indicative_kwh: number;
  usable_area_m2: number | null;
  main_aspect: string | null;
};
