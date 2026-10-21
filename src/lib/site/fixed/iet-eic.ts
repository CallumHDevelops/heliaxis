/**
 * The fixed wording of the IET model Electrical Installation Certificate, BS 7671:2018+A4:2026, as
 * Heliaxis's EIC prints it (REGS 1.2, SPEC D14: regulated wording is copied, never written).
 *
 * Source: "BS 7671:2018+A4:2026 MODEL FORMS FOR CERTIFICATION AND REPORTING", the IET's file of
 * 15 April 2026 (bs7671_eic_a4.pdf, 7 pages: the EIC's two pages, the Generic Schedule of Circuit
 * Details, the Generic Schedule of Test Results, the Notes for the person producing the Certificate
 * and the Guidance for recipients). Copied word for word from its text layer (pages 2–5) and, where
 * that layer is unreadable (pages 6–7), from the page images. Where the IET's own text has a stray
 * space ("BS 7 671:2018", "A4 :2026") it is printed without it.
 *
 * Licence (the file's page 1): free to photocopy and/or electronically manipulate the forms for use
 * solely in connection with an electrical contracting business; blank forms not for resale; the IET
 * logo must not be reproduced nor imposed on any copies (so it never is); not a check of the forms by
 * the IET; copyright not waived. The permission lapses seven years from 15 April 2026 (April 2033),
 * when it may be renewed on written application.
 *
 * The A4 file has no separate single-signature form and no combined declaration: Note 3 has one
 * person who did the design, construction, and inspection and testing sign in each of the three
 * places. The lettering (A–J) lives here, in the print layer only: fixing a letter never changes
 * stored answers.
 */

export const EIC_SOURCE = 'IET model forms for certification and reporting, BS 7671:2018+A4:2026 (15 April 2026): Electrical Installation Certificate, Generic Schedules of Circuit Details and Test Results';
export const EIC_CHECKED_AGAINST_A4 = true;
/** The model form's date and edition, for the footer of every page. */
export const EIC_FORM_BASIS = 'IET model form, BS 7671:2018+A4:2026 (15 April 2026)';

/** "amended to ____ (date)": the year and the amendment, from the job's edition. */
export function editionWords(edition: string | null | undefined): string {
  const e = (edition || 'A4:2026').trim();
  const all = [...e.matchAll(/A(\d)\s*:\s*(\d{4})/gi)];
  const last = all.at(-1);
  return last ? `${last[2]} (A${last[1]})` : e;
}

export const EIC_TITLE = 'ELECTRICAL INSTALLATION CERTIFICATE';
export const EIC_SUBTITLE = '(See the guidance for recipients included with this certificate)';
export const CERT_NO = 'Certificate No.:';
export const REPORT_NO = 'Certificate/Report No.:';

export const SECTION_TITLES = {
  A: 'SECTION A: DETAILS OF THE CLIENT',
  B: 'SECTION B: INSTALLATION DETAILS',
  C: 'SECTION C: CERTIFICATION SIGNATORIES',
  D: 'SECTION D: NEXT INSPECTION',
  E: 'SECTION E: PARTICULARS OF SIGNATORIES IN SECTION C',
  F: 'SECTION F: SUPPLY CHARACTERISTICS AND EARTHING ARRANGEMENTS',
  G: 'SECTION G: PARTICULARS OF INSTALLATION REFERRED TO IN THE CERTIFICATE',
  H: 'SECTION H: SCHEDULE OF INSPECTIONS',
  I: 'SECTION I: COMMENTS ON EXISTING INSTALLATION',
  I_NOTE: '(in the case of an addition or alteration see Regulation 644.1.2):',
  J: 'SECTION J: SCHEDULES',
} as const;

export const B_LABELS = {
  address: 'INSTALLATION ADDRESS',
  descExtent: 'DESCRIPTION AND EXTENT OF THE INSTALLATION',
  description: 'Description of installation:',
  extent: 'Extent of installation covered by this Certificate:',
  useContinuation: '(Use continuation sheet if necessary)',
  seeContinuation: 'See continuation sheet No.:',
  work: { new: 'New installation', addition: 'Adding to an existing installation', alteration: 'Alteration to an existing installation' },
} as const;

/** The three declarations of Section C; `amended` fills "amended to ____ (date)". */
export const DECLARATION = {
  design: (amended: string) =>
    `I/We, being the person(s) responsible for the design of the electrical installation (as indicated by my/our signatures below), particulars of which are described above, having exercised reasonable skill and care when carrying out the design, hereby CERTIFY that the design work for which I/we have been responsible is to the best of my/our knowledge and belief in accordance with BS 7671:2018, amended to ${amended} (date) except for the departures, if any, detailed as follows:`,
  construction: (amended: string) =>
    `I, being the person responsible for the construction of the electrical installation (as indicated by my signature below), particulars of which are described above, having exercised reasonable skill and care when carrying out the construction hereby CERTIFY that the construction work for which I have been responsible is to the best of my knowledge and belief in accordance with BS 7671:2018, amended to ${amended} (date) except for the departures, if any, detailed as follows:`,
  inspection: (amended: string) =>
    `I, being the person responsible for the inspection & testing of the electrical installation (as indicated by my signature below), particulars of which are described above, having exercised reasonable skill and care when carrying out the inspection & testing hereby CERTIFY that the work for which I have been responsible is to the best of my knowledge and belief in accordance with BS 7671:2018, amended to ${amended} (date) except for the departures, if any, detailed as follows:`,
};
export type Part = keyof typeof DECLARATION;
export const PART_HEADINGS: Record<Part, string> = { design: 'FOR DESIGN', construction: 'FOR CONSTRUCTION', inspection: 'FOR INSPECTION AND TESTING' };
export const PART_LEADS: Record<Part, string> = {
  design: 'For the DESIGN of the installation: **(Where there is mutual responsibility for the design)',
  construction: 'For CONSTRUCTION of the installation:',
  inspection: 'For INSPECTION AND TESTING of the installation:',
};
/** The same in all three parts. */
export const DEPARTURES = 'Details of departures from BS 7671 (Regulations 120.3, 133.1.2, 133.1.3 and 133.5):';
/** The design part only. */
export const EXCEPTIONS = 'Details of permitted exceptions (Regulation 411.3.3). Where applicable, a suitable risk assessment(s) must be attached to this Certificate.';
export const RISK_ASSESSMENT_ATTACHED = 'Risk assessment attached';
/** The same in all three parts. */
export const LIABILITY = 'The extent of liability of the signatory or signatories is limited to the work described above as the subject of this Certificate.';
export const SIGN_LINE = { signature: 'Signature:', date: 'Date:', name: 'Name (IN BLOCK CAPITALS):' } as const;
export const ROLES = { designer1: 'Designer No 1', designer2: 'Designer No 2**', constructor: 'Constructor', inspector: 'Inspector' } as const;

/** Section D: "…not more than ____ years/months." with the blank filled and the unit chosen. */
export const NEXT_INSPECTION = (n: string, unit: 'years' | 'months') =>
  `I/We, the designer(s), recommend that this installation is further inspected and tested after an interval of not more than ${n} ${unit}.`;
/** As the form prints it, before it's filled in. */
export const NEXT_INSPECTION_BLANK = 'I/We, the designer(s), recommend that this installation is further inspected and tested after an interval of not more than';

export const E_LABELS = {
  designer1: 'Designer (No 1)',
  designer2: 'Designer (No 2)',
  ifApplicable: '(if applicable)',
  constructor: 'Constructor',
  inspector: 'Inspector',
  name: 'Name:',
  onBehalf: 'For/on behalf of:',
  address: 'Address:',
  postcode: 'Postcode:',
  tel: 'Tel No:',
} as const;

/** Section F. `_{…}` is a subscript and `^{…}` a superscript in the print layer. */
export const F_LABELS = {
  earthing: 'Earthing arrangements',
  live: 'Number and Type of Live Conductors',
  params: 'Nature of Supply Parameters',
  device: 'Supply Protective Device',
  earthingOptions: ['TN-C', 'TN-S', 'TN-C-S (PME)', 'TN-C-S (PNB)', 'TT', 'IT'],
  ac: 'AC',
  dc: 'DC',
  acOptions: ['1-phase, 2-wire', '2-phase, 3-wire', '3-phase, 3-wire', '3-phase, 4-wire'],
  dcOptions: ['2-wire', '3-wire', 'Other'],
  polarity: 'Confirmation of supply polarity',
  u: 'Nominal voltage, U/U_{0} ^{(1)}',
  f: 'Nominal frequency, f^{(1)}',
  ipf: 'Prospective fault current, I_{pf} ^{(2)}',
  ze1: 'External earth fault',
  ze2: 'loop impedance, Z_{e}^{(2)}',
  note: '(Note: (1) by enquiry (2) by enquiry or by measurement)',
  bs: 'BS (EN)',
  type: 'Type',
  rated: 'Rated current',
  breaking: 'Breaking capacity',
  otherSources: 'Other sources of supply (as detailed on attached continuation sheet)',
} as const;

export const G_LABELS = {
  means: 'Means of Earthing',
  distributor: 'Distributor’s facility',
  electrode: 'Installation earth electrode',
  demandHead: 'Maximum Demand',
  demand: 'Maximum demand (load)',
  demandUnit: 'kVA / A (Delete as appropriate)',
  electrodeHead: 'Details of Installation Earth Electrode',
  electrodeWhere: '(where applicable)',
  electrodeType: 'Type (rod(s), tape etc)',
  electrodeLoc: 'Location',
  electrodeR: 'Electrode resistance/impedance, R_{A}/Z_{e}',
  electrodeRNote: '(delete as appropriate)',
  conductorsHead: 'Main Protective Conductors',
  earthingConductor: 'Earthing conductor',
  bondingConductors: 'Main protective bonding conductors',
  material: 'Material',
  csa: 'csa',
  verified: 'Connection / continuity verified',
  bonds: ['To water installation pipes', 'To gas installation pipes', 'To oil installation pipes', 'To structural steel', 'To lightning protection system'],
  toOther: 'To other',
  specify: 'Specify',
  mainSwitch: 'Main switch (Isolation device / Switch-fuse / Circuit-breaker / RCD etc.)',
  location: 'Location',
  bs: 'BS (EN)',
  poles: 'No of poles',
  current: 'Current rating',
  voltage: 'Voltage rating',
  ifOcpd: 'If overcurrent protective device',
  deviceType: 'Device type MCCB / ACB / Fuse(s) / other',
  deviceSetting: 'Device rating/setting',
  breaking: 'Breaking capacity',
  attachSettings: 'Attach protective device settings where applicable on separate continuation sheet(s).',
  ifRcd: 'If RCD main switch',
  rcdType: 'RCD Type AC / A / F / B / other',
  idn: 'Rated residual operating current (I_{Δn})',
  delay: 'Rated time delay',
  opTime: 'Measured operating time',
} as const;

export const H_HEAD = { item: 'Item No.', description: 'Description', outcome: 'Outcome', outcomeMarks: '/ N/A' } as const;

/**
 * The 14 lines of Section H, word for word with A4:2026. `lines` is how the form breaks the longer
 * ones over two lines.
 */
export const INSPECTIONS: { n: string; label: string; lines?: [string, string] }[] = [
  { n: '1.0', label: 'Condition of consumer’s intake equipment (Visual inspection only)', lines: ['Condition of consumer’s intake equipment', '(Visual inspection only)'] },
  { n: '2.0', label: 'Parallel or switched alternative sources of supply' },
  { n: '3.0', label: 'Protective measure: Automatic Disconnection of Supply (ADS)', lines: ['Protective measure:', 'Automatic Disconnection of Supply (ADS)'] },
  { n: '4.0', label: 'Basic protection' },
  { n: '5.0', label: 'Protective measures other than ADS' },
  { n: '6.0', label: 'Additional protection' },
  { n: '7.0', label: 'Distribution equipment' },
  { n: '8.0', label: 'Circuits (Distribution and Final)' },
  { n: '9.0', label: 'Isolation and switching' },
  { n: '10.0', label: 'Current-using equipment (permanently connected)', lines: ['Current-using equipment', '(permanently connected)'] },
  { n: '11.0', label: 'Identification and notices' },
  { n: '12.0', label: 'Location(s) containing a bath or shower' },
  { n: '13.0', label: 'Other special installations or locations' },
  { n: '14.0', label: 'Prosumer’s low voltage electrical installation(s)' },
];

/** Section J, the blanks filled: how many continuation sheets and for which sections, schedules of inspection, and schedules. */
export const J_LINE = (cont: string, sections: string, insp: string, sched: string) =>
  `${cont} Continuation sheet(s) for Section(s) ${sections} ${insp} Schedule(s) of Inspection ${sched} Schedule(s) of Circuit Details and Schedule(s) of Test Results`;
export const J_VALID = 'The schedule(s) and continuation sheet(s) listed are part of this document and this certificate is valid only when they are attached to it.';

/** Codes for types of wiring (column 3): letters and order checked against the A4:2026 form's own key. */
export const WIRING_CODES: { code: string; label: string }[] = [
  { code: 'A', label: 'Thermoplastic insulated/sheathed cables' },
  { code: 'B', label: 'Thermoplastic cables in metallic conduit' },
  { code: 'C', label: 'Thermoplastic cables in non-metallic conduit' },
  { code: 'D', label: 'Thermoplastic cables in metallic trunking' },
  { code: 'E', label: 'Thermoplastic cables in non-metallic trunking' },
  { code: 'F', label: 'Thermoplastic SWA cables' },
  { code: 'G', label: 'Thermosetting SWA cables' },
  { code: 'H', label: 'Mineral insulated cables' },
  { code: 'O', label: 'Other - please state' },
];
/** How the form's codes table breaks each label over two lines. */
export const WIRING_CODE_LINES: Record<string, [string, string?]> = {
  A: ['Thermoplastic insulated/', 'sheathed cables'],
  B: ['Thermoplastic cables in', 'metallic conduit'],
  C: ['Thermoplastic cables in', 'non-metallic conduit'],
  D: ['Thermoplastic cables in', 'metallic trunking'],
  E: ['Thermoplastic cables in', 'non-metallic trunking'],
  F: ['Thermoplastic', 'SWA cables'],
  G: ['Thermosetting', 'SWA cables'],
  H: ['Mineral insulated cables'],
  O: ['Other - please state'],
};

export type ScheduleGroup = { from: number; to: number; label: string; row: 1 | 2 };

export const CIRCUIT_SCHEDULE = {
  title: 'GENERIC SCHEDULE OF CIRCUIT DETAILS',
  boardBox: 'Distribution board/Consumer unit details',
  dbRef: 'DB/CU reference:',
  location: 'Location:',
  suppliedFrom: 'Supplied from:',
  ocpd: 'Distribution circuit OCPD: BS (EN):',
  ocpdType: 'Type:',
  ocpdRating: 'Rating/Setting:',
  spd: 'SPD Details: Type(s)*:',
  spdBoxes: ['T1', 'T2', 'T3^{†}', 'N/A'],
  rcd: 'RCD:',
  rcdBs: 'BS (EN)',
  rcdType: 'Type',
  rcdRating: 'Rating',
  rcdIdn: 'Rated residual operating current (I_{Δn}):',
  band: 'CIRCUIT DETAILS',
  codesTitle: 'CODES FOR TYPES OF WIRING',
  groups: [
    { from: 3, to: 7, label: 'Conductor details', row: 1 },
    { from: 6, to: 7, label: 'csa', row: 2 },
    { from: 8, to: 12, label: 'Overcurrent protective device', row: 1 },
    { from: 13, to: 16, label: 'RCD', row: 1 },
  ] as ScheduleGroup[],
  heads: {
    1: 'Circuit number',
    2: 'Circuit description',
    3: 'Type of wiring',
    4: 'Reference method^{‡}',
    5: 'Number of points served',
    6: 'Live (mm²)',
    7: 'CPC (mm²)',
    8: 'BS (EN)',
    9: 'Type',
    10: 'Rating (A)',
    11: 'Breaking capacity (kA)',
    12: 'Maximum permitted Z_{s} (Ω)^{§}',
    13: 'BS (EN)',
    14: 'Type',
    15: 'I_{Δn} (mA)',
    16: 'Rating (A)',
  } as Record<number, string>,
  rows: 12,
  footnotes: [
    '* SPD Type. Where a combined T1 + T2 or T2 + T3 device is installed, indicate by ticking both Type boxes.',
    '† Where a T3 SPD is installed to protect sensitive equipment, enter details in ‘Remarks’, column 31, of the Schedule of Test Results. (See Section 534 of BS 7671:2018+A4:2026.)',
    '‡ See Table 4A2 of Appendix 4 of BS 7671:2018+A4:2026.',
    '§ Where the maximum permitted earth fault loop impedance value stated in column 12 is taken from a source other than the tabulated values given in Chapter 41 of BS 7671:2018+A4:2026, state the source of the data in the appropriate cell for the circuit in the ‘Remarks’, column 31, of the Schedule of Test Results.',
  ],
};

export const TEST_SCHEDULE = {
  title: 'GENERIC SCHEDULE OF TEST RESULTS',
  boardBox: 'Distribution board/Consumer unit details',
  dbRef: 'DB/CU reference:',
  zdb: 'Z_{db}',
  ipf: 'I_{pf}',
  confirmed: 'Confirmed:',
  polarity: 'Correct polarity',
  phase: 'Phase sequence',
  spd: 'SPD:',
  spdOk: 'Operational status confirmed^{¶}',
  na: 'N/A',
  instrumentsHead: 'Details of test instruments used (serial and/or asset numbers)',
  instruments: [
    { k: 'mft', label: 'Multifunction:' },
    { k: 'cont', label: 'Continuity:' },
    { k: 'ir', label: 'Insulation resistance:' },
    { k: 'efli', label: 'Earth fault loop impedance:' },
    { k: 'rcd', label: 'RCD:' },
    { k: 'earth', label: 'Earth electrode resistance:' },
  ],
  band: 'TEST RESULTS',
  groups: [
    { from: 18, to: 22, label: 'Continuity (Ω)', row: 1 },
    { from: 18, to: 20, label: 'Ring final circuit', row: 2 },
    { from: 21, to: 22, label: '(R_{1} + R_{2}) or R_{2}', row: 2 },
    { from: 23, to: 25, label: 'Insulation resistance', row: 1 },
    { from: 23, to: 23, label: 'V', row: 2 },
    { from: 24, to: 25, label: '(MΩ)', row: 2 },
    { from: 27, to: 27, label: 'Z_{s} (Ω)', row: 1 },
    { from: 28, to: 29, label: 'RCD', row: 1 },
    { from: 30, to: 30, label: 'AFDD', row: 1 },
  ] as ScheduleGroup[],
  heads: {
    17: 'Circuit number',
    18: 'r_{1} (line)',
    19: 'r_{n} (neutral)',
    20: 'r_{2} (CPC)',
    21: '(R_{1} + R_{2})',
    22: 'R_{2}',
    23: 'Test voltage^{‡‡}',
    24: 'Live - Live',
    25: 'Live - Earth',
    26: 'Polarity^{#}',
    27: 'Maximum measured',
    28: 'Disconnection time (ms)**',
    29: 'Test button operation',
    30: 'Manual test button operation^{††}',
    31: 'Remarks',
  } as Record<number, string>,
  remarksNote: ['Include details of circuits, and/or installed equipment vulnerable to', 'damage when testing', '(continue on additional page(s) if necessary)'],
  rows: 12,
  testedBy: 'Tested by name (Capitals):',
  signature: 'Signature:',
  date: 'Date:',
  footnotes: [
    '¶ Not all SPDs have visible functionality indication.',
    '# An ‘X’, denoting incorrect polarity, cannot be entered on to this schedule when issued with an Electrical Installation Certificate.',
    '** RCD effectiveness is verified using an alternating current test at rated residual operating current (I_{Δn}).',
    '‡‡ Where this schedule forms part of an Electrical Installation Certificate, insulation resistance testing should be performed at the test voltage stated in Table 64.',
    '†† Not all AFDDs have a test button.',
  ],
};

/** The form's page "Notes for the person producing the Certificate", numbered as the IET numbers them. */
export const IET_EIC_NOTES: { title: string; heading: string; notes: { n: string; paras: (string | { bullets: string[] })[] }[] } = {
  title: 'ELECTRICAL INSTALLATION CERTIFICATE',
  heading: 'Notes for the person producing the Certificate:',
  notes: [
    {
      n: '1.',
      paras: [
        'The Electrical Installation Certificate is to be used for:',
        {
          bullets: [
            'the initial certification of a new installation; or',
            'for an addition or alteration to an existing installation where one or more new circuits have been introduced; or',
            'the replacement of a consumer unit/distribution board; or',
            'certifying where there are multiple additions, or alterations or remedial works to the existing installation which do not extend to new circuits as an alternative to the issue of multiple Minor Electrical Installation Works Certificates.',
          ],
        },
        'It is not to be used for periodic inspection and testing, for which an Electrical Installation Condition Report is to be used. For an addition or alteration which does not extend to the introduction of new circuits, a Minor Electrical Installation Works Certificate may be used.',
        "The 'original' Certificate is to be issued to the person ordering the work (Regulation 644.4). A duplicate should be retained by the person issuing the certificate.",
      ],
    },
    {
      n: '2.',
      paras: [
        'This Certificate is only valid if the Schedule of Inspection has been completed to confirm that all relevant inspections have been carried out and the relevant Schedule(s) of Circuit Details and Schedule(s) of Test Results have been attached (Regulation 644.3).',
      ],
    },
    {
      n: '3.',
      paras: [
        'The signatures on this Certificate are those of the persons authorized by the companies executing the work of design, construction, inspection and testing respectively. A signatory authorized to certify more than one category of work is to sign in each of the appropriate places. (Where a single signature Electrical Installation Certificate is used, the person authorized for executing the work of design, construction, inspection and testing is to sign the certificate.)',
      ],
    },
    {
      n: '4.',
      paras: [
        'The time interval recommended before the first periodic inspection must be inserted.',
        'The proposed date for the next inspection should take into consideration the frequency and quality of maintenance that the installation can reasonably be expected to receive during its intended life, and the period should be agreed between the designer, installer and other relevant parties.',
      ],
    },
    {
      n: '5.',
      paras: [
        'The page numbers for the Schedule(s) of Circuit Details and Schedule(s) of Test Results should be indicated, together with the total number of pages associated with the certification provided.',
      ],
    },
    {
      n: '6.',
      paras: [
        'The maximum prospective value of fault current (Ipf) recorded should be the greater of either the prospective value of short-circuit current or the prospective value of earth fault current.',
      ],
    },
  ],
};

/** The heading of a continuation sheet (the form asks for them; it has no model sheet of its own). */
export const CONTINUATION_TITLE = (n: number) => `CONTINUATION SHEET No. ${n}`;
