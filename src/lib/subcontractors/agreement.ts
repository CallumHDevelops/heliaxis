/**
 * Heliaxis Subcontractor Framework Agreement — the text subcontractors e-sign.
 *
 * Transcribed from Heliaxis_Subcontractor_Agreement.pdf (Word export, 7 Apr 2026).
 * The wording is the legal document: change it ONLY when the agreement itself
 * changes, and bump AGREEMENT_VERSION when you do. Every signature stores a
 * sha256 of the exact text + party details it was made against, so old
 * signatures stay verifiable against the version they signed.
 */

export const AGREEMENT_VERSION = 'HLX-SCFA-2026.04';
export const AGREEMENT_TITLE = 'Subcontractor Framework Agreement';
export const AGREEMENT_SUBTITLE = 'Master Agreement for the Supply of Specialist Labour Services';

/** Heliaxis's own Schedule B details. Review before going live. */
export const HELIAXIS_PARTY = {
  name: 'Heliaxis Limited',
  registeredAddress: 'Current Electrical, Turner Street, Newport, NP19 7AZ',
  companyNumber: '16734783',
  vatNumber: 'GB507431316',
  utr: '',
  noticesEmail: 'hello@heliaxis.co.uk',
  accountsEmail: 'hello@heliaxis.co.uk',
  primaryContact: 'Callum Hiscott',
};

export type Block =
  | { p: string }
  | { c: string; t: string }
  | { h: string }
  | { ul: string[] }
  | { defs: [string, string][] }
  | { note: string }
  | { rates: true };

export type Section = { num: string; title: string; blocks: Block[] };

export const DEFAULT_RATES: { trade: string; rate: string; basis: string }[] = [
  { trade: 'Electrician', rate: '£27.50 per hour', basis: 'Per operative, per hour worked' },
  { trade: 'Plumber', rate: '£37.50 per hour', basis: 'Equivalent to £300 per Working Day (8 hrs)' },
  { trade: 'Roofer', rate: '£30.00 per panel', basis: 'Per panel installed and signed off' },
  { trade: 'Other Trade', rate: 'To be agreed', basis: 'Confirmed in Work Order — no default applies' },
];

export const SECTIONS: Section[] = [
  {
    num: '1',
    title: 'Definitions and Interpretation',
    blocks: [
      { p: 'In this Agreement the following words and expressions shall have the meanings set out below:' },
      {
        defs: [
          ['Agreement', 'This master framework agreement together with all Schedules and any Work Order issued under it.'],
          ['Applicable Standards', 'All statutory and regulatory requirements relevant to the Services, including (without limitation) BS 7671:2018+A2:2022, MCS standards, Building Regulations, CDM Regulations 2015, the Electricity at Work Regulations 1989, PUWER 1998, and any relevant British or EN standards current at the time of performance.'],
          ['CIS', 'The Construction Industry Scheme operated by HMRC, under which certain payments to subcontractors may be subject to deductions at source.'],
          ['Confidential Information', "All information (in whatever form) relating to either party's business, clients, pricing, technical data, methods, or know-how that is not publicly available."],
          ['Defects Liability Period', 'The period of twelve (12) months from the date of practical completion of each Work Order.'],
          ['Intellectual Property Rights', 'All patents, copyrights, design rights, trade marks, database rights, and all other intellectual property rights.'],
          ['Services', 'The specialist labour and installation services to be performed by the Subcontractor as described in each Work Order, which may include (without limitation) electrical installation, Solar PV, BESS, infrared panel installation, roofing, plumbing, or other trade works.'],
          ['Work Order', 'A written instruction or formal letter issued by Heliaxis to the Subcontractor, in accordance with Clause 3.1, setting out the scope, site, programme, and agreed rates for a specific engagement under this Agreement.'],
          ['Working Day', 'Any day on which work is carried out under a Work Order, which shall ordinarily be Monday to Friday but may include Saturdays or Sundays where agreed in the relevant Work Order or required by site or programme constraints. A Working Day is deemed to comprise eight (8) hours of productive work, excluding any lunch break.'],
        ],
      },
    ],
  },
  {
    num: '2',
    title: 'Term and Structure',
    blocks: [
      { c: '2.1', t: "This Agreement commences on the date of signing and shall continue until terminated in accordance with Clause 17, unless earlier terminated by either party giving not less than thirty (30) days' written notice to the other." },
      { c: '2.2', t: 'This Agreement does not guarantee any minimum volume of work. Individual engagements shall only be created and become binding upon the issue and written acceptance of a Work Order by both parties.' },
      { c: '2.3', t: 'In the event of any conflict between this Agreement and a Work Order, the terms of this Agreement shall prevail unless the Work Order expressly states otherwise in writing and both parties have acknowledged that deviation in writing.' },
      { c: '2.4', t: 'Any deviation from the terms of this Agreement must be confirmed in writing by an authorised representative of Heliaxis to be valid. Verbal agreements, conduct, or custom and practice shall not constitute a valid amendment to this Agreement.' },
    ],
  },
  {
    num: '3',
    title: 'Services and Work Orders',
    blocks: [
      { c: '3.1', t: 'When Heliaxis wishes to engage the Subcontractor for a specific scope of work, it shall issue a Work Order. A Work Order may take the form of a formal written letter, a completed Work Order document (as per Schedule A), or any other written communication (including email) that is expressly identified as a Work Order and sets out the required particulars. Each Work Order shall contain, as a minimum:' },
      {
        ul: [
          'Site name, address, and description of work required;',
          'The agreed day rate and/or fixed price for the engagement;',
          'Anticipated start and completion dates;',
          'Specific certification, documentation, or compliance requirements applicable to that work;',
          'Any site-specific health and safety requirements or constraints.',
        ],
      },
      { c: '3.2', t: "All programme dates and timelines stated in a Work Order are anticipated dates only and do not constitute a contractual guarantee of commencement or completion by any given date. Heliaxis shall use all reasonable endeavours to ensure that the correct materials are delivered to site in a timely manner and are first-fix ready prior to the Subcontractor's attendance. Where Heliaxis becomes aware that materials will not be on site by the anticipated start date, it shall notify the Subcontractor as soon as reasonably practicable so that the Subcontractor can plan their attendance accordingly and avoid unnecessary travel or mobilisation costs." },
      { c: '3.2.1', t: "Heliaxis does not guarantee the timely delivery of materials to site. Delays to material delivery may arise from supply chain constraints, manufacturer lead times, logistics, or other circumstances outside Heliaxis' reasonable control. Such delays shall not constitute a breach of this Agreement by Heliaxis." },
      { c: '3.2.2', t: "Where the Subcontractor attends site and is unable to commence or continue the installation works solely because materials that are Heliaxis' responsibility to supply have not been delivered and Heliaxis has failed to provide advance notification of that delay in accordance with Clause 3.2, Heliaxis shall consider any reasonable claim for wasted attendance costs (including travel and agreed day-rate time) submitted by the Subcontractor in writing, supported by evidence. Any such consideration is at Heliaxis' sole discretion and does not constitute an admission of liability or an automatic entitlement to payment." },
      { c: '3.2.3', t: 'The Subcontractor shall not be entitled to claim loss of earnings, standing time, mobilisation costs, or damages arising from delayed or absent materials except as set out in Clause 3.2.2 above. The Subcontractor is expected to maintain a flexible programme and, where possible, to utilise any wasted attendance productively. No claim for unproductive time will be considered where Heliaxis provided reasonable advance notification of a material delay, regardless of the notice period given.' },
      { c: '3.2.4', t: 'Where a material delivery delay is anticipated to affect the programme by more than five (5) Working Days, Heliaxis will use reasonable endeavours to offer the Subcontractor a revised start date in writing. The Subcontractor shall hold that revised date available for a period of no less than three (3) Working Days from notification, without prejudice to their right to accept other work in the interim.' },
      { c: '3.3', t: 'The Subcontractor shall acknowledge acceptance of each Work Order in writing before commencing any work. Commencement of work shall in any event constitute acceptance of the Work Order on the terms set out therein.' },
      { c: '3.4', t: 'The Subcontractor shall not subcontract or assign any part of the Services to a third party without the prior written consent of Heliaxis.' },
      { c: '3.5', t: 'The Subcontractor warrants that all personnel provided under this Agreement are suitably qualified, competent, and hold all licences, registrations, and accreditations required by law and Applicable Standards for the relevant trade and scope of work.' },
      { c: '3.6', t: 'For electrical works, the Subcontractor shall ensure that all operatives hold current and valid qualifications including (where applicable) City & Guilds 2391/2394/2395 or equivalent, NICEIC or NAPIT registration, and MCS accreditation where required for renewables installations.' },
    ],
  },
  {
    num: '3A',
    title: 'Identity, Qualifications and Compliance Records',
    blocks: [
      { c: '3A.1', t: 'Prior to undertaking any work under this Agreement (or immediately upon request for existing Subcontractors), the Subcontractor shall provide Heliaxis with:' },
      {
        ul: [
          'A valid form of photographic identification (passport, driving licence, or equivalent government-issued document) for each operative who will attend site;',
          'Copies of all relevant trade qualifications, accreditations, certifications, and registration documents held by the Subcontractor or its operatives;',
          'Evidence of current registration with any relevant regulatory or accreditation body (e.g. NICEIC, NAPIT, CIPHE, NHBC, MCS).',
        ],
      },
      { c: '3A.2', t: 'The Subcontractor shall notify Heliaxis in writing no fewer than thirty (30) days prior to the expiry of any qualification, accreditation, or registration held by it or its operatives, and shall provide updated copies of renewed documentation promptly upon renewal. Heliaxis reserves the right to suspend a Subcontractor from site where any required qualification or accreditation has expired and a renewed certificate has not been provided.' },
      { c: '3A.3', t: 'Heliaxis shall retain copies of all documentation provided under Clause 3A.1 in accordance with its data protection obligations. The Subcontractor consents to Heliaxis sharing such documentation with clients or regulators where required for compliance purposes.' },
    ],
  },
  {
    num: '4',
    title: 'Remuneration and Payment',
    blocks: [
      { h: '4.1 Rates' },
      { rates: true },
      { h: '4.2 Invoice Submission' },
      { p: 'The Subcontractor may submit an invoice upon completion of the scope of works described in the relevant Work Order, or at such other intervals as may be agreed in the Work Order. Each invoice must be accompanied by all of the following supporting documents before it will be accepted by Heliaxis accounts:' },
      {
        ul: [
          'Photographic evidence of the completed installation or works;',
          'All applicable trade certification and regulatory documentation, including (without limitation):',
          '— Electrical Installation Certificate (EIC) for all relevant electrical works;',
          '— Minor Works Certificate (where applicable);',
          '— MCS certificate and all associated commissioning records for any renewables measure (Solar PV, BESS, infrared panels, heat pumps, etc.);',
          '— Building Control notification and completion certificate where required by Building Regulations;',
          '— Any other regulatory sign-off, test results, or inspection records required by Applicable Standards for the relevant trade;',
          'A completed and signed Heliaxis works completion form (where issued);',
          'Receipts for any materials claimed as additional costs (see Clause 4.5); and',
          'Mileage log where a mileage claim is submitted (see Clause 4.4).',
        ],
      },
      { p: 'Where the Services include the installation of any renewables measure, the Subcontractor must submit the full suite of trade specification renewables documentation required under MCS standards and any applicable grant scheme (including but not limited to ECO, HUG, or equivalent). This documentation is a prerequisite for invoice acceptance and payment cannot be processed until all required renewables documents are received in full by Heliaxis.' },
      { p: 'Heliaxis reserves the right to reject any invoice not accompanied by the above documentation. Rejected invoices will be returned to the Subcontractor with reasons stated, and the 14-day payment period shall restart from the date of resubmission of a compliant invoice.' },
      { h: '4.3 Payment Terms' },
      { p: 'Subject to receipt of a compliant invoice and all required supporting documentation, Heliaxis shall pay undisputed invoices within fourteen (14) days of the accepted invoice date, unless alternative terms are expressly agreed in writing in the relevant Work Order.' },
      { h: '4.4 Mileage' },
      { p: "Where the Subcontractor is required to travel to a site located more than seventy (70) miles from the Subcontractor's registered business address or principal place of work (as notified in writing to Heliaxis), mileage in excess of the 70-mile threshold shall be reimbursed at a rate of £0.25 per mile. The mileage allowance covers the round trip to and from site and is calculated on the basis of a direct route equivalent to approximately thirty (30) minutes of travel each way beyond the 70-mile threshold. No mileage shall be payable for the first 70 miles in either direction." },
      { p: 'Mileage claims shall be subject to:' },
      {
        ul: [
          'The claim being submitted with the invoice, accompanied by an HMRC-compliant mileage log or equivalent evidence;',
          "The journey being calculated by reference to the most direct practicable route from the Subcontractor's place of work to the site. Heliaxis may verify claims using standard route-planning tools and may reject or reduce claims that materially exceed a direct route; and",
          "Mileage rates being subject to periodic review, with any change communicated to the Subcontractor in writing with at least thirty (30) days' notice.",
        ],
      },
      { c: '4.4.1', t: 'Deviation from a Direct Route. Where the Subcontractor is required to deviate from a direct route to collect materials or equipment en route to site, additional mileage arising from such deviation shall only be reimbursed where it has been agreed in advance in writing by Heliaxis. Unagreed deviations from the direct route shall not be claimable.' },
      { h: '4.5 Materials' },
      { p: 'Where the Subcontractor procures materials for inclusion in the works, reimbursement of material costs above any agreed fixed price shall only be made where:' },
      {
        ul: [
          'Prior written approval from Heliaxis has been obtained before procurement;',
          'A valid VAT invoice from the supplier is submitted with the claim; and',
          'The materials are reasonably required for the agreed scope of works.',
        ],
      },
      { p: "Where Heliaxis holds a trade account with the relevant supplier, the Subcontractor shall be required to procure through that account in the first instance. In the event that the Subcontractor is required to purchase materials from a supplier with whom Heliaxis does not hold an account, the Subcontractor may charge a handling and carriage fee of five percent (5%) of the net materials cost, to cover the Subcontractor's reasonable costs in collecting or arranging delivery of those goods. This handling fee shall not apply where materials are purchased through a Heliaxis account or where Heliaxis has made alternative procurement arrangements." },
      { p: 'Mark-ups on materials beyond the permitted handling fee in Clause 4.5 shall not be permitted unless expressly agreed in writing in the Work Order.' },
      { h: '4.6 VAT' },
      { p: "Where the Subcontractor is VAT registered, all invoices must be valid VAT invoices compliant with HMRC requirements, showing the Subcontractor's VAT registration number, a description of the supply, and the VAT amount charged. The Subcontractor shall notify Heliaxis immediately of any change to their VAT registration status." },
      { h: '4.7 Disputed Invoices' },
      { p: 'If Heliaxis disputes all or part of an invoice, it shall notify the Subcontractor in writing within seven (7) Working Days of receipt, setting out the grounds for dispute. The undisputed portion (if any) shall be paid in accordance with Clause 4.3. The parties shall use reasonable endeavours to resolve any dispute within fourteen (14) days of the dispute notice.' },
    ],
  },
  {
    num: '5',
    title: 'Construction Industry Scheme (CIS)',
    blocks: [
      { c: '5.1', t: 'The parties acknowledge that payments made under this Agreement may be subject to the Construction Industry Scheme (CIS) as operated by HMRC under the Finance Act 2004 and the Income Tax (Construction Industry Scheme) Regulations 2005.' },
      { c: '5.2', t: 'The Subcontractor shall confirm to Heliaxis, prior to the commencement of any work, whether they are:' },
      {
        ul: [
          'Registered with HMRC as a CIS subcontractor (gross payment status or net payment status); or',
          'Not registered under CIS, in which case Heliaxis may be required to make deductions at the higher unverified rate as directed by HMRC.',
        ],
      },
      { c: '5.3', t: 'The Subcontractor shall provide Heliaxis with their Unique Taxpayer Reference (UTR) number and, where applicable, their CIS verification number, and shall notify Heliaxis immediately of any change to their CIS registration status.' },
      { c: '5.4', t: 'Where Heliaxis is required by law to deduct CIS at source, such deductions shall be made from the labour element of any invoice (excluding VAT and materials) and a deduction statement shall be provided to the Subcontractor in accordance with HMRC requirements.' },
      { c: '5.5', t: 'The Subcontractor is solely responsible for ensuring their CIS registration is maintained and up to date. Heliaxis shall not be liable for any additional tax liability or penalty arising from incorrect information provided by the Subcontractor.' },
    ],
  },
  {
    num: '6',
    title: 'Relationship of the Parties and Employment Status',
    blocks: [
      { c: '6.1', t: 'The Subcontractor is engaged as an independent contractor. Nothing in this Agreement shall constitute or be deemed to constitute a contract of employment, a partnership, a joint venture, or any agency relationship between the parties.' },
      { c: '6.2', t: 'The Subcontractor is solely responsible for the payment of all income tax, National Insurance contributions, and any other statutory levies arising from amounts received under this Agreement. The Subcontractor shall indemnify Heliaxis against any liability, cost, or penalty arising from a failure to meet these obligations.' },
      { c: '6.3', t: 'The parties acknowledge their respective obligations under UK off-payroll working legislation, commonly referred to as IR35, as set out in Chapter 10 of ITEPA 2003 and Chapter 10 of ITTOIA 2005. The Subcontractor warrants that they have taken appropriate legal and/or tax advice regarding their employment status and accept responsibility for ensuring compliance with all applicable HMRC rules. IR35 is a United Kingdom tax provision and the terminology used herein reflects UK law.' },
      { c: '6.4', t: "The Subcontractor shall have no authority to bind Heliaxis contractually or to make representations on Heliaxis' behalf." },
    ],
  },
  {
    num: '7',
    title: 'Insurance',
    blocks: [
      { c: '7.1', t: 'The Subcontractor shall maintain throughout the term of this Agreement and for such period thereafter as is necessary to cover any claims arising from the Services, at minimum:' },
      {
        ul: [
          'Public Liability Insurance: £2,000,000 (two million pounds) per occurrence;',
          "Employers' Liability Insurance (if the Subcontractor employs any persons): £5,000,000 (five million pounds) or such higher sum as required by law;",
          'Tools and Equipment Insurance: covering the full replacement value of all tools and equipment used in connection with the Services;',
          'Professional Indemnity Insurance (where applicable to the scope of services): not less than £500,000.',
        ],
      },
      { c: '7.2', t: 'All insurance policies shall be with reputable insurers authorised to conduct business in the United Kingdom. The Subcontractor shall provide Heliaxis with copies of current certificates of insurance upon request and within five (5) Working Days of any renewal.' },
      { c: '7.3', t: "Tools, equipment, and materials belonging to the Subcontractor that are lost, stolen, or damaged on site are the sole responsibility of the Subcontractor. Heliaxis shall not be liable for and shall accept no claims in respect of loss or theft of the Subcontractor's tools on site, howsoever caused, unless loss or damage results directly from Heliaxis' proven negligence. The Subcontractor should ensure their tools and equipment insurance provides adequate cover for on-site risks." },
      { c: '7.4', t: 'Failure to maintain required insurance shall be grounds for immediate suspension of work and may constitute grounds for termination under Clause 17.' },
    ],
  },
  {
    num: '8',
    title: 'Health, Safety and CDM Compliance',
    blocks: [
      { c: '8.1', t: 'The Subcontractor shall at all times comply with all applicable health and safety legislation including, without limitation:' },
      {
        ul: [
          'The Health and Safety at Work etc. Act 1974;',
          'The Construction (Design and Management) Regulations 2015 (CDM 2015);',
          'The Electricity at Work Regulations 1989;',
          'The Provision and Use of Work Equipment Regulations 1998 (PUWER);',
          'The Personal Protective Equipment at Work Regulations 1992 (as amended);',
          'The Manual Handling Operations Regulations 1992; and',
          'Any site-specific rules, method statements, or health and safety plans issued by Heliaxis or the principal contractor.',
        ],
      },
      { c: '8.2', t: 'Where required under CDM 2015, the Subcontractor shall cooperate fully with the Principal Contractor and/or Principal Designer, provide required information for the Health and Safety File, and comply with the Construction Phase Plan.' },
      { c: '8.3', t: 'The Subcontractor shall ensure all operatives attend any site induction required prior to commencing work. No operative shall be permitted on site who has not completed the required induction.' },
      { c: '8.4', t: 'The Subcontractor shall maintain their own risk assessments and method statements (RAMS) in respect of all activities carried out under this Agreement and provide copies to Heliaxis on request or prior to commencing works where required.' },
      { c: '8.5', t: 'The Subcontractor shall report any accident, near miss, or unsafe condition to the Heliaxis site manager immediately and shall cooperate fully with any subsequent investigation. Where reporting obligations arise under RIDDOR 2013, the Subcontractor shall notify Heliaxis at once.' },
    ],
  },
  {
    num: '9',
    title: 'Tools, Equipment and Site Conduct',
    blocks: [
      { c: '9.1', t: 'The Subcontractor shall provide all tools, plant, and equipment necessary for the performance of the Services, which shall be fit for purpose, in good working order, and compliant with all applicable legislation and safety standards.' },
      { c: '9.2', t: 'The Subcontractor shall not use any tools or equipment belonging to Heliaxis or its clients without prior written authorisation.' },
      { c: '9.3', t: 'Tools, equipment, or materials belonging to the Subcontractor that are left on site and subsequently lost, stolen, or damaged are the sole responsibility of the Subcontractor. No claim in respect of lost tools or equipment shall be submitted to or accepted by Heliaxis, unless Heliaxis has been directly negligent.' },
      { h: '9.4 Site Set-Up and Shut-Down' },
      { p: 'The Subcontractor is responsible for safe and tidy set-up and shut-down of their working area on each day of attendance. Specifically:' },
      {
        ul: [
          "At the commencement of each day's work, the Subcontractor shall set up their working area in a manner that is safe, organised, and does not present a hazard to other trades, site occupants, or the public;",
          "At the end of each day's work — regardless of whether the Subcontractor intends to return the following day or at any future date — the Subcontractor shall clear all tools and materials from the working area, store them safely, and leave the site in a clean and safe condition;",
          'The Subcontractor shall not leave tools, materials, waste, or equipment in common areas, passageways, or areas accessible to the public or other trades; and',
          'The Subcontractor is expected to present a professional standard of site tidiness at all times.',
        ],
      },
      { note: 'Recommendation: It is strongly recommended that the Subcontractor takes photographic evidence of their working area at the end of each day, showing the cleared and safe condition of the site. Such photographs may assist in resolving any dispute regarding the state in which the site was left and are considered good practice.' },
      { h: '9.5 Waste Management' },
      { p: 'The Subcontractor shall manage all waste generated by their works as follows:' },
      {
        ul: [
          'Where Heliaxis has provided a waste facility on site (including skip, bin, or designated waste area), the Subcontractor shall use that facility for all reasonable trade waste arising from their works;',
          'Where no site waste facility is provided, or where the Subcontractor generates waste that cannot reasonably be deposited in the facility provided, the Subcontractor shall remove all such waste from site at their own cost and ensure it is disposed of lawfully and in accordance with the Environmental Protection Act 1990 and associated waste regulations;',
          'The Subcontractor shall not fly-tip or cause waste to be deposited other than at a licensed facility; and',
          'Heliaxis reserves the right to charge the Subcontractor the reasonable cost of removing any waste left on site in breach of this clause.',
        ],
      },
    ],
  },
  {
    num: '10',
    title: 'Workmanship Standards',
    blocks: [
      { c: '10.1', t: "All works carried out under this Agreement shall be executed to a first-class standard of workmanship, in strict accordance with the relevant manufacturer's installation instructions, and in compliance with all Applicable Standards current at the time of installation. Where any conflict exists between a manufacturer's instructions and a British Standard or code of practice, the manufacturer's instructions shall take precedence unless Heliaxis directs otherwise in writing. All materials incorporated into the works shall be new, fit for purpose, and free from defect unless expressly stated otherwise in the Work Order." },
      { c: '10.2', t: 'Electrical Works. All electrical installation work shall be designed, installed, inspected, and tested in full compliance with BS 7671:2018+A2:2022 (IET Wiring Regulations, 18th Edition, as amended) and all subsequent amendments current at the time of installation. By contracting this standard, compliance with BS 7671 becomes a contractual obligation enforceable under common law in addition to its status as the standard referenced in the Electricity at Work Regulations 1989, Part P of the Building Regulations 2010, and the Electricity, Safety, Quality and Continuity Regulations 2002. The Subcontractor shall additionally comply with all relevant Approved Documents, IET Guidance Notes, and the requirements of any competent person scheme to which the Subcontractor is registered (including NICEIC or NAPIT). All notifiable works shall be certified, and an Electrical Installation Certificate (EIC) or Minor Works Certificate (as applicable) shall be issued upon completion of each scope of electrical work. For Solar PV, BESS, and other renewables electrical works, the Subcontractor shall comply with MCS standard MIS 3002 (Solar PV), MIS 3012 (BESS), and any other applicable MCS Installation Standards, together with the requirements of the relevant DNO for any grid-connected system.' },
      { c: '10.3', t: 'Roofing Works. All pitched roofing works (including slating, tiling, and associated elements) shall comply with BS 5534:2014+A2:2018 (Slating and Tiling for Pitched Roofs and Vertical Cladding) and BS 8000-6:2023 (Workmanship on Building Sites — Slating and Tiling). Flat roofing works shall comply with BS 6229:2018. Lead work shall comply with BS 6915 and the guidance published by the Lead Sheet Association. All roofing works shall be mechanically fixed in accordance with manufacturer\'s specifications and wind uplift calculations applicable to the site. Mortar shall not be used as the sole means of fixing roof coverings. The Subcontractor shall ensure that all roofing works are weather-tight upon completion and that materials are handled, stored, and installed in accordance with the relevant manufacturer\'s instructions. Where a roof covering forms part of a Solar PV installation, the penetration, mounting, and weatherproofing details shall comply with both the roofing standards above and the applicable MCS installation standard.' },
      { c: '10.4', t: 'Plumbing Works. All plumbing and water supply works shall comply with the Water Supply (Water Fittings) Regulations 1999, BS EN 806 (Specifications for Installations Inside Buildings Conveying Water for Human Consumption), and BS 8558:2015 (Guide to the Design, Installation, Testing and Maintenance of Services Supplying Water for Domestic Use). The Subcontractor shall ensure that all plumbing works are tested for soundness and flow prior to handover, and that all relevant notification requirements under the Water Fittings Regulations are met. Pipework shall be adequately supported, insulated against frost and heat loss where required, and free from water hammer or noise defects upon completion.' },
      { c: '10.5', t: 'General Workmanship Obligations. In addition to the trade-specific standards above, the following general obligations apply to all works carried out under this Agreement:' },
      {
        ul: [
          'All works shall be carried out by competent, qualified operatives using appropriate tools and equipment;',
          'All fixings, fastenings, sealants, and jointing materials shall be of a type approved by the relevant manufacturer and appropriate for the substrate and environmental conditions;',
          'Where materials are supplied by Heliaxis or a third party, the Subcontractor shall inspect them for damage or defect prior to installation and report any concerns to Heliaxis before proceeding. Installation of materials known to be defective shall constitute a breach of this clause;',
          'Finished surfaces and installed components shall be aligned, level, and presented to a professional standard with no damage to surrounding structure, finishes, or client property; and',
          'The Subcontractor shall self-report to Heliaxis any defect, non-compliance, or departure from the specified standard discovered during or after installation, before seeking sign-off or submitting an invoice.',
        ],
      },
    ],
  },
  {
    num: '11',
    title: 'Delay and Failure to Complete',
    blocks: [
      { c: '11.1', t: 'The Subcontractor shall use all reasonable endeavours to complete the Services by the anticipated completion date stated in the relevant Work Order. Where the Subcontractor anticipates that it will not complete the Services on time, it shall notify Heliaxis as soon as reasonably practicable and in any event no later than forty-eight (48) hours before the anticipated completion date, setting out the reason for delay and the revised expected completion date.' },
      { c: '11.2', t: "Where the Subcontractor fails to complete the Services within the period stated in the Work Order (or any revised date agreed in writing) and that failure is attributable to the Subcontractor's own default, poor resource management, or failure to attend site as required, Heliaxis may back-charge the Subcontractor for demonstrable losses directly caused by that delay, including (without limitation):" },
      {
        ul: [
          'The cost of engaging a replacement subcontractor to complete or accelerate the works;',
          'Loss of grant funding, scheme payments, or client contract value where a deadline imposed by a third party (including a grant scheme, local authority, or end client) has been missed as a direct consequence of the delay;',
          'Reasonable additional management, supervision, and administration costs incurred by Heliaxis as a result of the delay; and',
          "Client compensation, penalty charges, or abatements that Heliaxis is required to pay to its client as a direct result of the Subcontractor's failure to complete on time.",
        ],
      },
      { c: '11.3', t: 'Any back-charge under Clause 11.2 shall be notified to the Subcontractor in writing with reasonable supporting evidence. Heliaxis may deduct back-charges from any outstanding invoice due to the Subcontractor or recover them as a separate debt.' },
      { c: '11.4', t: "No back-charge shall arise under this Clause 11 where the delay is caused solely by Heliaxis' failure to provide adequate site access, materials, or instructions, or by circumstances beyond the Subcontractor's reasonable control. Nor shall a back-charge arise where the anticipated completion date in the Work Order was expressly stated as indicative only and no firm deadline was agreed in writing." },
    ],
  },
  {
    num: '12',
    title: 'Quality, Defective Work and Defects Liability',
    blocks: [
      { c: '12.1', t: 'The Subcontractor warrants that all Services shall be performed:' },
      {
        ul: [
          'With reasonable skill and care and to a standard no less than that required by Applicable Standards;',
          "In accordance with the relevant Work Order and any applicable manufacturer's installation instructions;",
          'By operatives who are competent and appropriately qualified; and',
          'Using materials that are fit for purpose and free from defects (where the Subcontractor supplies materials).',
        ],
      },
      { c: '12.2', t: 'The Defects Liability Period is twelve (12) months from the date of practical completion of each Work Order.' },
      { c: '12.3', t: "If Heliaxis identifies defective, incomplete, or non-compliant work during or following the Defects Liability Period, it shall notify the Subcontractor in writing. The Subcontractor shall remedy such defects within a reasonable period (and in any event within seven (7) Working Days of notice for works affecting safety or habitability), at the Subcontractor's own cost." },
      { c: '12.4', t: 'If the Subcontractor fails to remedy defective work within the period specified, Heliaxis may, at its sole discretion, exercise one or more of the following remedies:' },
      {
        ul: [
          'Require the Subcontractor to return to site and remedy the defect at their own cost;',
          'Deduct the reasonable cost of remediation from any outstanding or future invoice due to the Subcontractor; and/or',
          'Appoint a third-party contractor to remedy the defect and back-charge the full cost (including reasonable management and administration costs) to the Subcontractor.',
        ],
      },
      { c: '12.5', t: 'The rights in Clause 12.4 are cumulative and without prejudice to any other rights Heliaxis may have at law or in equity.' },
    ],
  },
  {
    num: '13',
    title: 'Confidentiality',
    blocks: [
      { c: '13.1', t: 'Each party undertakes to keep confidential all Confidential Information received from the other party and shall not disclose it to any third party without the prior written consent of the disclosing party, except as required by law or by a competent regulatory authority.' },
      { c: '13.2', t: "The Subcontractor shall not use Heliaxis' Confidential Information for any purpose other than the performance of the Services under this Agreement." },
      { c: '13.3', t: 'The obligations in this Clause 13 shall survive termination of this Agreement for a period of five (5) years.' },
      { c: '13.4', t: 'Heliaxis reserves the right to take such reasonable legal action as it considers necessary to enforce the obligations set out in this Clause 13 where a breach has occurred or is reasonably apprehended within the permitted confidentiality period. This may include, without limitation, seeking injunctive relief, damages, or an account of profits through the courts of England and Wales.' },
    ],
  },
  {
    num: '14',
    title: 'Non-Solicitation and Non-Dealing',
    blocks: [
      { c: '14.1', t: 'During the term of this Agreement and for a period of twelve (12) months following its termination or expiry, the Subcontractor shall not, directly or indirectly:' },
      {
        ul: [
          'Approach, solicit, or canvas any client, customer, or prospective client of Heliaxis with whom the Subcontractor came into contact in the course of providing Services under this Agreement, with a view to offering competing services; or',
          'Accept work or instructions directly from any such client in respect of matters related to the services provided by Heliaxis, without the prior written consent of Heliaxis.',
        ],
      },
      { c: '14.2', t: 'The Subcontractor agrees that the restrictions in Clause 14.1 are reasonable and necessary to protect the legitimate business interests of Heliaxis, having regard to the relationships and Confidential Information to which the Subcontractor will be exposed.' },
      { c: '14.3', t: 'Nothing in this Clause 14 shall prevent the Subcontractor from accepting work from a client of Heliaxis that approaches the Subcontractor directly and independently, without any solicitation by the Subcontractor, provided the Subcontractor has first notified Heliaxis in writing.' },
    ],
  },
  {
    num: '15',
    title: 'Intellectual Property',
    blocks: [
      { c: '15.1', t: 'All Intellectual Property Rights in any deliverables, designs, drawings, reports, or documentation created by the Subcontractor specifically for Heliaxis in connection with the Services shall vest in Heliaxis upon creation.' },
      { c: '15.2', t: "The Subcontractor shall execute any documents reasonably required to perfect Heliaxis' ownership of such rights." },
    ],
  },
  {
    num: '16',
    title: 'Liability and Indemnity',
    blocks: [
      { c: '16.1', t: 'The Subcontractor shall indemnify and hold harmless Heliaxis against all losses, costs, claims, damages, liabilities, and expenses (including reasonable legal fees) arising from:' },
      {
        ul: [
          'Any breach of this Agreement by the Subcontractor or its personnel;',
          'Any negligent or wilful act or omission of the Subcontractor or its personnel;',
          "Death or personal injury caused by the Subcontractor's negligence;",
          'Any failure by the Subcontractor to comply with health and safety or CDM obligations;',
          'Any defective workmanship or non-compliant installation; and',
          'Any claim by HMRC in respect of tax, National Insurance, or CIS deductions arising from incorrect information provided by the Subcontractor.',
        ],
      },
      { c: '16.2', t: 'Neither party excludes liability for death or personal injury caused by negligence, or for fraud or fraudulent misrepresentation.' },
      { c: '16.3', t: "Subject to Clause 16.2, Heliaxis' total liability to the Subcontractor under or in connection with this Agreement shall not exceed the total fees paid to the Subcontractor in the twelve (12) months immediately preceding the event giving rise to the claim." },
    ],
  },
  {
    num: '17',
    title: 'Termination',
    blocks: [
      { c: '17.1', t: "Either party may terminate this Agreement on not less than thirty (30) days' written notice to the other." },
      { c: '17.2', t: 'Heliaxis may terminate this Agreement with immediate effect by written notice if the Subcontractor:' },
      {
        ul: [
          'Commits a material breach of this Agreement which (if capable of remedy) it fails to remedy within seven (7) Working Days of written notice;',
          'Commits any health and safety violation or act which Heliaxis reasonably considers puts any person at immediate risk;',
          'Becomes insolvent, enters administration, receivership, or voluntary arrangement, or takes any step preparatory to such event;',
          'Is found to have submitted false documentation, certificates, or claims; or',
          'Fails to maintain the required insurance cover or any required accreditation.',
        ],
      },
      { c: '17.3', t: 'On termination, the Subcontractor shall complete any works in progress to the stage specified by Heliaxis and promptly return any Heliaxis property or Confidential Information.' },
      { c: '17.4', t: 'Payment for work properly completed and accepted prior to termination shall not be withheld, subject to the right to withhold for defective work or outstanding documentation.' },
      { c: '17.5', t: 'Clauses 13 (Confidentiality), 14 (Non-Solicitation), 15 (IP), 16 (Liability), and 19 (Governing Law) shall survive termination of this Agreement.' },
    ],
  },
  {
    num: '18',
    title: 'Audit and Records',
    blocks: [
      { c: '18.1', t: 'The Subcontractor shall maintain complete and accurate records of all work carried out under this Agreement, including timesheets, materials records, mileage logs, certification, and correspondence, for a minimum of six (6) years from the date of each Work Order.' },
      { c: '18.2', t: 'Heliaxis (or its appointed representative) shall have the right, on reasonable notice of not less than five (5) Working Days, to audit or inspect such records for the purpose of verifying invoices, certifications, or compliance with this Agreement.' },
    ],
  },
  {
    num: '19',
    title: 'Governing Law and Dispute Resolution',
    blocks: [
      { c: '19.1', t: 'This Agreement shall be governed by and construed in accordance with the laws of England and Wales.' },
      { c: '19.2', t: 'In the event of a dispute, the parties shall first seek to resolve the matter through good-faith negotiations at senior level within ten (10) Working Days of written notice of dispute.' },
      { c: '19.3', t: 'If not resolved within thirty (30) days of the initial notice, either party may refer the matter to mediation under the CEDR Model Mediation Procedure before resorting to litigation.' },
      { c: '19.4', t: 'The parties submit to the exclusive jurisdiction of the courts of England and Wales.' },
    ],
  },
  {
    num: '20',
    title: 'Right to Work and Modern Slavery',
    blocks: [
      { c: '20.1', t: 'The Subcontractor warrants that all operatives engaged on work under this Agreement have the legal right to work in the United Kingdom in accordance with the Immigration, Asylum and Nationality Act 2006 and any successor legislation. The Subcontractor shall carry out appropriate right to work checks on all personnel prior to their attendance on site and shall make evidence of such checks available to Heliaxis upon request.' },
      { c: '20.2', t: 'The Subcontractor shall comply with the Modern Slavery Act 2015 and warrants that neither the Subcontractor nor, to the best of its knowledge, any person in its supply chain engages in any form of forced labour, human trafficking, or labour exploitation. The Subcontractor shall notify Heliaxis immediately if it becomes aware of any actual or suspected modern slavery in its operations or supply chain.' },
      { c: '20.3', t: 'The Subcontractor shall indemnify Heliaxis against any loss, liability, or penalty arising from a breach of this Clause 18, including any costs arising from a failure to carry out adequate right to work checks.' },
    ],
  },
  {
    num: '21',
    title: 'Conduct, Drugs, Alcohol and Smoking',
    blocks: [
      { c: '21.1', t: 'The Subcontractor shall ensure that all operatives attending site are fit for work at all times. No operative shall attend or remain on site under the influence of alcohol, illegal drugs, or any substance (including prescribed medication) that impairs their ability to work safely. Heliaxis reserves the right to remove from site any operative it reasonably believes to be unfit for work, and such removal shall not give rise to any claim for standing time, loss of earnings, or compensation.' },
      { c: '21.2', t: "The Subcontractor shall not bring onto site or consume any alcohol or illegal substance during working hours or whilst on a client's premises, regardless of whether work has concluded for the day." },
      { c: '21.3', t: "Smoking (including the use of e-cigarettes and vaping devices) is strictly prohibited within any client property, on the immediate curtilage of a client's premises, or in any location that could cause discomfort to the client, their family, or other occupants. Operatives who wish to smoke must do so away from the client's property entirely, at a suitable distance, and only during agreed break periods. All cigarette waste must be disposed of responsibly and not left on or near the client's property." },
      { c: '21.4', t: "Operatives are expected to conduct themselves professionally and courteously at all times when on or near a client's property. This includes appropriate language, attire, and behaviour in the presence of clients, their families, and members of the public." },
    ],
  },
  {
    num: '22',
    title: 'Client Complaints',
    blocks: [
      { c: '22.1', t: "The Subcontractor shall notify Heliaxis promptly, and in any event within twenty-four (24) hours, of any complaint, concern, or dispute raised by a client or site occupant in connection with the Subcontractor's work, conduct, or presence on site." },
      { c: '22.2', t: 'Where Heliaxis receives a complaint from a client that relates to the Services or conduct of the Subcontractor, Heliaxis shall notify the Subcontractor in writing and provide reasonable details of the complaint. The Subcontractor shall respond to Heliaxis with their account of events within three (3) Working Days of receipt of that notification.' },
      { c: '22.3', t: 'Heliaxis shall investigate complaints in a fair and proportionate manner, taking into account the response provided by the Subcontractor. Where a complaint is upheld and relates to defective work, the remedies in Clause 12 shall apply. Where a complaint relates to conduct, Heliaxis may, at its reasonable discretion, issue a written warning, suspend the Subcontractor from that site, or treat the complaint as a material breach entitling Heliaxis to terminate under Clause 17.2.' },
      { c: '22.4', t: 'The Subcontractor shall not make any admission of liability, offer of settlement, or direct communication with a client regarding a complaint without the prior written consent of Heliaxis.' },
    ],
  },
  {
    num: '23',
    title: 'General',
    blocks: [
      { c: '23.1', t: 'Entire Agreement. This Agreement (together with all Schedules and Work Orders) constitutes the entire agreement between the parties and supersedes all prior agreements, representations, and understandings relating to its subject matter.' },
      { c: '23.2', t: 'Variation. No amendment to this Agreement shall be valid unless made in writing and signed by an authorised representative of each party. Any deviation confirmed in writing by Heliaxis in connection with a specific Work Order shall be binding only in respect of that Work Order and shall not amend this Agreement more generally.' },
      { c: '23.3', t: 'Waiver. A failure to exercise or delay in exercising any right or remedy shall not constitute a waiver of that right or remedy.' },
      { c: '23.4', t: 'Severance. If any provision of this Agreement is found to be unenforceable, the remaining provisions shall continue in full force and effect.' },
      { c: '23.5', t: 'Notices. Notices under this Agreement shall be in writing and delivered by email (with read receipt or acknowledgement) or by first class post to the addresses set out in Schedule B. Notices shall be deemed received the next Working Day after sending by email, or two Working Days after posting.' },
      { c: '23.6', t: 'Third Party Rights. Nothing in this Agreement confers any right on any third party under the Contracts (Rights of Third Parties) Act 1999.' },
      { c: '23.7', t: 'Force Majeure. Neither party shall be liable for any delay or failure to perform its obligations where such delay or failure results from circumstances beyond its reasonable control, provided it notifies the other party promptly.' },
      { c: '23.8', t: 'Data Protection. Each party shall comply with the UK GDPR and the Data Protection Act 2018 in respect of any personal data processed in connection with this Agreement.' },
    ],
  },
];

/** Schedule A is a template for Work Orders — shown for reference, not completed at signing. */
export const SCHEDULE_A_FIELDS: [string, string][] = [
  ['Work Order Number', 'HLX-WO-[YEAR]-[NO.]'],
  ['Agreement Reference', 'HLX-SC-[YEAR]-[NO.]'],
  ['Subcontractor Name', ''],
  ['Trade / Discipline', 'e.g. Electrician / Roofer / Plumber'],
  ['Site Name & Address', ''],
  ['Client / End Customer', ''],
  ['Nature of Works', 'e.g. Solar PV, BESS, IR Panels, Electrical, Roofing'],
  ['Scope of Works', 'Attach scope sheet if required'],
  ['Anticipated Start Date', 'Note: anticipated only — not guaranteed'],
  ['Anticipated Completion Date', 'Note: anticipated only — not guaranteed'],
  ['Working Days', 'Mon–Fri standard / weekend if agreed'],
  ['Agreed Day / Hour / Unit Rate (£)', 'Or confirm 4.1.1 default applies'],
  ['Mileage Applicable?', 'Yes / No — Subcontractor base address:'],
  ['Materials — Pre-approved?', 'Yes / No — see approval ref:'],
  ['Heliaxis Materials Account Held?', 'Yes / No — supplier name:'],
  ['EIC Required?', 'Yes / No (required for all relevant electrical works)'],
  ['MCS / Renewables Docs Required?', 'Yes / No — list applicable certs:'],
  ['Building Control Notification?', 'Yes / No — competent person scheme:'],
  ['Other Regulatory Requirements', 'Detail any further certs / notifications'],
  ['Site H&S / Induction Requirements', ''],
  ['Waste Facility On Site?', 'Yes / No — if no, SC to remove own waste'],
  ['Additional / Deviating Terms', 'Expressly state any deviation from master agreement'],
  ['Heliaxis Authorised By', 'Name / Signature / Date'],
  ['Subcontractor Acceptance', 'Name / Signature / Date'],
];
