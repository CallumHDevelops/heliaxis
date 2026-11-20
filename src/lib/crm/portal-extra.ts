import 'server-only';
import type { Db } from '@/lib/site/server';
import { loadHandover } from '@/lib/handover/facts';
import { equipmentOf, IBG_PROVIDER, longDay } from '@/lib/handover/inputs';
import { handoverReady } from '@/lib/handover/server';
import { loadViews } from '@/lib/proposal/server';
import { contentsGroups, customerState } from '@/lib/proposal/slots';
import { hasPrintVersion } from '@/lib/documents/print-shared';
import { serialsFrom } from './portal-login';

/**
 * The "full transparency" parts of the customer's portal (src/app/my/[token]): what it costs and what's
 * been paid, the dated history of the job, the equipment with its serial numbers, the warranties, and
 * the proposal pack in its groups. Every part is best-effort: a missing table or a fault leaves that part
 * empty, never the page broken. Nothing here is worked out that the office didn't record.
 */

export type PortalFile = { id: string; name: string; at: string; print: boolean };
export type PortalEvent = { key: string; label: string; at: string; detail?: string; planned: boolean };
export type PortalEquipment = { what: string; model: string | null; count: number | null; rating: string | null; serials: string[] };
export type PortalWarranty = { title: string; term: string; detail: string };
export type PortalMoney = {
  /** The agreed price, £ inc. VAT (crm_projects.value). Null: not recorded, so no balance is shown. */
  total: number | null;
  payments: { label: string; amount: number; on: string; reference: string | null }[];
  paid: number;
  balance: number | null;
  invoices: PortalFile[];
};
export type PortalProposal = { groups: { title: string; items: { code: string; title: string; line: string; docs: PortalFile[]; coming: boolean; sign: boolean }[] }[]; ids: string[] };

type DocLite = { id: string; category: string; name: string; created_at: string; visible: boolean; archived_at?: string | null; source?: string | null; generated_key?: string | null };

const fileOf = (d: { id: string; name: string; at: string; source?: string | null; key?: string | null }): PortalFile => ({
  id: d.id,
  name: d.name.replace(/\.pdf$/i, ''),
  at: d.at,
  print: d.source === 'generated' && hasPrintVersion(d.key ?? null),
});

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const n = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const KIND: Record<string, string> = { stage: 'Stage payment', final: 'Final payment', other: 'Payment' };

/** The proposal pack the customer can see: items in pack order, each with its visible documents or "On its way". */
async function proposalOf(db: Db, projectId: string): Promise<PortalProposal | null> {
  const views = await loadViews(db, projectId);
  const shown = views.filter((v) => customerState(v) !== null);
  const items = shown.map((v) => ({
    code: v.code,
    title: v.title,
    line: v.customer,
    group: v.group,
    order: v.order,
    sign: v.role === 'sign',
    coming: customerState(v) === 'coming',
    docs: v.docs.filter((d) => d.visible).sort((a, b) => b.version - a.version).slice(0, 1).map((d) => fileOf({ id: d.id, name: d.name, at: d.at, source: d.source, key: d.key })),
  }));
  // Nothing visible yet: the pack isn't shown at all (no wall of "On its way").
  if (!items.some((i) => i.docs.length)) return null;
  const groups = contentsGroups(items).map((g) => ({ title: g.title, items: g.items.map((i) => ({ code: i.code, title: i.title, line: i.line, docs: i.docs, coming: i.coming, sign: i.sign })) }));
  return { groups, ids: items.flatMap((i) => i.docs.map((d) => d.id)) };
}

export async function portalExtras(db: Db, p: Record<string, unknown>, docs: DocLite[], opts: { full: boolean; proposalReady: boolean }) {
  const projectId = String(p.id);
  const visible = docs.filter((d) => d.visible && !d.archived_at);

  const [proposal, handover, payRows, quoteRow] = await Promise.all([
    opts.proposalReady ? proposalOf(db, projectId).catch(() => null) : Promise.resolve(null),
    opts.full ? handoverReady().then((ok) => (ok ? loadHandover(db, projectId) : null)).catch(() => null) : Promise.resolve(null),
    opts.full
      ? db.from('crm_payments').select('kind, amount_pence, paid_on, reference').eq('project_id', projectId).order('paid_on').then((r) => (r.error ? [] : (r.data ?? [])), () => [])
      : Promise.resolve([]),
    db.from('crm_quotes').select('sent_at').eq('project_id', projectId).not('sent_at', 'is', null).order('sent_at', { ascending: true }).limit(1).then((r) => r.data?.[0] ?? null, () => null),
  ]);

  // ── Money ──
  const total = n(p.value);
  const payments: PortalMoney['payments'] = [];
  const deposit = n(p.deposit_amount);
  if (deposit && str(p.deposit_paid_at)) payments.push({ label: 'Deposit', amount: deposit, on: String(p.deposit_paid_at), reference: null });
  for (const r of payRows as Record<string, unknown>[]) payments.push({ label: KIND[String(r.kind)] ?? 'Payment', amount: Number(r.amount_pence) / 100, on: String(r.paid_on), reference: str(r.reference) });
  const paid = Math.round(payments.reduce((a, x) => a + x.amount, 0) * 100) / 100;
  const money: PortalMoney | null = opts.full
    ? {
        total: total && total > 0 ? total : null,
        payments,
        paid,
        balance: total && total > 0 ? Math.max(0, Math.round((total - paid) * 100) / 100) : null,
        invoices: visible.filter((d) => d.category === 'invoice' || d.category === 'receipt').map((d) => fileOf({ id: d.id, name: d.name, at: d.created_at, source: d.source, key: d.generated_key })),
      }
    : null;

  // ── Equipment and serial numbers ──
  const sys = (p.system ?? {}) as Record<string, unknown>;
  let equipment: PortalEquipment[] = [];
  if (opts.full) {
    if (handover) equipment = equipmentOf(handover.facts).map((e) => ({ what: e.what, model: e.model, count: e.count, rating: e.rating, serials: e.serials }));
    else {
      const products = Array.isArray(p.products) ? (p.products as string[]) : [];
      if (products.includes('solar')) {
        equipment.push({ what: 'Solar panels', model: str(sys.panel_model), count: n(sys.panel_count), rating: n(sys.kwp) ? `${n(sys.kwp)} kWp` : null, serials: [] });
        equipment.push({ what: 'Inverter', model: str(sys.inverter_model), count: null, rating: n(sys.inverter_kw) ? `${n(sys.inverter_kw)} kW` : null, serials: [] });
      }
      if (products.includes('battery')) equipment.push({ what: 'Battery', model: str(sys.battery_model), count: null, rating: n(sys.battery_kwh) ? `${n(sys.battery_kwh)} kWh` : null, serials: [] });
      if (products.includes('ev')) equipment.push({ what: 'EV charger', model: str(sys.ev_charger_model), count: null, rating: null, serials: [] });
      if (products.includes('heatpump')) equipment.push({ what: 'Heat pump', model: str(sys.heat_pump_model), count: null, rating: n(sys.heat_pump_kw) ? `${n(sys.heat_pump_kw)} kW` : null, serials: [] });
    }
    // The inverter serial typed on Job details, when the electrician's scan hasn't given one.
    const inv = equipment.find((e) => e.what === 'Inverter');
    if (inv && !inv.serials.length) inv.serials = serialsFrom(sys.inverter_serial);
    equipment = equipment.filter((e) => e.model || e.rating || e.serials.length);
  }

  // ── Warranties ──
  const warranties: PortalWarranty[] = [];
  if (handover) {
    const s = handover.facts.settings;
    const start = s.warrantyStart === 'commissioning' ? (handover.facts.job.commissionedOn ?? handover.facts.electrician?.signedOn ?? null) : handover.facts.job.handedOverOn;
    if (s.warrantyYears) {
      let term = `${s.warrantyYears} years`;
      if (start) {
        const end = new Date(`${start}T12:00:00Z`);
        end.setUTCFullYear(end.getUTCFullYear() + s.warrantyYears);
        term = `${s.warrantyYears} years: ${longDay(start)} to ${longDay(end.toISOString().slice(0, 10))}`;
      } else term += s.warrantyStart === 'commissioning' ? ', from the day your system is switched on' : ', from the day we hand over your pack';
      warranties.push({ title: 'Heliaxis workmanship warranty', term, detail: 'Our own warranty on the work we did.' });
    }
    const pw = handover.facts.paperwork;
    warranties.push({
      title: 'Insurance-backed guarantee',
      term: `${pw.ibg_provider || IBG_PROVIDER}${pw.ibg_ref ? `, policy ${pw.ibg_ref}` : ' (policy number to follow)'}`,
      detail: 'It backs our warranty if we ever stopped trading.',
    });
  }
  for (const e of equipment.filter((x) => x.model)) warranties.push({ title: `${e.what}: manufacturer’s warranty`, term: e.model!, detail: 'Set by the manufacturer. The terms are in the data sheet and warranty documents in your packs.' });

  // ── The job's history, with dates ──
  const ev: PortalEvent[] = [];
  const now = Date.now();
  const add = (key: string, label: string, at: unknown, detail?: string) => {
    const s = str(at);
    if (s) ev.push({ key, label, at: s, detail, planned: Date.parse(s.length === 10 ? `${s}T23:59:00Z` : s) > now });
  };
  add('enquiry', 'Enquiry received', p.created_at);
  add('survey', 'Survey', p.survey_at);
  add('quote', 'Quote sent to you', quoteRow?.sent_at);
  add('accepted', 'Quote accepted', p.accepted_at, str(p.accepted_name) ? `Signed by ${p.accepted_name}` : undefined);
  add('deposit', 'Deposit paid', p.deposit_paid_at);
  if (opts.full) {
    add('dno_applied', 'Applied to the electricity network (DNO)', p.dno_submitted_at, str(p.dno_ref) ? `Reference ${p.dno_ref}` : undefined);
    add('dno_ok', 'Network (DNO) approval', p.dno_approved_at);
    add('scaffold_up', 'Scaffolding up', p.scaffold_up_on);
    const days = Number(p.install_days ?? 1);
    add('install', 'Installation', p.install_at, days > 1 ? `${days} working days` : undefined);
    add('scaffold_down', 'Scaffolding down', p.scaffold_down_on);
    add('switched_on', 'System switched on', p.commissioned_at);
    add('handover', 'Handover pack sent', handover?.pack?.sent_at ?? p.handover_at);
    for (const x of payments.filter((x) => x.label !== 'Deposit')) add(`pay-${x.on}`, x.label, x.on, `£${x.amount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`);
  }
  ev.sort((a, b) => a.at.slice(0, 10).localeCompare(b.at.slice(0, 10)) || a.at.localeCompare(b.at));

  return { money, equipment, warranties, events: ev, proposal, ref: str(p.project_ref) };
}
export type PortalExtras = Awaited<ReturnType<typeof portalExtras>>;
