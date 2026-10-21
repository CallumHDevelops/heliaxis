// Heliaxis's own details (src/lib/subcontractors/agreement.ts): the registered address moved to
// 9 Turner Street without breaking agreements and NTP appointments signed with the old one, and the
// new HELIAXIS_COMPANY constant the site paperwork prints.
// Usage: node --experimental-strip-types scripts/test-site-party.mjs
import { registerHooks } from 'node:module';

// hashing.ts is server-only and imports its neighbours without ".ts", as the bundler expects.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true };
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(?:\.\.?\/|file:)/.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const { HELIAXIS_COMPANY, HELIAXIS_PARTY } = await import('../src/lib/subcontractors/agreement.ts');
const { agreementFingerprint, agreementIntact, ntpIntact } = await import('../src/lib/subcontractors/hashing.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/** What Postgres jsonb does to a stored snapshot: object keys sorted by length, then bytewise. */
function jsonb(v) {
  if (Array.isArray(v)) return v.map(jsonb);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v).sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || Buffer.compare(Buffer.from(a), Buffer.from(b)));
    return Object.fromEntries(keys.map((k) => [k, jsonb(v[k])]));
  }
  return v;
}

/* ── The party's keys never change (legacy fingerprints rebuild snapshots in this order) ── */

eq('HELIAXIS_PARTY keeps its keys, in order', Object.keys(HELIAXIS_PARTY), [
  'name',
  'registeredAddress',
  'companyNumber',
  'vatNumber',
  'utr',
  'noticesEmail',
  'accountsEmail',
  'primaryContact',
]);
eq('the registered address is 9 Turner Street', HELIAXIS_PARTY.registeredAddress, '9 Turner Street, Newport, Gwent, NP19 7AZ');

/* ── Agreements signed with the old address still check out ───────────────── */

// The old party, exactly as it was before 21 Oct 2026.
const OLD_PARTY = {
  name: 'Heliaxis Limited',
  registeredAddress: 'Current Electrical, Turner Street, Newport, NP19 7AZ',
  companyNumber: '16734783',
  vatNumber: 'GB507431316',
  utr: '',
  noticesEmail: 'hello@heliaxis.co.uk',
  accountsEmail: 'hello@heliaxis.co.uk',
  primaryContact: 'Callum Hiscott',
};
// A small framework agreement and NTP appointment, as built at signing (values read from the database
// were already in jsonb order). The fingerprints below were taken with the code before the change.
const AGREEMENT = {
  version: 'HLX-SCFA-2026.04',
  ref: 'HLX-SC-2026-007',
  companyName: 'Price Roofing Ltd',
  contactName: 'Dave Price',
  trade: 'Roofer',
  rateOption: 'bespoke',
  bespokeRates: [{ rate: '£30.00 per panel', basis: 'Per panel installed and signed off', trade: 'Roofer' }],
  defaultRates: [{ trade: 'Roofer', rate: '£30.00 per panel', basis: 'Per panel installed and signed off' }],
  details: { cisStatus: 'net', legalName: 'Price Roofing Ltd', vatNumber: '' },
  heliaxis: OLD_PARTY,
  sections: [{ num: '1', title: 'Definitions and Interpretation', blocks: [{ p: 'In this Agreement the following words…' }, { ul: ['a', 'b'] }] }],
  scheduleA: [['Services', 'Roofing']],
};
const NTP = {
  version: 'HLX-NTP-2026.10',
  ref: 'HLX-NTP-2026-002',
  frameworkRef: 'HLX-SC-2026-007',
  companyName: 'Sparks Ltd',
  ntpName: 'Sam Sparks',
  technologies: [{ key: 'solar_pv', label: 'Solar PV', standard: 'MIS 3002' }],
  minDaysPerMonth: 2,
  supervision: { geography: 'South Wales', notes: '' },
  fee: null,
  heliaxis: OLD_PARTY,
  sections: [{ num: '1', title: 'Appointment', blocks: [{ p: 'Heliaxis appoints…' }] }],
};
const STORED = {
  agreementCanonical: '05b54f8b5ab5b79714baa1faa0f3d9eb85b30bcf0f3bf4f4ea5481ffdfbe9cf2',
  agreementLegacy: 'b6aee900fadf4efc36f4c99ba90928b7004c7a61c65f24e3368797595753ee0b',
  ntpCanonical: 'af9266f5d79e07e2d69fd0c5ca65cea1edd1bfeda43dd614d0cbed693be09aea',
  ntpLegacy: '3e1accfb156be01c3f0089a2788d431576f5c85d90c7c0bf7aa6e0332b473bed',
};

eq('an agreement signed with the old address (canonical hash) is intact', agreementIntact(jsonb(AGREEMENT), STORED.agreementCanonical), true);
eq('an agreement signed before canonical hashing, with the old address, is intact', agreementIntact(jsonb(AGREEMENT), STORED.agreementLegacy), true);
eq('an NTP appointment with the old address (canonical hash) is intact', ntpIntact(jsonb(NTP), STORED.ntpCanonical), true);
eq('an NTP appointment from before canonical hashing, with the old address, is intact', ntpIntact(jsonb(NTP), STORED.ntpLegacy), true);
eq('the stored snapshot keeps the address it was signed with', jsonb(AGREEMENT).heliaxis.registeredAddress, 'Current Electrical, Turner Street, Newport, NP19 7AZ');

// An edited snapshot still fails, so the check means something.
const edited = jsonb({ ...AGREEMENT, heliaxis: { ...OLD_PARTY, registeredAddress: '9 Turner Street, Newport, Gwent, NP19 7AZ' } });
eq('swapping the address into an old snapshot breaks its fingerprint', agreementIntact(edited, STORED.agreementCanonical) || agreementIntact(edited, STORED.agreementLegacy), false);

/* ── New signatures carry the new address ─────────────────────────────────── */

const fresh = { ...AGREEMENT, heliaxis: HELIAXIS_PARTY };
const freshHash = agreementFingerprint(fresh);
eq('a new snapshot carries 9 Turner Street', fresh.heliaxis.registeredAddress, '9 Turner Street, Newport, Gwent, NP19 7AZ');
eq('and its fingerprint survives the jsonb round trip', agreementIntact(jsonb(fresh), freshHash), true);
eq('which differs from the old one', freshHash === STORED.agreementCanonical, false);

/* ── HELIAXIS_COMPANY ──────────────────────────────────────────────────────── */

eq('trading name', HELIAXIS_COMPANY.tradingName, 'Heliaxis Ltd');
eq('address lines', HELIAXIS_COMPANY.addressLines, ['9 Turner Street', 'Newport', 'Gwent', 'NP19 7AZ']);
eq('phone and email', [HELIAXIS_COMPANY.phone, HELIAXIS_COMPANY.email], ['01633 965205', 'hello@heliaxis.co.uk']);
eq('MCS number', HELIAXIS_COMPANY.mcsNumber, 'NAP-82308');
eq('company and VAT numbers come from HELIAXIS_PARTY', [HELIAXIS_COMPANY.companyNumber, HELIAXIS_COMPANY.vatNumber], [HELIAXIS_PARTY.companyNumber, HELIAXIS_PARTY.vatNumber]);
eq('the address lines say the same as the registered address', HELIAXIS_COMPANY.addressLines.join(', '), HELIAXIS_PARTY.registeredAddress);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
