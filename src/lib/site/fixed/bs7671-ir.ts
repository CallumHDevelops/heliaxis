/**
 * Minimum insulation resistance for a circuit, by the test voltage used: BS 7671 Table 64 as it's
 * remembered from BS 7671:2018 (SELV and PELV tested at 250 V d.c., 0.5 MΩ; up to 500 V tested at
 * 500 V, 1 MΩ; above 500 V tested at 1000 V, 1 MΩ). Not checked against the A4:2026 text, so
 * `verified` stays false: the EIC screen shows the figure as "check it against Table 64", and a
 * reading under it is for the office to look at, not a stop. Flipping `verified` is a deliberate
 * commit naming where it was checked.
 */
export const IR_TABLE_64 = {
  standard: 'BS 7671 Table 64',
  issue: 'BS 7671:2018 (not checked against A4:2026)',
  verified: false,
  rows: [
    { circuit: 'SELV and PELV', testVolts: 250, minMegaohm: 0.5 },
    { circuit: 'Up to and including 500 V', testVolts: 500, minMegaohm: 1 },
    { circuit: 'Above 500 V', testVolts: 1000, minMegaohm: 1 },
  ],
} as const;

/** The minimum (MΩ) for a test voltage, or null when the voltage isn't one in the table. */
export function irMinimumAt(testVolts: number | null | undefined): number | null {
  if (!testVolts) return null;
  return IR_TABLE_64.rows.find((r) => r.testVolts === testVolts)?.minMegaohm ?? null;
}
