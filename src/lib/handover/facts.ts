import 'server-only';
import { installDayList, ukDay } from '@/lib/bank-holidays';
import { deadlinesFor } from '@/lib/projects/deadlines';
import { calendarNow, projectRow } from '@/lib/projects/server';
import { designOf } from '@/lib/site/design';
import type { Db } from '@/lib/site/server';
import { valuesOf, type Answers } from '@/lib/site/types';
import { modelsOf, type CustomerSig, type ElectricianFacts, type HandoverFacts, type LibraryItem, type Payment, type SlotData, type SystemFacts } from './inputs';
import { getHandoverSettings } from './settings';
import { isSlot, modelKey, type SlotCode, type SlotDoc } from './slots';

/**
 * Everything the handover pack is worked out from, read for one job: the job and its customer, the
 * design and paperwork, the electrician's sign-off (Unit 2) with the customer's signatures, the
 * office's marks and data per item (handover_slots), the documents in the pack (the registry, D3),
 * the product library, recorded payments, the survey's shading and the deadlines.
 *
 * Units 2 and 3 can add what only they know (the EIC's reference and next inspection, answers a form
 * keeps elsewhere) with registerHandoverFacts; until then the electrician's facts come from their
 * pack's answers by the FORMS keys.
 */

/** A crm_documents row as the pack reads it (select('*')). */
export type DocRow = {
  id: string;
  project_id: string;
  category: string;
  name: string;
  storage_path: string;
  mime: string | null;
  size: number | null;
  visible: boolean;
  created_at: string;
  uploaded_by: string | null;
  handover_slot: string | null;
  release: string | null;
  source: string | null;
  generated_key: string | null;
  version: number | null;
  inputs_hash: string | null;
  archived_at: string | null;
};
export type SlotRow = { project_id: string; slot: string; na: boolean; na_reason: string | null; note: string | null; updated_by: string | null; updated_at: string; data: SlotData | null };
export type PackRow = {
  project_id: string;
  version: number;
  document_id: string | null;
  contents: unknown;
  built_at: string | null;
  built_by: string | null;
  sent_at: string | null;
  sent_by: string | null;
  sent_via: string[];
  invoice_prompted_at: string | null;
  /** Messages held for the evening rule (D19), oldest first. */
  queued: { at: string; via: string[]; kind: string; what: string | null; by: string | null }[] | null;
};

export type Loaded = {
  project: Record<string, unknown>;
  facts: HandoverFacts;
  docs: DocRow[];
  slots: Map<string, SlotRow>;
  pack: PackRow | null;
  electrician: 'none' | 'working' | 'signed';
  due: { mcs?: string | null; regs?: string | null; cc16?: string | null; g98?: string | null };
  invoicePaid: boolean;
  /** Every library item that isn't archived (the job's matches are in facts.library). */
  libraryAll: LibraryItem[];
  /** Profiles by id, for "Uploaded by Sarah". */
  people: Map<string, string>;
};

/** What Units 2 and 3 can tell the pack about the electrician's work (only the fields they know). */
export type FactsPlugin = (db: Db, projectId: string, f: HandoverFacts) => Promise<Partial<Pick<ElectricianFacts, 'certRef' | 'nextInspection' | 'values'>> | null>;
const PLUGINS: FactsPlugin[] = [];
export const registerHandoverFacts = (p: FactsPlugin) => void PLUGINS.push(p);

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const SHADING: Record<string, string> = { trees: 'Trees', building: 'Buildings', chimney: 'Chimney', dormer_parapet: 'Dormer or parapet', pole_wires: 'Pole or wires' };

/** The site address as lines (street, town…), then the postcode once. */
export function addressLines(address: string | null | undefined, postcode: string | null | undefined): string[] {
  const parts = String(address ?? '')
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pc = (postcode ?? '').trim();
  if (pc && !parts.some((p) => p.toUpperCase().replace(/\s/g, '') === pc.toUpperCase().replace(/\s/g, ''))) parts.push(pc.toUpperCase());
  return parts;
}

/** The library items for these models (case, spaces and dashes ignored; learnt aliases too), plus the ones in every pack. */
export function libraryFor(all: LibraryItem[], models: string[], products: string[]): LibraryItem[] {
  const keys = new Set(models.map(modelKey));
  return all.filter((l) => {
    if (l.every_pack) return !l.technologies.length || l.technologies.some((t) => products.includes(t));
    const names = l.models.flatMap((m) => [m, ...(l.details?.[m]?.aliases ?? [])]);
    return names.some((m) => keys.has(modelKey(m)));
  });
}

/** Models with no manual or datasheet in the library yet (CC5's gaps). */
export function libraryGaps(all: LibraryItem[], models: string[]): string[] {
  return models.filter((m) => !all.some((l) => (l.kind === 'manual' || l.kind === 'datasheet') && libraryFor([{ ...l, every_pack: false }], [m], []).length));
}

function libraryItem(r: Record<string, unknown>): LibraryItem {
  return {
    id: String(r.id),
    name: String(r.name ?? 'Document'),
    kind: (r.kind as LibraryItem['kind']) ?? null,
    models: Array.isArray(r.models) ? (r.models as string[]) : [],
    slot: str(r.handover_slot),
    technologies: Array.isArray(r.technologies) ? (r.technologies as string[]) : [],
    every_pack: r.every_pack === true,
    details: r.details && typeof r.details === 'object' ? (r.details as LibraryItem['details']) : {},
    storage_path: String(r.storage_path ?? ''),
    compact_path: str(r.compact_path),
    mime: str(r.mime),
    size: num(r.size),
  };
}

/** The electrician on the job (the latest live one) with their sign-off and the customer's signatures. */
async function electricianOf(db: Db, projectId: string): Promise<{ facts: ElectricianFacts | null; state: Loaded['electrician'] }> {
  const { data: rows } = await db.from('site_assignments').select('*').eq('project_id', projectId).eq('trade', 'electrician').neq('status', 'cancelled').order('created_at', { ascending: false });
  const a = (rows ?? [])[0] as Record<string, unknown> | undefined;
  if (!a) return { facts: null, state: 'none' };
  const [{ data: contact }, { data: so }] = await Promise.all([
    db.from('site_contacts').select('*').eq('id', String(a.contact_id)).maybeSingle(),
    db.from('site_signoffs').select('*').eq('assignment_id', String(a.id)).eq('stage', 'main').maybeSingle(),
  ]);
  const values = valuesOf((a.answers ?? {}) as Answers);
  const extra = ((so?.extra ?? {}) as { customer?: Record<string, { name?: string; signed_at?: string; path?: string; declaration?: string | null }> }).customer ?? {};
  const customer: ElectricianFacts['customer'] = {};
  for (const k of ['f16e', 'g98'] as const) {
    const c = extra[k];
    if (c?.name && c.signed_at && c.path) customer[k] = { name: c.name, signed_at: c.signed_at, path: c.path, via: 'phone', declaration: c.declaration ?? null } satisfies CustomerSig;
  }
  const signed = !!so && (a.status === 'signed' || a.status === 'done');
  const nextN = num(values.eic_next);
  return {
    state: signed ? 'signed' : 'working',
    facts: {
      name: String(contact?.name ?? 'The electrician'),
      company: str(contact?.company),
      status: String(a.status),
      signedAt: signed ? String(so!.signed_at) : null,
      signedOn: signed ? ukDay(String(so!.signed_at)) : null,
      signaturePath: signed ? str(so!.signature_path) : null,
      values,
      customer,
      partPBy: contact?.part_p_by === 'self' || contact?.part_p_by === 'heliaxis' ? contact.part_p_by : null,
      certRef: str(values.CERT_NO),
      nextInspection: nextN ? `${nextN} ${values.eic_next_unit === 'months' ? 'months' : 'years'}` : null,
    },
  };
}

export async function loadHandover(db: Db, projectId: string): Promise<Loaded | null> {
  const { data: raw } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
  if (!raw) return null;
  const p = raw as Record<string, unknown>;
  const [{ data: c }, { data: owner }, { data: docRows }, { data: slotRows }, { data: packRow }, { data: libRows }, { data: payRows }, el, cal, settings, { data: survey }] = await Promise.all([
    db.from('enquiries').select('id, name, email, phone, postcode').eq('id', String(p.enquiry_id)).maybeSingle(),
    p.owner_id ? db.from('profiles').select('full_name').eq('id', String(p.owner_id)).maybeSingle() : Promise.resolve({ data: null }),
    db.from('crm_documents').select('*').eq('project_id', projectId).order('created_at'),
    db.from('handover_slots').select('*').eq('project_id', projectId),
    db.from('handover_packs').select('*').eq('project_id', projectId).maybeSingle(),
    db.from('crm_library').select('*').is('archived_at', null).order('name'),
    db.from('crm_payments').select('*').eq('project_id', projectId).order('paid_on'),
    electricianOf(db, projectId),
    calendarNow(),
    getHandoverSettings(),
    db.from('crm_surveys').select('id, answers').eq('project_id', projectId).eq('type', 'solar').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const docs = (docRows ?? []) as DocRow[];
  const slots = new Map(((slotRows ?? []) as SlotRow[]).map((s) => [s.slot, { ...s, data: (s.data ?? {}) as SlotData }]));
  const sys = (p.system ?? {}) as Record<string, unknown>;
  const paperwork = (p.paperwork ?? {}) as Record<string, string>;
  const products = Array.isArray(p.products) ? (p.products as string[]) : [];
  const job = projectRow(p);
  const deadlines = deadlinesFor(job, cal);
  const dueOf = (k: string) => deadlines.find((d) => d.key === k && !d.done)?.due ?? null;
  const install = str(p.install_at);
  const checklist = (p.checklist ?? {}) as Record<string, { done_at?: string; na?: boolean }>;
  const system: SystemFacts = {
    kwp: num(sys.kwp),
    panel_count: num(sys.panel_count),
    panel_model: str(sys.panel_model),
    inverter_model: str(sys.inverter_model),
    inverter_kw: num(sys.inverter_kw),
    battery_model: str(sys.battery_model),
    battery_kwh: num(sys.battery_kwh),
    ev_charger_model: str(sys.ev_charger_model),
    heat_pump_model: str(sys.heat_pump_model),
    heat_pump_kw: num(sys.heat_pump_kw),
    mpan: str(sys.mpan),
    export_limit_kw: num(sys.export_limit_kw),
    monitoring: str(sys.monitoring),
  };
  const libraryAll = ((libRows ?? []) as Record<string, unknown>[]).map(libraryItem);
  const data: HandoverFacts['data'] = {};
  for (const [k, s] of slots) if (isSlot(k) && s.data) data[k as SlotCode] = s.data;
  const current = docs.filter((d) => d.handover_slot && !d.archived_at);
  const name = String(c?.name ?? '');

  // The survey's shading notes and sun-path photo, for F48I.
  const shading = Array.isArray((survey?.answers as Record<string, unknown> | undefined)?.R12) ? ((survey!.answers as Record<string, unknown>).R12 as string[]).filter((k) => k !== 'none').map((k) => SHADING[k] ?? k) : [];
  const { data: sun } = survey ? await db.from('crm_photos').select('storage_path').eq('survey_id', String(survey.id)).eq('slot', 'R14').order('created_at').limit(1).maybeSingle() : { data: null };

  const facts: HandoverFacts = {
    today: cal.today,
    job: {
      id: projectId,
      ref: str(p.project_ref),
      title: String(p.title ?? ''),
      stage: String(p.stage ?? ''),
      products,
      addressLines: addressLines(str(p.address), str(p.postcode) ?? str(c?.postcode)),
      postcode: str(p.postcode) ?? str(c?.postcode),
      installDays: install ? installDayList(ukDay(install), Math.max(1, Number(p.install_days) || 1), cal.hols) : [],
      commissionedOn: str(p.commissioned_at) ? ukDay(String(p.commissioned_at)) : null,
      handedOverOn: str(p.handover_at) ? ukDay(String(p.handover_at)) : null,
      dno: { route: str(paperwork.dno_route), status: str(p.dno_status), ref: str(p.dno_ref), submittedAt: str(p.dno_submitted_at), notified: !!(checklist.c_dno_notified?.done_at || checklist.c_dno_notified?.na) },
      deposit: { amount: num(p.deposit_amount), paidAt: str(p.deposit_paid_at), ref: str(p.deposit_ref) },
    },
    customer: { name, first: name.split(/\s+/)[0] || '', email: str(c?.email), phone: str(c?.phone) },
    owner: { name: str((owner as { full_name?: string } | null)?.full_name) },
    system,
    design: designOf(sys),
    paperwork,
    electrician: el.facts,
    data,
    library: [],
    payments: ((payRows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      kind: r.kind as Payment['kind'],
      amount_pence: Number(r.amount_pence),
      paid_on: String(r.paid_on),
      method: r.method as Payment['method'],
      reference: str(r.reference),
    })),
    survey: { shading, sunPath: str((sun as { storage_path?: string } | null)?.storage_path) },
    made: [...new Set(current.map((d) => String(d.handover_slot)))],
    settings,
  };
  for (const plugin of PLUGINS) {
    const more = await plugin(db, projectId, facts).catch(() => null);
    if (more && facts.electrician) facts.electrician = { ...facts.electrician, ...more, values: { ...facts.electrician.values, ...(more.values ?? {}) } };
  }
  // The library matched to the job's models.
  facts.library = libraryFor(libraryAll, modelsOf(facts), products);

  const ids = [...new Set([...docs.map((d) => d.uploaded_by), ...[...slots.values()].map((s) => s.updated_by)].filter((x): x is string => !!x))];
  const { data: profs } = ids.length ? await db.from('profiles').select('id, full_name, email').in('id', ids) : { data: [] };
  const people = new Map(((profs ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((x) => [x.id, (x.full_name || x.email || 'Someone').split(/\s+/)[0]]));
  return {
    project: p,
    facts,
    docs,
    slots,
    pack: (packRow as PackRow | null) ?? null,
    electrician: el.state,
    due: { mcs: dueOf('mcs'), regs: dueOf('regs'), cc16: dueOf('cc16'), g98: dueOf('g98') },
    invoicePaid: facts.payments.some((x) => x.kind === 'final') || !!checklist.x_paid?.done_at,
    libraryAll,
    people,
  };
}

/** The pack's documents as the catalogue reads them (current ones, with the store's Out of date marks and F76's parts). */
export function slotDocs(l: Loaded): SlotDoc[] {
  return l.docs
    .filter((d) => d.handover_slot && isSlot(d.handover_slot) && d.handover_slot !== 'PACK' && !d.archived_at)
    .map((d) => {
      const data = l.slots.get(String(d.handover_slot))?.data;
      return {
        id: d.id,
        slot: String(d.handover_slot),
        name: d.name,
        source: d.source,
        key: d.generated_key,
        visible: !!d.visible,
        release: d.release ?? 'now',
        at: d.created_at,
        version: Number(d.version ?? 1),
        mime: d.mime,
        size: d.size,
        hash: d.inputs_hash,
        stale: !!data?.stale && data.stale.key === d.generated_key && data.stale.hash !== d.inputs_hash,
        part: data?.parts?.[d.id] ?? null,
        by: d.uploaded_by ? (l.people.get(d.uploaded_by) ?? null) : null,
      };
    });
}
