// Labour POs (src/lib/site/money.ts) and putting trades on a job (src/lib/site/assign.ts): VAT by
// registration, CIS by verification, line rounding, materials outside CIS, the preview line, agreed
// rates read from an agreement, and the mobile check.
// Usage: node --experimental-strip-types scripts/test-site-money.mjs
import { registerHooks } from 'node:module';

// assign.ts imports its neighbours without ".ts", as the bundler expects.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (/^(?:\.\.?\/|file:)/.test(specifier) && !/\.\w+$/.test(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});
const M = await import('../src/lib/site/money.ts');
const A = await import('../src/lib/site/assign.ts');

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── CIS (D10) ─────────────────────────────────────────────────────────────── */

const verifiedNet = { verifiedOn: '2026-09-01', rate: 'net' };
const verifiedGross = { verifiedOn: '2026-09-01', rate: 'gross' };
const verifiedHigher = { verifiedOn: '2026-09-01', rate: 'higher' };
const notVerified = { verifiedOn: null, rate: null };
const quickBefore = { verifiedOn: null, rate: null };
const quickAfter = { verifiedOn: '2026-10-20', rate: 'net' };
eq('verified net: 20%', M.cisPercent(verifiedNet), 20);
eq('verified gross: 0%', M.cisPercent(verifiedGross), 0);
eq('verified at the higher rate (unmatched): 30%', M.cisPercent(verifiedHigher), 30);
eq('not verified: 30%', M.cisPercent(notVerified), 30);
eq('a quick contact before verification: 30%', M.cisPercent(quickBefore), 30);
eq('a quick contact once verified net: 20%', M.cisPercent(quickAfter), 20);
eq('a date with no rate is not verified', M.cisPercent({ verifiedOn: '2026-09-01', rate: null }), 30);
eq('changed for this job wins', [M.cisPercent({ ...notVerified, override: 'gross' }), M.cisPercent({ ...verifiedGross, override: 'net' })], [0, 20]);
eq('words: verified net', M.cisWords(verifiedNet), 'CIS: verified (net) · 20% deducted');
eq('words: not verified', M.cisWords(notVerified), 'Not verified · 30% deducted');
eq('words: gross', M.cisWords(verifiedGross), 'Gross status · no deduction');
eq('words: changed for the job', M.cisWords({ ...notVerified, override: 'net' }), 'Net rate (changed for this job) · 20% deducted');

/* ── Lines and rounding ────────────────────────────────────────────────────── */

eq('£30.00 × 16', M.lineNet(16, 3000), 48000);
eq('£27.50 × 7.5 hours', M.lineNet(7.5, 2750), 20625);
eq('half-up: 2.5 × £19.99 = 4997.5p → 4998p', M.lineNet(2.5, 1999), 4998);
eq('half-up: 0.5 × 1p → 1p', M.lineNet(0.5, 1), 1);
eq('0.3 × £10 stays exact', M.lineNet(0.3, 1000), 300);
eq('CIS rounds down: 20% of £0.99 = 19.8p → 19p', M.CIS_ROUND((99 * 20) / 100), 19);
eq('CIS rounds down: 30% of £10.01 = 300.3p → 300p', M.labourMoney([{ description: 'x', qty: 1, unit_pence: 1001, cis: true }], 'none', 30).cis, 300);

/* ── The owner's example (test data only) ──────────────────────────────────── */

const roofer = M.labourMoney([{ description: 'Roofing', qty: 16, unit_pence: 3000, cis: true }], 'none', M.cisPercent(verifiedNet));
eq('£30.00 per panel × 16, not VAT registered, verified net: net £480.00', M.formatPence(roofer.net), '£480.00');
eq('CIS −£96.00', M.formatPence(roofer.cis), '£96.00');
eq('payable £384.00', M.formatPence(roofer.payable), '£384.00');
eq('preview line', M.previewWords(roofer, 'none'), '£480.00 · no VAT · CIS −£96.00 · pays £384.00');

/* ── Every VAT treatment × every CIS rate ──────────────────────────────────── */

const lines = [{ description: 'Labour', qty: 2, unit_pence: 22550, cis: true }];
const want = {
  none: { vat: 0 },
  reverse_charge: { vat: 0 },
  zero: { vat: 0 },
  standard: { vat: 9020 },
};
for (const vat of M.VAT_TREATMENTS) {
  for (const [label, pct] of [
    ['gross', 0],
    ['net', 20],
    ['unverified', 30],
  ]) {
    const m = M.labourMoney(lines, vat, pct);
    const cis = Math.floor((45100 * pct) / 100);
    eq(`${vat} × ${label}: net, VAT, CIS, payable`, [m.net, m.vat, m.cis, m.payable], [45100, want[vat].vat, cis, 45100 + want[vat].vat - cis]);
  }
}
eq('gross status gives no deduction', M.labourMoney(lines, 'standard', 0).cis, 0);
eq('reverse charge adds no VAT to what they’re paid', M.labourMoney(lines, 'reverse_charge', 20).payable, 45100 - 9020);
eq('VAT is on the whole net, half-up: 20% of £0.05 = 1p', M.labourMoney([{ description: 'x', qty: 1, unit_pence: 5, cis: true }], 'standard', 0).vat, 1);

const mixed = M.labourMoney(
  [
    { description: 'Labour', qty: 1, unit_pence: 40000, cis: true },
    { description: 'Materials: tiles', qty: 1, unit_pence: 5000, cis: false },
  ],
  'standard',
  20
);
eq('materials are not subject to CIS', [mixed.labourNet, mixed.materialsNet, mixed.cis], [40000, 5000, 8000]);
eq('VAT on labour and materials, CIS on labour only', [mixed.vat, mixed.payable], [9000, 45000 + 9000 - 8000]);

/* ── VAT rules (D9, owner [4]) ─────────────────────────────────────────────── */

eq('not VAT registered: no VAT', A.vatFor(false, null, ''), { ok: true, value: 'none' });
eq('not VAT registered, even with a company default', A.vatFor(false, null, 'reverse_charge'), { ok: true, value: 'none' });
eq('not VAT registered and VAT asked for: refused', A.vatFor(false, 'standard', '').ok, false);
eq('VAT registered, nothing chosen and no default: must choose', A.vatFor(true, null, '').ok, false);
eq('VAT registered: the company default', A.vatFor(true, null, 'reverse_charge'), { ok: true, value: 'reverse_charge' });
eq('VAT registered: the choice beats the default', A.vatFor(true, 'zero', 'reverse_charge'), { ok: true, value: 'zero' });
eq('VAT registered can’t be "no VAT"', A.vatFor(true, 'none', '').ok, false);
eq('VAT words', [M.VAT_WORDS.none, M.VAT_WORDS.reverse_charge, M.VAT_WORDS.standard, M.VAT_WORDS.zero], [
  'Not VAT registered: no VAT',
  'Reverse charge: customer to pay the VAT to HMRC',
  'VAT 20%',
  'Zero-rated',
]);

/* ── Agreed rates from their agreement ─────────────────────────────────────── */

eq('"£30.00 per panel" → 3000 per panel', M.parseAgreedRate('£30.00 per panel'), { pence: 3000, basis: 'per_panel' });
eq('"£27.50 per hour"', M.parseAgreedRate('£27.50 per hour'), { pence: 2750, basis: 'per_hour' });
eq('"£300 per day"', M.parseAgreedRate('£300 per day'), { pence: 30000, basis: 'per_day' });
eq('"£450 fixed"', M.parseAgreedRate('£450 fixed'), { pence: 45000, basis: 'fixed' });
eq('"£30–35 per panel" is left empty', M.parseAgreedRate('£30–35 per panel'), null);
eq('"tbc" is left empty', M.parseAgreedRate('tbc'), null);
eq('"day rate" is left empty', M.parseAgreedRate('day rate'), null);
eq('"To be agreed" is left empty', M.parseAgreedRate('To be agreed'), null);
eq('pounds typed', [M.poundsToPence('30'), M.poundsToPence('£1,250.5'), M.poundsToPence(''), M.poundsToPence('thirty')], [3000, 125050, null, undefined]);

/* ── The money line on the Site tab ────────────────────────────────────────── */

const base = { rate_pence: 3000, rate_basis: 'per_panel', rate_qty: null, vat_treatment: 'none', raise_po: true, cis: verifiedNet };
eq('per panel before the roofer signs: no preview yet', A.moneyLine(base).preview, null);
eq('and says where the count comes from', A.moneyLine(base).qty, 'Panels from the roofer’s sign-off');
eq('per panel once signed: the preview', A.moneyLine({ ...base, panels: 16 }).preview, '£480.00 · no VAT · CIS −£96.00 · pays £384.00');
eq('no rate: says so', A.moneyLine({ ...base, rate_pence: null }).missing, 'Add the agreed rate to issue the PO');
eq('per day with the days agreed', A.moneyLine({ ...base, rate_pence: 25000, rate_basis: 'per_day', rate_qty: 2, cis: notVerified }).preview, '£500.00 · no VAT · CIS −£150.00 · pays £350.00');
eq('no PO for staff', A.moneyLine({ ...base, raise_po: false }).missing, 'No PO: Heliaxis staff');

/* ── Assignments as typed ──────────────────────────────────────────────────── */

eq('a per-day rate needs the days', A.cleanAssignment({ trade: 'scaffolder', rate_pence: 25000, rate_basis: 'per_day' }, false).ok, false);
eq('a rate needs its basis', A.cleanAssignment({ trade: 'roofer', rate_pence: 3000 }, false).ok, false);
eq('no rate at all is fine (the PO is held)', A.cleanAssignment({ trade: 'roofer' }, false).ok, true);
eq('a fixed price drops any quantity', A.cleanAssignment({ trade: 'roofer', rate_pence: 45000, rate_basis: 'fixed', rate_qty: 3 }, false).fields?.rate_qty, null);
eq('"other" needs its name', A.cleanAssignment({ trade: 'other' }, false).ok, false);
eq('a change to the basis is checked against the saved rate', A.cleanAssignment({ rate_basis: 'per_hour' }, true, { rate_pence: 2750, rate_basis: 'per_panel', rate_qty: null }).ok, false);

/* ── Mobiles ───────────────────────────────────────────────────────────────── */

eq('a UK mobile is fine', A.mobileProblem('07700 900123'), null);
eq('+44 mobile is fine', A.mobileProblem('+44 7700 900123'), null);
eq('a landline says so', A.mobileProblem('01633 965205'), 'That looks like a landline. WhatsApp needs a mobile.');
eq('too short', A.mobileProblem('0770'), 'That isn’t a phone number we can use. Check the digits.');
eq('empty is fine (email only)', A.mobileProblem(''), null);
eq('WhatsApp id', A.waIdOf('07700 900123'), '447700900123');

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
