import { createAdminClient } from '@/lib/supabase/admin';
import { ukDay } from '@/lib/bank-holidays';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import { msConfigured, sendMail } from '@/lib/ms365';
import { afterSend, sendBlocker } from '@/lib/purchase-orders/money';
import { pdfName, purchaseOrderPdf } from '@/lib/purchase-orders/pdf';
import { logOrder, NOT_READY, orderWords, ordersReady, pdfInputFor, readOrder } from '@/lib/purchase-orders/server';
import { dayWords, defaultPoMessage, isEmail } from '@/lib/purchase-orders/shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NOT_CONNECTED =
  'Microsoft 365 isn’t set up yet, so the app can’t email suppliers. Download the PDF, email it to them yourself, then tap Mark as sent.';

/**
 * Email the order to the supplier as a PDF, from the shared mailbox, with replies going to whoever
 * sent it. `to`: another address than the supplier's (optional); `message`: the email's text (the
 * sheet shows the default to edit). Works again after a change: the PDF says which one it replaces.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  if (!msConfigured()) return json({ error: NOT_CONNECTED, notConnected: true }, 400);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const full = await readOrder(db, id);
  if (!full) return json({ error: 'That order isn’t there any more.' }, 404);
  const o = full.order;
  if (b.expect_updated_at && Date.parse(String(b.expect_updated_at)) !== Date.parse(o.updated_at)) {
    return json({ error: 'Someone else changed this order a moment ago. Close it and open it again before sending.', stale: true }, 409);
  }
  const block = sendBlocker({ status: o.status, lines: full.lines });
  if (block) return json({ error: block }, 400);
  const to = String(b.to ?? '').trim() || full.supplier?.email || '';
  if (!isEmail(to)) {
    return json({ error: to ? `“${to}” isn’t an email address.` : `There’s no email address for ${full.supplier?.name ?? 'this supplier'}. Add one in Suppliers, or type it here.` }, 400);
  }

  const sender = s.profile.full_name || null;
  const replyTo = [s.profile.email, s.user.email].find((e) => isEmail(e)) ?? undefined;
  const input = pdfInputFor(full, sender);
  const again = !!o.sent_at;
  const text =
    String(b.message ?? '').trim().slice(0, 4000) ||
    defaultPoMessage({ ...o, jobRef: input.jobRef, contact: full.supplier?.contact_name ?? null, sender, replaces: input.replaces });
  const subject = `Purchase order ${o.po_number} from Heliaxis${input.jobRef ? ` (our job ${input.jobRef})` : ''}${input.replaces ? ': revised' : ''}`;

  try {
    const bytes = await purchaseOrderPdf(input);
    await sendMail({ to, subject, text, replyTo, attachments: [{ name: pdfName(o), contentType: 'application/pdf', bytes }] });
  } catch (e) {
    return json({ error: `The email didn’t go: ${e instanceof Error ? e.message : 'Microsoft 365 said no'}. Nothing has changed: try again, or download the PDF instead.` }, 502);
  }

  // It's gone, so it's recorded even if someone saved a change meanwhile.
  const now = new Date().toISOString();
  const status = afterSend(o.status, o.changed_since_sent);
  const { error } = await db
    .from('purchase_orders')
    .update({ status, sent_at: now, sent_to: to, sent_by: s.user.id, changed_since_sent: false, updated_at: now, ...(status === 'sent' ? { confirmed_at: null } : {}) })
    .eq('id', id);
  const supplier = full.supplier?.name ?? 'the supplier';
  await logOrder(
    db,
    o,
    'sent',
    `Purchase order ${orderWords(o, supplier)} emailed to ${to}${again ? (input.replaces ? `, replacing the one sent on ${dayWords(ukDay(o.sent_at!))}` : ' again') : ''}`,
    s.user.id
  );
  if (error) return json({ error: `The email went to ${to}, but the order couldn’t be marked as sent: ${error.message}. Tap Mark as sent.` }, 500);
  return json(await readOrder(db, id));
}
