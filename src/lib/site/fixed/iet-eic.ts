/**
 * The fixed wording of the BS 7671 model Electrical Installation Certificate, as Heliaxis's EIC prints
 * it (REGS 1.2). The IET lets businesses adapt its model forms electronically, as long as the IET logo
 * isn't used (REGS 1.6).
 *
 * Copied word for word from a real BS 7671:2018+A2:2022 certificate (the ECA's rendition of the IET
 * model form, issued March 2025, read in full for REGS 1.2), with "____ (date)" filled in from the
 * job's edition. A4:2026 re-letters the form A–J and splits TN-C-S into PME and PNB (REGS 1.4); the
 * wording itself still has to be checked against the IET's A4 PDF before release, so
 * `checkedAgainstA4` stays false until a person has done that (SPEC 3.3, 15). The lettering lives here,
 * in the print layer only: fixing a letter never changes stored answers.
 *
 * The single-signature EIC is its own model form, and its combined declaration wasn't in the source
 * read: `single` stays null, and a single-signature EIC prints the three declarations above one
 * signature until it's copied in (SPEC D14: regulated wording is copied, never written).
 */

export const EIC_SOURCE = 'IET model Electrical Installation Certificate, BS 7671:2018+A2:2022 (ECA rendition, Rev 1 of 2024)';
export const EIC_CHECKED_AGAINST_A4 = false;

/** "amended to ____ (date)": the year and the amendment, from the job's edition. */
export function editionWords(edition: string | null | undefined): string {
  const e = (edition || 'A4:2026').trim();
  const all = [...e.matchAll(/A(\d)\s*:\s*(\d{4})/gi)];
  const last = all.at(-1);
  return last ? `${last[2]} (A${last[1]})` : e;
}

export const DECLARATION = {
  design: (amended: string) =>
    `I/We, being the person(s) responsible for the design of the electrical installation (as indicated by my/our signatures below), particulars of which are described above, having exercised reasonable skill and care when carrying out the design, hereby CERTIFY that the design work for which I/we have been responsible is, to the best of my/our knowledge and belief, in accordance with BS 7671:2018 amended to ${amended} (date) except for departures, if any, detailed as follows:`,
  construction: (amended: string) =>
    `I, being the person responsible for the construction of the electrical installation (as indicated by my signatures below), particulars of which are described above, having exercised reasonable skill and care when carrying out the construction, hereby CERTIFY that the construction work of which I have been responsible is, to the best of my knowledge and belief, in accordance with BS 7671:2018 amended to ${amended} (date) except for departures, if any, detailed as follows:`,
  inspection: (amended: string) =>
    `I, being the person responsible for the inspection & testing of the electrical installation (as indicated by my signatures below), particulars of which are described above, having exercised reasonable skill and care when carrying out the inspection & testing, hereby CERTIFY that the work of which I have been responsible is, to the best of my knowledge and belief, in accordance with BS 7671:2018 amended to ${amended} (date) except for departures, if any, detailed as follows:`,
  /** The single-signature form's one declaration: not in the source read (see above). */
  single: null as ((amended: string) => string) | null,
};

export const LIABILITY = {
  design: 'The extent of liability of the signatory or signatories is limited to the work described above as the subject of this Certificate.',
  one: 'The extent of liability of the signatory is limited to the work described above as the subject of this Certificate.',
};

export const DEPARTURES = {
  design: 'Details of departures from BS 7671 (Regulation 120.3, 133.1.3, 133.5)',
  other: 'Details of departures from BS 7671 (Regulation 120.3 and 133.5)',
  exceptions: 'Details of permitted exceptions (regulation 411.3.3) where applicable',
  riskAssessment: 'A suitable risk assessment(s) must be attached to this certificate',
};

export const NEXT_INSPECTION = (interval: string) => `I/We the designer(s), recommend that this installation is further inspected and tested after an interval of not more than ${interval}.`;

export const SCHEDULES_VALID = (n: number) => `This Certificate is valid only when ${n} Schedule${n === 1 ? '' : 's'} of Circuit Details and Test Results ${n === 1 ? 'is' : 'are'} attached.`;

/** The 14 summary lines of the Schedule of Inspections (REGS 1.2, the same on the A2 form). */
export const INSPECTIONS: { n: string; label: string }[] = [
  { n: '1.0', label: 'Condition of consumer’s intake equipment (Visual inspection only)' },
  { n: '2.0', label: 'Parallel or switched alternative sources of supply' },
  { n: '3.0', label: 'Protective measure: Automatic Disconnection of Supply (ADS)' },
  { n: '4.0', label: 'Basic protection' },
  { n: '5.0', label: 'Protective measures other than ADS' },
  { n: '6.0', label: 'Additional protection' },
  { n: '7.0', label: 'Distribution equipment' },
  { n: '8.0', label: 'Circuits (Distribution and Final)' },
  { n: '9.0', label: 'Isolation and switching' },
  { n: '10.0', label: 'Current-using equipment (permanently connected)' },
  { n: '11.0', label: 'Identification and notices' },
  { n: '12.0', label: 'Location(s) containing a bath or shower' },
  { n: '13.0', label: 'Other special installations or locations' },
  { n: '14.0', label: 'Prosumer’s low voltage electrical installation(s)' },
];

/**
 * Codes for types of wiring (EIC column 3). The order of B–E came out scrambled from the source's text
 * (REGS 1.2 [U]): this is the order the research notes give. The certificate prints this key under the
 * schedule, so what's chosen and what's printed always agree; check the letters against the IET A4 PDF.
 */
export const WIRING_CODES: { code: string; label: string }[] = [
  { code: 'A', label: 'Thermoplastic insulated/sheathed cables' },
  { code: 'B', label: 'Thermoplastic cables in metallic conduit' },
  { code: 'C', label: 'Thermoplastic cables in non-metallic conduit' },
  { code: 'D', label: 'Thermoplastic cables in metallic trunking' },
  { code: 'E', label: 'Thermoplastic cables in non-metallic trunking' },
  { code: 'F', label: 'Thermoplastic SWA cables' },
  { code: 'G', label: 'Thermosetting SWA cables' },
  { code: 'H', label: 'Mineral-insulated cables' },
  { code: 'O', label: 'Other (please state)' },
];

/** A4:2026's section letters (REGS 1.4 [S]; A presumed to be the client). Print layer only. */
export const EIC_SECTIONS = {
  client: 'A',
  installation: 'B',
  declarations: 'C',
  next: 'D',
  signatories: 'E',
  supply: 'F',
  particulars: 'G',
  inspections: 'H',
  comments: 'I',
  schedules: 'J',
} as const;

/**
 * Notes under the schedules and the supply box. The source's own notes ran off the edge of the text
 * that could be read, so these say the same things in Heliaxis's words (they explain the columns;
 * they aren't declarations).
 */
export const SCHEDULE_NOTES = {
  spd: 'SPD type: a combined T1 + T2 or T2 + T3 device has both boxes ticked. A T3 SPD protecting equipment is described in Remarks (column 31).',
  zs: 'Column 12: where the maximum permitted Zs isn’t from the tables in BS 7671 Chapter 41, its source is given in Remarks (column 31).',
  spdStatus: 'Not all SPDs have a visible status indicator.',
  supply: 'Note: (1) by enquiry. (2) by enquiry or by measurement.',
  ipf: 'Ipf is the greater of the prospective short-circuit current and the prospective earth fault current.',
  rcd: 'RCD effectiveness is verified with an AC test at the rated residual operating current (IΔn).',
};
