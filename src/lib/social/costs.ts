import defaults from './config/costs.defaults.json';

/**
 * Costs report maths. Pure: no I/O. Every figure that is not measured comes from the assumptions below,
 * which an admin can change, and the report says which numbers are measured and which are assumed.
 */

export type Assumptions = Omit<typeof defaults, 'fixed_costs_gbp'> & { fixed_costs_gbp: Record<string, number> };
export const DEFAULT_ASSUMPTIONS: Assumptions = defaults;

export type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

/** USD per million tokens (Anthropic's published prices for prompts up to 100K tokens). Cache reads 10% of input, cache writes 125%. */
const PRICES: { match: string; input: number; output: number }[] = [
  { match: 'haiku', input: 0.1, output: 0.5 },
  { match: 'sonnet', input: 2, output: 10 },
  { match: 'opus', input: 4, output: 20 },
];

/** Unknown models are priced like Opus, the dearest here, so the report never under-states. */
export function modelPrice(model: string) {
  return PRICES.find((p) => model.toLowerCase().includes(p.match)) ?? PRICES[PRICES.length - 1];
}

export function callCostUsd(model: string, u: Usage): number {
  const p = modelPrice(model);
  const input = u.input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  return (input * p.input + output * p.output + read * p.input * 0.1 + write * p.input * 1.25) / 1_000_000;
}

export type Volume = {
  /** Comments and reviews received in the period. */
  received: number;
  /** Of those, how many had a person deal with them (posted, dismissed or copied). */
  handled: number;
  /** Replies a person copied from a draft. */
  draftsUsed: number;
  /** Critical and High alerts sent. */
  urgentAlerts: number;
  aiCalls: number;
  aiCostUsd: number;
};

export type Report = {
  aiCostGbp: number;
  fixedCostsGbp: number;
  runningCostGbp: number;
  capUsedPct: number;
  /** Hours saved, by where the saving comes from. */
  hours: { triage: number; replies: number; monitoring: number; total: number };
  /** Compared with doing it by hand: the value of the hours saved. */
  timeValueGbp: number;
  netSavingGbp: number;
  /** Compared with buying a paid tool instead: what that tool would cost. These two are alternatives, never added together. */
  toolAvoidedGbp: number;
  vsToolSavingGbp: number;
  /** Value of the time saved per £1 spent, or null when nothing was spent. */
  returnPerPound: number | null;
};

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function buildReport(v: Volume, a: Assumptions): Report {
  const aiCostGbp = v.aiCostUsd * a.usd_to_gbp;
  const fixedCostsGbp = Object.values(a.fixed_costs_gbp).reduce((s, n) => s + (Number(n) || 0), 0);
  const runningCostGbp = aiCostGbp + fixedCostsGbp;

  // Triage: without this, someone opens each comment and decides what it is.
  const triage = (v.received * a.minutes_to_check_one_comment) / 60;
  // Replies: a draft turns writing from scratch into a quick review.
  const replies = (v.draftsUsed * Math.max(0, a.minutes_to_write_one_reply - a.minutes_to_review_a_draft)) / 60;
  // Monitoring: nobody has to keep refreshing each platform to spot a risky comment.
  const monitoring = (a.minutes_checking_platforms_per_day * a.days_checked_per_month) / 60;
  const total = triage + replies + monitoring;

  const timeValueGbp = total * a.staff_hourly_cost_gbp;
  const toolAvoidedGbp = a.comparison_tool_monthly_gbp;
  return {
    aiCostGbp: round(aiCostGbp, 4),
    fixedCostsGbp: round(fixedCostsGbp),
    runningCostGbp: round(runningCostGbp, 4),
    capUsedPct: a.ai_monthly_cap_gbp > 0 ? round((aiCostGbp / a.ai_monthly_cap_gbp) * 100, 1) : 0,
    hours: { triage: round(triage, 1), replies: round(replies, 1), monitoring: round(monitoring, 1), total: round(total, 1) },
    timeValueGbp: round(timeValueGbp),
    netSavingGbp: round(timeValueGbp - runningCostGbp),
    toolAvoidedGbp: round(toolAvoidedGbp),
    vsToolSavingGbp: round(toolAvoidedGbp - runningCostGbp),
    returnPerPound: runningCostGbp > 0 ? round(timeValueGbp / runningCostGbp, 1) : null,
  };
}
