import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json } from '@/lib/crm/server';
import {
  afterSend,
  afterUndeliver,
  canDo,
  checkChange,
  cleanLines,
  formatQty,
  isDay,
  marksChanged,
  MAX_INVOICE_PENCE,
  MAX_QTY,
  sendBlocker,
  STATUS_LABEL,
  type CleanLine,
  type PoAction,
  type PoStatus,
} from '@/lib/purchase-orders/money';
import { deliveryFor, logOrder, NOT_READY, orderWords, ordersReady, readOrder, sameLines, saveLines } from '@/lib/purchase-orders/server';
import { labourWho } from '@/lib/purchase-orders/shared';
import { issueLabourPo } from '@/lib/site/labour-po';
import { HELD_WORDS } from '@/lib/site/po-shared';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const NOTE_MAX = 2000;
const note = (v: unknown) => String(v ?? '').trim().slice(0, NOTE_MAX) || null;
const STALE = 'Someone else changed this order a moment ago. Close it and open it again to see their changes.';
const VERB: Record<string, string> = { mark_sent: 'marked as sent', confirm: 'confirmed', deliver: 'marked as delivered', undeliver: 'changed back', cancel: 'cancelled', issue: 'issued' };
const statusWord = (s: string) => STATUS_LABEL[s as PoStatus]?.toLowerCase() ?? s;

/** One order with its lines, supplier, job and the office address (for the sheet). */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const full = await readOrder(createAdminClient(), id);
  return full ? json(full) : json({ error: 'That order isn’t there any more.' }, 404);
}

/**
 * Change an order, or move it on. `action`: mark_sent (sent outside the app; `sent_to` says how),
 * confirm, deliver (with `received`: {lineId: qty} if not everything came), undeliver, cancel. Else
 * any of: supplier_id, deliver_to + deliver_address + deliver_postcode, required_by, notes,
 * internal_note, lines (the whole list), supplier_invoice_ref, supplier_invoice_pence, paid_on,
 * received. What can change depends on the status (money.ts); changing what's on the PO after it
 * went marks it "changed since sent". `expect_updated_at`: refuse if someone else saved meanwhile.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const b = await req.json().catch(() => ({}));
  const db = createAdminClient();
  const cur = await readOrder(db, id);
  if (!cur) return json({ error: 'That order isn’t there any more.' }, 404);
  const o = cur.order;
  if (b.expect_updated_at && Date.parse(String(b.expect_updated_at)) !== Date.parse(o.updated_at)) return json({ error: STALE, stale: true }, 409);
  const now = new Date().toISOString();
  const labour = o.kind === 'labour';
  const supplier = labour ? labourWho(o) : (cur.supplier?.name ?? 'the supplier');

  // Quantities received, by line: { lineId: qty } (blank clears one).
  let received: Map<string, number | null> | null = null;
  if (b.received && typeof b.received === 'object') {
    received = new Map();
    const ids = new Set(cur.lines.map((l) => l.id));
    for (const [lineId, v] of Object.entries(b.received as Record<string, unknown>)) {
      if (!ids.has(lineId)) continue;
      if (v === null || v === '') received.set(lineId, null);
      else {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > MAX_QTY) return json({ error: 'A quantity received isn’t a number we can use.' }, 400);
        received.set(lineId, Math.round(n * 1000) / 1000);
      }
    }
  }
  const saveReceived = async () => {
    for (const [lineId, qty] of received ?? []) {
      const { error } = await db.from('purchase_order_lines').update({ received_qty: qty }).eq('id', lineId).eq('purchase_order_id', id);
      if (error) return error.message;
    }
    return null;
  };

  /* ── Moving it on ─────────────────────────────────────────────────────────── */
  if (b.action) {
    const action = String(b.action) as PoAction;
    if (!(action in VERB)) return json({ error: 'Unknown action' }, 400);
    if (!canDo(o.status, action, o.kind)) return json({ error: `This ${labour ? 'PO' : 'order'} is ${statusWord(o.status)}, so it can’t be ${VERB[action]}.` }, 409);
    // A labour PO is issued (or issued again) as the trade's sign-off says: frozen, PDF, email and WhatsApp.
    if (action === 'issue') {
      const r = await issueLabourPo(db, id, { by: s.user.id, override: true, origin: new URL(req.url).origin });
      if (!r.ok) return json({ error: r.held?.length ? r.held.map((h) => HELD_WORDS[h]).join('. ') : r.error }, 409);
      return json(await readOrder(db, id));
    }
    let u: Record<string, unknown> = {};
    let log: { event: 'sent' | 'confirmed' | 'delivered' | 'undelivered' | 'cancelled'; body: string } | null = null;
    switch (action) {
      case 'mark_sent': {
        const block = sendBlocker({ status: o.status, lines: cur.lines });
        if (block) return json({ error: block }, 400);
        const status = afterSend(o.status, o.changed_since_sent);
        const how = String(b.sent_to ?? '').trim().slice(0, 200) || 'Marked as sent';
        u = { status, sent_at: now, sent_to: how, sent_by: s.user.id, changed_since_sent: false, ...(status === 'sent' ? { confirmed_at: null } : {}) };
        log = { event: 'sent', body: `Purchase order ${orderWords(o, supplier)} marked as sent${o.sent_at ? ' again' : ''}${how !== 'Marked as sent' ? ` (${how})` : ''}` };
        break;
      }
      case 'confirm':
        u = { status: 'confirmed', confirmed_at: now };
        log = { event: 'confirmed', body: `${supplier} confirmed purchase order ${o.po_number}` };
        break;
      case 'deliver': {
        const day = isDay(b.delivered_on) ? `${b.delivered_on}T12:00:00.000Z` : now;
        u = { status: 'delivered', delivered_at: day };
        const got = new Map(cur.lines.map((l) => [l.id, received?.has(l.id!) ? received.get(l.id!) : l.received_qty]));
        const short = cur.lines.filter((l) => got.get(l.id) != null && Number(got.get(l.id)) < l.qty);
        const shortWords = short.length
          ? ` · short: ${short
              .slice(0, 3)
              .map((l) => `${formatQty(Number(got.get(l.id)))} of ${formatQty(l.qty)} ${l.description}`)
              .join('; ')}${short.length > 3 ? ` and ${short.length - 3} more` : ''}`
          : '';
        log = { event: 'delivered', body: `Purchase order ${o.po_number} from ${supplier} delivered${shortWords}` };
        break;
      }
      case 'undeliver':
        u = { status: afterUndeliver(o.confirmed_at), delivered_at: null };
        log = { event: 'undelivered', body: `Purchase order ${o.po_number} no longer marked as delivered` };
        break;
      case 'cancel': {
        const why = String(b.reason ?? '').trim().slice(0, 300);
        u = { status: 'cancelled', cancelled_at: now };
        log = { event: 'cancelled', body: `Purchase order ${orderWords(o, supplier)} cancelled${why ? `: ${why}` : ''}` };
        break;
      }
    }
    const { data: moved, error } = await db
      .from('purchase_orders')
      .update({ ...u, updated_at: now })
      .eq('id', id)
      .eq('updated_at', o.updated_at)
      .select('id');
    if (error) return json({ error: error.message }, 500);
    if (!moved?.length) return json({ error: STALE, stale: true }, 409);
    // A cancelled labour PO's messages still waiting (the evening rule) don't go.
    if (action === 'cancel' && labour) await db.from('site_messages').update({ status: 'cancelled' }).like('dedupe_key', `po:${id}:%`).eq('status', 'queued');
    if (action === 'deliver') {
      const failed = await saveReceived();
      if (failed) return json({ error: `Marked as delivered, but the quantities received weren’t saved: ${failed}` }, 500);
    }
    if (log) await logOrder(db, o, log.event, log.body, s.user.id);
    return json(await readOrder(db, id));
  }

  /* ── Changes ──────────────────────────────────────────────────────────────── */
  const u: Record<string, unknown> = {};
  const changed: string[] = [];
  const set = (k: string, v: unknown, was: unknown) => {
    if ((v ?? null) === (was ?? null)) return;
    u[k] = v;
    changed.push(k);
  };
  if ('supplier_id' in b && b.supplier_id !== o.supplier_id) {
    if (!isUuid(String(b.supplier_id ?? ''))) return json({ error: 'Choose a supplier.' }, 400);
    const { data: sup } = await db.from('suppliers').select('id, name, archived_at').eq('id', b.supplier_id).maybeSingle();
    if (!sup) return json({ error: 'That supplier isn’t there any more.' }, 404);
    if (sup.archived_at) return json({ error: `${sup.name} is archived. Bring them back from Suppliers first, or choose another.` }, 400);
    set('supplier_id', sup.id, o.supplier_id);
  }
  if ('deliver_to' in b || 'deliver_address' in b || 'deliver_postcode' in b) {
    const where = await deliveryFor(b.deliver_to ?? o.deliver_to, {
      deliver_address: 'deliver_address' in b ? b.deliver_address : o.deliver_address,
      deliver_postcode: 'deliver_postcode' in b ? b.deliver_postcode : o.deliver_postcode,
    });
    if (!where.ok) return json({ error: where.error }, 400);
    set('deliver_to', where.deliver_to, o.deliver_to);
    set('deliver_address', where.deliver_address, o.deliver_address);
    set('deliver_postcode', where.deliver_postcode, o.deliver_postcode);
  }
  if ('required_by' in b) {
    if (b.required_by && !isDay(b.required_by)) return json({ error: 'The required-by date isn’t a real date.' }, 400);
    set('required_by', b.required_by || null, o.required_by);
  }
  if ('notes' in b) set('notes', note(b.notes), o.notes);
  if ('internal_note' in b) set('internal_note', note(b.internal_note), o.internal_note);
  let lines: CleanLine[] | null = null;
  if ('lines' in b) {
    const clean = cleanLines(b.lines);
    if (!clean.ok) return json({ error: clean.error }, 400);
    if (!sameLines(clean.lines, cur.lines)) {
      // Keep what's been recorded as received on lines that are still there.
      lines = clean.lines.map((l, i) => ({ ...l, received_qty: l.received_qty ?? cur.lines[i]?.received_qty ?? null }));
      changed.push('lines');
    }
  }
  if ('supplier_invoice_ref' in b) set('supplier_invoice_ref', String(b.supplier_invoice_ref ?? '').trim().slice(0, 60) || null, o.supplier_invoice_ref);
  if ('supplier_invoice_pence' in b) {
    const v = b.supplier_invoice_pence;
    const n = v === null || v === '' ? null : Number(v);
    if (n !== null && !(Number.isInteger(n) && n >= 0 && n <= MAX_INVOICE_PENCE)) return json({ error: 'Their invoice total isn’t an amount we can use.' }, 400);
    set('supplier_invoice_pence', n, o.supplier_invoice_pence);
  }
  if ('paid_on' in b) {
    if (b.paid_on && !isDay(b.paid_on)) return json({ error: 'The paid date isn’t a real date.' }, 400);
    set('paid_on', b.paid_on || null, o.paid_on);
  }
  if (received?.size && cur.lines.some((l) => received!.has(l.id!) && received!.get(l.id!) !== l.received_qty)) changed.push('received');

  if (!changed.length) return json(cur);
  const block = checkChange(o.status, changed, o.kind);
  if (block) return json({ error: block }, 409);
  if (!labour && marksChanged(o.status, changed)) u.changed_since_sent = true;

  // The order first, only if nobody else saved meanwhile; then its lines.
  const { data: saved, error } = await db
    .from('purchase_orders')
    .update({ ...u, updated_at: now })
    .eq('id', id)
    .eq('updated_at', o.updated_at)
    .select('id');
  if (error) return json({ error: error.message }, 500);
  if (!saved?.length) return json({ error: STALE, stale: true }, 409);
  if (lines) {
    const failed = await saveLines(db, id, lines);
    if (failed) return json({ error: failed }, 500);
  }
  if (changed.includes('received')) {
    const failed = await saveReceived();
    if (failed) return json({ error: failed }, 500);
  }
  return json(await readOrder(db, id));
}

/** Drafts only: an order that's gone to the supplier is cancelled instead, so there's a record. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (!(await ordersReady())) return json({ error: NOT_READY }, 409);
  const { id } = await params;
  if (!isUuid(id)) return json({ error: 'Not found' }, 404);
  const db = createAdminClient();
  const { data: o } = await db.from('purchase_orders').select('*').eq('id', id).maybeSingle();
  if (!o) return json({ ok: true });
  const labour = o.kind === 'labour';
  if (!canDo(o.status, 'delete', labour ? 'labour' : 'supply') || (labour && Number(o.labour?.version) > 0)) {
    return json({ error: labour ? 'This PO has been issued: cancel it instead, so there’s a record.' : `Only drafts can be deleted. This one has gone to the supplier: cancel it instead.` }, 409);
  }
  const { error } = await db.from('purchase_orders').delete().eq('id', id).eq('status', 'draft');
  if (error) return json({ error: error.message }, 500);
  await logOrder(db, o, 'deleted', `${labour ? 'Held labour PO' : 'Draft purchase order'} ${o.po_number} deleted`, s.user.id);
  return json({ ok: true });
}
