// A customer's corrected postcode and their jobs' site postcodes (src/lib/crm/site-postcode.ts): which
// jobs follow it (a copy of the old one, or none) and which keep their own, when Customer → Edit says
// "change it in Job details", and what counts as a UK postcode for the record page's "Check postcode".
// Usage: node --experimental-strip-types scripts/test-postcode-follows.mjs
import { readFileSync } from 'node:fs';
import { followsCustomerPostcode, postcodeKey, siteHasOtherPostcode, ukPostcode } from '../src/lib/crm/site-postcode.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const job = (postcode, address = null) => ({ postcode, address });

/* ── Comparing ────────────────────────────────────────────────────────────── */

eq('spaces and case aside', postcodeKey(' cf39  8yy '), 'CF398YY');
eq('a lead form’s 88888 stays itself', postcodeKey('88888'), '88888');
eq('nothing is empty', [postcodeKey(null), postcodeKey(undefined), postcodeKey('  ')], ['', '', '']);

/* ── Which jobs follow ────────────────────────────────────────────────────── */

// The owner's report: the lead form said 88888, copied onto the job when it was made.
eq('88888 copied from the lead form follows', followsCustomerPostcode(job('88888'), '88888', 'CF39 8YY'), true);
eq('the same postcode written differently follows', followsCustomerPostcode(job('cf39 8xx'), 'CF39 8XX', 'CF39 8YY'), true);
eq('no space on the job, a space on the customer', followsCustomerPostcode(job('CF398XX'), 'cf39 8xx', 'CF39 8YY'), true);
eq('no postcode on the job follows', followsCustomerPostcode(job(null), '88888', 'CF39 8YY'), true);
eq('a blank postcode on the job follows', followsCustomerPostcode(job('  '), '88888', 'CF39 8YY'), true);
eq('no postcode anywhere before follows', followsCustomerPostcode(job(''), null, 'CF39 8YY'), true);
eq('a street with no postcode in it follows', followsCustomerPostcode(job('88888', '12 High Street, Porth'), '88888', 'CF39 8YY'), true);
eq('an address naming the new postcode follows', followsCustomerPostcode(job('88888', '12 High Street, Porth CF39 8YY'), '88888', 'cf39 8yy'), true);

eq('a job with its own postcode stays', followsCustomerPostcode(job('NP20 4AB'), '88888', 'CF39 8YY'), false);
eq('its own postcode stays even with no customer postcode before', followsCustomerPostcode(job('NP20 4AB'), null, 'CF39 8YY'), false);
eq('an address naming another postcode stays', followsCustomerPostcode(job('88888', '4 Mill Lane, Newport NP20 4AB'), '88888', 'CF39 8YY'), false);
eq('…with no postcode on the job too', followsCustomerPostcode(job(null, 'Unit 2, Mill Lane, np204ab'), '88888', 'CF39 8YY'), false);
eq('an address still naming the old postcode stays (someone fixes it in Job details)', followsCustomerPostcode(job('CF39 8XX', '12 High Street, CF39 8XX'), 'CF39 8XX', 'CF39 8YY'), false);
eq('a job already at the new postcode stays as it is', followsCustomerPostcode(job('CF39 8YY'), '88888', 'CF39 8YY'), false);

eq('the same postcode again moves nothing', followsCustomerPostcode(job('CF39 8YY'), 'CF39 8YY', 'CF39 8YY'), false);
eq('only the case or spaces changing moves nothing', followsCustomerPostcode(job('cf398yy'), 'cf398yy', 'CF39 8YY'), false);
eq('a cleared postcode moves nothing', [followsCustomerPostcode(job('88888'), '88888', ''), followsCustomerPostcode(job('88888'), '88888', null)], [false, false]);
eq('a new postcode that isn’t UK-shaped still follows (the card says Check postcode)', followsCustomerPostcode(job('88888'), '88888', 'CF39 8Y'), true);

/* ── A site of its own (Customer → Edit: "change it in Job details") ───────── */

// The owner's report as it stands: the customer is already CF39 8YY, the job still has 88888.
eq('88888 on the job, CF39 8YY typed: the job has its own', siteHasOtherPostcode(job('88888'), 'CF39 8YY'), true);
eq('another property’s postcode', siteHasOtherPostcode(job('NP20 4AB'), 'CF39 8YY'), true);
eq('another postcode written in the address', siteHasOtherPostcode(job(null, '4 Mill Lane, Newport NP20 4AB'), 'CF39 8YY'), true);
eq('the same postcode, spaces and case aside', siteHasOtherPostcode(job('cf398yy', '12 High Street, CF39 8YY'), 'CF39 8YY'), false);
eq('no postcode on the job (the site is the customer’s)', siteHasOtherPostcode(job(null, '12 High Street, Porth'), 'CF39 8YY'), false);

/* ── UK-shaped ────────────────────────────────────────────────────────────── */

eq('UK postcodes', ['CF39 8YY', 'cf398yy', 'NP20 4AB', 'SW1A 1AA', 'M1 1AE', 'B33 8TH', 'W1A 0AX'].map(ukPostcode), [true, true, true, true, true, true, true]);
eq('not UK postcodes', ['88888', 'CF39 8Y', 'CF39', '', null, '12345-678', 'CF39 8YYY'].map(ukPostcode), [false, false, false, false, false, false, false]);

/* ── The route and the card use the same rule ─────────────────────────────── */

const route = readFileSync(new URL('../src/app/api/crm/customers/[id]/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/app/admin/crm/[id]/CustomerColumn.tsx', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../src/app/admin/crm/[id]/record-shared.ts', import.meta.url), 'utf8');
eq('the customers route moves jobs by followsCustomerPostcode', /followsCustomerPostcode\(/.test(route), true);
eq('the route reads the old postcode before saving', /select\('phone, postcode'\)/.test(route), true);
eq('Customer → Edit says what happens with the same rule', /followsCustomerPostcode\(/.test(card) && /siteHasOtherPostcode\(/.test(card), true);
eq('the site and its Check postcode use the same postcode', /export const sitePostcodeOf/.test(shared) && /sitePostcodeOf\(p, c\)/.test(shared), true);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
