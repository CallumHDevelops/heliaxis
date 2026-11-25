/**
 * Electrical design checks for a PV (and optional battery) system. Pure and deterministic.
 * Specs come from datasheets held in the price book. A spec that is missing is reported as missing: it is never
 * guessed, and a check that needs it is not passed. Warnings are never hidden to make a design look clean.
 */

export type PanelSpec = {
  wp: number | null;
  voc: number | null;
  vmp: number | null;
  isc: number | null;
  imp: number | null;
  /** Voc temperature coefficient, % per °C (negative, e.g. -0.25). Also used for Vmp if no separate figure is given. */
  tempCoeffVocPct: number | null;
  tempCoeffVmpPct?: number | null;
};

export type InverterSpec = {
  acKw: number | null;
  /** Largest DC input voltage the inverter survives. */
  maxDcV: number | null;
  mpptMinV: number | null;
  mpptMaxV: number | null;
  mpptCount: number | null;
  /** Per MPPT: the highest operating current and the highest short-circuit current it is rated for. */
  maxInputCurrentA: number | null;
  maxIscA: number | null;
  /** Highest PV power the inverter accepts, if the datasheet gives one. */
  maxPvKw?: number | null;
  batteryMinV?: number | null;
  batteryMaxV?: number | null;
  maxChargeKw?: number | null;
  maxDischargeKw?: number | null;
  offGridCapable: boolean | null;
  generatorInput: boolean | null;
};

export type BatterySpec = {
  usableKwh: number | null;
  nominalV: number | null;
  maxChargeKw?: number | null;
  maxDischargeKw?: number | null;
};

export type Severity = 'error' | 'warn' | 'info';
export type Issue = { severity: Severity; code: string; message: string; fix?: string };

export type StringPlan = { strings: { panels: number; mppt: number }[]; panelsPerString: number[]; mpptsUsed: number; parallelOnMppt: boolean };

export type CheckInput = {
  panel: PanelSpec;
  panelCount: number;
  inverter: InverterSpec;
  battery?: BatterySpec | null;
  batteryCount?: number;
  systemType: 'grid-tied' | 'off-grid';
  /** Off-grid only. */
  dailyLoadKwh?: number | null;
  peakLoadKw?: number | null;
  generatorBackup?: boolean;
  /** Coldest and hottest cell temperature to design for, °C. Defaults are deliberately conservative for the UK. */
  minTempC?: number;
  maxCellTempC?: number;
};

export type CheckResult = {
  ok: boolean;
  issues: Issue[];
  plan: StringPlan | null;
  metrics: {
    kwp: number | null;
    dcAcRatio: number | null;
    vocColdV: number | null;
    vmpHotV: number | null;
    minPanelsPerString: number | null;
    maxPanelsPerString: number | null;
    usableKwh: number | null;
    autonomyDays: number | null;
  };
  assumptions: string[];
};

export const DEFAULT_MIN_TEMP_C = -10;
export const DEFAULT_MAX_CELL_TEMP_C = 70;
/** DC/AC thresholds. Outside these the design is flagged, not rejected. */
export const DC_AC_LOW = 0.8;
export const DC_AC_HIGH = 1.3;
/** Off-grid autonomy below this many days is flagged. */
export const MIN_AUTONOMY_DAYS = 1;

const nz = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

type StringLimits = { vocCold: number; vmpHot: number; minLen: number; maxLen: number; maxParallel: number };

/** The string lengths a panel and inverter allow, or null when a needed figure is missing. */
export function stringLimits(panel: PanelSpec, inv: InverterSpec, minT: number, hotT: number): StringLimits | null {
  const { voc, vmp, isc, tempCoeffVocPct } = panel;
  if (!nz(voc) || !nz(vmp) || !nz(isc) || tempCoeffVocPct == null || !nz(inv.maxDcV) || !nz(inv.mpptMinV) || !nz(inv.mpptMaxV)) return null;
  const vmpCoeff = panel.tempCoeffVmpPct ?? tempCoeffVocPct;
  const vocCold = voc * (1 + (tempCoeffVocPct / 100) * (minT - 25));
  const vmpCold = vmp * (1 + (vmpCoeff / 100) * (minT - 25));
  const vmpHot = vmp * (1 + (vmpCoeff / 100) * (hotT - 25));
  const maxLen = Math.min(Math.floor(inv.maxDcV / vocCold), Math.floor(inv.mpptMaxV / vmpCold));
  const minLen = Math.ceil(inv.mpptMinV / vmpHot);
  const imp = nz(panel.imp) ? panel.imp : nz(panel.wp) ? panel.wp / vmp : null;
  if (!nz(inv.maxIscA) || !nz(inv.maxInputCurrentA) || imp == null) return { vocCold, vmpHot, minLen, maxLen, maxParallel: 0 };
  const maxParallel = Math.min(Math.floor(inv.maxIscA / isc), Math.floor(inv.maxInputCurrentA / imp));
  return { vocCold, vmpHot, minLen, maxLen, maxParallel };
}

/** A way to wire `n` panels, or null if there isn't one. Prefers the fewest MPPTs, then equal strings. */
export function planStrings(n: number, lim: StringLimits, mpptCount: number): StringPlan | null {
  if (n <= 0 || lim.maxLen < lim.minLen || lim.minLen < 1) return null;
  // One string per MPPT, lengths as even as possible (each MPPT is independent, so lengths may differ).
  if (lim.maxParallel >= 1) {
    for (let m = 1; m <= mpptCount; m++) {
      if (n >= m * lim.minLen && n <= m * lim.maxLen) {
        const base = Math.floor(n / m);
        const extra = n % m;
        const lens = Array.from({ length: m }, (_, i) => base + (i < extra ? 1 : 0));
        return { strings: lens.map((panels, mppt) => ({ panels, mppt })), panelsPerString: lens, mpptsUsed: m, parallelOnMppt: false };
      }
    }
  }
  // Two or more equal strings in parallel on an MPPT.
  if (lim.maxParallel >= 2) {
    for (let len = lim.maxLen; len >= lim.minLen; len--) {
      if (n % len) continue;
      const s = n / len;
      if (s <= mpptCount * lim.maxParallel) {
        const strings = Array.from({ length: s }, (_, i) => ({ panels: len, mppt: i % mpptCount }));
        return { strings, panelsPerString: [len], mpptsUsed: Math.min(s, mpptCount), parallelOnMppt: s > mpptCount };
      }
    }
  }
  return null;
}

function nearestWorkable(n: number, lim: StringLimits, mppts: number) {
  let below: number | null = null;
  let above: number | null = null;
  for (let k = n - 1; k >= 1 && below == null; k--) if (planStrings(k, lim, mppts)) below = k;
  for (let k = n + 1; k <= n + 60 && above == null; k++) if (planStrings(k, lim, mppts)) above = k;
  return { below, above };
}

const MISSING_LABEL: Record<string, string> = {
  voc: 'the panel’s Voc', vmp: 'the panel’s Vmp', isc: 'the panel’s Isc', tempCoeffVocPct: 'the panel’s Voc temperature coefficient',
  maxDcV: 'the inverter’s maximum DC voltage', mpptMinV: 'the inverter’s MPPT minimum voltage', mpptMaxV: 'the inverter’s MPPT maximum voltage',
  mpptCount: 'the inverter’s number of MPPTs', maxInputCurrentA: 'the inverter’s maximum input current per MPPT', maxIscA: 'the inverter’s maximum short-circuit current per MPPT',
  acKw: 'the inverter’s AC rating', wp: 'the panel’s rated power',
};

export function checkDesign(input: CheckInput): CheckResult {
  const issues: Issue[] = [];
  const assumptions: string[] = [];
  const add = (severity: Severity, code: string, message: string, fix?: string) => issues.push({ severity, code, message, ...(fix ? { fix } : {}) });
  const { panel, inverter: inv, panelCount: n } = input;
  const minT = input.minTempC ?? DEFAULT_MIN_TEMP_C;
  const hotT = input.maxCellTempC ?? DEFAULT_MAX_CELL_TEMP_C;
  assumptions.push(`Designed for a coldest panel temperature of ${minT} °C and a hottest cell temperature of ${hotT} °C.`);

  const missing = (obj: object, keys: string[], who: string) => {
    const rec = obj as Record<string, number | null | undefined>;
    // A temperature coefficient is negative, so "present" means "not null"; every other figure must be a positive number.
    const gone = keys.filter((k) => (k === 'tempCoeffVocPct' ? rec[k] == null : !nz(rec[k])));
    if (gone.length) add('error', 'missing_spec', `Can't fully check the design: ${gone.map((k) => MISSING_LABEL[k] ?? k).join(', ')} ${gone.length > 1 ? 'are' : 'is'} missing from the ${who} datasheet in the price book.`, 'Add the figure to the product in the price book (from its datasheet), then re-run the check.');
  };
  missing(panel, ['wp', 'voc', 'vmp', 'isc', 'tempCoeffVocPct'], 'panel');
  missing(inv, ['acKw', 'maxDcV', 'mpptMinV', 'mpptMaxV', 'mpptCount', 'maxInputCurrentA', 'maxIscA'], 'inverter');

  if (!(n > 0)) add('error', 'no_panels', 'There are no panels in the design.');

  // --- power
  const kwp = nz(panel.wp) && n > 0 ? r2((panel.wp * n) / 1000) : null;
  const ratio = kwp != null && nz(inv.acKw) ? r2(kwp / inv.acKw) : null;
  if (ratio != null && kwp != null && nz(inv.acKw)) {
    if (ratio < DC_AC_LOW) add('warn', 'dc_ac_low', `The array (${kwp} kWp) is small for a ${inv.acKw} kW inverter: DC/AC ratio ${ratio}. The inverter will rarely reach its rating, so you are paying for capacity you can't use.`, `Add panels (another roof face), or choose a smaller inverter of about ${r1(kwp / 1.1)} kW.`);
    else if (ratio > DC_AC_HIGH) add('warn', 'dc_ac_high', `DC/AC ratio is ${ratio}: the array (${kwp} kWp) is large for a ${inv.acKw} kW inverter, so output will be clipped on sunny days.`, 'Choose a larger inverter or fewer panels.');
  }
  if (kwp != null && nz(inv.maxPvKw) && kwp > inv.maxPvKw) add('error', 'pv_over_max', `${kwp} kWp is more than the inverter's maximum PV input of ${inv.maxPvKw} kW.`, 'Reduce the number of panels or choose a larger inverter.');

  // --- strings
  let plan: StringPlan | null = null;
  const lim = stringLimits(panel, inv, minT, hotT);
  if (lim && nz(inv.mpptCount)) {
    if (lim.maxLen < 1) add('error', 'string_voltage', `A single panel's cold open-circuit voltage (${r1(lim.vocCold)} V) already exceeds what this inverter allows.`, 'Choose a different inverter or panel.');
    else if (lim.maxLen < lim.minLen) add('error', 'string_window', `No string length works: at least ${lim.minLen} panels are needed to stay above the MPPT minimum when hot, but no more than ${lim.maxLen} are allowed by the cold voltage limit.`, 'Choose a different inverter or panel.');
    else if (n > 0) {
      plan = planStrings(n, lim, inv.mpptCount);
      if (!plan) {
        const near = nearestWorkable(n, lim, inv.mpptCount);
        const opts = [near.below != null ? `${near.below} panels` : null, near.above != null ? `${near.above} panels` : null].filter(Boolean).join(' or ');
        add('error', 'no_string_plan', `${n} panels can't be wired within this inverter's limits (strings of ${lim.minLen}–${lim.maxLen} panels, ${inv.mpptCount} MPPT${inv.mpptCount > 1 ? 's' : ''}${lim.maxParallel < 1 ? ', and the current limits stop any string connecting' : ''}).`, opts ? `The nearest counts that work are ${opts}.` : 'Choose a different inverter.');
      } else if (plan.parallelOnMppt) add('info', 'parallel_strings', 'Some MPPTs carry two or more strings in parallel; fuse or protect them as the inverter manufacturer requires.');
      if (plan && plan.panelsPerString.includes(lim.minLen)) add('warn', 'string_near_min', `A string of ${lim.minLen} panels sits right at the inverter's minimum MPPT voltage when hot, so output may drop out on hot days.`, 'Add a panel to that string if you can.');
    }
  } else if (n > 0) add('error', 'cannot_size_strings', 'String sizing could not be checked because datasheet figures are missing (see above).');

  // --- battery
  let usableKwh: number | null = null;
  const bat = input.battery ?? null;
  const bc = Math.max(1, input.batteryCount ?? 1);
  if (bat) {
    if (nz(bat.usableKwh)) usableKwh = r2(bat.usableKwh * bc);
    else add('error', 'missing_spec', 'The battery’s usable capacity is missing from its datasheet in the price book.', 'Add it to the product in the price book.');
    if (nz(bat.nominalV) && nz(inv.batteryMinV) && nz(inv.batteryMaxV)) {
      if (bat.nominalV < inv.batteryMinV || bat.nominalV > inv.batteryMaxV) add('error', 'battery_voltage', `The battery's nominal ${bat.nominalV} V is outside the inverter's battery range of ${inv.batteryMinV}–${inv.batteryMaxV} V.`, 'Choose a battery that is compatible with this inverter.');
    } else add('warn', 'battery_voltage_unchecked', 'Battery and inverter voltage compatibility could not be checked because a voltage figure is missing from a datasheet.');
    const dis = nz(bat.maxDischargeKw) ? bat.maxDischargeKw * bc : null;
    const ch = nz(bat.maxChargeKw) ? bat.maxChargeKw * bc : null;
    if (dis != null && nz(inv.acKw) && dis < inv.acKw) add('warn', 'battery_discharge_limit', `The battery can only discharge ${r1(dis)} kW, less than the inverter's ${inv.acKw} kW, so battery-fed output will be limited to ${r1(dis)} kW.`, 'Add battery modules or accept the lower battery power.');
    if (dis == null) add('warn', 'battery_power_unchecked', 'The battery’s maximum discharge power is not in the price book, so charge and discharge limits against the inverter were not checked.');
    if (ch != null && nz(inv.maxChargeKw) && ch < inv.maxChargeKw) add('info', 'battery_charge_limit', `Battery charge power (${r1(ch)} kW) is below the inverter's maximum (${inv.maxChargeKw} kW).`);
  }

  // --- off-grid
  let autonomy: number | null = null;
  if (input.systemType === 'off-grid') {
    if (inv.offGridCapable !== true) add('error', 'not_off_grid', inv.offGridCapable === false ? 'This inverter does not support true off-grid (island) operation.' : "I can't confirm this inverter supports true off-grid (island) operation: it isn't recorded in the price book.", 'Choose an off-grid capable inverter, or record the capability from the datasheet.');
    if (input.generatorBackup && inv.generatorInput !== true) add('error', 'no_generator_input', inv.generatorInput === false ? 'You want generator backup, but this inverter has no generator input.' : "You want generator backup, but I can't confirm this inverter has a generator input.", 'Choose an inverter with a generator input, or record it from the datasheet.');
    if (!bat) add('error', 'off_grid_no_battery', 'An off-grid system needs a battery.', 'Add a battery.');
    if (usableKwh != null && nz(input.dailyLoadKwh)) {
      autonomy = r1(usableKwh / input.dailyLoadKwh);
      if (autonomy < MIN_AUTONOMY_DAYS) add('warn', 'autonomy_low', `The battery covers about ${autonomy} day${autonomy === 1 ? '' : 's'} of the stated ${input.dailyLoadKwh} kWh/day load with no sun. That is under ${MIN_AUTONOMY_DAYS} day, so a cloudy spell will flatten it.`, `For ${MIN_AUTONOMY_DAYS} day you need about ${r1(input.dailyLoadKwh * MIN_AUTONOMY_DAYS)} kWh usable. Add battery capacity or a generator.`);
      else add('info', 'autonomy', `About ${autonomy} day${autonomy === 1 ? '' : 's'} of autonomy at ${input.dailyLoadKwh} kWh/day (battery only, no solar).`);
    } else if (usableKwh != null) add('warn', 'need_load', "I can't state days of autonomy without a daily load in kWh (or the main appliances).", 'Ask the customer for their daily use.');
    if (nz(input.peakLoadKw) && nz(inv.acKw) && input.peakLoadKw > inv.acKw) add('error', 'peak_over_inverter', `The stated peak load (${input.peakLoadKw} kW) is more than the inverter's ${inv.acKw} kW.`, 'Choose a larger inverter or reduce simultaneous loads.');
  }

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    plan,
    metrics: {
      kwp,
      dcAcRatio: ratio,
      vocColdV: lim ? r1(lim.vocCold) : null,
      vmpHotV: lim ? r1(lim.vmpHot) : null,
      minPanelsPerString: lim ? lim.minLen : null,
      maxPanelsPerString: lim ? lim.maxLen : null,
      usableKwh,
      autonomyDays: autonomy,
    },
    assumptions,
  };
}
