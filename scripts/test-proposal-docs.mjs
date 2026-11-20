// The proposal pack's own documents (src/lib/proposal/inputs.ts, terms.ts, documents/proposal/docs.ts):
// what each needs, the contract's price and payment schedule (a deposit never over 25%), the solar-only
// clause, the complaints timescales, and that each one renders. Writes the PDFs to OUT_DIR when set.
// Usage: node --experimental-strip-types scripts/test-proposal-docs.mjs
import { registerHooks } from 'node:module';
import { writeFileSync } from 'node:fs';

const SRC = new URL('../src/', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    const spec = specifier.startsWith('@/') ? SRC + specifier.slice(2) : specifier;
    try {
      return next(spec, context);
    } catch (e) {
      if (/^(?:\.\.?\/|file:)/.test(spec) && !/\.\w+$/.test(spec)) return next(`${spec}.ts`, context);
      throw e;
    }
  },
});
const I = await import('../src/lib/proposal/inputs.ts');
const T = await import('../src/lib/proposal/terms.ts');
const S = await import('../src/lib/proposal/slots.ts');
const D = await import('../src/lib/documents/proposal/docs.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const facts = (o = {}) => ({
  today: '2026-11-20',
  ref: 'HX-0042',
  customer: { name: 'Sam Jones', first: 'Sam' },
  address: ['12 High Street', 'Newport', 'NP20 1AA'],
  postcode: 'NP20 1AA',
  products: ['solar', 'battery'],
  owner: 'Callum Hiscott',
  quote: { number: 'Q-0042', title: 'Solar and battery', on: '2026-11-18', validUntil: null, net: 875000, vat: 0, gross: 875000, byRate: [{ rate: 0, net: 875000, vat: 0 }], depositPence: 300000, hasEstimate: true },
  installOn: null,
  signed: false,
  warrantyYears: 7,
  contents: ['Quotation', 'Performance estimate', 'Contract of sale (with cancellation form)', 'Complaints procedure'],
  ...o,
});

/* ── What each needs ──────────────────────────────────────────────────────── */
eq('covering letter: made from any job with a customer', I.coverInput(facts()).ok, true);
eq('covering letter: no name, asks for it', I.coverInput(facts({ customer: { name: '', first: '' } })).why, 'Add the customer’s name.');
eq('covering letter: valid 30 days from the quote when it has no date', I.coverInput(facts()).input.validUntil, '2026-12-18');
eq('contract: no quote, asks for it first', [I.contractInput(facts({ quote: null })).ok, I.contractInput(facts({ quote: null })).fix], [false, 'opensolar']);
eq('contract: no address, asks for it', I.contractInput(facts({ address: [] })).why, 'Add the installation address on Job details: the contract names it.');
const c = I.contractInput(facts());
eq('contract: a deposit over 25% is capped at 25% (RECC)', c.input.schedule, [
  { what: 'Deposit', pence: 218750, due: 'When you sign this contract' },
  { what: 'Balance', pence: 656250, due: 'When the installation is finished' },
]);
eq('contract: no deposit, one payment on completion', I.contractInput(facts({ quote: { ...facts().quote, depositPence: null } })).input.schedule, [{ what: 'Full price', pence: 875000, due: 'When the installation is finished' }]);
eq('contract: the schedule adds up to the price', c.input.schedule.reduce((a, s) => a + s.pence, 0), 875000);
eq('complaints procedure: always made, the job owner named', I.complaintsInput(facts()).input.contact, 'Callum Hiscott at Heliaxis');
eq('tech words', [I.techWords(['solar']), I.techWords(['solar', 'battery', 'ev'])], ['solar panels', 'solar panels, a battery and an EV charger']);

/* ── The wording ─────────────────────────────────────────────────────────── */
const solarClauses = T.contractClauses({ warrantyYears: 7, solar: true, validUntil: '18 December 2026' }).map((x) => x.title);
const hpClauses = T.contractClauses({ warrantyYears: 7, solar: false, validUntil: '18 December 2026' }).map((x) => x.title);
eq('Smart Export Guarantee only for solar', [solarClauses.includes('Smart Export Guarantee'), hpClauses.includes('Smart Export Guarantee')], [true, false]);
const all = T.contractClauses({ warrantyYears: 7, solar: true, validUntil: 'x' }).flatMap((x) => x.paras).join(' ');
eq(
  'the contract covers what RECC asks',
  ['14 days', '25%', '60%', 'three weeks', T.TERMS_FACTS.depositInsurer, T.TERMS_FACTS.adr.name, 'large print', 'Building Control', '7 years'].filter((w) => !all.includes(w)),
  []
);
const comp = T.complaintsSteps('Callum').flatMap((x) => x.paras).join(' ');
eq('complaints: RECC timescales and the dispute service', ['2 working days', '5 working days', '24 hours', '10 working days', 'Green Homes Dispute Resolution'].filter((w) => !comp.includes(w)), []);
eq('the generated items are the pack’s G items we make', S.SLOTS.filter((s) => s.kind === 'G').map((s) => s.code), ['HX-PP-01', 'HX-PP-02', 'HX-PP-03', 'HX-PP-04', 'HX-PP-08']);

/* ── States: an uploaded quotation counts; the estimate inside the quotation counts ── */
const views = S.proposalStates({ products: ['solar'], docs: [{ id: 'q', slot: 'HX-PP-02', name: 'Quote', source: 'upload', key: null, visible: true, at: '2026-11-18', version: 1, hash: null }], marks: {}, gen: {}, libraryGaps: [], covered: { 'HX-PP-03': 'In the quotation' } });
const by = Object.fromEntries(views.map((v) => [v.code, v]));
eq('quotation filed: complete', by['HX-PP-02'].state, 'complete');
eq('estimate in the quotation: complete, and says where', [by['HX-PP-03'].state, by['HX-PP-03'].why], ['complete', 'In the quotation']);

/* ── They render ─────────────────────────────────────────────────────────── */
const out = process.env.OUT_DIR;
for (const [name, bytes] of [
  ['HX-PP-01 Covering letter', await D.makeProposalCover(I.coverInput(facts()).input)],
  ['HX-PP-04 Contract of sale', await D.makeContract(c.input)],
  ['HX-PP-08 Complaints procedure', await D.makeComplaints(I.complaintsInput(facts()).input)],
]) {
  eq(`${name} renders a PDF`, String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
  if (out) writeFileSync(`${out}/${name}.pdf`, bytes);
}

console.log(failed ? `${failed} failed` : 'All passed');
process.exit(failed ? 1 : 0);
