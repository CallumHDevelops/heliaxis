/**
 * The off-grid (non-MCS) contract pack, HX-OG-01 to HX-OG-06. Modelled on the MCS pack but without the MCS
 * contractual requirements: the customer gets no MCS certificate and no Insurance-Backed Guarantee, and is told so
 * on a page of its own that they sign separately (HX-OG-02).
 *
 * THE WORDING HERE IS FIXED. Metis only fills in the variables (names, addresses, the system, the price, the payment
 * schedule, dates) through the answers; she never rewrites a clause for a job. These are first drafts to be reviewed
 * by a solicitor once. Every template carries `legalReview`, so it prints "DRAFT — awaiting legal review" and cannot be
 * signed until an admin approves this exact wording in HAP; changing a word withdraws the approval. This is drafting
 * help, not legal advice.
 *
 * To change a clause: edit it here, raise the document's issue in src/lib/documents/issue.ts, update the wording hash
 * in tests/contracts/offgrid-templates.test.ts on purpose, and get the new wording approved again.
 */
import type { DocTemplate, TemplateField } from '../types';

const text = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'text', ...o });
const num = (key: string, label: string, unit: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'number', unit, ...o });
const yn = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'yesno', ...o });
const pick = (key: string, label: string, options: string[], o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'choice', options, ...o });
const long = (key: string, label: string, o: Partial<TemplateField> = {}): TemplateField => ({ key, label, kind: 'long', ...o });

const CONSUMER = { key: 'customer_type', is: 'Consumer' } as const;
const BUSINESS = { key: 'customer_type', is: 'Business' } as const;

/* ── HX-OG-01: Terms & Conditions of Supply and Installation ─────────────── */

export const OG_TERMS: DocTemplate = {
  schema: 1,
  code: 'HX-OG-01',
  title: 'Terms & Conditions of Supply and Installation (off-grid)',
  purpose: 'The terms of the contract for an off-grid (non-MCS) installation: a consumer version and a business version.',
  intro: 'These terms, our quote and the other documents in this pack are the contract. Please read them, and ask us about anything that is not clear before you sign.',
  tech: ['offgrid'],
  legalReview: true,
  sections: [
    {
      type: 'fields',
      title: 'This agreement',
      columns: 2,
      fields: [
        pick('customer_type', 'Is the customer a consumer or a business?', ['Consumer', 'Business'], { required: true, help: 'A consumer buys mostly for purposes outside their trade, business or profession (a homeowner, for example).' }),
        text('quote_ref', 'Quote this contract is for', { required: true, hint: 'e.g. Q-1042' }),
        text('customer_name', 'Customer', { required: true, prefill: '{{customer}}' }),
        text('site', 'Site address', { required: true, prefill: '{{address}}' }),
        text('made_on', 'Date', { prefill: '{{date}}' }),
      ],
    },
    {
      type: 'text',
      title: 'Terms for consumers',
      showWhen: CONSUMER,
      body: [
        '1. Who we are and what this covers. These terms apply to the supply and installation of the equipment and work described in our quote, between {{company}} of {{company_address}} ("we", "us") and the customer named above ("you"). You are a consumer. The quote, these terms, the Non-MCS Disclosure and Acknowledgement (HX-OG-02), the System Specification and Design Summary (HX-OG-03), the Warranty Statement (HX-OG-04) and the Payment Schedule (HX-OG-05) together make up the contract.',
        '2. Making the contract. The contract is made when you accept our quote in writing or sign this document. We will not start work until then, unless you ask us to in writing (see section 4).',
        '3. Your rights as a consumer. The Consumer Rights Act 2015 gives you rights that these terms do not take away. Goods must be of satisfactory quality, fit for their purpose and as described. Services must be carried out with reasonable care and skill. If something is wrong, tell us and we will put it right in line with your legal rights.',
        '4. Your right to cancel. If this contract was made away from our business premises (for example at your home) or at a distance, the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 give you the right to cancel within 14 days, starting the day after the contract is made, without giving a reason. To cancel, tell us clearly in writing. You can use the model cancellation form below, but you do not have to. If you want us to start work within the 14 days, you must ask us to in writing: the box on the signature page does this. If you then cancel, you must pay us an amount in proportion to what we have supplied up to the time you told us you were cancelling, compared with the full contract. We will refund any other payment you have made within 14 days of hearing that you are cancelling.',
        '5. Price, deposit and payment. The price is the price in our quote, including VAT at the rate shown. The deposit and the stage payments, and when each is due, are in the Payment Schedule (HX-OG-05). Goods stay our property until they have been paid for in full.',
        '6. Changes. Nothing in the contract changes unless we agree it in writing. If you ask for a change, or we find that extra work is needed, we will tell you what it will cost and how it affects the dates before we do it.',
        '7. Access and site. You will make sure we can reach the work area safely, with clear working space and, where we need them, power, water and parking. We are not responsible for hidden services or unforeseen conditions (for example asbestos, structural defects or concealed pipes and cables). If we find any, work may stop, and we will agree any extra cost with you first.',
        '8. Dates and delays. Dates are our best estimates. If we are going to be late we will tell you. Your legal rights are not affected by a delay.',
        '9. This is not an MCS installation. The installation is off-grid and is not certified under the Microgeneration Certification Scheme. What that means for you is set out in the Non-MCS Disclosure and Acknowledgement (HX-OG-02), which you sign separately.',
        '10. Our liability. Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else the law does not allow us to limit, and nothing takes away your rights in section 3. Apart from that, we are not responsible for loss that was not a reasonably foreseeable result of our breaking the contract, or for loss of income or business.',
        '11. Complaints. If you are unhappy with anything, tell us and we will deal with it under our complaints procedure (HX-QMS-P08), a copy of which we will give you on request. Contact us at {{company_email}} or on {{company_phone}}.',
        '12. Governing law. This contract is governed by the law of England and Wales. This does not affect any right you have to bring a claim in the courts of the part of the United Kingdom where you live.',
      ].join('\n\n'),
    },
    {
      type: 'text',
      title: 'Model cancellation form',
      showWhen: CONSUMER,
      body: [
        '(Complete and return this form only if you wish to withdraw from the contract.)',
        'To {{company}}, {{company_address}}, {{company_email}}:',
        'I/We hereby give notice that I/we cancel my/our contract for the supply of the following service: the supply and installation described in the quote named above.',
        'Ordered on / received on: ____________________',
        'Name of consumer(s): ____________________',
        'Address of consumer(s): ____________________',
        'Signature of consumer(s) (only if this form is notified on paper): ____________________',
        'Date: ____________________',
      ].join('\n\n'),
    },
    {
      type: 'text',
      title: 'Terms for businesses',
      showWhen: BUSINESS,
      body: [
        '1. Who we are and what this covers. These terms apply to the supply and installation of the equipment and work described in our quote, between {{company}} of {{company_address}} ("we", "us") and the customer named above ("you"). You are a business. The quote, these terms, the Non-MCS Disclosure and Acknowledgement (HX-OG-02), the System Specification and Design Summary (HX-OG-03), the Warranty Statement (HX-OG-04) and the Payment Schedule (HX-OG-05) together make up the contract and replace anything said or written before it.',
        '2. Making the contract. The contract is made when you accept our quote in writing or sign this document. You have no right to cancel once it is made, other than as these terms or the law allow.',
        '3. Price and payment. The price is the price in our quote. VAT is added or included as the quote shows. The deposit and stage payments, and when each is due, are in the Payment Schedule (HX-OG-05). If you do not pay an invoice by its due date we may charge interest and compensation under the Late Payment of Commercial Debts (Interest) Act 1998, and may suspend work until it is paid. Goods stay our property until they have been paid for in full; risk in them passes to you when they are delivered to site.',
        '4. Changes. Nothing in the contract changes unless we agree it in writing. If you ask for a change, or extra work is needed, we will tell you what it will cost and how it affects the dates, and the contract price changes as agreed.',
        '5. Access and site. You will make sure we can reach the work area safely, with clear working space and, where we need them, power, water and parking. You are responsible for the condition of the site and for any hidden services or unforeseen conditions. If we find any, work may stop, and extra cost will be agreed with you first.',
        '6. Dates and delays. Dates are our best estimates and time is not of the essence. We are not responsible for delay caused by something outside our reasonable control, including weather, supply of equipment and your failure to give us access.',
        '7. Warranties. The equipment carries the manufacturers’ warranties and our workmanship carries the warranty in the Warranty Statement (HX-OG-04). To the extent the law allows, we give no other warranty or condition about the equipment or the work.',
        '8. This is not an MCS installation. The installation is off-grid and is not certified under the Microgeneration Certification Scheme (see HX-OG-02).',
        '9. Our liability. Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else the law does not allow us to limit. Subject to that, we are not liable for loss of profit, income, business or goodwill, or for indirect or consequential loss, and our total liability to you under or in connection with the contract is limited to the price you pay for it.',
        '10. Ending the contract. Either of us may end the contract by written notice if the other commits a serious breach and does not put it right within a reasonable time of being asked to. You will pay for the work done and the goods ordered or supplied up to the date it ends.',
        '11. Complaints. If you are unhappy with anything, tell us and we will deal with it under our complaints procedure (HX-QMS-P08), a copy of which we will give you on request. Contact us at {{company_email}} or on {{company_phone}}.',
        '12. Governing law. This contract, and any dispute arising from it, is governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.',
      ].join('\n\n'),
    },
    {
      type: 'fields',
      title: 'Starting within the 14 days (consumers only)',
      showWhen: CONSUMER,
      fields: [yn('start_early', 'Please start the work within the 14-day cancellation period. I understand that if I cancel after we have started I must pay for what has been supplied up to then.', { hint: 'Leave this blank if the customer does not want work to start within the 14 days.', help: 'The Regulations need this request from the customer in writing before work starts inside the 14 days.' })],
    },
    {
      type: 'sign',
      title: 'Signed',
      signers: [
        { key: 'customer', label: 'Customer' },
        { key: 'heliaxis', label: 'For Heliaxis' },
      ],
    },
  ],
};

/* ── HX-OG-02: Non-MCS Disclosure & Acknowledgement ──────────────────────── */

export const OG_DISCLOSURE: DocTemplate = {
  schema: 1,
  code: 'HX-OG-02',
  title: 'Non-MCS Disclosure & Acknowledgement',
  purpose: 'One page, in plain English, telling the customer what an off-grid, non-MCS installation does not come with. Signed separately.',
  intro: 'Please read this page carefully before you sign. It is separate from the contract so that it is not missed.',
  tech: ['offgrid'],
  legalReview: true,
  sections: [
    {
      type: 'text',
      title: 'This is not an MCS-certified installation',
      body: [
        'The system we are installing for you at the address below is off-grid: it is not connected to the electricity grid. It is not an MCS-certified installation. That means:',
        '- You will not receive an MCS certificate.',
        '- You will not have an Insurance-Backed Guarantee (IBG).',
        '- The installation is not eligible for the Smart Export Guarantee, or for grants or incentives that are linked to MCS.',
        '- You should tell your home insurer, and your mortgage lender if you have one, before the work starts.',
        '- It may matter when you sell the property: a buyer or their solicitor may ask about it.',
        'If any part of the system is, or will be, connected to a grid-connected installation, this page does not apply. Tell us before you sign.',
      ].join('\n'),
    },
    {
      type: 'fields',
      title: 'Your acknowledgement',
      columns: 1,
      fields: [
        text('customer_name', 'Customer', { required: true, prefill: '{{customer}}' }),
        text('site', 'Site address', { required: true, prefill: '{{address}}' }),
        yn('ack_off_grid', 'I understand that the system is off-grid and not connected to the electricity grid.', { required: true, noNa: true }),
        yn('ack_no_mcs', 'I understand that this is not an MCS-certified installation and I will not receive an MCS certificate.', { required: true, noNa: true }),
        yn('ack_no_ibg', 'I understand that I will not have an Insurance-Backed Guarantee.', { required: true, noNa: true }),
        yn('ack_no_seg', 'I understand that it is not eligible for the Smart Export Guarantee or for MCS-linked grants or incentives.', { required: true, noNa: true }),
        yn('ack_tell_insurer', 'I understand that I should tell my home insurer and my mortgage lender, and that it may be relevant when I sell the property.', { required: true, noNa: true }),
      ],
    },
    {
      type: 'sign',
      title: 'Signed',
      signers: [
        { key: 'customer', label: 'Customer' },
        { key: 'heliaxis', label: 'For Heliaxis' },
      ],
    },
  ],
};

/* ── HX-OG-03: System Specification & Design Summary ─────────────────────── */

export const OG_SPEC: DocTemplate = {
  schema: 1,
  code: 'HX-OG-03',
  title: 'System Specification & Design Summary (off-grid)',
  purpose: 'What is being installed and how it was sized, taken from the design pack.',
  intro: 'This summarises the design pack for your property. Until a site survey has been done the design is indicative and may change; we will tell you before anything changes.',
  tech: ['offgrid'],
  legalReview: true,
  sections: [
    {
      type: 'fields',
      title: 'The system',
      columns: 2,
      fields: [
        text('system_type', 'System type', { prefill: 'Off-grid (non-MCS)' }),
        text('quote_ref', 'Quote', { required: true }),
        text('panels', 'Solar panels', { required: true }),
        text('array_kwp', 'Array size', { required: true }),
        text('layout', 'Panel layout'),
        text('strings', 'String configuration'),
        text('inverter', 'Inverter', { required: true }),
        text('battery', 'Battery storage', { required: true }),
        text('battery_usable', 'Usable battery capacity'),
        text('generator', 'Generator backup'),
        text('dc_ac', 'DC/AC ratio'),
      ],
    },
    {
      type: 'fields',
      title: 'Off-grid sizing assumptions',
      columns: 2,
      fields: [
        text('daily_load', 'Daily electricity use the system is sized for'),
        text('autonomy', 'Days of autonomy'),
        long('assumptions', 'What the design assumes', { hint: 'Roof shape, pitch, direction and any other assumption made without a survey.' }),
        long('design_points', 'Points from the design checks', { hint: 'Any warning from the design checks, none left out.' }),
        text('design_ref', 'Design pack'),
        text('survey_status', 'Survey', { prefill: 'Not yet surveyed: indicative' }),
      ],
    },
    {
      type: 'text',
      title: 'About this design',
      body: 'The panel layout and the system size are worked out from the roof size given to us. They are indicative and subject to a site survey. Autonomy is the number of days the battery alone could supply the stated daily use with no sun; real use and weather will vary. This document does not make any claim about generation, savings or payback.',
    },
    { type: 'sign', title: 'Signed', signers: [{ key: 'customer', label: 'Customer' }, { key: 'heliaxis', label: 'For Heliaxis' }] },
  ],
};

/* ── HX-OG-04: Warranty Statement ────────────────────────────────────────── */

export const OG_WARRANTY: DocTemplate = {
  schema: 1,
  code: 'HX-OG-04',
  title: 'Warranty Statement (off-grid)',
  purpose: 'The manufacturers’ warranties that are passed to the customer, and Heliaxis’s workmanship warranty.',
  intro: 'This statement says what is, and is not, covered.',
  tech: ['offgrid'],
  legalReview: true,
  sections: [
    {
      type: 'fields',
      title: 'Warranty periods',
      columns: 2,
      fields: [
        num('panel_years', 'Solar panels: manufacturer’s product warranty', 'years', { required: true }),
        num('inverter_years', 'Inverter: manufacturer’s warranty', 'years', { required: true }),
        num('battery_years', 'Battery: manufacturer’s warranty', 'years', { required: true }),
        num('workmanship_years', 'Heliaxis workmanship warranty', 'years', { required: true }),
        long('mf_terms', 'Where the manufacturers’ terms are', { hint: 'The warranty document for each product, with its terms, is in the handover pack.' }),
      ],
    },
    {
      type: 'text',
      title: 'Manufacturers’ warranties',
      body: 'The equipment carries the manufacturer’s own warranty. We pass these to you; they are given by the manufacturers on their own terms, which are in the warranty document for each product. Where a manufacturer’s terms and this statement differ, the manufacturer’s terms apply to that product.',
    },
    {
      type: 'text',
      title: 'Our workmanship warranty',
      body: 'We warrant our installation work for the number of years shown above, from the date the system is commissioned. If our workmanship is faulty during that time, we will put it right. This does not affect your legal rights.',
    },
    {
      type: 'text',
      title: 'No Insurance-Backed Guarantee',
      body: 'This is an off-grid, non-MCS installation. It does not have an Insurance-Backed Guarantee (IBG). Nothing in this statement is, or replaces, an IBG.',
    },
    {
      type: 'text',
      title: 'What can void a warranty',
      body: [
        'A warranty may not cover, or may end, if the fault is caused by:',
        '- misuse, or use outside the limits in the manufacturer’s instructions (for example overloading the system or discharging a battery beyond its limits);',
        '- changes, repairs or additions made by anyone we or the manufacturer have not approved;',
        '- not following the maintenance or operating instructions;',
        '- damage from fire, flood, lightning, impact or other events outside our control;',
        '- parts that are not genuine or not approved for the equipment.',
      ].join('\n'),
    },
    { type: 'sign', title: 'Signed', signers: [{ key: 'customer', label: 'Customer' }, { key: 'heliaxis', label: 'For Heliaxis' }] },
  ],
};

/* ── HX-OG-05: Payment Schedule & Deposit Invoice ────────────────────────── */

const stage = (n: number, required = false): TemplateField[] => [
  text(`p${n}_label`, `Payment ${n}: what it is for`, { required }),
  text(`p${n}_amount`, `Payment ${n}: amount (inc VAT)`, { required }),
  text(`p${n}_due`, `Payment ${n}: due`, { required }),
];

export const OG_PAYMENT: DocTemplate = {
  schema: 1,
  code: 'HX-OG-05',
  title: 'Payment Schedule & Deposit Invoice (off-grid)',
  purpose: 'The stages, the amounts and when each is due, with the deposit invoice.',
  intro: 'The amounts below add up to the price in the quote.',
  tech: ['offgrid'],
  legalReview: true,
  sections: [
    {
      type: 'fields',
      title: 'The price',
      columns: 2,
      fields: [text('quote_ref', 'Quote', { required: true }), text('total', 'Total price (inc VAT)', { required: true }), text('vat', 'Of which VAT'), text('invoice_no', 'Deposit invoice number'), text('invoice_date', 'Invoice date', { prefill: '{{date}}' })],
    },
    { type: 'fields', title: 'Payment 1: deposit', columns: 3, fields: stage(1, true) },
    { type: 'fields', title: 'Payment 2', columns: 3, fields: stage(2) },
    { type: 'fields', title: 'Payment 3', columns: 3, fields: stage(3) },
    { type: 'fields', title: 'Payment 4', columns: 3, fields: stage(4) },
    {
      type: 'text',
      title: 'Paying us',
      body: 'Please pay by the due date shown, quoting the invoice number or quote number. Payment details are on the invoice. Goods stay our property until they have been paid for in full.',
    },
    { type: 'sign', title: 'Agreed', signers: [{ key: 'customer', label: 'Customer' }, { key: 'heliaxis', label: 'For Heliaxis' }] },
  ],
};

/* ── HX-OG-06: Handover Pack checklist ───────────────────────────────────── */

const handover = (key: string, label: string, hint?: string): TemplateField => yn(key, label, { required: true, ...(hint ? { hint } : {}) });

export const OG_HANDOVER: DocTemplate = {
  schema: 1,
  code: 'HX-OG-06',
  title: 'Handover Pack checklist (off-grid)',
  purpose: 'What goes in the handover pack for an off-grid installation, ticked off before handover.',
  intro: 'Answer N/A only where an item really does not apply to this installation.',
  tech: ['offgrid'],
  legalReview: true,
  sections: [
    {
      type: 'fields',
      title: 'In the handover pack',
      columns: 1,
      fields: [
        handover('om_manuals', 'Operation and maintenance manuals for every product'),
        handover('datasheets', 'Datasheets for the panels, inverter and battery'),
        handover('eic', 'Electrical Installation Certificate to BS 7671'),
        handover('part_p', 'Building Regulations (Part P) notification, where applicable'),
        handover('battery_pas', 'Battery installation to PAS 63100'),
        handover('commissioning', 'Commissioning record'),
        handover('isolation', 'Safe isolation and emergency shutdown instructions'),
        handover('generator', 'Generator instructions', 'N/A if there is no generator.'),
        handover('warranties', 'Warranty documents (HX-OG-04 and the manufacturers’ warranties)'),
        long('notes', 'Anything to note'),
      ],
    },
    { type: 'sign', title: 'Signed', signers: [{ key: 'installer', label: 'Installer' }, { key: 'customer', label: 'Customer' }] },
  ],
};

export const OFF_GRID_TEMPLATES: DocTemplate[] = [OG_TERMS, OG_DISCLOSURE, OG_SPEC, OG_WARRANTY, OG_PAYMENT, OG_HANDOVER];
