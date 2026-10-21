import 'server-only';
import { ukDay } from '@/lib/bank-holidays';
import { DOCS_BUCKET } from '@/lib/crm/server';
import { docFileName, longDate, newDocument, stampWords } from '@/lib/documents/pdf-kit';
import { currentGenerated, saveGenerated } from '@/lib/documents/store';
import { addressLine } from '@/lib/purchase-orders/shared';
import { logOrder } from '@/lib/purchase-orders/server';
import { HELIAXIS_PARTY } from '@/lib/subcontractors/agreement';
import { getSettings as getWaSettings } from '@/lib/whatsapp/settings';
import { KIND_TEMPLATE, poParams, sendAfter, siteShort } from './messages';
import { cisPercent, cisWords, formatPence, labourMoney, qtyWords, rateWords, STANDARD_VAT, VAT_WORDS, type LabourLine } from './money';
import { OVERRIDABLE, snapshotOf, type HeldReason, type LabourSnapshot } from './po-shared';
import { aboutOf, emailHtml, jobOf, queueMessage, whatsappProblem, type MessageRow } from './send';
import { firmsById, logSiteEvent, moneyFacts, readAssignment, type AssignmentRow, type ContactRow, type Db } from './server';
import { getSiteSettings } from './settings';
import { siteLink, linkTokenFor } from './tokens';
import { TRADE_LABEL, TRADE_WORK, valuesOf, type Stage } from './types';

/**
 * The labour PO a sign-off raises (SPEC 1I): the agreed rate × the quantity (the roofer's "How many
 * panels did you fit?" as signed, 1 for a fixed price, the agreed days or hours), VAT by the
 * subcontractor's registration, CIS by their verification, and what they'll be paid. One per
 * sign-off (purchase_orders.signoff_id is unique), held as a draft when something's missing or the
 * owner's settings say so, otherwise issued: the PDF (the document kit), stored as a document, and
 * sent by email with the PDF and by WhatsApp, both through the evening rule. Everything printed is
 * frozen in purchase_orders.labour when it's issued.
 */

export type PoRow = {
  id: string;
  po_number: string;
  status: string;
  project_id: string;
  assignment_id: string | null;
  signoff_id: string | null;
  net_pence: number;
  vat_pence: number;
  cis_pence: number | null;
  payable_pence: number | null;
  sent_at: string | null;
  paid_on: string | null;
  changed_since_sent: boolean;
  labour: LabourSnapshot | null;
};
const poRow = (r: Record<string, unknown>): PoRow => ({
  ...(r as unknown as PoRow),
  net_pence: Number(r.net_pence) || 0,
  vat_pence: Number(r.vat_pence) || 0,
  cis_pence: r.cis_pence == null ? null : Number(r.cis_pence),
  payable_pence: r.payable_pence == null ? null : Number(r.payable_pence),
  labour: snapshotOf(r.labour),
});

type SignoffLite = { id: string; signed_name: string; signed_at: string; stage: Stage };

/** The labour PO for this assignment that isn't cancelled (a re-sign after a reopen updates it). */
export async function livePo(db: Db, assignmentId: string): Promise<PoRow | null> {
  const { data } = await db.from('purchase_orders').select('*').eq('assignment_id', assignmentId).eq('kind', 'labour').neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1);
  return data?.[0] ? poRow(data[0]) : null;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

/** Everything the PO says, from the assignment, the person, the job and the sign-off as they are now. */
async function snapshotFor(db: Db, a: AssignmentRow, signoff: SignoffLite | null, poNumber: string): Promise<{ snap: LabourSnapshot; contact: ContactRow | null }> {
  const [{ data: c }, job, settings] = await Promise.all([db.from('site_contacts').select('*').eq('id', a.contact_id).maybeSingle(), jobOf(db, a.project_id), getSiteSettings()]);
  const contact = c as ContactRow | null;
  const firm = contact?.subcontractor_id ? ((await firmsById(db, [contact.subcontractor_id])).get(contact.subcontractor_id) ?? null) : null;
  const facts = contact ? moneyFacts(contact, firm) : { cis: { verifiedOn: null, rate: null } };
  const values = valuesOf(a.answers);
  const basis = a.rate_basis;
  // The quantity: the roofer's signed count for per-panel work, 1 for a fixed price, else as agreed.
  let qty: number | null = null;
  let from = '';
  if (basis === 'fixed') {
    qty = 1;
    from = 'fixed price';
  } else if (basis === 'per_panel' && a.trade === 'roofer') {
    qty = num(values.RX5);
    from = 'as signed by the roofer';
  } else if (basis) {
    qty = num(a.rate_qty);
    from = 'as agreed';
  }
  const title = a.trade === 'other' ? a.trade_label || TRADE_LABEL.other : TRADE_LABEL[a.trade];
  const lines: LabourLine[] = a.rate_pence != null && qty ? [{ description: `${title}: ${a.scope || TRADE_WORK[a.trade]}`, qty, unit_pence: a.rate_pence, cis: true }] : [];
  const pct = cisPercent({ ...facts.cis, override: a.cis_override });
  const m = labourMoney(lines, a.vat_treatment ?? 'none', pct);
  const held: HeldReason[] = [];
  if (a.rate_pence == null || !basis) held.push('rate');
  else if (!qty) held.push('qty');
  if (!a.vat_treatment) held.push('vat');
  if (!contact?.email && !(contact?.wa_id && contact.whatsapp_ok)) held.push('contact');
  if (settings.holdPoOnUrgent && a.flags.some((f) => f.severity === 'urgent' && !f.resolved_at)) held.push('urgent');
  // Until the strike is signed (the assignment is done then).
  if (a.trade === 'scaffolder' && settings.holdScaffoldPoUntilStrike && a.status !== 'done') held.push('scaffold');
  const terms = [settings.paymentTerms.trim(), settings.paymentDays ? `Paid within ${settings.paymentDays} days of a correct invoice.` : ''].filter(Boolean).join(' ');
  const snap: LabourSnapshot = {
    po_number: poNumber,
    issued: null,
    version: 0,
    job: { ref: job.ref, address: addressLine(job.address, job.postcode) },
    sub: {
      company: firm?.details?.legalName || firm?.company_name || contact?.company || null,
      contact: contact?.name ?? '',
      mobile: contact?.mobile ?? null,
      email: contact?.email ?? null,
      firm_ref: firm?.ref ?? null,
    },
    trade: a.trade,
    trade_title: title,
    scope: a.scope,
    rate_pence: a.rate_pence,
    basis,
    qty,
    qty_words: basis && qty ? (basis === 'fixed' ? 'Fixed price' : `${qtyWords(basis, qty)} (${from})`) : null,
    rate_words: basis && a.rate_pence != null && qty ? (basis === 'fixed' ? rateWords(a.rate_pence, basis) : `${rateWords(a.rate_pence, basis)} × ${qtyWords(basis, qty)} (${from})`) : null,
    lines: lines.map((l, i) => ({ ...l, net: m.lines[i] })),
    labour_net: m.labourNet,
    materials_net: m.materialsNet,
    net: m.net,
    vat_treatment: a.vat_treatment,
    vat_words: a.vat_treatment ? VAT_WORDS[a.vat_treatment] : 'VAT not chosen yet',
    vat: m.vat,
    cis: { words: cisWords({ ...facts.cis, override: a.cis_override }), percent: pct, pence: m.cis },
    payable: m.payable,
    payment_terms: terms || null,
    signed: signoff ? { by: signoff.signed_name, at: signoff.signed_at, stage: signoff.stage } : null,
    quote_line: `Please quote ${poNumber} on your invoice and send it to ${HELIAXIS_PARTY.accountsEmail}`,
    held,
    replaces: null,
  };
  return { snap, contact };
}

async function saveLabourLines(db: Db, poId: string, s: LabourSnapshot) {
  await db.from('purchase_order_lines').delete().eq('purchase_order_id', poId);
  if (!s.lines.length) return;
  await db.from('purchase_order_lines').insert(
    s.lines.map((l, position) => ({ purchase_order_id: poId, position, description: l.description, qty: l.qty, unit_cost_pence: l.unit_pence, vat_rate: s.vat_treatment === 'standard' ? STANDARD_VAT : 0, cis: l.cis }))
  );
}

const moneyCols = (s: LabourSnapshot) => ({ net_pence: s.net, vat_pence: s.vat, gross_pence: s.net + s.vat, cis_pence: s.cis.pence, payable_pence: s.payable });

/**
 * The PO for a sign-off, raised once: a retried sign-off reads the same PO. After a reopen, the
 * re-sign updates the assignment's PO instead of making another; if it had already gone and the
 * money changed, it's marked changed since sent (the office issues it again). No PO when the
 * assignment says not to raise one (Heliaxis's own staff).
 */
export async function raiseLabourPo(db: Db, a: AssignmentRow, signoff: SignoffLite): Promise<{ po: PoRow | null; held: HeldReason[] }> {
  if (!a.raise_po) return { po: null, held: [] };
  const { data: same } = await db.from('purchase_orders').select('*').eq('signoff_id', signoff.id).maybeSingle();
  if (same) {
    const po = poRow(same);
    return { po, held: po.labour?.held ?? [] };
  }
  const live = await livePo(db, a.id);
  if (live) {
    const { snap } = await snapshotFor(db, a, signoff, live.po_number);
    const was = live.labour;
    const now = new Date().toISOString();
    if (was && was.version > 0) {
      // Issued: what went stays as it went (the snapshot and its PDF). A change waits for Issue again.
      const changed = was.payable !== snap.payable || was.qty !== snap.qty || was.rate_pence !== snap.rate_pence || was.vat_treatment !== snap.vat_treatment;
      await db
        .from('purchase_orders')
        .update({ signoff_id: signoff.id, changed_since_sent: live.changed_since_sent || changed, updated_at: now })
        .eq('id', live.id);
    } else {
      await db.from('purchase_orders').update({ signoff_id: signoff.id, labour: snap, ...moneyCols(snap), updated_at: now }).eq('id', live.id);
      await saveLabourLines(db, live.id, snap);
    }
    const po = (await readPo(db, live.id))!;
    return { po, held: snap.held };
  }
  const { snap, contact } = await snapshotFor(db, a, signoff, '');
  const { data: ins, error } = await db
    .from('purchase_orders')
    .insert({ kind: 'labour', project_id: a.project_id, assignment_id: a.id, signoff_id: signoff.id, status: 'draft', deliver_to: 'site', deliver_address: snap.job.address || null, ...moneyCols(snap), labour: snap })
    .select('*')
    .single();
  if (error || !ins) {
    // Raised a moment ago by the same sign-off: that's the one.
    const { data: again } = await db.from('purchase_orders').select('*').eq('signoff_id', signoff.id).maybeSingle();
    if (again) return { po: poRow(again), held: snapshotOf(again.labour)?.held ?? [] };
    throw new Error(`The labour PO couldn’t be saved: ${error?.message ?? 'no row'}`);
  }
  const poNumber = String(ins.po_number);
  const full: LabourSnapshot = { ...snap, po_number: poNumber, quote_line: `Please quote ${poNumber} on your invoice and send it to ${HELIAXIS_PARTY.accountsEmail}` };
  await db.from('purchase_orders').update({ labour: full }).eq('id', ins.id);
  await saveLabourLines(db, String(ins.id), full);
  await logOrder(db, { id: String(ins.id), po_number: poNumber, project_id: a.project_id }, 'created', `Labour PO ${poNumber} raised for ${contact?.name ?? 'the trade'} (${full.trade_title.toLowerCase()})${full.net ? ` · ${formatPence(full.net)} ex VAT` : ''}`, null);
  return { po: (await readPo(db, String(ins.id)))!, held: full.held };
}

/**
 * After the office changes the rate, quantity or VAT on a signed trade: a PO that hasn't gone yet is
 * worked out again (so what it's held for is current), and a signed trade whose PO was turned on gets
 * one. A PO that has gone is left as it went.
 */
export async function refreshDraftPo(db: Db, a: AssignmentRow): Promise<PoRow | null> {
  const live = await livePo(db, a.id);
  const { data: so } = await db.from('site_signoffs').select('id, signed_name, signed_at, stage').eq('assignment_id', a.id).neq('stage', 'strike').maybeSingle();
  const signoff = (so as SignoffLite | null) ?? null;
  if (!live) return a.raise_po && signoff ? (await raiseLabourPo(db, a, signoff)).po : null;
  if (live.status !== 'draft' || (live.labour?.version ?? 0) > 0) return live;
  const { snap } = await snapshotFor(db, a, signoff, live.po_number);
  await db.from('purchase_orders').update({ labour: snap, ...moneyCols(snap), updated_at: new Date().toISOString() }).eq('id', live.id);
  await saveLabourLines(db, live.id, snap);
  return readPo(db, live.id);
}

export async function readPo(db: Db, id: string): Promise<PoRow | null> {
  const { data } = await db.from('purchase_orders').select('*').eq('id', id).maybeSingle();
  return data ? poRow(data) : null;
}

/* ── The PDF ─────────────────────────────────────────────────────────────────── */

const upperFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const SIGNED_STAGE: Record<Stage, string> = { main: 'Signed off', erection: 'Scaffold signed off as up', strike: 'Scaffold signed off as down' };

export async function labourPoPdf(s: LabourSnapshot): Promise<Uint8Array> {
  const issued = s.issued ?? ukDay(new Date());
  const kit = await newDocument({ code: s.po_number, label: s.po_number, title: 'Labour purchase order', jobRef: s.job.ref, issued });
  kit.header({ meta: [['PO number', s.po_number], ['Date', longDate(issued)], ['Job', s.job.ref ?? '–']] });
  if (s.replaces) kit.paragraph(`This replaces the purchase order sent on ${longDate(s.replaces)}.`, { bold: true });
  kit.idGrid([
    ['Subcontractor', [s.sub.company, s.sub.contact].filter(Boolean).join(' · ')],
    ['Our reference for you', s.sub.firm_ref],
    ['Mobile', s.sub.mobile],
    ['Email', s.sub.email],
    ['Site', s.job.address],
    ['Trade', s.trade_title],
  ]);
  kit.section('The work');
  kit.rows([
    { label: 'What', value: s.scope || upperFirst(TRADE_WORK[s.trade]) },
    { label: 'Rate and quantity', value: s.rate_words },
  ]);
  kit.section('Price');
  kit.rows([
    { label: 'Labour (ex VAT)', value: formatPence(s.labour_net) },
    ...(s.materials_net ? [{ label: 'Materials (not subject to CIS)', value: formatPence(s.materials_net) }] : []),
    { label: s.vat_words, value: s.vat ? formatPence(s.vat) : 'No VAT on this PO' },
    { label: `CIS: ${s.cis.words.replace(/^CIS: /, '')}`, value: s.cis.pence ? `−${formatPence(s.cis.pence)}` : 'No deduction' },
    { label: 'What you’ll be paid', value: formatPence(s.payable), strong: true },
  ]);
  if (s.payment_terms) kit.note(s.payment_terms);
  if (s.signed) {
    kit.section('Signed off');
    kit.rows([{ label: SIGNED_STAGE[s.signed.stage], value: `${s.signed.by}, ${stampWords(s.signed.at)}` }]);
  }
  kit.gap(6);
  kit.paragraph(s.quote_line, { bold: true });
  return kit.save();
}

/* ── Issuing ─────────────────────────────────────────────────────────────────── */

export type IssueResult = { ok: true; po: PoRow; messages: MessageRow[] } | { ok: false; error: string; held?: HeldReason[] };

/**
 * Issue (or issue again) a labour PO: the PO frozen as it is now, its PDF stored as a document
 * (category po, not visible, a new version each time), and sent by email (the PDF attached) and
 * WhatsApp through the evening rule. It counts as sent once a message reaches them (send.ts).
 * `override`: the office issues past its own holds (Urgent, scaffold); missing details still stop it.
 */
export async function issueLabourPo(db: Db, poId: string, opts: { by?: string | null; override?: boolean; origin?: string | null } = {}): Promise<IssueResult> {
  const po = await readPo(db, poId);
  if (!po || !po.assignment_id) return { ok: false, error: 'That PO isn’t there any more.' };
  if (po.status === 'cancelled') return { ok: false, error: 'That PO was cancelled.' };
  const a = await readAssignment(db, po.assignment_id);
  if (!a) return { ok: false, error: 'The trade isn’t on the job any more.' };
  const { data: so } = po.signoff_id ? await db.from('site_signoffs').select('id, signed_name, signed_at, stage').eq('id', po.signoff_id).maybeSingle() : { data: null };
  const { snap, contact } = await snapshotFor(db, a, (so as SignoffLite | null) ?? null, po.po_number);
  const blocking = snap.held.filter((h) => !(opts.override && OVERRIDABLE.includes(h)));
  if (blocking.length) return { ok: false, error: 'Not ready to issue yet.', held: blocking };
  const prev = po.labour;
  const version = (prev?.version ?? 0) + 1;
  const issued: LabourSnapshot = { ...snap, held: [], issued: ukDay(new Date()), version, replaces: prev?.issued && version > 1 ? prev.issued : null };
  const bytes = await labourPoPdf(issued);
  const saved = await saveGenerated(db, a.project_id, {
    key: po.po_number,
    name: docFileName(snap.job.ref, po.po_number, 'Labour purchase order'),
    bytes,
    inputs: { ...issued, issued: null },
    category: 'po',
    visible: false,
    force: true,
    by: opts.by ?? null,
  });
  // Issued: status sent now; sent_at only once a message for this version has reached them (send.ts deliver).
  await db
    .from('purchase_orders')
    .update({ status: 'sent', labour: issued, ...moneyCols(issued), changed_since_sent: false, sent_at: null, sent_to: null, updated_at: new Date().toISOString() })
    .eq('id', po.id);
  await saveLabourLines(db, po.id, issued);
  const messages = await sendPoMessages(db, po.id, { by: opts.by, origin: opts.origin, attachPath: saved.doc.storage_path });
  await logSiteEvent(db, a.id, opts.by ?? 'system', 'po_issued', { po: po.id, po_number: po.po_number, version, payable: issued.payable });
  await logOrder(db, { id: po.id, po_number: po.po_number, project_id: a.project_id }, 'sent', `Labour PO ${po.po_number} ${version > 1 ? 'issued again' : 'issued'} to ${contact?.name ?? 'the trade'} · ${formatPence(issued.payable)} to pay`, opts.by ?? null);
  return { ok: true, po: (await readPo(db, po.id))!, messages };
}

/**
 * The issued PO's email (its PDF attached) and WhatsApp for the version that went, through the
 * evening rule, each once (its dedupe key). Run again after anything failed part-way (the sign-off's
 * cron step), it queues only what's missing.
 */
export async function sendPoMessages(db: Db, poId: string, opts: { by?: string | null; origin?: string | null; attachPath?: string | null } = {}): Promise<MessageRow[]> {
  const po = await readPo(db, poId);
  const issued = po?.labour;
  if (!po || !issued || issued.version < 1 || po.status === 'cancelled' || !po.assignment_id) return [];
  const a = await readAssignment(db, po.assignment_id);
  if (!a) return [];
  const { data: c } = await db.from('site_contacts').select('*').eq('id', a.contact_id).maybeSingle();
  const contact = c as ContactRow | null;
  if (!contact) return [];
  const version = issued.version;
  const messages: MessageRow[] = [];
  const job = await jobOf(db, a.project_id);
  const after = sendAfter(new Date(), await getWaSettings());
  const about = aboutOf(a, contact, job, siteLink(linkTokenFor(a.id, Math.max(1, a.link_generation)), opts.origin));
  const site = siteShort(job.address, job.postcode);
  if (contact.email) {
    const path = opts.attachPath ?? (await currentGenerated(db, a.project_id, po.po_number))?.storage_path;
    if (!path) throw new Error(`The PDF of ${po.po_number} isn’t stored yet.`);
    const html = emailHtml({
      subject: `${po.po_number}: your purchase order for ${site}`,
      title: `${po.po_number}: your purchase order`,
      paragraphs: [
        `Hi ${about.firstName || 'there'},`,
        `${version > 1 ? 'Here is your updated' : 'Thank you for signing off. Here is your'} purchase order for the ${TRADE_WORK[a.trade]} at ${site}. The PDF is attached.`,
        `${issued.rate_words ?? ''}${issued.rate_words ? ': ' : ''}${formatPence(issued.net)} ex VAT. ${issued.vat_words}. ${issued.cis.words.replace(/^CIS: /, 'CIS ')}.`,
        `What you’ll be paid: ${formatPence(issued.payable)}.`,
        ...(issued.payment_terms ? [issued.payment_terms] : []),
        issued.quote_line + '.',
      ],
    });
    const m = await queueMessage(
      db,
      {
        assignmentId: a.id,
        channel: 'email',
        kind: 'po',
        dedupeKey: `po:${po.id}:v${version}:email`,
        to: contact.email,
        params: { subject: `${po.po_number}: your purchase order for ${site}`, html, attach: { bucket: DOCS_BUCKET, path, filename: `${po.po_number}.pdf` } },
        sendAfter: after,
      },
      opts.by ?? 'system'
    );
    if (m) messages.push(m);
  }
  if (!(await whatsappProblem(contact, 'po')) && contact.wa_id) {
    const m = await queueMessage(db, { assignmentId: a.id, channel: 'whatsapp', kind: 'po', dedupeKey: `po:${po.id}:v${version}:whatsapp`, to: contact.wa_id, template: KIND_TEMPLATE.po, params: poParams(about, po.po_number), sendAfter: after }, opts.by ?? 'system');
    if (m) messages.push(m);
  }
  return messages;
}
