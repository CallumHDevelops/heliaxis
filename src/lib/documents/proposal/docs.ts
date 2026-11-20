import 'server-only';
import type { ComplaintsInput, ContractInput, ProposalCoverInput } from '@/lib/proposal/inputs';
import { longYmd } from '@/lib/proposal/inputs';
import { CANCELLATION_FORM, complaintsSteps, contractClauses } from '@/lib/proposal/terms';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { pounds } from '../handover/common';
import { issueOf } from '../issue';
import { longDate, newDocument } from '../pdf-kit';

/**
 * The proposal pack's own documents (SPEC: proposal pack): HX-PP-01 the covering letter, HX-PP-04 the
 * contract of sale with its cancellation form, HX-PP-08 the complaints procedure. The wording is in
 * src/lib/proposal/terms.ts; each job fills in its names, prices and dates.
 */
export const PROPOSAL_COVER_TITLE = 'Covering letter';
export const CONTRACT_TITLE = 'Contract of sale';
export const COMPLAINTS_TITLE = 'Complaints procedure';

const contactLines = () => [`${HELIAXIS_COMPANY.tradingName}, ${HELIAXIS_COMPANY.addressLines.join(', ')}`, `${HELIAXIS_COMPANY.phone} · ${HELIAXIS_COMPANY.email}`];

async function start(code: string, title: string, h: { ref: string | null; issued: string; variant?: 'digital' | 'print' }) {
  const kit = await newDocument({ code, title, revision: issueOf(code), jobRef: h.ref, issued: h.issued, variant: h.variant });
  kit.header({ meta: [['Project', h.ref ?? '–'], ['Date', longDate(h.issued)]] });
  return kit;
}

export async function makeProposalCover(c: ProposalCoverInput): Promise<Uint8Array> {
  const kit = await start('HX-PP-01', PROPOSAL_COVER_TITLE, c);
  kit.paragraph([c.customer, ...c.address].join('\n'), { bold: true });
  kit.gap(4);
  kit.paragraph(`Dear ${c.first || c.customer},`);
  kit.paragraph(
    `Thank you for asking us to quote. We are pleased to send you our proposal to supply and fit ${c.what} at your home. This pack gives you everything you need to decide whether to go ahead: what we propose to fit and where, what it costs, what it should produce, the contract, and how you are protected.`
  );
  if (c.contents.length) {
    kit.section('In this pack');
    kit.list(c.contents);
  }
  kit.section('Taking your time');
  kit.paragraph(
    `Our quotation${c.quoteNumber ? ` (${c.quoteNumber})` : ''} stands until ${longYmd(c.validUntil)}. Please read the contract before you sign it. If you do sign, you still have 14 days to change your mind without giving a reason: how to cancel, and a form you can use, are in the contract.`
  );
  kit.section('If you decide to go ahead');
  kit.paragraph('Sign the contract in your online portal (or sign and return a paper copy). We will then confirm your order, take any deposit set out in the contract, and agree an installation date with you.');
  kit.section('Our MCS certification');
  kit.paragraph(
    'As an MCS-certified installer we are assessed every year by our certification body, who check a sample of the installations we have done. By going ahead you agree to let them see your installation if it is chosen; we would arrange a time with you first.'
  );
  kit.paragraph(`If you have any questions at all, call us on ${HELIAXIS_COMPANY.phone} or email ${HELIAXIS_COMPANY.email}.`);
  kit.gap(6);
  kit.paragraph('Yours sincerely,');
  kit.gap(4);
  kit.paragraph(c.owner ? `${c.owner}\nfor Heliaxis` : 'The Heliaxis team', { bold: true });
  return kit.save();
}

export async function makeContract(c: ContractInput): Promise<Uint8Array> {
  const kit = await start('HX-PP-04', CONTRACT_TITLE, c);
  kit.idGrid([
    ['Customer', c.customer],
    ['Installation address', c.address.join(', ')],
    ['Quotation', [c.quote.number, `dated ${longYmd(c.quote.on)}`].filter(Boolean).join(', ')],
    ['Installer', `${HELIAXIS_COMPANY.legalName}, company ${HELIAXIS_COMPANY.companyNumber}, MCS ${HELIAXIS_COMPANY.mcsNumber}`],
  ]);
  kit.paragraph(`This contract is for the supply and installation of ${c.what}, as described in the quotation.`);
  const clauses = contractClauses({ warrantyYears: c.warrantyYears, solar: c.solar, validUntil: longYmd(c.validUntil) });
  clauses.forEach((cl, i) => {
    kit.section(`${i + 1}. ${cl.title}`);
    for (const p of cl.paras) kit.paragraph(p);
  });

  const n = clauses.length;
  kit.section(`${n + 1}. Price, payments and timetable`);
  kit.grid({
    columns: ['Contract value', 'Amount'],
    rows: [
      ['Total before VAT', pounds(c.quote.net)],
      ...c.quote.byRate.filter((r) => r.net > 0).map((r) => [`VAT at ${r.rate}%`, pounds(r.vat)]),
      ['Total contract price', pounds(c.quote.gross)],
    ],
    widths: [4, 2],
  });
  kit.grid({ columns: ['Payment', 'Amount', 'Due'], rows: c.schedule.map((s) => [s.what, pounds(s.pence), s.due]), widths: [2, 2, 3] });
  kit.rows([{ label: 'Installation date', value: c.installOn ? longYmd(c.installOn) : 'To be agreed with you after you sign' }]);

  kit.section(`${n + 2}. Signing`);
  kit.paragraph('By signing you agree to these terms and to the quotation they come with. You have 14 days to change your mind (clause 4).');
  await kit.signatures([
    { title: 'The customer', png: null, name: c.customer, at: null, line: 'Signature and date' },
    { title: 'For Heliaxis Ltd', png: null, name: c.owner ?? 'Heliaxis Ltd', at: null, line: 'Signature and date' },
  ]);

  kit.newPage();
  kit.section('Cancellation form');
  kit.paragraph(CANCELLATION_FORM[0], { bold: true });
  kit.rows([
    { label: 'To', value: [...contactLines()].join('\n') },
    { label: 'Contract', value: [c.ref, c.quote.number].filter(Boolean).join(' · ') || null },
  ]);
  kit.paragraph(CANCELLATION_FORM[1]);
  kit.rows([
    { label: 'Ordered on', value: '' },
    { label: 'Your name', value: c.customer },
    { label: 'Your address', value: c.address.join(', ') },
    { label: 'Date', value: '' },
  ]);
  await kit.signatures([{ title: 'Your signature (only if sending this on paper)', png: null, name: c.customer, at: null, line: ' ' }]);
  return kit.save();
}

export async function makeComplaints(c: ComplaintsInput): Promise<Uint8Array> {
  const kit = await start('HX-PP-08', COMPLAINTS_TITLE, c);
  kit.paragraph('We want every customer to be happy with their installation. If something is not right, we want to hear about it so we can put it right, and so it does not happen again.');
  for (const s of complaintsSteps(c.contact)) {
    kit.section(s.title);
    for (const p of s.paras) kit.paragraph(p);
  }
  kit.section('How to reach us');
  kit.rows([
    { label: 'Phone', value: HELIAXIS_COMPANY.phone },
    { label: 'Email', value: HELIAXIS_COMPANY.email },
    { label: 'Post', value: [HELIAXIS_COMPANY.tradingName, ...HELIAXIS_COMPANY.addressLines].join(', ') },
    { label: 'Please quote', value: c.ref ?? 'your name and address' },
  ]);
  return kit.save();
}
