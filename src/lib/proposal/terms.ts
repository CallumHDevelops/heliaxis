/**
 * The proposal pack's fixed wording (HX-PP-01 covering letter, HX-PP-04 contract of sale, HX-PP-08
 * complaints procedure): Heliaxis's own words, written to cover everything the Renewable Energy
 * Consumer Code (RECC), MCS and the Consumer Contracts Regulations 2013 ask a contract and a
 * complaints procedure to tell a domestic customer. Every job fills in its own names, prices and
 * dates (src/lib/proposal/generate.ts). Pure: the generators and the tests read the same words.
 *
 * Bump TERMS_VERSION whenever any wording here changes: it goes into each document's inputs, so
 * contracts not yet signed are made again with the new words (signed ones are never touched).
 */
export const TERMS_VERSION = 'terms-1 (20 Nov 2026)';

/** Facts about the company and its schemes that the contract names. Check them when anything changes. */
export const TERMS_FACTS = {
  /** How long a quotation stands when it carries no "valid until" date. */
  quoteValidDays: 30,
  /** The insurer that protects deposits and advance payments (RECC). */
  depositInsurer: 'Peacock Insurance',
  /** Who insures Heliaxis for damage to people and property. */
  liabilityInsurer: 'Open Underwriting',
  /** MCS certification body (Heliaxis's MCS number is NAP-…: NAPIT). */
  certificationBody: 'NAPIT',
  /** RECC's alternative dispute resolution provider (a fact; from RECC). */
  adr: { name: 'Green Homes Dispute Resolution', web: 'www.ghdr.org.uk', phone: '0204 616 0015', email: 'hello@ghdr.org.uk' },
  recc: 'www.recc.org.uk',
  privacy: 'heliaxis.co.uk/privacy-policy',
  /** Interest on late payment, over the Bank of England base rate. */
  lateInterestOverBase: 3,
  /** Complaints (RECC section 9): written acknowledgement, a visit when one is needed, and the findings. */
  complaints: { acknowledgeWorkingDays: 2, inspectWorkingDays: 5, findingsWorkingDays: 10 },
  /** Waste taken away, and the handover pack given, within this many days of finishing. */
  wasteDays: 7,
  handoverDays: 7,
} as const;

export type Clause = { title: string; paras: string[] };

/** The contract's clauses. `{…}` are filled per job: see contractClauses(). */
export function contractClauses(o: { warrantyYears: number | null; solar: boolean; validUntil: string }): Clause[] {
  const F = TERMS_FACTS;
  const C = F.complaints;
  const clauses: Clause[] = [
    {
      title: 'About this contract',
      paras: [
        'This contract is between you, the customer named above, and Heliaxis Ltd. It is made up of these terms and the quotation they come with. Together they set out what we will supply and fit, what it costs, and what each of us agrees to do.',
        'We have written it to meet our obligations under the Renewable Energy Consumer Code (RECC) and the Microgeneration Certification Scheme (MCS). If anything in it is unclear, please ask us before you sign. We can give you this contract, or anything else we have sent you, in large print.',
      ],
    },
    {
      title: 'Your quotation',
      paras: [
        `The quotation stands until ${o.validUntil}. It lists the goods and work we will provide and the total price, including VAT. It also gives an estimate of how the system should perform, worked out the way MCS requires; an estimate is a guide, not a guarantee.`,
        'If something you might expect to be included is left out at your request, the quotation says so. We will agree with you where the main equipment goes, and you can approve the design before work starts.',
        'If our survey finds the roof, the building or the electrics need a different design, equipment or price, we will explain why and agree any change with you in writing before work starts. If the main equipment or the total price changes, you may cancel without paying anything.',
      ],
    },
    {
      title: 'Permissions',
      paras: [
        'Most systems on houses do not need planning permission, but listed buildings, conservation areas and some other properties do. We will tell you what permissions and notifications we think apply, and help you get them, but it is your responsibility to make sure any planning permission or other consent the work needs is in place before we start.',
        'Planning fees, a structural engineer’s report or other costs of this kind are yours unless the quotation includes them. We cannot give a refund for an installation that needed permission which was not obtained.',
      ],
    },
    {
      title: 'Your right to cancel',
      paras: [
        'You have the right to cancel this contract within 14 days without giving any reason. The 14 days end 14 days after the day the last of the goods is delivered to you. You can also cancel at any time before the goods are delivered.',
        `To cancel, tell us clearly, by letter, email or phone, using the details at the end of this contract. You can use the cancellation form attached, but you do not have to. Your cancellation is in time if you send it before the 14 days are up.`,
      ],
    },
    {
      title: 'If you cancel',
      paras: [
        'We will refund everything you have paid us, including the cost of standard delivery, within 14 days of the day you tell us you are cancelling (or, if we have delivered goods, within 14 days of getting them back or of you showing us you have sent them back, whichever is sooner). We will refund you the same way you paid, unless you agree otherwise, and you will not be charged for the refund.',
        'We will collect any goods ourselves, at our cost. We may take off the refund any loss in value caused by handling the goods more than was needed to see what they are and how they work.',
      ],
    },
    {
      title: 'Starting work in the 14 days',
      paras: [
        'We will only start work before your 14 days are up if you ask us to in writing. If you do, and then cancel, you will have to pay for the work done up to the time you tell us, in proportion to the whole contract, and for any goods that have been fitted.',
      ],
    },
    {
      title: 'Other times you can cancel',
      paras: [
        'You can also cancel, and get a full refund, if there is a serious delay that is within our control and not caused by you; if the design or the main equipment is different from the quotation; or if the total price goes up after you have signed. If we seriously break this contract, you may cancel, or ask us to repair or replace what is wrong, or claim compensation.',
        'If you cancel at any other time after your 14 days, we may ask you to pay our reasonable costs, which we will keep as low as we can, and we may keep some or all of a deposit or advance payment towards them.',
      ],
    },
    {
      title: 'Our right to end the contract',
      paras: [
        'If you seriously break this contract and do not put it right within 14 days of us telling you in writing, we may end it. If we lose money because of it, we may claim reasonable compensation, and we will keep our losses as low as we can.',
      ],
    },
    {
      title: 'The timetable',
      paras: [
        'We will agree a timetable for the work with you; by signing you are agreeing to it. Bad weather, or goods arriving late, can mean it has to change. We will tell you as soon as we know and agree a new date with you.',
        'If goods are badly delayed we may offer you other MCS-certified products of the same specification, quality and value. You can accept them, wait for the ones you ordered, or cancel without paying anything. If a serious delay is caused by us or our suppliers, you may cancel without paying anything.',
        'If a delay is caused by you, we will try to work around it at no cost to you, but if it costs us more (for example, keeping scaffolding up for longer) we may ask you to pay that extra cost.',
      ],
    },
    {
      title: 'The installation',
      paras: [
        'We will install the system to the MCS installation standard for its technology, BS 7671 (the wiring regulations), the manufacturers’ instructions and the Renewable Energy Consumer Code. The work will be done by people trained and competent to do it. The goods will be of satisfactory quality, fit for purpose and as described.',
        'If we find something we could not reasonably have foreseen, such as electrical or building work that needs putting right first, we will stop, explain it and agree it, and its cost, with you before going on.',
        'Please give us safe, clear access to where we are working, and the use of water, electricity and a toilet, free of charge. If the system will connect to the internet, we will need your Wi-Fi details. Any work you or someone else is doing to get ready must be finished by the agreed start date; if it is not, and that costs us more, we may ask you to pay that cost.',
        'We will tell, or apply to, your electricity network operator (DNO) where the rules require it, and notify Building Control. We will take away our waste within ' +
          `${F.wasteDays} days of finishing.`,
      ],
    },
    {
      title: 'Switching on and handing over',
      paras: [
        'When the work is finished we will commission the system to MCS requirements: test that it is safe, installed as designed and the manufacturers require, and working properly. We will show you how it works, how to switch it off and how to look after it.',
        `Within ${F.handoverDays} days of finishing we will give you your handover pack: the certificates, warranties, test records and manufacturers’ information. We will register the installation with MCS and Building Control, and send you the certificates for your pack.`,
      ],
    },
    {
      title: 'Deposits and advance payments',
      paras: [
        'We will only use a deposit or advance payment for the work in this contract. A deposit will never be more than 25% of the total price. A deposit and advance payments together will never be more than 60% of the total price, and we will not ask for an advance payment more than three weeks before the goods are delivered or the work starts.',
        `Your deposit and advance payments are protected by insurance with ${F.depositInsurer}, at no cost to you. When you place your order we register your name, address and the contract value with them, and they send you the policy themselves. Please tell us if you do not want your details registered.`,
        'If we take a deposit before our full survey, and the survey shows we cannot go ahead, we will refund every deposit and advance payment.',
        'Goods we buy with your money become yours, in proportion to what you have paid. Until we deliver them we keep them separate, marked as yours and insured, and you may arrange to see them or collect them.',
      ],
    },
    {
      title: 'Goods that are still ours',
      paras: [
        'Goods we deliver before they are paid for stay ours until they are. Please keep them identifiable, in their packaging and protected from damage, and tell us if you are worried they are unsafe or at risk. You are not responsible for inspecting or storing them beyond that, although we may ask you to check a delivery for visible damage.',
        'If the contract ends, we will arrange with you to collect our goods, and refund any part of them you paid for, less our reasonable costs. If we cannot reasonably arrange collection, we may take legal action to recover them or their value.',
      ],
    },
    {
      title: 'Changes to the work',
      paras: [
        'If you want to change the work after signing, tell us straight away. We will make the change if we can, or explain why not. A change may change the price, up or down; we will agree it with you in writing as a variation to this contract, and ask you to confirm it in writing within 14 days.',
        'If we come across extra work that is needed, we will discuss it with you. If it is work we are competent to do, we will quote for it; if not, we will help you find someone who is. If it holds up the installation, we may make a reasonable charge for the delay.',
      ],
    },
    {
      title: 'Paying us',
      paras: [
        'Please pay each amount in the payment schedule below when it is due. The final payment is due when the installation is finished. If a payment is not made we may stop work, after telling you in writing. We may charge interest on late payments at ' +
          `${F.lateInterestOverBase}% a year above the Bank of England base rate, from the due date until it is paid.`,
        'If you believe something is wrong, you may hold back only an amount in proportion to the problem. Tell us in writing, before the payment is due, how much you are holding back and why.',
        'If we have stopped work because a payment was not made, you may have to pay our extra costs, and we may ask for the goods back or take legal action to recover them or the money owed.',
      ],
    },
    {
      title: 'Warranties and guarantees',
      paras: [
        [
          o.warrantyYears ? `We guarantee our workmanship for ${o.warrantyYears} years from the day the system is switched on.` : 'We guarantee our workmanship, as our written warranty sets out.',
          'The equipment also carries its manufacturers’ warranties, and our workmanship warranty is backed by an insurance policy in case we stop trading. We will give you all of these in writing in your handover pack and go through them with you.',
        ].join(' '),
      ],
    },
    {
      title: 'Complaints and disputes',
      paras: [
        `If you are unhappy with anything we have done, please tell us; our complaints procedure is in this pack. We will acknowledge your complaint in writing within ${C.acknowledgeWorkingDays} working days and give you our findings within ${C.findingsWorkingDays} working days. If we cannot meet a timescale, we will tell you why and when you can expect an answer.`,
        `If we cannot settle it between us, you can take it, free of charge, to RECC’s independent dispute resolution service, ${F.adr.name}: ${F.adr.web}, ${F.adr.phone}, ${F.adr.email}. A dispute about the MCS installation standards can also go to our MCS certification body, ${F.certificationBody}; we will give you their details on request. The Renewable Energy Consumer Code is at ${F.recc}.`,
      ],
    },
    {
      title: 'Insurance',
      paras: [
        'Please tell your home insurer about the installation, in case it changes your cover or premium.',
        `We are insured, through ${F.liabilityInsurer}, against damage to people or property caused by our work, as members of a consumer code must be.`,
      ],
    },
    {
      title: 'Your information',
      paras: [
        `We use your personal information, under the UK GDPR and the Data Protection Act 2018, to supply and fit your system; to take payments; to register the installation with MCS, your network operator, Building Control and the deposit and warranty insurers; and to deal with any complaint, including with RECC and its dispute resolution service where the law requires us to share it. Our privacy policy is at ${F.privacy}. If you asked to hear about offers, you can stop that at any time.`,
      ],
    },
    {
      title: 'Audits',
      paras: [
        'MCS certification bodies check a sample of our installations every year. If yours is chosen, you agree to let them see it, at a time arranged with you.',
      ],
    },
    {
      title: 'Subcontractors',
      paras: ['We may use trusted subcontractors for parts of the work, such as scaffolding. We will tell you who they are, and we stay responsible for the whole installation under our MCS certification.'],
    },
    {
      title: 'Your legal rights',
      paras: ['Nothing in this contract affects your legal rights as a consumer. The contract is governed by the law of England and Wales.'],
    },
  ];
  if (o.solar) {
    clauses.splice(clauses.length - 3, 0, {
      title: 'Smart Export Guarantee',
      paras: [
        'Under the Smart Export Guarantee, licensed electricity suppliers pay for the electricity a solar system sends to the grid. Each supplier sets its own rate and terms. To apply you will need the MCS certificate we send you, an export MPAN and a smart meter (or another meter that records exports every half hour). Your electricity supplier can tell you more.',
      ],
    });
  }
  return clauses;
}

/** The model cancellation form (Consumer Contracts Regulations 2013, Schedule 3, part B), with our details filled in. */
export const CANCELLATION_FORM = [
  'Complete and return this form only if you wish to cancel the contract.',
  'I hereby give notice that I cancel my contract for the supply of the goods and installation described in the quotation.',
];

/** HX-PP-08: the customer complaints procedure, in Heliaxis's words (RECC section 9). `contact` is the job owner. */
export function complaintsSteps(contact: string): Clause[] {
  const F = TERMS_FACTS;
  const C = F.complaints;
  return [
    {
      title: 'Telling us',
      paras: [
        `If you are unhappy with anything we have done, or not done, please tell us. You can call us, email us or write to us at the details below. The person to contact is ${contact}, who will look after your complaint from start to finish.`,
        'You are welcome to have someone else, such as a relative, a friend or a consumer adviser, help you or deal with us on your behalf. If you do, we will work fully with them.',
      ],
    },
    {
      title: 'What we will do',
      paras: [
        `We will acknowledge your complaint in writing within ${C.acknowledgeWorkingDays} working days of receiving it.`,
        `If we need to see your system, we will arrange to inspect it within ${C.inspectWorkingDays} working days, or within 24 hours if you are without heating or hot water because of the problem.`,
        `We will look into it and give you our findings, clearly and in writing, within ${C.findingsWorkingDays} working days of receiving your complaint, and agree with you what we will do to put it right.`,
        'If we cannot meet any of these timescales, or a date we have agreed with you, we will tell you why and give you a new date.',
      ],
    },
    {
      title: 'If we cannot settle it',
      paras: [
        `If we have not resolved your complaint to your satisfaction, you can take it to ${F.adr.name}, the independent dispute resolution service partnered with the Renewable Energy Consumer Code. It is free for you. Raise a dispute at ${F.adr.web}, or contact them on ${F.adr.phone} or ${F.adr.email}. We will take part fully in any mediation or adjudication.`,
        `A complaint about whether the installation meets the MCS standards can also be referred to our MCS certification body, ${F.certificationBody}; we will give you their contact details on request. You can read the Renewable Energy Consumer Code at ${F.recc}.`,
        'This procedure does not affect your legal rights.',
      ],
    },
  ];
}
