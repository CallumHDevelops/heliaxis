import { notFound } from 'next/navigation';
import type { PortalData } from '@/lib/crm/portal';
import { PortalView } from '../[token]/PortalView';

export const dynamic = 'force-dynamic';

/**
 * Development only (404 everywhere else): the portal drawn from made-up data, one stage at a time, so the
 * design can be checked without a database. /my/demo?stage=quote | booked | complete
 */
export default async function PortalDemo({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { stage = 'booked' } = await searchParams;
  return <PortalView data={demo(stage)} preview />;
}

const D = (id: string, name: string, at = '2026-10-02T10:00:00Z') => ({ id, name, at, print: false });
const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10) + 'T08:00:00Z';

function demo(stage: string): PortalData {
  const quote = stage === 'quote';
  const complete = stage === 'complete';
  const proposal = {
    ids: ['p1', 'p2', 'p3', 'p4'],
    groups: [
      { title: 'Start here', items: [{ code: 'HX-PP-01', title: 'Covering letter', line: 'Our letter to you: what is in this pack and what happens next.', docs: [D('p1', 'Covering letter')], coming: false, sign: false }] },
      { title: 'Your quotation', items: [{ code: 'HX-PP-02', title: 'Quotation', line: 'What we propose to supply and fit, what it costs, and the guarantees.', docs: [D('p2', 'Quotation Q-1042')], coming: false, sign: false }] },
      { title: 'Your contract', items: [{ code: 'HX-PP-04', title: 'Contract of sale (with cancellation form)', line: 'The terms we both agree to when you sign.', docs: [D('p3', 'Contract')], coming: false, sign: true }] },
      {
        title: 'Your protection',
        items: [
          { code: 'HX-PP-05', title: 'MCS Customer Commitment', line: 'What MCS says you can expect from us.', docs: [], coming: true, sign: false },
          { code: 'HX-PP-08', title: 'Complaints procedure', line: 'Who to contact if something goes wrong.', docs: [D('p4', 'Complaints procedure')], coming: false, sign: false },
        ],
      },
    ],
  };
  const stageKey = quote ? 'quote_sent' : complete ? 'complete' : 'install_booked';
  const step = (key: string, label: string, state: 'done' | 'current' | 'upcoming', date?: string | null, note?: string) => ({ key, label, state, date, note });
  return {
    token: 'demo',
    mode: quote ? 'quote' : 'full',
    projectId: 'demo',
    title: '4.4 kWp solar and 5 kWh battery',
    stage: stageKey,
    first: 'Sam',
    postcode: quote ? '' : 'NP20 1AB',
    owner: 'Callum',
    surveyAt: '2026-09-18T10:00:00Z',
    installAt: complete ? '2026-10-20T08:00:00Z' : quote ? null : soon(9),
    tracker: quote
      ? []
      : [
          step('enquiry', 'Enquiry received', 'done', '2026-09-02T09:00:00Z'),
          step('survey', 'Survey', 'done', '2026-09-18T10:00:00Z'),
          step('quote', 'Your quote', 'done'),
          step('order', 'Order confirmed', 'done', '2026-09-28T19:12:00Z', 'Deposit paid'),
          step('design', 'Design & approvals', 'done'),
          step('dno', 'Grid connection (DNO)', 'done', '2026-10-06T00:00:00Z'),
          step('install', 'Installation', complete ? 'done' : 'current', complete ? '2026-10-20T08:00:00Z' : soon(9), complete ? undefined : 'Booked'),
          step('handover', 'Handover & certificates', complete ? 'done' : 'upcoming'),
        ],
    documents: quote ? [] : [{ id: 'o1', category: 'dno', name: 'DNO approval letter', at: '2026-10-06T10:00:00Z', print: false }, ...(complete ? [{ id: 'i1', category: 'invoice', name: 'Final invoice INV-2207', at: '2026-10-22T10:00:00Z', print: false }] : [])],
    handover: complete
      ? {
          sent: true,
          pack: { id: 'pk', size: 4_200_000 },
          groups: [
            { title: 'Start here', items: [{ code: 'HX-HO-01', title: 'Covering letter', line: 'What’s in your pack.', docs: [D('h1', 'Covering letter')], coming: false }] },
            {
              title: 'Certificates',
              items: [
                { code: 'HX-HO-02', title: 'MCS certificate', line: 'You need this for the Smart Export Guarantee.', docs: [D('h2', 'MCS certificate')], coming: false },
                { code: 'HX-HO-03', title: 'Electrical installation certificate', line: 'The electrician’s record of the work.', docs: [D('h3', 'EIC')], coming: false },
              ],
            },
            {
              title: 'Warranties',
              items: [
                { code: 'HX-HO-06', title: 'Heliaxis workmanship warranty', line: 'Our warranty on the work we did.', docs: [D('h4', 'Workmanship warranty')], coming: false },
                { code: 'HX-HO-07', title: 'Warranty insurance', line: 'Your QualityMark insurance-backed guarantee.', docs: [], coming: true },
              ],
            },
          ],
          signs: [],
          next: ['Apply for the Smart Export Guarantee (SEG) with an energy supplier.', 'Download the GivEnergy app, so you can see what your system is doing.', 'Keep this link safe: it’s your copy of everything.'],
          ids: ['h1', 'h2', 'h3', 'h4', 'pk'],
        }
      : null,
    photos: [],
    quote: quote ? { id: 'q1', name: 'Quotation Q-1042.pdf', category: 'quote', pdf: true } : null,
    accepted: quote ? null : { at: '2026-09-28T19:12:00Z', name: 'Sam Jones', document: { id: 'p3', name: 'Contract' } },
    deposit: quote ? null : { amount: 1200, paidAt: '2026-09-28T19:20:00Z', canPay: true },
    installPref: null,
    pack: { on: false, held: false },
    hasProposal: true,
    extras: {
      ref: quote ? null : 'HX-0142',
      proposal,
      money: quote
        ? null
        : {
            total: 9850,
            payments: [{ label: 'Deposit', amount: 1200, on: '2026-09-28T19:20:00Z', reference: null }, ...(complete ? [{ label: 'Final payment', amount: 7000, on: '2026-10-24', reference: 'BACS 88214' }] : [])],
            paid: complete ? 8200 : 1200,
            balance: complete ? 1650 : 8650,
            invoices: complete ? [D('i1', 'Final invoice INV-2207', '2026-10-22T10:00:00Z')] : [D('i0', 'Deposit receipt', '2026-09-28T19:20:00Z')],
          },
      equipment: quote
        ? []
        : [
            { what: 'Solar panels', model: 'Aiko Neostar 2P 440W', count: 10, rating: '4.4 kWp', serials: [] },
            { what: 'Inverter', model: 'GivEnergy Gen 3 Hybrid 5 kW', count: null, rating: '5 kW', serials: complete ? ['GE2341A4B7C9'] : [] },
            { what: 'Battery', model: 'GivEnergy 5.2 kWh', count: null, rating: '5.2 kWh usable', serials: complete ? ['BT2309X55120'] : [] },
          ],
      warranties: complete
        ? [
            { title: 'Heliaxis workmanship warranty', term: '10 years: 20 October 2026 to 20 October 2036', detail: 'Our own warranty on the work we did.' },
            { title: 'Insurance-backed guarantee', term: 'QualityMark, policy QM-55120', detail: 'It backs our warranty if we ever stopped trading.' },
            { title: 'Inverter: manufacturer’s warranty', term: 'GivEnergy Gen 3 Hybrid 5 kW', detail: 'Set by the manufacturer. The terms are in your packs.' },
          ]
        : [],
      events: [
        { key: 'enquiry', label: 'Enquiry received', at: '2026-09-02T09:00:00Z', planned: false },
        { key: 'survey', label: 'Survey', at: '2026-09-18T10:00:00Z', planned: false },
        { key: 'quote', label: 'Quote sent to you', at: '2026-09-20T12:00:00Z', planned: false },
        ...(quote
          ? []
          : [
              { key: 'accepted', label: 'Quote accepted', at: '2026-09-28T19:12:00Z', detail: 'Signed by Sam Jones', planned: false },
              { key: 'deposit', label: 'Deposit paid', at: '2026-09-28T19:20:00Z', planned: false },
              { key: 'dno_applied', label: 'Applied to the electricity network (DNO)', at: '2026-09-30T10:00:00Z', detail: 'Reference NGED-88812', planned: false },
              { key: 'install', label: 'Installation', at: complete ? '2026-10-20T08:00:00Z' : soon(9), detail: '2 working days', planned: !complete },
            ]),
      ],
    },
    hestia: true,
    phone: '01633 965205',
    whatsapp: '07700900123',
    email: 'hello@heliaxis.co.uk',
  } as unknown as PortalData;
}
