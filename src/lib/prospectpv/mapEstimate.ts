/**
 * The estimate shown before any money is spent. Pure, no I/O.
 *
 * In Phase M1 only the number of homes in the area is known (one cheap OS
 * Places call). How many get a Google Solar check depends on the OS screen in
 * M2, so the worst case is shown: every home is checked. Homes already written
 * to or opted out can only be counted once the addresses are fetched, so the
 * estimate says so instead of guessing a figure.
 */

export type EstimateInput = {
  homesFound: number;
  /** Google Solar calls already made this month (from pv_api_log). */
  solarCallsThisMonth: number;
  /** Settings: null means [TBC] and nothing is invented. */
  freeCallsPerMonth: number | null;
  costPerCallGbp: number | null;
  monthlyCapGbp: number | null;
  /** Spend already logged this month across providers (GBP). */
  spentThisMonthGbp: number;
  maxHomesPerScan: number | null;
};

export type Estimate = {
  homesFound: number;
  /** Upper bound until the OS screen has run. */
  solarCallsAtMost: number;
  freeCallsLeft: number | null;
  billableCallsAtMost: number | null;
  costAtMostGbp: number | null;
  capGbp: number | null;
  capRemainingGbp: number | null;
  /** Reasons this scan can't go ahead as drawn. */
  blockers: string[];
  /** Things the person should know that don't stop the scan. */
  notes: string[];
  canConfirm: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildEstimate(i: EstimateInput): Estimate {
  const blockers: string[] = [];
  const notes: string[] = [];

  const solarCallsAtMost = i.homesFound;
  const freeLeft = i.freeCallsPerMonth === null ? null : Math.max(0, i.freeCallsPerMonth - i.solarCallsThisMonth);
  const billable = freeLeft === null ? null : Math.max(0, solarCallsAtMost - freeLeft);

  let cost: number | null = null;
  if (billable !== null && i.costPerCallGbp !== null) cost = round2(billable * i.costPerCallGbp);
  else if (billable === 0) cost = 0;

  if (i.homesFound === 0) blockers.push('No homes were found in this area. Draw it over streets with houses.');
  if (i.maxHomesPerScan !== null && i.homesFound > i.maxHomesPerScan) {
    blockers.push(`${i.homesFound.toLocaleString('en-GB')} homes is over the limit of ${i.maxHomesPerScan.toLocaleString('en-GB')} per scan. Draw a smaller area.`);
  }

  const capRemaining = i.monthlyCapGbp === null ? null : round2(Math.max(0, i.monthlyCapGbp - i.spentThisMonthGbp));
  if (i.monthlyCapGbp === null) notes.push('No monthly spend cap is set yet. An admin should set one in Settings before a scan runs.');
  if (cost === null && billable !== null && billable > 0) {
    notes.push('The cost per Google Solar call isn’t set, so the cost can’t be shown. Set it in Settings.');
  }
  if (cost !== null && capRemaining !== null && cost > capRemaining) {
    blockers.push(`The worst-case cost (£${cost.toFixed(2)}) is more than the £${capRemaining.toFixed(2)} left under this month’s cap.`);
  }
  notes.push('Homes already written to, or opted out, are taken off once the addresses are fetched. They don’t count towards a scan.');

  return {
    homesFound: i.homesFound,
    solarCallsAtMost,
    freeCallsLeft: freeLeft,
    billableCallsAtMost: billable,
    costAtMostGbp: cost,
    capGbp: i.monthlyCapGbp,
    capRemainingGbp: capRemaining,
    blockers,
    notes,
    canConfirm: blockers.length === 0,
  };
}
