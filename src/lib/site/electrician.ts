import 'server-only';
import { CRM_BUCKET, DOCS_BUCKET, thumbPath } from '@/lib/crm/server';
import { ROOFER_EVIDENCE, rooferValues, type CustomerSigned, type CustomerSignKind, type ElectricianPack, type TradeFile } from './electrician-shared';
import type { LabelReadResult } from './forms/types';
import { assignmentRow, type AssignmentRow, type Db } from './server';
import { getSiteSettings } from './settings';
import { firstNameOf } from './types';

/**
 * The electrician's part of the job pack and of the rules' context on the server (SPEC 2.2): the
 * roofer's synced answers and what Claude read from their photos (strings, panels per string, panel
 * model, Voc, the badge's Isc and Wp, optimisers and the layout plan's serials), the job's DNO route
 * and design extras, this person's scheme and last instruments, the certificate files they've
 * uploaded, and the customer's signatures taken on their phone. With `links`, short-lived links for
 * the roofer's evidence thumbnails and the files (the phone downloads them at once).
 */

const LINK_SECONDS = 15 * 60;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Where a trade's uploaded file lives: crm-docs projects/<job>/site/<assignment>/<slot>/<phone's id>-<name>. */
export const tradeFilePath = (projectId: string, assignmentId: string, slot: string, clientId: string, name: string) =>
  `projects/${projectId}/site/${assignmentId}/${slot.replace(':', '_')}/${clientId.toLowerCase()}-${name.replace(/[^\w.\- ]+/g, '_').slice(0, 80)}`;
const FILE_PATH = /\/site\/[0-9a-f-]{36}\/([A-Za-z0-9_]+)\/([0-9a-f-]{36})-[^/]+$/i;

/** This assignment's uploaded files (their own certificate), newest last. */
export async function tradeFiles(db: Db, a: Pick<AssignmentRow, 'id' | 'project_id'>, links = false): Promise<(TradeFile & { storage_path: string })[]> {
  const { data } = await db
    .from('crm_documents')
    .select('id, name, mime, storage_path, created_at')
    .eq('project_id', a.project_id)
    .like('storage_path', `projects/${a.project_id}/site/${a.id}/%`)
    .is('archived_at', null)
    .order('created_at');
  const out: (TradeFile & { storage_path: string })[] = [];
  for (const d of (data ?? []) as { id: string; name: string; mime: string | null; storage_path: string }[]) {
    const m = FILE_PATH.exec(d.storage_path);
    if (!m) continue;
    let url: string | null = null;
    if (links) url = (await db.storage.from(DOCS_BUCKET).createSignedUrl(d.storage_path, LINK_SECONDS)).data?.signedUrl ?? null;
    out.push({ id: d.id, slot: m[1], name: d.name, mime: d.mime || 'application/pdf', client_id: m[2].toLowerCase(), url, storage_path: d.storage_path });
  }
  return out;
}

/** The customer's signatures taken after the electrician's sign-off (site_signoffs.extra.customer). */
export async function customerSigns(db: Db, assignmentId: string): Promise<Partial<Record<CustomerSignKind, CustomerSigned & { path: string }>>> {
  const { data } = await db.from('site_signoffs').select('extra').eq('assignment_id', assignmentId).eq('stage', 'main').maybeSingle();
  const c = ((data?.extra as Record<string, unknown> | null)?.customer ?? {}) as Partial<Record<CustomerSignKind, CustomerSigned & { path: string }>>;
  return c && typeof c === 'object' ? c : {};
}

export async function electricianPack(db: Db, a: AssignmentRow, project: Record<string, unknown>, survey: Record<string, unknown> | null, opts: { links?: boolean } = {}): Promise<ElectricianPack> {
  const sys = (project.system ?? {}) as Record<string, unknown>;
  const paper = (project.paperwork ?? {}) as Record<string, unknown>;
  const [{ data: roofers }, { data: contact }, { data: cust }, settings, uploads, customer] = await Promise.all([
    db.from('site_assignments').select('*').eq('project_id', a.project_id).eq('trade', 'roofer').neq('status', 'cancelled').order('created_at'),
    db.from('site_contacts').select('name, scheme, scheme_number, instruments').eq('id', a.contact_id).maybeSingle(),
    db.from('enquiries').select('name').eq('id', String(project.enquiry_id ?? '')).maybeSingle(),
    getSiteSettings(),
    tradeFiles(db, a, !!opts.links),
    customerSigns(db, a.id),
  ]);
  // The roofer with the most to say (normally the only one).
  const rows = ((roofers ?? []) as Record<string, unknown>[]).map(assignmentRow);
  const roofer = rows.sort((x, y) => Object.keys(y.answers).length - Object.keys(x.answers).length)[0] ?? null;
  let rooferPart: ElectricianPack['facts']['roofer'] = null;
  const rooferPhotos: ElectricianPack['roofer_photos'] = [];
  if (roofer) {
    const [{ data: reads }, { data: photos }] = await Promise.all([
      db.from('site_reads').select('key, status, result').eq('assignment_id', roofer.id),
      db.from('crm_photos').select('id, slot, storage_path').eq('assignment_id', roofer.id).order('created_at'),
    ]);
    const counts: Record<string, number> = {};
    for (const p of (photos ?? []) as { id: string; slot: string | null; storage_path: string }[]) {
      if (!p.slot) continue;
      counts[p.slot] = (counts[p.slot] ?? 0) + 1;
      if (ROOFER_EVIDENCE.includes(p.slot)) {
        const thumb = opts.links ? ((await db.storage.from(CRM_BUCKET).createSignedUrl(thumbPath(p.storage_path), LINK_SECONDS)).data?.signedUrl ?? null) : null;
        rooferPhotos.push({ id: p.id, slot: p.slot, thumb });
      }
    }
    rooferPart = {
      status: roofer.status,
      values: rooferValues(roofer.answers),
      reads: ((reads ?? []) as { key: string; status: string; result: LabelReadResult | null }[]).map((r) => ({ key: r.key, status: r.status, result: r.result })),
      photos: counts,
    };
  }
  const person = contact as { name?: string; scheme?: string | null; scheme_number?: string | null; instruments?: unknown } | null;
  const last = Array.isArray(person?.instruments) ? (person!.instruments as { text?: unknown }[]).find((x) => typeof x?.text === 'string') : null;
  return {
    facts: {
      customer_first: firstNameOf(String((cust as { name?: string } | null)?.name ?? '')),
      dno_route: str(paper.dno_route),
      dno_ref: str(project.dno_ref),
      export_limit_kw: num(sys.export_limit_kw),
      inverter_kw: num(sys.inverter_kw),
      battery_kwh: num(sys.battery_kwh),
      ev_model: str(sys.ev_charger_model),
      heat_pump_model: str(sys.heat_pump_model),
      survey_battery_spot: str(survey?.F5),
      roofer: rooferPart,
      voc_tolerance: settings.vocTolerancePct,
      instruments: last ? String(last.text) : null,
      name: str(person?.name),
      scheme: str(person?.scheme),
      scheme_number: str(person?.scheme_number),
    },
    roofer_photos: rooferPhotos,
    uploads: uploads.map((f) => ({ id: f.id, slot: f.slot, name: f.name, mime: f.mime, client_id: f.client_id, url: f.url })),
    customer: Object.fromEntries(Object.entries(customer).map(([k, v]) => [k, { name: v!.name, signed_at: v!.signed_at }])),
    g98: str(paper.dno_route) === 'g98',
  };
}
