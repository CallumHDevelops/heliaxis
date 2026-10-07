import type { Section } from './agreement';

/**
 * Heliaxis Nominated Technical Person (NTP) Agreement — appoints a subcontractor's
 * named individual as Heliaxis's NTP for one or more MCS technologies.
 *
 * Written for Heliaxis (no third-party template wording). Supplements the
 * Subcontractor Framework Agreement, which must already be in force. Runs for 12
 * months and is renewed annually by fresh signature. Bump NTP_VERSION whenever
 * the wording changes; signed copies keep the text they were signed against.
 */

export const NTP_VERSION = 'HLX-NTP-2026.10';
export const NTP_TITLE = 'Nominated Technical Person Agreement';
export const NTP_SUBTITLE = 'Appointment of a Nominated Technical Person under the Heliaxis MCS certification';
export const NTP_TERM_MONTHS = 12;

export const NTP_TECHNOLOGIES: Record<string, { label: string; standard: string }> = {
  solar_pv: { label: 'Solar PV', standard: 'MIS 3002' },
  bess: { label: 'Battery energy storage systems (BESS)', standard: 'MIS 3012' },
  ashp: { label: 'Air source heat pumps (ASHP)', standard: 'MIS 3005-D and MIS 3005-I' },
};

export type NtpSupervision = {
  geography?: string;
  installsPerMonth?: string;
  typicalDuration?: string;
  installersToSupervise?: string;
  notes?: string;
};

export const NTP_SECTIONS: Section[] = [
  {
    num: '1',
    title: 'Definitions',
    blocks: [
      {
        defs: [
          ['Certification Body', 'The UKAS-accredited certification body through which Heliaxis holds MCS certification for the Technologies, as notified to the NTP from time to time.'],
          ['Framework Agreement', 'The Heliaxis Subcontractor Framework Agreement between Heliaxis and the Subcontractor, together with any Work Order issued under it.'],
          ['Installation', 'Any installation of a Technology carried out, supervised or certified by or on behalf of Heliaxis under its MCS certification, including its supply, design, installation, setting to work, commissioning and handover.'],
          ['MCS', 'The Microgeneration Certification Scheme, its Installation Standards (including the MIS standards listed in the Schedule), the MCS Installer Standard (MCS 001) and all associated scheme documents, guidance and requirements current from time to time.'],
          ['NTP', 'The individual named in the Schedule as Heliaxis\'s Nominated Technical Person for the Technologies.'],
          ['Scheme Requirements', 'MCS, the requirements of the Certification Body, BS 7671 and all other applicable Regulations, Building Regulations, the requirements of the consumer code of which Heliaxis is a member, and all relevant industry, manufacturer and product requirements.'],
          ['Technologies', 'The technologies listed in the Schedule for which the NTP is appointed.'],
          ['Term', 'The period stated in the Schedule, being twelve (12) months from the date of countersignature by Heliaxis.'],
        ],
      },
    ],
  },
  {
    num: '2',
    title: 'Appointment',
    blocks: [
      { c: '2.1', t: 'Heliaxis appoints the NTP as its Nominated Technical Person for the Technologies under its MCS certification for the Term, and the NTP and the Subcontractor accept that appointment on the terms of this Agreement.' },
      { c: '2.2', t: 'This Agreement supplements the Framework Agreement, which must be in force for the whole of the Term. The Framework Agreement\'s provisions on insurance, confidentiality, data protection, liability, indemnity, non-solicitation and governing law apply to this Agreement. Where the two conflict on a matter concerning the NTP role, this Agreement prevails.' },
      { c: '2.3', t: 'The appointment is personal to the named NTP. The NTP may not delegate the role, or allow any other person to act as NTP, without Heliaxis\'s prior written consent.' },
    ],
  },
  {
    num: '3',
    title: 'Responsibilities of the NTP',
    blocks: [
      { c: '3.1', t: 'The NTP is responsible for ensuring that every Installation of the Technologies is supplied, designed, installed, set to work, commissioned and handed over in full compliance with the Scheme Requirements, including the MCS Installation Standard for each Technology listed in the Schedule.' },
      { c: '3.2', t: 'The NTP shall provide technical supervision of all Heliaxis employees and subcontractors working on Installations of the Technologies, to the level set out in the Schedule, and shall:' },
      {
        ul: [
          'review and approve system designs, performance estimates and specifications before installation;',
          'visit and inspect Installations during and on completion of the works as the Schedule and the Scheme Requirements require;',
          'verify that commissioning, testing and handover documentation is complete, accurate and issued to the customer;',
          'confirm that the information submitted for MCS certification of each Installation is true and complete;',
          'ensure that those carrying out the work are competent and appropriately qualified for it.',
        ],
      },
      { c: '3.3', t: 'The NTP has the authority, and the duty, to stop any work on an Installation that the NTP reasonably believes is unsafe or does not comply with the Scheme Requirements, and shall notify Heliaxis immediately when doing so. No claim shall arise against the NTP or the Subcontractor from a stop made in good faith.' },
      { c: '3.4', t: 'The NTP shall attend Heliaxis Internal Review Meetings, management reviews, and Certification Body assessments, surveillance visits and witness assessments when their attendance is required, on reasonable notice.' },
      { c: '3.5', t: 'The NTP shall keep complete records of their supervision activity (including inspections carried out, designs approved and non-conformities raised) and make them available to Heliaxis and the Certification Body on request. Records shall be retained for at least six (6) years.' },
      { c: '3.6', t: 'Work shall be carried out to the timescales agreed when each instruction is placed.' },
    ],
  },
  {
    num: '4',
    title: 'Competence and Qualifications',
    blocks: [
      { c: '4.1', t: 'The NTP warrants that they hold, and shall maintain throughout the Term, the qualifications, training and competence required by MCS and the Certification Body to act as Nominated Technical Person for each of the Technologies.' },
      { c: '4.2', t: 'Before the Term starts, and at any time on request, the NTP shall provide evidence of those qualifications and competence through the Heliaxis subcontractor portal, for Heliaxis to hold and submit to the Certification Body. Qualifications and competence shall be reassessed at least every five (5) years, or sooner where the Scheme Requirements require.' },
      { c: '4.3', t: 'The NTP shall notify Heliaxis in writing within two (2) Working Days if any qualification, registration or accreditation relevant to the role lapses, is suspended or withdrawn, or is the subject of any investigation, and shall upload renewed documents no later than thirty (30) days before expiry.' },
    ],
  },
  {
    num: '5',
    title: 'Time Commitment',
    blocks: [
      { c: '5.1', t: 'The NTP shall devote sufficient time to the role to meet the supervision requirements in the Schedule, having regard to the volume, complexity, geographical spread and duration of Installations. As a minimum the NTP shall engage with Heliaxis for the number of days per month stated in the Schedule.' },
      { c: '5.2', t: 'Where Heliaxis\'s volume of Installations changes materially, either party may request a review of the Schedule. Any change shall be agreed in writing.' },
    ],
  },
  {
    num: '6',
    title: 'Non-conformities, Complaints and Investigations',
    blocks: [
      { c: '6.1', t: 'The NTP shall report to Heliaxis within twenty-four (24) hours any non-conformity, defect, safety concern or customer complaint identified on an Installation, and shall assist Heliaxis in agreeing and completing corrective and preventive actions within the timescales set by Heliaxis or the Certification Body.' },
      { c: '6.2', t: 'The NTP and the Subcontractor shall co-operate fully with any investigation by Heliaxis, the Certification Body, MCS, a consumer code body or any regulator, including by providing records and attending meetings.' },
    ],
  },
  {
    num: '7',
    title: 'Other Appointments and Conflicts',
    blocks: [
      { c: '7.1', t: 'The NTP shall disclose to Heliaxis in writing, before signing and promptly on any change, every other organisation for which they act as Nominated Technical Person or equivalent for any technology.' },
      { c: '7.2', t: 'The NTP shall not take on any other appointment that prevents them meeting the requirements of this Agreement. Heliaxis may terminate this Agreement under Clause 9.2 if, acting reasonably, it considers that another appointment does so.' },
    ],
  },
  {
    num: '8',
    title: 'Term and Annual Renewal',
    blocks: [
      { c: '8.1', t: 'This Agreement takes effect on countersignature by Heliaxis and continues for the Term, after which it expires automatically unless renewed.' },
      { c: '8.2', t: 'Heliaxis will issue a renewal agreement before the end of the Term. Renewal takes effect only when the renewal agreement has been signed by the NTP and countersigned by Heliaxis. Until then the NTP may not act as Heliaxis\'s Nominated Technical Person after the end of the Term.' },
      { c: '8.3', t: 'Heliaxis shall notify the Certification Body of the appointment, renewal, expiry or termination of the NTP as the Scheme Requirements require.' },
    ],
  },
  {
    num: '9',
    title: 'Notice and Termination',
    blocks: [
      { c: '9.1', t: 'Either party may terminate this Agreement by giving not less than thirty (30) days\' written notice, so that Heliaxis can appoint a replacement and notify the Certification Body.' },
      { c: '9.2', t: 'Heliaxis may terminate this Agreement with immediate effect by written notice if: any qualification or accreditation required by Clause 4 lapses or is withdrawn; the NTP or the Subcontractor commits a material breach of this Agreement or the Framework Agreement; the Certification Body requires a change of NTP; or the Framework Agreement ends.' },
      { c: '9.3', t: 'On expiry or termination, the NTP shall promptly hand over all records, designs, inspection notes and other information relating to Installations, and shall co-operate in a reasonable handover to any replacement NTP.' },
    ],
  },
  {
    num: '10',
    title: 'Fees',
    blocks: [
      { c: '10.1', t: 'Any fee for the NTP role is as stated in the Schedule or as otherwise agreed in writing. Unless stated otherwise, time spent on the role is charged at the rates applying under the Framework Agreement and invoiced in accordance with it.' },
    ],
  },
];
