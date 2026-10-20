// Purchase orders (src/lib/purchase-orders/money.ts): line totals, VAT per rate with half-up rounding,
// typed amounts and quantities, the lines the API takes, and what can change in each status.
// Usage: node --experimental-strip-types scripts/test-purchase-orders.mjs
import {
  afterSend,
  afterUndeliver,
  actionsFor,
  canDo,
  checkChange,
  cleanLines,
  editable,
  formatPence,
  formatQty,
  isDay,
  isLate,
  isOrdered,
  lineNet,
  marksChanged,
  MAX_LINES,
  parsePounds,
  parseQty,
  penceToInput,
  sendBlocker,
  stillChanged,
  totals,
} from '../src/lib/purchase-orders/money.ts';

let failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

/* ── Lines ──────────────────────────────────────────────────────────────── */

eq('12 × £89.50', lineNet({ qty: 12, unit_cost_pence: 8950, vat_rate: 20 }), 107400);
eq('2.5 m × £19.99 rounds half-up (4997.5p → 4998p)', lineNet({ qty: 2.5, unit_cost_pence: 1999, vat_rate: 20 }), 4998);
eq('0.125 × £0.03 (0.375p → 0p)', lineNet({ qty: 0.125, unit_cost_pence: 3, vat_rate: 20 }), 0);
eq('0.5 × 1p (0.5p → 1p)', lineNet({ qty: 0.5, unit_cost_pence: 1, vat_rate: 20 }), 1);
eq('0.1 × 3 floating point stays exact (0.3 × 1000p = 300p)', lineNet({ qty: 0.3, unit_cost_pence: 1000, vat_rate: 20 }), 300);
eq('1.005 × £100 (100.5 → 10050p)', lineNet({ qty: 1.005, unit_cost_pence: 10000, vat_rate: 20 }), 10050);
eq('not priced yet counts as nothing', lineNet({ qty: 3, unit_cost_pence: null, vat_rate: 20 }), 0);
eq('biggest line is exact', lineNet({ qty: 10000, unit_cost_pence: 10_000_000, vat_rate: 20 }), 100_000_000_000);

/* ── Totals and VAT ─────────────────────────────────────────────────────── */

const twelve = totals(Array.from({ length: 12 }, () => ({ qty: 1, unit_cost_pence: 99, vat_rate: 20 })));
eq('VAT once per rate: 12 × 99p at 20% is £2.38, not 12 × 20p', [twelve.net, twelve.vatTotal, twelve.gross], [1188, 238, 1426]);
const mixed = totals([
  { qty: 12, unit_cost_pence: 8950, vat_rate: 20 },
  { qty: 1, unit_cost_pence: 120000, vat_rate: 5 },
  { qty: 2.5, unit_cost_pence: 1999, vat_rate: 20 },
  { qty: 1, unit_cost_pence: 2500, vat_rate: 0 },
  { qty: 4, unit_cost_pence: null, vat_rate: 20 },
]);
eq('mixed: each line', mixed.lines, [107400, 120000, 4998, 2500, 0]);
eq('mixed: net', mixed.net, 234898);
eq('mixed: VAT grouped by rate, highest first', mixed.vat, [
  { rate: 20, net: 112398, vat: 22480 },
  { rate: 5, net: 120000, vat: 6000 },
  { rate: 0, net: 2500, vat: 0 },
]);
eq('mixed: 20% of 1123.98 = 224.796 → 224.80 (half-up)', mixed.vat[0].vat, 22480);
eq('mixed: gross = net + VAT', mixed.gross, 234898 + 22480 + 6000);
eq('mixed: one line not priced', mixed.unpriced, 1);
eq('half a penny of VAT rounds up (2.5p → 3p)', totals([{ qty: 1, unit_cost_pence: 50, vat_rate: 5 }]).vatTotal, 3);
eq('just under half rounds down (12.4p → 12p)', totals([{ qty: 1, unit_cost_pence: 62, vat_rate: 20 }]).vatTotal, 12);
eq('no lines', totals([]), { lines: [], net: 0, vat: [], vatTotal: 0, gross: 0, unpriced: 0 });

/* ── Typed amounts and quantities ───────────────────────────────────────── */

eq('£1,234.56', parsePounds('£1,234.56'), { ok: true, pence: 123456 });
eq('89.5', parsePounds('89.5'), { ok: true, pence: 8950 });
eq('89', parsePounds(' 89 '), { ok: true, pence: 8900 });
eq('.99', parsePounds('.99'), { ok: true, pence: 99 });
eq('0', parsePounds('0'), { ok: true, pence: 0 });
eq('empty is not priced yet', parsePounds(''), { ok: true, pence: null });
eq('0.125 refused, not rounded', parsePounds('0.125').ok, false);
eq('abc refused', parsePounds('abc').ok, false);
eq('-5 refused', parsePounds('-5').ok, false);
eq('qty 12', parseQty('12'), { ok: true, qty: 12 });
eq('qty 2.5', parseQty('2.5'), { ok: true, qty: 2.5 });
eq('qty 0 refused', parseQty('0').ok, false);
eq('qty 1.2345 refused', parseQty('1.2345').ok, false);
eq('qty 1e3 refused', parseQty('1e3').ok, false);
eq('qty over the cap refused', parseQty('10001').ok, false);
eq('£1,234.56 shown', formatPence(123456), '£1,234.56');
eq('£0.05 shown', formatPence(5), '£0.05');
eq('£1,000,000.00 shown', formatPence(100_000_000), '£1,000,000.00');
eq('input from pence', [penceToInput(8950), penceToInput(5), penceToInput(null)], ['89.50', '0.05', '']);
eq('quantities shown', [formatQty(12), formatQty(2.5), formatQty(0.125)], ['12', '2.5', '0.125']);

/* ── Lines from a request ───────────────────────────────────────────────── */

const ok = cleanLines([
  { description: '  JA Solar   440W panel ', part_number: ' JAM54 ', qty: '12', unit_cost_pence: 8950, vat_rate: 20 },
  { description: '', qty: '', unit_cost_pence: null },
  { description: 'Battery', qty: 1, unit_cost_pence: null, vat_rate: 5 },
]);
eq('tidied, empty line dropped, unpriced kept', ok, {
  ok: true,
  lines: [
    { description: 'JA Solar 440W panel', part_number: 'JAM54', qty: 12, unit_cost_pence: 8950, vat_rate: 20, received_qty: null },
    { description: 'Battery', part_number: null, qty: 1, unit_cost_pence: null, vat_rate: 5, received_qty: null },
  ],
});
eq('needs a description', cleanLines([{ qty: 1, unit_cost_pence: 100 }]), { ok: false, error: 'Line 1: say what it is' });
eq('needs a quantity', cleanLines([{ description: 'x', unit_cost_pence: 100 }]), { ok: false, error: 'Line 1: quantity needed' });
eq('pence must be whole', cleanLines([{ description: 'x', qty: 1, unit_cost_pence: 12.5 }]).ok, false);
eq('unit cost capped', cleanLines([{ description: 'x', qty: 1, unit_cost_pence: 10_000_001 }]).ok, false);
eq('VAT 17.5% refused', cleanLines([{ description: 'x', qty: 1, unit_cost_pence: 1, vat_rate: 17.5 }]), { ok: false, error: 'Line 1: VAT is 20%, 5% or 0%' });
eq('too many lines', cleanLines(Array.from({ length: MAX_LINES + 1 }, () => ({ description: 'x', qty: 1 }))).ok, false);
eq('not a list', cleanLines('nope').ok, false);
eq('second line named', cleanLines([{ description: 'a', qty: 1 }, { description: 'b', qty: 'x' }]).ok === false && cleanLines([{ description: 'a', qty: 1 }, { description: 'b', qty: 'x' }]).error.startsWith('Line 2:'), true);

/* ── Statuses ───────────────────────────────────────────────────────────── */

eq('draft: everything but the invoice', editable('draft'), { supplier: true, order: true, invoice: false, internal: true, received: false });
eq('sent: order and invoice, not the supplier', editable('sent'), { supplier: false, order: true, invoice: true, internal: true, received: false });
eq('confirmed: same as sent', editable('confirmed'), editable('sent'));
eq('delivered: invoice and quantities received only', editable('delivered'), { supplier: false, order: false, invoice: true, internal: true, received: true });
eq('cancelled: our note only', editable('cancelled'), { supplier: false, order: false, invoice: false, internal: true, received: false });
eq('draft: change anything on paper', checkChange('draft', ['supplier_id', 'lines', 'required_by', 'internal_note']), null);
eq('sent: no new supplier', checkChange('sent', ['supplier_id'])?.startsWith('The supplier can’t change'), true);
eq('sent: lines can change', checkChange('sent', ['lines', 'notes']), null);
eq('delivered: lines locked', checkChange('delivered', ['lines']), 'A delivered order can’t be changed.');
eq('delivered: invoice can be added', checkChange('delivered', ['supplier_invoice_ref', 'supplier_invoice_pence', 'paid_on', 'received']), null);
eq('draft: no invoice yet', checkChange('draft', ['supplier_invoice_ref']), 'Add their invoice once the order has gone to them.');
eq('cancelled: only our note', [checkChange('cancelled', ['internal_note']), checkChange('cancelled', ['notes'])], [null, 'A cancelled order can’t be changed.']);
eq('editing a sent order marks it changed', marksChanged('sent', ['lines']), true);
eq('editing a confirmed order marks it changed', marksChanged('confirmed', ['required_by']), true);
eq('our own note doesn’t', marksChanged('sent', ['internal_note', 'supplier_invoice_ref']), false);
eq('a draft is never "changed since sent"', marksChanged('draft', ['lines']), false);
eq('changed since sent: still to send again while open', [stillChanged('sent', true), stillChanged('confirmed', true), stillChanged('sent', false)], [true, true, false]);
eq('changed since sent: not once delivered or cancelled', [stillChanged('delivered', true), stillChanged('cancelled', true), stillChanged('draft', true)], [false, false, false]);
eq('draft actions', actionsFor('draft'), ['send', 'mark_sent', 'delete']);
eq('sent actions', actionsFor('sent'), ['send', 'mark_sent', 'confirm', 'deliver', 'cancel']);
eq('only drafts can be deleted', ['draft', 'sent', 'confirmed', 'delivered', 'cancelled'].map((s) => canDo(s, 'delete')), [true, false, false, false, false]);
eq('drafts are deleted, not cancelled', canDo('draft', 'cancel'), false);
eq('a delivered order can’t be cancelled', canDo('delivered', 'cancel'), false);
eq('nothing happens to a cancelled order', actionsFor('cancelled'), []);
eq('sending a draft', afterSend('draft', false), 'sent');
eq('sending again, unchanged, keeps Confirmed', afterSend('confirmed', false), 'confirmed');
eq('sending a changed confirmed order: confirm again', afterSend('confirmed', true), 'sent');
eq('undo delivered', [afterUndeliver('2026-10-20T10:00:00Z'), afterUndeliver(null)], ['confirmed', 'sent']);
eq('ordered: sent, confirmed or delivered', ['draft', 'sent', 'confirmed', 'delivered', 'cancelled'].map(isOrdered), [false, true, true, true, false]);
eq('send: needs lines', sendBlocker({ status: 'draft', lines: [] }), 'Add what you’re ordering first.');
eq('send: every line priced', sendBlocker({ status: 'draft', lines: [{ qty: 1, unit_cost_pence: null, vat_rate: 20 }] })?.startsWith('One line has no unit cost'), true);
eq('send: free is fine', sendBlocker({ status: 'sent', lines: [{ qty: 1, unit_cost_pence: 0, vat_rate: 20 }] }), null);
eq('send: not once delivered', sendBlocker({ status: 'delivered', lines: [{ qty: 1, unit_cost_pence: 1, vat_rate: 20 }] }), 'A delivered order can’t be sent.');

/* ── Dates ──────────────────────────────────────────────────────────────── */

eq('days', [isDay('2026-11-03'), isDay('2026-02-30'), isDay('3/11/2026'), isDay('1999-01-01')], [true, false, false, false]);
eq('late: open and past its date', isLate({ status: 'sent', required_by: '2026-10-19' }, '2026-10-20'), true);
eq('not late: due today', isLate({ status: 'confirmed', required_by: '2026-10-20' }, '2026-10-20'), false);
eq('not late: delivered', isLate({ status: 'delivered', required_by: '2026-10-01' }, '2026-10-20'), false);
eq('not late: a draft', isLate({ status: 'draft', required_by: '2026-10-01' }, '2026-10-20'), false);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
