import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import { cleanOption, type ProposalOption } from './types';

/**
 * Reading an OpenSolar proposal (a PDF) for the figures the quote's cover and writing use: for each system option its size, panels,
 * inverter, battery, warranties and yearly generation, plus (kept apart) the designer's savings and payback. Only what is printed is
 * copied. The first pages go to the model as a document (the options and their specifications sit at the front), so a long
 * proposal costs no more than a short one. No ANTHROPIC_API_KEY: no read.
 */
const MODEL = process.env.QUOTE_READER_MODEL || 'claude-haiku-5-5';
const FIRST_PAGES = 24;

const Option = z.object({
  name: z.string().nullable(),
  system_kwp: z.number().nullable(),
  panel_count: z.number().nullable(),
  panel_watts: z.number().nullable(),
  panel_brand: z.string().nullable(),
  panel_model: z.string().nullable(),
  panel_product_warranty_years: z.number().nullable(),
  panel_performance_warranty_years: z.number().nullable(),
  inverter_brand: z.string().nullable(),
  inverter_model: z.string().nullable(),
  inverter_count: z.number().nullable(),
  inverter_kw: z.number().nullable(),
  inverter_warranty_years: z.number().nullable(),
  battery_brand: z.string().nullable(),
  battery_model: z.string().nullable(),
  battery_modules: z.number().nullable(),
  battery_usable_kwh: z.number().nullable(),
  battery_warranty_years: z.number().nullable(),
  annual_generation_kwh: z.number().nullable(),
  annual_savings_gbp: z.number().nullable(),
  payback_text: z.string().nullable(),
  self_sufficiency_pct_with_battery: z.number().nullable(),
  self_sufficiency_pct_panels_only: z.number().nullable(),
  annual_consumption_kwh: z.number().nullable(),
  kwh_per_kwp: z.number().nullable(),
  shade_factor: z.number().nullable(),
  tilt_degrees: z.number().nullable(),
  monthly_generation_kwh: z.array(z.number()).nullable(),
  option_page: z.number().nullable(),
  monthly_use_kwh: z.array(z.number()).nullable(),
  bill_before_monthly_gbp: z.array(z.number()).nullable(),
  bill_after_monthly_gbp: z.array(z.number()).nullable(),
  cumulative_net_gbp: z.array(z.number()).nullable(),
  first_year: z.number().nullable(),
  net_savings_gbp: z.number().nullable(),
  rate_of_return_pct: z.number().nullable(),
  solar_share_of_use_pct: z.number().nullable(),
  co2_tonnes_per_year: z.number().nullable(),
  car_km_lifetime: z.number().nullable(),
  trees_lifetime: z.number().nullable(),
  flights_lifetime: z.number().nullable(),
  expected_selfconsumption_panels_only_kwh: z.number().nullable(),
  expected_selfconsumption_with_battery_kwh: z.number().nullable(),
  tariff_day_pence_per_kwh: z.number().nullable(),
  tariff_night_pence_per_kwh: z.number().nullable(),
  standing_charge_pence_per_day: z.number().nullable(),
  export_pence_per_kwh: z.number().nullable(),
  energy_price_rise_pct: z.number().nullable(),
  discount_rate_pct: z.number().nullable(),
  panel_degradation_pct_per_year: z.number().nullable(),
});
const Read = z.object({ readable: z.boolean(), options: z.array(Option) });

const PROMPT =
  'This is a design proposal for a home solar system, with one or more system options. For each option copy exactly what is printed: ' +
  'its name, system size in kWp, number of panels and their wattage, panel brand and model, inverter brand, model, count and power in kW, ' +
  'battery brand, model, number of modules and usable capacity in kWh, each warranty in years, the estimated annual generation in kWh, ' +
  'the estimated annual bill saving in pounds, the payback as printed (for example "9 Years 6 Months"), self-sufficiency with the battery and with the panels only in percent, ' +
  'the assumed annual consumption in kWh, the MCS kWh per kWp, the shade factor, the panel tilt in degrees, the monthly generation for January to December in kWh (exactly twelve numbers, from the monthly table) ' +
  'and the page number (counting the first page as 1) of the page headed System Option for that option. ' +
  'Also, from the electricity bill savings table, the twelve monthly net grid consumption figures before the new system (kWh) and the twelve monthly utility bills before and after (pounds); ' +
  'from the net financial impact page, the cumulative impacts for every year (negative at first) and the first year, the estimated net savings in pounds and the rate of return in percent; ' +
  'from the performance tables the expected annual solar self-consumption with panels only and with the battery in kWh; from the tariff details the day and night prices in pence per kWh (convert pounds to pence), any standing charge in pence per day and any export rate in pence per kWh; the assumed yearly energy price rise, the discount rate and the yearly panel degradation in percent (work the degradation out from the first two years of generation if it is not printed); ' +
  'and from the environmental benefits, the percentage of use generated by solar, the tonnes of CO2 reduced a year, the lifetime car kilometres avoided, trees planted and long haul flights avoided. ' +
  'Use null for anything not printed. Never work anything out and never guess. If there is no system option in it, set readable to false and give an empty list.';

/** Just the first pages of the PDF: where the options and their specifications are, and far cheaper than all of it. */
async function firstPages(bytes: Uint8Array): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  if (src.getPageCount() <= FIRST_PAGES) return bytes;
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, Array.from({ length: FIRST_PAGES }, (_, i) => i));
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

export const proposalConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

export async function readProposal(bytes: Uint8Array): Promise<{ ok: true; options: ProposalOption[] } | { ok: false; error: string }> {
  if (!proposalConfigured()) return { ok: false, error: 'The writing assistant isn’t switched on yet (it needs the ANTHROPIC_API_KEY in Vercel).' };
  try {
    const data = Buffer.from(await firstPages(bytes)).toString('base64');
    const res = await new Anthropic().beta.messages.create(
      {
        model: MODEL,
        max_tokens: 6000,
        output_config: { format: betaZodOutputFormat(Read) },
        messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }, { type: 'text', text: PROMPT }] }],
      },
      { timeout: 45_000 }
    );
    if (res.stop_reason === 'refusal') return { ok: false, error: 'It couldn’t read that file.' };
    const last = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').at(-1)?.text;
    const parsed = last ? Read.safeParse(JSON.parse(last)) : null;
    if (!parsed?.success || !parsed.data.readable || !parsed.data.options.length) return { ok: false, error: 'No system options found in that file. Is it an OpenSolar proposal?' };
    const options = parsed.data.options.map((o) =>
      cleanOption({
        name: o.name, systemKwp: o.system_kwp, panelCount: o.panel_count, panelWatts: o.panel_watts, panelBrand: o.panel_brand, panelModel: o.panel_model,
        panelProductWarrantyYears: o.panel_product_warranty_years, panelPerformanceWarrantyYears: o.panel_performance_warranty_years,
        inverterBrand: o.inverter_brand, inverterModel: o.inverter_model, inverterCount: o.inverter_count, inverterKw: o.inverter_kw, inverterWarrantyYears: o.inverter_warranty_years,
        batteryBrand: o.battery_brand, batteryModel: o.battery_model, batteryModules: o.battery_modules, batteryUsableKwh: o.battery_usable_kwh, batteryWarrantyYears: o.battery_warranty_years,
        annualGenerationKwh: o.annual_generation_kwh, annualSavingsGbp: o.annual_savings_gbp, paybackText: o.payback_text, selfSufficiencyPct: o.self_sufficiency_pct_with_battery,
        selfSufficiencyPvOnlyPct: o.self_sufficiency_pct_panels_only, consumptionKwh: o.annual_consumption_kwh, kwhPerKwp: o.kwh_per_kwp, shadeFactor: o.shade_factor, tiltDeg: o.tilt_degrees, monthlyKwh: o.monthly_generation_kwh ?? undefined, optionPage: o.option_page,
        monthlyUseKwh: o.monthly_use_kwh ?? undefined, billBeforeGbp: o.bill_before_monthly_gbp ?? undefined, billAfterGbp: o.bill_after_monthly_gbp ?? undefined, cumulativeGbp: o.cumulative_net_gbp ?? undefined, firstYear: o.first_year, netSavingsGbp: o.net_savings_gbp, rateOfReturnPct: o.rate_of_return_pct, solarSharePct: o.solar_share_of_use_pct, co2TonnesYear: o.co2_tonnes_per_year, carKm: o.car_km_lifetime, trees: o.trees_lifetime, flights: o.flights_lifetime, selfUsePvKwh: o.expected_selfconsumption_panels_only_kwh, selfUseBatteryKwh: o.expected_selfconsumption_with_battery_kwh, tariffDayPence: o.tariff_day_pence_per_kwh, tariffNightPence: o.tariff_night_pence_per_kwh, standingPencePerDay: o.standing_charge_pence_per_day, exportPence: o.export_pence_per_kwh, priceRisePct: o.energy_price_rise_pct, discountPct: o.discount_rate_pct, degradationPct: o.panel_degradation_pct_per_year,
      })
    );
    return { ok: true, options: options.filter((o) => Object.keys(o).length) };
  } catch (e) {
    return { ok: false, error: e instanceof Error && /timeout|timed out/i.test(e.message) ? 'That took too long. Try again.' : 'It couldn’t read that file. Try again.' };
  }
}

const n0 = (x: number) => Math.round(x).toLocaleString('en-GB');
const kw = (x: number) => `${Math.round(x * 100) / 100}`;

/** The proposal's figures as plain sentences, for the writers (never prices; savings only when allowed). */
export function factsText(o: ProposalOption, financials = false): string {
  const lines: string[] = [];
  if (o.systemKwp) lines.push(`Solar array: ${kw(o.systemKwp)} kWp${o.panelCount ? `, ${o.panelCount} panels` : ''}${o.panelWatts ? ` of ${o.panelWatts} W` : ''}${o.panelBrand || o.panelModel ? ` (${[o.panelBrand, o.panelModel].filter(Boolean).join(' ')})` : ''}.`);
  else if (o.panelCount) lines.push(`Solar panels: ${o.panelCount}${o.panelWatts ? ` × ${o.panelWatts} W` : ''}${o.panelBrand || o.panelModel ? ` (${[o.panelBrand, o.panelModel].filter(Boolean).join(' ')})` : ''}.`);
  if (o.inverterModel || o.inverterBrand) lines.push(`Inverter: ${o.inverterCount && o.inverterCount > 1 ? `${o.inverterCount} × ` : ''}${[o.inverterBrand, o.inverterModel].filter(Boolean).join(' ')}${o.inverterKw ? `, ${kw(o.inverterKw)} kW` : ''}.`);
  if (o.batteryUsableKwh || o.batteryModel) {
    const unit = [o.batteryBrand, o.batteryModel].filter(Boolean).join(' ');
    lines.push(`Battery: ${[o.batteryUsableKwh ? `${kw(o.batteryUsableKwh)} kWh usable capacity` : '', unit ? `${o.batteryModules && o.batteryModules > 1 ? `${o.batteryModules} × ` : ''}${unit}` : ''].filter(Boolean).join(', ')}.`);
  }
  const w: string[] = [];
  if (o.panelProductWarrantyYears) w.push(`${o.panelProductWarrantyYears}-year panel product warranty`);
  if (o.panelPerformanceWarrantyYears) w.push(`${o.panelPerformanceWarrantyYears}-year panel performance warranty`);
  if (o.inverterWarrantyYears) w.push(`${o.inverterWarrantyYears}-year inverter product warranty`);
  if (o.batteryWarrantyYears) w.push(`${o.batteryWarrantyYears}-year battery product warranty`);
  if (w.length) lines.push(`Manufacturer warranties: ${w.join(', ')}.`);
  if (o.annualGenerationKwh) lines.push(`Estimated annual generation: ${n0(o.annualGenerationKwh)} kWh.`);
  if (financials) {
    if (o.annualSavingsGbp) lines.push(`Estimated annual bill saving: £${n0(o.annualSavingsGbp)}.`);
    if (o.paybackText) lines.push(`Estimated payback: ${o.paybackText}.`);
  }
  return lines.join('\n');
}

/** The cover's "System at a glance" rows. */
export function glanceRows(o: ProposalOption, financials = false): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (o.systemKwp) rows.push({ label: 'System size', value: `${kw(o.systemKwp)} kWp solar PV` });
  if (o.panelCount) rows.push({ label: 'Solar panels', value: `${o.panelCount} × ${o.panelWatts ? `${o.panelWatts} W ` : ''}${[o.panelBrand, o.panelModel].filter(Boolean).join(' ')}`.trim() });
  if (o.inverterModel || o.inverterBrand) rows.push({ label: 'Inverter', value: `${o.inverterCount && o.inverterCount > 1 ? `${o.inverterCount} × ` : ''}${[o.inverterBrand, o.inverterModel].filter(Boolean).join(' ')}${o.inverterKw ? ` (${kw(o.inverterKw)} kW)` : ''}` });
  if (o.batteryUsableKwh) rows.push({ label: 'Battery storage', value: `${kw(o.batteryUsableKwh)} kWh usable${o.batteryModules ? `, ${o.batteryModules} × ${[o.batteryBrand, o.batteryModel].filter(Boolean).join(' ')}` : ''}`.trim() });
  if (o.annualGenerationKwh) rows.push({ label: 'Estimated generation', value: `${n0(o.annualGenerationKwh)} kWh a year` });
  const w: string[] = [];
  if (o.panelProductWarrantyYears) w.push(`panels ${o.panelProductWarrantyYears} years${o.panelPerformanceWarrantyYears ? ` (performance ${o.panelPerformanceWarrantyYears})` : ''}`);
  if (o.inverterWarrantyYears) w.push(`inverter ${o.inverterWarrantyYears}`);
  if (o.batteryWarrantyYears) w.push(`battery ${o.batteryWarrantyYears}`);
  if (w.length) rows.push({ label: 'Manufacturer warranties', value: w.join(' · ') });
  if (financials) {
    if (o.annualSavingsGbp) rows.push({ label: 'Estimated annual saving', value: `£${n0(o.annualSavingsGbp)}` });
    if (o.paybackText) rows.push({ label: 'Estimated payback', value: o.paybackText });
  }
  return rows;
}
