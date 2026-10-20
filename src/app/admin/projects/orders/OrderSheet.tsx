'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  canDo,
  editable,
  formatPence,
  formatQty,
  lineNet,
  MAX_LINES,
  parsePounds,
  parseQty,
  penceToInput,
  sendBlocker,
  STATUS_LABEL,
  totals,
  VAT_RATES,
  type MoneyLine,
  type PoStatus,
} from '@/lib/purchase-orders/money';
import { addressLine, DELIVER_LABEL, defaultPoMessage, type DeliverTo, type PoFull, type PoSuggestion, type Supplier } from '@/lib/purchase-orders/shared';
import { Sheet } from '../../crm/CrmUi';
import { shortDate, ukDayOf } from '../../crm/crm-shared';
import { api, neededWords, StatusChip } from './OrdersUi';
import { SupplierForm } from './SupplierForm';
import './orders.css';

/* ── The form's own copy of an order ─────────────────────────────────────────── */

type LineDraft = { key: string; description: string; part_number: string; qty: string; unit: string; vat_rate: number };
type Draft = {
  supplier_id: string;
  deliver_to: DeliverTo;
  deliver_address: string;
  deliver_postcode: string;
  required_by: string;
  notes: string;
  internal_note: string;
  lines: LineDraft[];
};

let keys = 0;
const nextKey = () => `l${++keys}`;
const blankLine = (): LineDraft => ({ key: nextKey(), description: '', part_number: '', qty: '', unit: '', vat_rate: 20 });
const isBlank = (l: LineDraft) => !l.description.trim() && !l.qty.trim() && !l.unit.trim() && !l.part_number.trim();

function draftOf(full: PoFull): Draft {
  const o = full.order;
  return {
    supplier_id: o.supplier_id,
    deliver_to: o.deliver_to,
    deliver_address: o.deliver_address ?? '',
    deliver_postcode: o.deliver_postcode ?? '',
    required_by: o.required_by ?? '',
    notes: o.notes ?? '',
    internal_note: o.internal_note ?? '',
    lines: full.lines.length
      ? full.lines.map((l) => ({ key: nextKey(), description: l.description, part_number: l.part_number ?? '', qty: formatQty(l.qty), unit: penceToInput(l.unit_cost_pence), vat_rate: l.vat_rate }))
      : [blankLine()],
  };
}

function draftFromSuggestion(s: PoSuggestion): Draft {
  return {
    supplier_id: '',
    deliver_to: 'site',
    deliver_address: s.site.address ?? '',
    deliver_postcode: s.site.postcode ?? '',
    required_by: '',
    notes: '',
    internal_note: '',
    lines: s.lines.length
      ? s.lines.map((l) => ({ key: nextKey(), description: l.description, part_number: l.part_number ?? '', qty: l.qty == null ? '' : formatQty(l.qty), unit: '', vat_rate: l.vat_rate }))
      : [blankLine()],
  };
}

/** What's wrong with a line, field by field (nothing for an empty line: it's left out). */
function lineProblems(l: LineDraft): { description?: string; qty?: string; unit?: string } {
  if (isBlank(l)) return {};
  const q = parseQty(l.qty);
  const u = parsePounds(l.unit);
  return {
    ...(l.description.trim() ? {} : { description: 'Say what it is' }),
    ...(q.ok ? {} : { qty: q.error }),
    ...(u.ok ? {} : { unit: u.error }),
  };
}

/** The lines as money, for the live totals (a quantity or price that doesn't read yet counts as nothing). */
const moneyOf = (lines: LineDraft[]): MoneyLine[] =>
  lines
    .filter((l) => !isBlank(l))
    .map((l) => {
      const q = parseQty(l.qty);
      const u = parsePounds(l.unit);
      return { qty: q.ok ? q.qty : 0, unit_cost_pence: u.ok ? u.pence : null, vat_rate: l.vat_rate };
    });

type Mode = 'view' | 'edit' | 'send' | 'deliver' | 'cancel';

/**
 * One purchase order in a sheet: a new one on a job (supplier, delivery, date, lines with live
 * totals, notes; Save draft or Save and email), or an existing one to read and move on (Download PDF,
 * Email to supplier, Mark confirmed, Mark delivered with what arrived, Cancel, their invoice). What
 * can be changed follows its status (money.ts). Used by the job's Orders tab and the Purchase orders
 * page; `onChanged` gets the order after every save (null once a draft is deleted).
 */
export function OrderSheet({
  orderId,
  newFor,
  today,
  myName,
  showJob = false,
  onClose,
  onChanged,
}: {
  orderId?: string | null;
  newFor?: { projectId: string } | null;
  today: string;
  /** Signs off the email to the supplier. */
  myName?: string | null;
  /** On the Purchase orders page: say which job, with a link. */
  showJob?: boolean;
  onClose: () => void;
  onChanged: (full: PoFull | null) => void;
}) {
  const [full, setFull] = useState<PoFull | null>(null);
  const [suggestion, setSuggestion] = useState<PoSuggestion | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [mode, setMode] = useState<Mode>(newFor ? 'edit' : 'view');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [thenSend, setThenSend] = useState(false);

  // An existing order, or what a new one on this job starts with (and the suppliers to pick from).
  const newProject = newFor?.projectId ?? null;
  useEffect(() => {
    let live = true;
    const fail = (e: unknown) => {
      if (live) setLoadErr(e instanceof Error ? e.message : 'Couldn’t load this order. Try again.');
    };
    if (orderId) {
      api<PoFull>(`/api/crm/purchase-orders/${orderId}`)
        .then((d) => {
          if (live) setFull(d);
        })
        .catch(fail);
    } else if (newProject) {
      Promise.all([api<PoSuggestion>(`/api/crm/purchase-orders/suggest?project=${newProject}`), api<{ suppliers: Supplier[] }>('/api/crm/suppliers')])
        .then(([s, sup]) => {
          if (!live) return;
          setSuggestion(s);
          setSuppliers(sup.suppliers);
          setDraft(draftFromSuggestion(s));
        })
        .catch(fail);
    }
    return () => {
      live = false;
    };
  }, [orderId, newProject]);

  const o = full?.order ?? null;
  const isNew = !o;
  const dirty =
    mode === 'edit' && !!draft && (isNew ? draft.lines.some((l) => !isBlank(l)) || !!draft.supplier_id : JSON.stringify(stripKeys(draft)) !== JSON.stringify(draftOfFull(full)));
  const close = () => {
    if (dirty && !window.confirm('Close without saving your changes?')) return;
    onClose();
  };

  /** After a save, send or move: show it, and tell the page. */
  const saved = (d: PoFull, then: Mode = 'view', msg = '') => {
    setFull(d);
    setDraft(null);
    setMode(then);
    setErr('');
    setNotice(msg);
    onChanged(d);
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function startEdit() {
    if (!full) return;
    setDraft(draftOf(full));
    setMode('edit');
    setErr('');
    setNotice('');
    if (editable(full.order.status).supplier && !suppliers) {
      await api<{ suppliers: Supplier[] }>('/api/crm/suppliers')
        .then((d) => setSuppliers(d.suppliers))
        .catch(() => setSuppliers([]));
    }
  }

  const move = (body: Record<string, unknown>, msg: string) =>
    run(async () => {
      saved(await api<PoFull>(`/api/crm/purchase-orders/${o!.id}`, { method: 'PATCH', body: { ...body, expect_updated_at: o!.updated_at } }), 'view', msg);
    });

  const title = isNew ? 'New purchase order' : `Purchase order ${o!.po_number}`;
  if (loadErr || (!full && !draft)) {
    return (
      <Sheet title={orderId ? 'Purchase order' : 'New purchase order'} onClose={onClose} wide>
        <p className={loadErr ? 'crm-banner crm-banner--err' : 'crm-muted'}>{loadErr || 'Loading…'}</p>
      </Sheet>
    );
  }

  return (
    <Sheet title={title} onClose={close} wide>
      <div className="po-sheet">
        {o && (
          <div className="po-sheet__chips">
            <StatusChip status={o.status} />
            {o.changed_since_sent && <span className="po-chip po-chip--changed">Changed since sent</span>}
            {showJob && full?.job && (
              <Link className="po-joblink" href={`/admin/projects/${full.job.id}?tab=orders`}>
                {full.job.ref ? `${full.job.ref} · ` : ''}
                {full.job.customer || full.job.title} →
              </Link>
            )}
          </div>
        )}
        {notice && <p className="crm-banner po-ok">{notice}</p>}
        {err && <p className="crm-banner crm-banner--err">{err}</p>}

        {mode === 'edit' && draft && (
          <OrderEditor
            draft={draft}
            setDraft={setDraft}
            full={full}
            suggestion={suggestion}
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            busy={busy}
            onCancel={() => {
              if (isNew) return close();
              setDraft(null);
              setMode('view');
              setErr('');
            }}
            onSave={(body, andSend) => {
              setThenSend(andSend);
              return run(async () => {
                const d = isNew
                  ? await api<PoFull>('/api/crm/purchase-orders', { method: 'POST', body: { project_id: newProject, ...body } }, 'Not saved. Try again.')
                  : await api<PoFull>(`/api/crm/purchase-orders/${o!.id}`, { method: 'PATCH', body: { ...body, expect_updated_at: o!.updated_at } }, 'Not saved. Try again.');
                saved(d, andSend ? 'send' : 'view', andSend ? '' : 'Saved ✓');
              });
            }}
          />
        )}

        {mode !== 'edit' && full && o && (
          <>
            {mode === 'send' && (
              <SendPanel
                full={full}
                myName={myName ?? null}
                busy={busy}
                justSaved={thenSend}
                onSend={(to, message) =>
                  run(async () => {
                    const d = await api<PoFull>(`/api/crm/purchase-orders/${o.id}/send`, { method: 'POST', body: { to, message, expect_updated_at: o.updated_at } }, 'The email didn’t go. Try again.');
                    saved(d, 'view', `Emailed to ${to} ✓`);
                  })
                }
                onMarkSent={() => void move({ action: 'mark_sent' }, 'Marked as sent ✓')}
                onBack={() => {
                  setThenSend(false);
                  setMode('view');
                  setErr('');
                }}
              />
            )}
            {mode === 'deliver' && (
              <DeliverPanel
                full={full}
                today={today}
                busy={busy}
                onDone={(delivered_on, received) => void move({ action: 'deliver', delivered_on, received }, 'Marked as delivered ✓')}
                onBack={() => setMode('view')}
              />
            )}
            {mode === 'cancel' && (
              <CancelPanel
                full={full}
                busy={busy}
                onDone={(reason) => void move({ action: 'cancel', reason }, 'Cancelled')}
                onBack={() => setMode('view')}
              />
            )}
            {mode === 'view' && (
              <OrderView
                full={full}
                today={today}
                busy={busy}
                onEdit={() => void startEdit()}
                onSend={() => {
                  setThenSend(false);
                  setMode('send');
                  setErr('');
                  setNotice('');
                }}
                onConfirm={() => void move({ action: 'confirm' }, 'Marked as confirmed ✓')}
                onDeliver={() => setMode('deliver')}
                onUndeliver={() => {
                  if (window.confirm(`Mark ${o.po_number} as not delivered after all?`)) void move({ action: 'undeliver' }, 'No longer marked as delivered');
                }}
                onCancel={() => setMode('cancel')}
                onDelete={() => {
                  if (!window.confirm(`Delete the draft ${o.po_number}? It hasn’t gone to anyone, so nothing else changes.`)) return;
                  void run(async () => {
                    await api(`/api/crm/purchase-orders/${o.id}`, { method: 'DELETE' }, 'Not deleted. Try again.');
                    onChanged(null);
                    onClose();
                  });
                }}
                onSave={(body, msg) => move(body, msg)}
              />
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

const draftOfFull = (full: PoFull | null) => (full ? stripKeys(draftOf(full)) : null);
/** Line keys are new each time, so they're left out when comparing. */
function stripKeys(d: Draft) {
  return { ...d, lines: d.lines.map((l) => [l.description, l.part_number, l.qty, l.unit, l.vat_rate]) };
}

/* ── Reading an order ────────────────────────────────────────────────────────── */

function OrderView({
  full,
  today,
  busy,
  onEdit,
  onSend,
  onConfirm,
  onDeliver,
  onUndeliver,
  onCancel,
  onDelete,
  onSave,
}: {
  full: PoFull;
  today: string;
  busy: boolean;
  onEdit: () => void;
  onSend: () => void;
  onConfirm: () => void;
  onDeliver: () => void;
  onUndeliver: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: (body: Record<string, unknown>, msg: string) => Promise<void>;
}) {
  const o = full.order;
  const s = o.status;
  const sup = full.supplier;
  const t = totals(full.lines);
  const e = editable(s);
  const day = (iso: string | null) => (iso ? shortDate(ukDayOf(iso)) : '');
  const steps = [
    `Drafted ${day(o.created_at)}${full.people.created_by ? ` by ${full.people.created_by}` : ''}`,
    o.sent_at ? `Sent ${day(o.sent_at)}${o.sent_to ? ` (${o.sent_to})` : ''}${full.people.sent_by ? ` by ${full.people.sent_by}` : ''}` : '',
    o.confirmed_at ? `Confirmed ${day(o.confirmed_at)}` : '',
    o.delivered_at ? `Delivered ${day(o.delivered_at)}` : '',
    o.cancelled_at ? `Cancelled ${day(o.cancelled_at)}` : '',
  ].filter(Boolean);
  const pdf = `/api/crm/purchase-orders/${o.id}/pdf`;
  const block = sendBlocker({ status: s, lines: full.lines });
  const sent = !!o.sent_at;

  return (
    <div className="po-view">
      {o.changed_since_sent && (
        <div className="crm-banner po-changed">
          <span>
            You’ve changed this order since it went to {sup?.name ?? 'the supplier'}. Send it again so they have the latest version.
          </span>
          <button type="button" className="crm-btn crm-btn--small" disabled={busy} onClick={onSend}>
            {full.email ? 'Email it again' : 'Send it again'}
          </button>
        </div>
      )}

      <div className="po-view__top">
        <section className="po-box" aria-label="Supplier">
          <h4>Supplier</h4>
          <b>{sup?.name ?? 'Not found'}</b>
          {sup?.contact_name && <span>{sup.contact_name}</span>}
          {sup?.email ? <span>{sup.email}</span> : <span className="crm-muted">No email yet</span>}
          {sup?.phone && <span>{sup.phone}</span>}
          {sup?.account_number && <span className="crm-muted">Our account: {sup.account_number}</span>}
        </section>
        <section className="po-box" aria-label="Delivery">
          <h4>{DELIVER_LABEL[o.deliver_to]}</h4>
          {o.deliver_to === 'collect' ? <span>From the supplier</span> : <span className="po-pre">{addressLine(o.deliver_address, o.deliver_postcode)}</span>}
          <span className={o.required_by && o.required_by < today && (s === 'sent' || s === 'confirmed') ? 'po-late' : ''}>{neededWords(o, today)}</span>
        </section>
        <section className="po-box" aria-label="History">
          <h4>So far</h4>
          {steps.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </section>
      </div>

      <LinesTable full={full} />
      <TotalsBox t={t} />

      {o.notes && (
        <section className="po-note">
          <h4>Notes to the supplier</h4>
          <p className="po-pre">{o.notes}</p>
        </section>
      )}
      <NoteForm key={`n-${o.updated_at}`} value={o.internal_note ?? ''} busy={busy} onSave={(v) => onSave({ internal_note: v }, 'Saved ✓')} />
      {e.invoice && <InvoiceForm key={`i-${o.updated_at}`} full={full} busy={busy} onSave={(b) => onSave(b, 'Saved ✓')} />}

      <div className="po-actions">
        <a className="crm-btn crm-btn--ghost" href={pdf} download>
          Download PDF
        </a>
        {canDo(s, 'send') && (
          <button type="button" className={`crm-btn${s === 'draft' ? ' crm-btn--solar' : ' crm-btn--ghost'}`} disabled={busy} onClick={onSend} title={block ?? undefined}>
            {full.email ? (sent ? 'Email again' : 'Email to supplier') : sent ? 'Send again' : 'Send to supplier'}
          </button>
        )}
        {canDo(s, 'confirm') && (
          <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={onConfirm}>
            Mark confirmed
          </button>
        )}
        {canDo(s, 'deliver') && (
          <button type="button" className={`crm-btn${s === 'confirmed' ? ' crm-btn--solar' : ' crm-btn--ghost'}`} disabled={busy} onClick={onDeliver}>
            Mark delivered
          </button>
        )}
        {e.order && (
          <button type="button" className="crm-btn crm-btn--ghost" disabled={busy} onClick={onEdit}>
            Edit
          </button>
        )}
        <span className="po-actions__end">
          {canDo(s, 'undeliver') && (
            <button type="button" className="crm-link" disabled={busy} onClick={onUndeliver}>
              Not delivered after all
            </button>
          )}
          {canDo(s, 'cancel') && (
            <button type="button" className="crm-link po-danger" disabled={busy} onClick={onCancel}>
              Cancel order
            </button>
          )}
          {canDo(s, 'delete') && (
            <button type="button" className="crm-link po-danger" disabled={busy} onClick={onDelete}>
              Delete draft
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function LinesTable({ full }: { full: PoFull }) {
  const delivered = full.order.status === 'delivered';
  if (!full.lines.length) return <p className="crm-muted po-empty">Nothing on this order yet. Tap Edit to add what you’re ordering.</p>;
  return (
    <div className={`po-lines${delivered ? ' po-lines--got' : ''}`} role="table" aria-label="What’s ordered">
      <div className="po-line po-line--head" role="row">
        <span role="columnheader">Description</span>
        <span role="columnheader">Part no.</span>
        <span role="columnheader">Qty</span>
        {delivered && <span role="columnheader">Arrived</span>}
        <span role="columnheader">Unit ex VAT</span>
        <span role="columnheader">VAT</span>
        <span role="columnheader">Net</span>
      </div>
      {full.lines.map((l) => {
        const short = delivered && l.received_qty != null && l.received_qty < l.qty;
        return (
          <div key={l.id ?? l.position} className="po-line" role="row">
            <span role="cell" className="po-line__desc">
              {l.description}
            </span>
            <span role="cell" className="po-line__part">
              {l.part_number || <span className="crm-muted">–</span>}
            </span>
            <span role="cell" className="po-num" data-label="Qty">
              {formatQty(l.qty)}
            </span>
            {delivered && (
              <span role="cell" className={`po-num${short ? ' po-late' : ''}`} data-label="Arrived">
                {l.received_qty == null ? '–' : formatQty(l.received_qty)}
              </span>
            )}
            <span role="cell" className="po-num" data-label="Unit">
              {l.unit_cost_pence == null ? <span className="po-tbc">Price to add</span> : formatPence(l.unit_cost_pence)}
            </span>
            <span role="cell" className="po-num crm-muted" data-label="VAT">
              {l.vat_rate}%
            </span>
            <span role="cell" className="po-num po-line__net" data-label="Net">
              {l.unit_cost_pence == null ? '–' : formatPence(lineNet(l))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TotalsBox({ t }: { t: ReturnType<typeof totals> }) {
  return (
    <dl className="po-totals" aria-label="Totals">
      <div>
        <dt>Net (ex VAT)</dt>
        <dd>{formatPence(t.net)}</dd>
      </div>
      {t.vat.map((g) => (
        <div key={g.rate}>
          <dt>
            VAT at {g.rate}%{t.vat.length > 1 ? ` on ${formatPence(g.net)}` : ''}
          </dt>
          <dd>{formatPence(g.vat)}</dd>
        </div>
      ))}
      <div className="po-totals__gross">
        <dt>Total (inc VAT)</dt>
        <dd>{formatPence(t.gross)}</dd>
      </div>
      {t.unpriced > 0 && (
        <p className="po-tbc">
          {t.unpriced} line{t.unpriced === 1 ? ' has' : 's have'} no price yet, so {t.unpriced === 1 ? 'it isn’t' : 'they aren’t'} in the totals.
        </p>
      )}
    </dl>
  );
}

/** Our own note (never on the PO): read, with ✎ to change it. Any status. */
function NoteForm({ value, busy, onSave }: { value: string; busy: boolean; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  if (!editing) {
    return (
      <section className="po-note po-note--ours">
        <h4>
          Our note <span className="crm-muted">(not on the PO)</span>
          <button type="button" className="crmr-edit" onClick={() => setEditing(true)}>
            ✎ {value ? 'Edit' : 'Add'}
          </button>
        </h4>
        {value ? <p className="po-pre">{value}</p> : null}
      </section>
    );
  }
  return (
    <section className="po-note po-note--ours">
      <label className="crm-label" htmlFor="po-our-note">
        Our note (not on the PO)
      </label>
      <textarea id="po-our-note" className="crm-input" rows={3} value={v} autoFocus onChange={(e) => setV(e.target.value)} />
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--small" disabled={busy} onClick={() => void onSave(v)}>
          Save note
        </button>
        <button
          type="button"
          className="crm-btn crm-btn--ghost crm-btn--small"
          onClick={() => {
            setV(value);
            setEditing(false);
          }}
        >
          Cancel
        </button>
      </div>
    </section>
  );
}

/** Their invoice: reference, total (inc VAT) and when it was paid, with how it compares with the order. */
function InvoiceForm({ full, busy, onSave }: { full: PoFull; busy: boolean; onSave: (b: Record<string, unknown>) => Promise<void> }) {
  const o = full.order;
  const init = { ref: o.supplier_invoice_ref ?? '', total: penceToInput(o.supplier_invoice_pence), paid: o.paid_on ?? '' };
  const [f, setF] = useState(init);
  const [err, setErr] = useState('');
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const total = parsePounds(f.total);
  const diff = total.ok && total.pence != null && total.pence !== o.gross_pence ? total.pence - o.gross_pence : 0;
  return (
    <section className="po-invoice" aria-label="Their invoice">
      <h4>Their invoice</h4>
      <div className="po-invoice__grid">
        <div>
          <label className="crm-label" htmlFor="po-inv-ref">
            Invoice number
          </label>
          <input id="po-inv-ref" className="crm-input" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} />
        </div>
        <div>
          <label className="crm-label" htmlFor="po-inv-total">
            Total inc VAT £
          </label>
          <input id="po-inv-total" className="crm-input" inputMode="decimal" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} placeholder={penceToInput(o.gross_pence)} />
        </div>
        <div>
          <label className="crm-label" htmlFor="po-inv-paid">
            Paid on
          </label>
          <input id="po-inv-paid" className="crm-input" type="date" value={f.paid} onChange={(e) => setF({ ...f, paid: e.target.value })} />
        </div>
      </div>
      {diff !== 0 && (
        <p className="crm-small po-tbc">
          {diff > 0 ? `${formatPence(diff)} more` : `${formatPence(-diff)} less`} than this order ({formatPence(o.gross_pence)} inc VAT).
        </p>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {dirty && (
        <div className="crm-actions">
          <button
            type="button"
            className="crm-btn crm-btn--small"
            disabled={busy}
            onClick={() => {
              if (!total.ok) return setErr(`Total: ${total.error.toLowerCase()}`);
              setErr('');
              void onSave({ supplier_invoice_ref: f.ref, supplier_invoice_pence: total.pence, paid_on: f.paid || null });
            }}
          >
            Save invoice
          </button>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setF(init)}>
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}

/* ── Moving it on ────────────────────────────────────────────────────────────── */

function SendPanel({
  full,
  myName,
  busy,
  justSaved,
  onSend,
  onMarkSent,
  onBack,
}: {
  full: PoFull;
  myName: string | null;
  busy: boolean;
  justSaved: boolean;
  onSend: (to: string, message: string) => void;
  onMarkSent: () => void;
  onBack: () => void;
}) {
  const o = full.order;
  const again = !!o.sent_at;
  const replaces = again && o.changed_since_sent ? ukDayOf(o.sent_at!) : null;
  const [to, setTo] = useState(full.supplier?.email ?? '');
  const [message, setMessage] = useState(() =>
    defaultPoMessage({ ...o, jobRef: full.job?.ref ?? null, contact: full.supplier?.contact_name ?? null, sender: myName, replaces })
  );
  const block = sendBlocker({ status: o.status, lines: full.lines });
  const pdf = `/api/crm/purchase-orders/${o.id}/pdf`;
  return (
    <section className="po-panel" aria-label="Send to the supplier">
      {justSaved && <p className="crm-banner po-ok">Saved ✓ Now check the email and send it.</p>}
      <h3>{again ? `Send ${o.po_number} again` : `Send ${o.po_number} to ${full.supplier?.name ?? 'the supplier'}`}</h3>
      {block ? (
        <p className="crm-banner crm-banner--err">{block}</p>
      ) : !full.email ? (
        <>
          <p className="crm-banner">
            Microsoft 365 isn’t set up yet, so the app can’t email suppliers. Download the PDF, email it to {full.supplier?.email || 'them'} yourself, then tap Mark as sent.
          </p>
          <div className="crm-actions">
            <a className="crm-btn crm-btn--ghost" href={pdf} download>
              Download PDF
            </a>
            <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={onMarkSent}>
              {busy ? 'Saving…' : 'Mark as sent'}
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend(to.trim(), message);
          }}
        >
          <label className="crm-label" htmlFor="po-send-to">
            To
          </label>
          <input id="po-send-to" className="crm-input" type="email" inputMode="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="orders@…" required />
          <label className="crm-label" htmlFor="po-send-msg">
            Message
          </label>
          <textarea id="po-send-msg" className="crm-input" rows={10} value={message} onChange={(e) => setMessage(e.target.value)} />
          <p className="crm-muted crm-small">
            Goes from the shared mailbox with {o.po_number}.pdf attached. Their reply comes to you.{' '}
            <a className="crmh-link" href={`${pdf}?inline=1`} target="_blank" rel="noreferrer">
              See the PDF
            </a>
          </p>
          <div className="crm-actions">
            <button type="submit" className="crm-btn crm-btn--solar" disabled={busy || !to.trim()}>
              {busy ? 'Sending…' : 'Send email'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={onBack}>
              Not now
            </button>
            <button type="button" className="crm-link po-actions__end" disabled={busy} onClick={onMarkSent} title="Sent another way (from Outlook, or by hand)">
              I sent it another way: mark as sent
            </button>
          </div>
        </form>
      )}
      {(block || !full.email) && (
        <button type="button" className="crm-link po-back" onClick={onBack}>
          ← Back to the order
        </button>
      )}
    </section>
  );
}

function DeliverPanel({
  full,
  today,
  busy,
  onDone,
  onBack,
}: {
  full: PoFull;
  today: string;
  busy: boolean;
  onDone: (deliveredOn: string, received: Record<string, string>) => void;
  onBack: () => void;
}) {
  const [on, setOn] = useState(today);
  const [got, setGot] = useState<Record<string, string>>(() => Object.fromEntries(full.lines.map((l) => [l.id!, formatQty(l.received_qty ?? l.qty)])));
  const bad = full.lines.some((l) => got[l.id!] !== '' && !(Number(got[l.id!]) >= 0));
  return (
    <section className="po-panel" aria-label="Mark as delivered">
      <h3>Mark {full.order.po_number} as delivered</h3>
      <label className="crm-label" htmlFor="po-deliv-on">
        Delivered on
      </label>
      <input id="po-deliv-on" className="crm-input po-narrow" type="date" value={on} max={today || undefined} onChange={(e) => setOn(e.target.value)} />
      <p className="crm-muted crm-small">What arrived. Change a number if something was short.</p>
      <ul className="po-got">
        {full.lines.map((l) => (
          <li key={l.id}>
            <span>
              {l.description}
              {l.part_number ? <small> · {l.part_number}</small> : null}
            </span>
            <label>
              <input
                className="crm-input"
                inputMode="decimal"
                value={got[l.id!] ?? ''}
                aria-label={`How many ${l.description} arrived`}
                onChange={(e) => setGot({ ...got, [l.id!]: e.target.value })}
              />
              <small>of {formatQty(l.qty)}</small>
            </label>
          </li>
        ))}
      </ul>
      {bad && <p className="crm-banner crm-banner--err">A quantity isn’t a number.</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || bad || !on} onClick={() => onDone(on, got)}>
          {busy ? 'Saving…' : 'Mark delivered'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}

function CancelPanel({ full, busy, onDone, onBack }: { full: PoFull; busy: boolean; onDone: (reason: string) => void; onBack: () => void }) {
  const [why, setWhy] = useState('');
  return (
    <section className="po-panel" aria-label="Cancel the order">
      <h3>Cancel {full.order.po_number}?</h3>
      <p>
        It stays on the job, marked Cancelled. <b>This doesn’t tell {full.supplier?.name ?? 'the supplier'}</b>: call or email them too.
      </p>
      <label className="crm-label" htmlFor="po-cancel-why">
        Why (optional, goes on the job’s timeline)
      </label>
      <input id="po-cancel-why" className="crm-input" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. customer changed the battery" />
      <div className="crm-actions">
        <button type="button" className="crm-btn po-btn--danger" disabled={busy} onClick={() => onDone(why)}>
          {busy ? 'Cancelling…' : 'Cancel the order'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onBack}>
          Keep it
        </button>
      </div>
    </section>
  );
}

/* ── Making or changing one ──────────────────────────────────────────────────── */

function OrderEditor({
  draft,
  setDraft,
  full,
  suggestion,
  suppliers,
  setSuppliers,
  busy,
  onCancel,
  onSave,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  full: PoFull | null;
  suggestion: PoSuggestion | null;
  suppliers: Supplier[] | null;
  setSuppliers: (s: Supplier[]) => void;
  busy: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>, andSend: boolean) => Promise<void>;
}) {
  const o = full?.order ?? null;
  const status = (o?.status ?? 'draft') as PoStatus;
  const e = editable(status);
  const office = full?.office ?? suggestion?.office ?? null;
  const email = full?.email ?? suggestion?.email ?? false;
  const site = full?.job ? { address: full.job.address, postcode: full.job.postcode } : (suggestion?.site ?? { address: null, postcode: null });
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState('');
  const [tried, setTried] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const setLine = (i: number, patch: Partial<LineDraft>) => set('lines', draft.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const moveLine = (i: number, by: number) => {
    const lines = [...draft.lines];
    const [l] = lines.splice(i, 1);
    lines.splice(i + by, 0, l);
    set('lines', lines);
  };
  const t = totals(moneyOf(draft.lines));
  const live = (suppliers ?? []).filter((x) => !x.archived_at);
  const sent = status === 'sent' || status === 'confirmed';

  function check(): string | null {
    if (!draft.supplier_id) return 'Choose a supplier (or add one).';
    if (draft.deliver_to === 'site' && !draft.deliver_address.trim() && !draft.deliver_postcode.trim()) return 'Add the site address, so the supplier knows where to deliver.';
    if (draft.deliver_to === 'office' && !office) return 'There’s no office address yet: add it in CRM settings first.';
    const filled = draft.lines.filter((l) => !isBlank(l));
    if (filled.length > MAX_LINES) return `${MAX_LINES} lines at most on one order.`;
    for (const [i, l] of filled.entries()) {
      const p = lineProblems(l);
      const first = p.description ?? p.qty ?? p.unit;
      if (first) return `Line ${i + 1}: ${first.charAt(0).toLowerCase()}${first.slice(1)}.`;
    }
    return null;
  }

  function submit(andSend: boolean) {
    setTried(true);
    const p = check();
    setProblem(p ?? '');
    if (p) return;
    const lines = draft.lines
      .filter((l) => !isBlank(l))
      .map((l) => ({ description: l.description, part_number: l.part_number, qty: l.qty, unit_cost_pence: (parsePounds(l.unit) as { pence: number | null }).pence, vat_rate: l.vat_rate }));
    void onSave(
      {
        ...(e.supplier ? { supplier_id: draft.supplier_id } : {}),
        deliver_to: draft.deliver_to,
        deliver_address: draft.deliver_address,
        deliver_postcode: draft.deliver_postcode,
        required_by: draft.required_by || null,
        notes: draft.notes,
        internal_note: draft.internal_note,
        lines,
      },
      andSend
    );
  }

  return (
    <form
      className="po-edit"
      onSubmit={(ev) => {
        ev.preventDefault();
        submit(false);
      }}
    >
      {sent && (
        <p className="crm-banner">
          This order has gone to {full?.supplier?.name ?? 'the supplier'}. Saving changes marks it “changed since sent”: send it again so they have the latest version.
        </p>
      )}

      <div className="po-edit__row">
        <div className="po-edit__sup">
          <label className="crm-label" htmlFor="po-supplier">
            Supplier
          </label>
          {e.supplier ? (
            adding ? null : (
              <div className="po-suppick">
                <select
                  id="po-supplier"
                  className="crm-input"
                  value={draft.supplier_id}
                  aria-invalid={tried && !draft.supplier_id}
                  onChange={(ev) => (ev.target.value === '+' ? setAdding(true) : set('supplier_id', ev.target.value))}
                >
                  <option value="">{suppliers ? (live.length ? 'Choose a supplier' : 'No suppliers yet: add one') : 'Loading…'}</option>
                  {live.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.email ? '' : ' (no email)'}
                    </option>
                  ))}
                  <option value="+">+ Add a supplier…</option>
                </select>
                <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setAdding(true)}>
                  + Add a supplier
                </button>
              </div>
            )
          ) : (
            <p className="po-locked">
              <b>{full?.supplier?.name}</b> <span className="crm-muted">· can’t change once it’s been sent</span>
            </p>
          )}
        </div>
        <div className="po-edit__date">
          <label className="crm-label" htmlFor="po-required">
            Required by
          </label>
          <input id="po-required" className="crm-input" type="date" value={draft.required_by} onChange={(ev) => set('required_by', ev.target.value)} />
        </div>
      </div>
      {adding && (
        <SupplierForm
          compact
          onCancel={() => setAdding(false)}
          onSaved={(s) => {
            setSuppliers([...(suppliers ?? []), s].sort((a, b) => a.name.localeCompare(b.name)));
            setDraft({ ...draft, supplier_id: s.id });
            setAdding(false);
          }}
        />
      )}

      <span className="crm-label">Delivery</span>
      <div className="crmh-seg po-seg" role="radiogroup" aria-label="Delivery">
        {(['site', 'office', 'collect'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={draft.deliver_to === k}
            className={draft.deliver_to === k ? 'on' : ''}
            disabled={k === 'office' && !office}
            title={k === 'office' && !office ? 'Add the office address in CRM settings first' : undefined}
            onClick={() =>
              setDraft({
                ...draft,
                deliver_to: k,
                // Back to the site: the job's address again if it had been cleared.
                ...(k === 'site' && !draft.deliver_address && !draft.deliver_postcode ? { deliver_address: site.address ?? '', deliver_postcode: site.postcode ?? '' } : {}),
              })
            }
          >
            {k === 'site' ? 'To the site' : k === 'office' ? 'To the office' : 'We’ll collect'}
          </button>
        ))}
      </div>
      {draft.deliver_to === 'site' && (
        <div className="po-edit__addr">
          <div>
            <label className="crm-label" htmlFor="po-addr">
              Site address
            </label>
            <textarea id="po-addr" className="crm-input" rows={2} value={draft.deliver_address} onChange={(ev) => set('deliver_address', ev.target.value)} placeholder="From the job" />
          </div>
          <div>
            <label className="crm-label" htmlFor="po-pc">
              Postcode
            </label>
            <input id="po-pc" className="crm-input" value={draft.deliver_postcode} onChange={(ev) => set('deliver_postcode', ev.target.value)} />
          </div>
        </div>
      )}
      {draft.deliver_to === 'office' && office && <p className="po-locked po-pre">{addressLine(office.address, office.postcode)}</p>}
      {draft.deliver_to === 'collect' && <p className="po-locked">We’ll collect it from the supplier. The PO asks them to say when it’s ready.</p>}
      {!office && (
        <p className="crm-muted crm-small">
          To deliver to the office, add its address in{' '}
          <Link className="crmh-link" href="/admin/crm/settings">
            CRM settings
          </Link>
          .
        </p>
      )}

      <div className="po-edit__lineshead">
        <span className="crm-label">What you’re ordering</span>
        {suggestion && suggestion.from.length > 0 && !o && (
          <span className="crm-muted crm-small">Filled in from {suggestion.from.join(' and ')}. Add the prices from the supplier’s quote.</span>
        )}
      </div>
      <div className="po-elines">
        <div className="po-eline po-eline--head" aria-hidden="true">
          <span>Description</span>
          <span>Part no.</span>
          <span>Qty</span>
          <span>Unit £ ex VAT</span>
          <span>VAT</span>
          <span>Net</span>
          <span />
        </div>
        {draft.lines.map((l, i) => {
          const p = tried ? lineProblems(l) : {};
          const q = parseQty(l.qty);
          const u = parsePounds(l.unit);
          const net = q.ok && u.ok && u.pence != null ? formatPence(lineNet({ qty: q.qty, unit_cost_pence: u.pence, vat_rate: l.vat_rate })) : '–';
          return (
            <div key={l.key} className="po-eline" role="group" aria-label={`Line ${i + 1}`}>
              <input
                className="crm-input po-eline__desc"
                value={l.description}
                aria-label={`Line ${i + 1}: description`}
                aria-invalid={!!p.description}
                placeholder="What it is"
                onChange={(ev) => setLine(i, { description: ev.target.value })}
              />
              <input className="crm-input po-eline__part" value={l.part_number} aria-label={`Line ${i + 1}: part number`} placeholder="Part no." onChange={(ev) => setLine(i, { part_number: ev.target.value })} />
              <input className="crm-input po-eline__qty" inputMode="decimal" value={l.qty} aria-label={`Line ${i + 1}: quantity`} aria-invalid={!!p.qty} placeholder="Qty" onChange={(ev) => setLine(i, { qty: ev.target.value })} />
              <input
                className="crm-input po-eline__unit"
                inputMode="decimal"
                value={l.unit}
                aria-label={`Line ${i + 1}: unit cost in pounds, ex VAT`}
                aria-invalid={!!p.unit}
                placeholder="£ each"
                onChange={(ev) => setLine(i, { unit: ev.target.value })}
              />
              <select className="crm-input po-eline__vat" value={l.vat_rate} aria-label={`Line ${i + 1}: VAT rate`} onChange={(ev) => setLine(i, { vat_rate: Number(ev.target.value) })}>
                {VAT_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
              <span className="po-eline__net" aria-label={`Line ${i + 1}: net`}>
                {net}
              </span>
              <span className="po-eline__acts">
                <button type="button" className="po-iconbtn" disabled={i === 0} onClick={() => moveLine(i, -1)} aria-label={`Move line ${i + 1} up`}>
                  ↑
                </button>
                <button type="button" className="po-iconbtn" disabled={i === draft.lines.length - 1} onClick={() => moveLine(i, 1)} aria-label={`Move line ${i + 1} down`}>
                  ↓
                </button>
                <button
                  type="button"
                  className="po-iconbtn po-iconbtn--x"
                  onClick={() => set('lines', draft.lines.length > 1 ? draft.lines.filter((_, j) => j !== i) : [blankLine()])}
                  aria-label={`Remove line ${i + 1}`}
                >
                  ✕
                </button>
              </span>
            </div>
          );
        })}
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small po-addline" disabled={draft.lines.length >= MAX_LINES} onClick={() => set('lines', [...draft.lines, blankLine()])}>
          + Add a line
        </button>
      </div>
      <TotalsBox t={t} />

      <div className="crm-grid2 po-edit__notes">
        <div>
          <label className="crm-label" htmlFor="po-notes">
            Notes to the supplier <span className="po-hint">(on the PO)</span>
          </label>
          <textarea id="po-notes" className="crm-input" rows={3} value={draft.notes} onChange={(ev) => set('notes', ev.target.value)} placeholder="Access, delivery times, who to call" />
        </div>
        <div>
          <label className="crm-label" htmlFor="po-internal">
            Our note <span className="po-hint">(not on the PO)</span>
          </label>
          <textarea id="po-internal" className="crm-input" rows={3} value={draft.internal_note} onChange={(ev) => set('internal_note', ev.target.value)} placeholder="e.g. price agreed on the phone" />
        </div>
      </div>

      {problem && <p className="crm-banner crm-banner--err">{problem}</p>}
      <div className="po-savebar">
        <button type="submit" className="crm-btn crm-btn--ghost" disabled={busy}>
          {busy ? 'Saving…' : !o || status === 'draft' ? 'Save draft' : 'Save changes'}
        </button>
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => submit(true)}>
          {sent ? (email ? 'Save and email again' : 'Save and send again') : email ? 'Save and email' : 'Save and send'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        {status !== 'draft' && <span className="crm-muted crm-small">{STATUS_LABEL[status]}</span>}
      </div>
    </form>
  );
}
