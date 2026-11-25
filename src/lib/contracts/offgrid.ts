import type { Answers } from '@/lib/templates/types';

/**
 * The variables for the off-grid contract pack (HX-OG-01 to 06): the answers Metis fills in. Pure. The wording of each
 * document is fixed in src/lib/templates/seed/off-grid.ts; nothing here touches a clause, and nothing here answers a
 * question that belongs to the customer (the acknowledgements) or the installer (the handover checklist), or signs.
 */

export const OG_CODES = ['HX-OG-01', 'HX-OG-02', 'HX-OG-03', 'HX-OG-04', 'HX-OG-05', 'HX-OG-06'] as const;
export type OgCode = (typeof OG_CODES)[number];

export const gbp = (pence: number) => `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type StageInput = { label: string; percent: number; due: string };
export type ScheduleLine = { label: string; percent: number; amountPence: number; due: string };

/**
 * Split the price into payments. The percentages must add up to 100; each amount is rounded down to the penny and the last
 * takes what is left, so the payments always add up to the price exactly.
 */
export function buildSchedule(totalPence: number, stages: StageInput[]): { ok: true; lines: ScheduleLine[] } | { ok: false; error: string } {
  if (!Number.isInteger(totalPence) || totalPence <= 0) return { ok: false, error: 'The quote has no price to split into payments.' };
  if (stages.length < 1 || stages.length > 4) return { ok: false, error: 'A payment schedule has between 1 and 4 payments.' };
  if (stages.some((s) => !(s.percent > 0) || !s.label.trim() || !s.due.trim())) return { ok: false, error: 'Each payment needs what it is for, a percentage above zero and when it is due.' };
  const sum = stages.reduce((a, s) => a + s.percent, 0);
  if (Math.abs(sum - 100) > 1e-9) return { ok: false, error: `The payments add up to ${Math.round(sum * 100) / 100}%, not 100%.` };
  let paid = 0;
  const lines = stages.map((s, i) => {
    const amountPence = i === stages.length - 1 ? totalPence - paid : Math.floor((totalPence * s.percent) / 100);
    paid += amountPence;
    return { label: s.label.trim(), percent: s.percent, amountPence, due: s.due.trim() };
  });
  return { ok: true, lines };
}

export type DesignFacts = {
  panels: string;
  arrayKwp: string;
  layout: string;
  strings: string;
  inverter: string;
  battery: string;
  batteryUsable: string;
  generator: string;
  dcAc: string;
  dailyLoad: string;
  autonomy: string;
  assumptions: string;
  designPoints: string;
  designRef: string;
  surveyStatus: string;
};

export type PackFacts = {
  customerType: 'Consumer' | 'Business';
  quoteRef: string;
  totalPence: number;
  vatPence: number;
  schedule: ScheduleLine[];
  design: DesignFacts;
  warranty: { panelYears: number | null; inverterYears: number | null; batteryYears: number | null; workmanshipYears: number | null };
  invoiceNo?: string | null;
  /** The consumer's own request to start within 14 days: only true or false if they have said so. */
  startEarly?: boolean | null;
};

/** Drop empty values so a missing fact stays "Not answered" (and is chased) instead of being filled with blank text. */
const keep = (a: Record<string, string | number | null | undefined>): Answers => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== null && v !== undefined && v !== ''));

export function answersFor(code: OgCode, f: PackFacts): Answers {
  switch (code) {
    case 'HX-OG-01':
      return keep({ customer_type: f.customerType, quote_ref: f.quoteRef, ...(f.customerType === 'Consumer' && f.startEarly != null ? { start_early: f.startEarly ? 'yes' : 'no' } : {}) });
    case 'HX-OG-02':
      return {}; // the customer's own acknowledgements, and their signature
    case 'HX-OG-03': {
      const d = f.design;
      return keep({ quote_ref: f.quoteRef, panels: d.panels, array_kwp: d.arrayKwp, layout: d.layout, strings: d.strings, inverter: d.inverter, battery: d.battery, battery_usable: d.batteryUsable, generator: d.generator, dc_ac: d.dcAc, daily_load: d.dailyLoad, autonomy: d.autonomy, assumptions: d.assumptions, design_points: d.designPoints, design_ref: d.designRef, survey_status: d.surveyStatus });
    }
    case 'HX-OG-04':
      return keep({ panel_years: f.warranty.panelYears, inverter_years: f.warranty.inverterYears, battery_years: f.warranty.batteryYears, workmanship_years: f.warranty.workmanshipYears });
    case 'HX-OG-05': {
      const a: Record<string, string> = { quote_ref: f.quoteRef, total: gbp(f.totalPence), vat: gbp(f.vatPence), ...(f.invoiceNo ? { invoice_no: f.invoiceNo } : {}) };
      f.schedule.forEach((l, i) => {
        a[`p${i + 1}_label`] = l.label;
        a[`p${i + 1}_amount`] = gbp(l.amountPence);
        a[`p${i + 1}_due`] = l.due;
      });
      return a;
    }
    case 'HX-OG-06':
      return {}; // ticked by the installer at handover
  }
}
