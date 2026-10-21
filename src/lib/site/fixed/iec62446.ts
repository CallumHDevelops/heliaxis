/**
 * Insulation-resistance minimums for PV array tests, by test voltage (FORMS 5.3, from BS EN IEC
 * 62446-1 as the research notes give it: 0.5 MΩ at a 250 V test, 1 MΩ at 500 V and 1000 V). One table,
 * used by the string tests' check (rules.ts irMinimum). `verified` stays false until someone has checked it
 * against the current edition of the standard; until then the string tests screen says so beside the figure.
 */
export const IR_MINIMUM = {
  standard: 'BS EN IEC 62446-1',
  verified: false,
  rows: [
    { upToVolts: 250, minMegaohm: 0.5 },
    { upToVolts: 1000, minMegaohm: 1 },
  ],
} as const;
