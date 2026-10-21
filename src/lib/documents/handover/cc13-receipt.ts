import 'server-only';
import { longDay, type ReceiptInput } from '@/lib/handover/inputs';
import { begin, pounds } from './common';

/**
 * CC13's payment receipt (SPEC 4.9, D21): only the payments recorded against the job (the Stripe
 * deposit, and what the office typed from the invoice), each as recorded. No balance and no total
 * owed: the app has no invoice lines to work one out from, so the invoice itself says that.
 */
export const RECEIPT_TITLE = 'Payment receipt';

export async function makeReceipt(r: ReceiptInput): Promise<Uint8Array> {
  const kit = await begin('CC13', RECEIPT_TITLE, r, { label: 'CC13' });
  kit.section('Payments received', { intro: 'Thank you. These are the payments we’ve received for this installation.' });
  kit.grid({ columns: ['Date', 'Payment', 'How', 'Reference', 'Amount'], rows: r.lines.map((l) => [longDay(l.date), l.what, l.method, l.reference ?? '–', pounds(l.pence)]), widths: [1.4, 1.4, 1.2, 1.6, 1] });
  kit.note('Your invoice, in this pack, shows what the installation cost.');
  return kit.save();
}
