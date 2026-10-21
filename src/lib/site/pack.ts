import 'server-only';
import { createHash } from 'crypto';
import { installDayList, ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import { CRM_BUCKET, DOCS_BUCKET, thumbPath } from '@/lib/crm/server';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { canonicalJson } from '@/lib/subcontractors/hashing';
import { fieldIndex } from '@/lib/surveys/solar-schema';
import { designOf } from './design';
import { eicFacts } from './eic/facts';
import { siteShort } from './messages';
import type { PackFile, PackPhoto, PackPo, SitePack } from './pack-shared';
import { assignmentRow, type AssignmentRow, type Db } from './server';
import { getSiteSettings } from './settings';
import { jobStrip } from './strip';
import { firstNameOf, STATUS_LABEL, TRADE_LABEL, valuesOf, yesNo, type Stage } from './types';

/**
 * The job pack (GET /api/site/jobs/<id>/pack): everything a trade needs on site for one job, built
 * for their trade, downloaded once and kept on the phone. Never bank or ID details; the customer's
 * mobile only when the office shares it. Files come as short-lived links the phone downloads at
 * once. `version` is a hash of the details (not the answers), so the phone can say "Updated by the
 * office: start date, access notes" when it changes. A refresh never touches answers.
 */

const MAX_FILE = 10 * 1024 * 1024;
const LINK_SECONDS = 15 * 60;
const SIDES = ['front', 'rear', 'left', 'right'];

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A survey answer in words, from the survey's own options ("Side gate", "Front, Rear"). */
function surveyWords(id: string, v: unknown): string | null {
  const f = fieldIndex().get(id)?.field;
  if (v === null || v === undefined || v === '') return null;
  const label = (k: unknown) => f?.options?.find((o) => o.key === k)?.label ?? String(k);
  if (Array.isArray(v)) return v.length ? v.map(label).join(', ') : null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return `${v}${f?.unit ? ` ${f.unit}` : ''}`;
  return f?.options ? label(v) : String(v);
}

async function signed(db: Db, bucket: string, path: string): Promise<string | null> {
  const { data } = await db.storage.from(bucket).createSignedUrl(path, LINK_SECONDS);
  return data?.signedUrl ?? null;
}

/** A labour PO as the phone keeps it (the pack, and the sign-off's reply). */
export function packPo(po: Record<string, unknown>): PackPo {
  return {
    id: String(po.id),
    po_number: String(po.po_number),
    status: String(po.status),
    net_pence: Number(po.net_pence) || 0,
    vat_pence: Number(po.vat_pence) || 0,
    cis_pence: po.cis_pence == null ? null : Number(po.cis_pence),
    payable_pence: po.payable_pence == null ? null : Number(po.payable_pence),
    sent_at: (po.sent_at as string | null) ?? null,
    paid_on: (po.paid_on as string | null) ?? null,
    changed_since_sent: po.changed_since_sent === true,
    labour: (po.labour as Record<string, unknown> | null) ?? null,
  };
}

export async function buildPack(db: Db, a: AssignmentRow): Promise<SitePack> {
  const { data: p } = await db.from('crm_projects').select('*').eq('id', a.project_id).maybeSingle();
  const project = (p ?? {}) as Record<string, unknown>;
  const [{ data: cust }, { data: owner }, { data: others }, { data: surveys }, { data: photos }, { data: docs }, { data: signoffs }, { data: orders }, hols] = await Promise.all([
    db.from('enquiries').select('*').eq('id', String(project.enquiry_id ?? '')).maybeSingle(),
    project.owner_id ? db.from('profiles').select('full_name').eq('id', String(project.owner_id)).maybeSingle() : Promise.resolve({ data: null }),
    db.from('site_assignments').select('*').eq('project_id', a.project_id).neq('status', 'cancelled').order('created_at'),
    db.from('crm_surveys').select('*').eq('project_id', a.project_id).eq('type', 'solar').neq('status', 'cancelled').order('updated_at', { ascending: false }).limit(1),
    db.from('crm_photos').select('*').eq('assignment_id', a.id).order('created_at'),
    db.from('crm_documents').select('*').eq('project_id', a.project_id).eq('category', 'design').is('archived_at', null).order('created_at'),
    db.from('site_signoffs').select('stage, signed_at, signed_name').eq('assignment_id', a.id).order('signed_at'),
    db.from('purchase_orders').select('*').eq('assignment_id', a.id).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1),
    ukBankHolidays(),
  ]);
  const c = (cust ?? {}) as Record<string, unknown>;
  const team = (others ?? []).map(assignmentRow);
  const contactIds = [...new Set(team.map((t) => t.contact_id))];
  const { data: people } = contactIds.length ? await db.from('site_contacts').select('id, name').in('id', contactIds) : { data: [] };
  const nameOf = new Map(((people ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const survey = (surveys?.[0] ?? null) as { id: string; answers?: Record<string, unknown> } | null;
  const sa = (survey?.answers ?? {}) as Record<string, unknown>;
  const sys = (project.system ?? {}) as Record<string, unknown>;
  const design = designOf(sys);

  // Access and parking, from the survey (what the trade needs before they arrive).
  const access: { label: string; value: string }[] = [];
  for (const [id, label] of [
    ['S1', 'Scaffold on'],
    ['S6', 'Rear access'],
    ['S6w', 'Side gate width'],
    ['S7', 'Parking'],
    ['S3', 'Ground and obstacles'],
    ['S4', 'Scaffold on the pavement or road'],
    ['S5', 'Scaffold over a neighbour’s land'],
    ['S8', 'Site hazards'],
  ] as const) {
    if (a.trade !== 'scaffolder' && (id === 'S4' || id === 'S5')) continue;
    const v = surveyWords(id, sa[id]);
    if (v) access.push({ label, value: v });
  }
  const sides = Array.isArray(sa.S1) ? (sa.S1 as string[]).filter((s) => SIDES.includes(s)) : [];

  // Files: the roof layout drawing from the survey, the design documents, and (electricians) the survey's meter and cut-out photos.
  const files: PackFile[] = [];
  const skipped: string[] = [];
  if (survey) {
    const want = a.trade === 'electrician' ? ['R13', 'E1', 'E6'] : ['R13'];
    const { data: sp } = await db.from('crm_photos').select('*').eq('survey_id', survey.id);
    for (const ph of (sp ?? []) as Record<string, unknown>[]) {
      const slot = String(ph.slot ?? '').split(':')[0];
      if (!want.includes(slot)) continue;
      const path = String(ph.markup_path || ph.storage_path);
      const url = await signed(db, CRM_BUCKET, path);
      if (url) files.push({ id: String(ph.id), name: slot === 'R13' ? 'Roof layout' : slot === 'E1' ? 'Main cut-out (survey)' : 'Meter (survey)', kind: slot === 'R13' ? 'drawing' : 'photo', mime: 'image/jpeg', size: null, url });
    }
  }
  for (const d of (docs ?? []) as Record<string, unknown>[]) {
    const size = Number(d.size) || null;
    if (size && size > MAX_FILE) {
      skipped.push(`${d.name} is over 10 MB: ask the office for it.`);
      continue;
    }
    const url = await signed(db, DOCS_BUCKET, String(d.storage_path));
    if (url) files.push({ id: String(d.id), name: String(d.name), kind: 'design', mime: String(d.mime || 'application/pdf'), size, url });
  }

  // Photos the office already holds for this trade (so another phone, or a reinstall, sees them).
  const held: PackPhoto[] = [];
  for (const ph of (photos ?? []) as Record<string, unknown>[]) {
    const path = String(ph.storage_path);
    const [thumb, url] = await Promise.all([signed(db, CRM_BUCKET, thumbPath(path)), signed(db, CRM_BUCKET, path)]);
    const client = /\/([0-9a-f-]{36})\.[a-z]+$/i.exec(path)?.[1] ?? null;
    held.push({ id: String(ph.id), slot: String(ph.slot ?? ''), client_id: client, taken_at: (ph.taken_at as string | null) ?? null, thumb, url });
  }

  const { data: reads } = held.length ? await db.from('site_reads').select('photo_id, key, status, result').eq('assignment_id', a.id) : { data: [] };
  const po = (orders?.[0] ?? null) as Record<string, unknown> | null;
  const installDates = project.install_at ? installDayList(ukDay(String(project.install_at)), Number(project.install_days) || 1, hols) : [];
  const address = String(project.address ?? '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const postcode = str(project.postcode) ?? str(c.postcode);
  const answersOf = (t: AssignmentRow) => valuesOf(t.answers);
  const live = team.filter((t) => t.status !== 'cancelled');

  const details = {
    assignment: {
      id: a.id,
      trade: a.trade,
      title: a.trade === 'other' ? a.trade_label || TRADE_LABEL.other : TRADE_LABEL[a.trade],
      scope: a.scope,
      starts_on: a.starts_on,
      days: a.days,
      note_to_trade: a.note_to_trade,
      forms: a.forms,
      cert_route: a.cert_route,
      schema_version: a.schema_version,
    },
    job: {
      ref: str(project.project_ref) ?? str(c.customer_ref),
      address,
      short: siteShort(String(project.address ?? ''), postcode),
      postcode,
      map: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([...address, postcode].filter(Boolean).join(', '))}`,
      customer: { name: String(c.name ?? ''), first: firstNameOf(String(c.name ?? '')), phone: a.share_customer_phone ? str(c.phone) : null },
      install_dates: installDates,
      scaffold_up_on: str(project.scaffold_up_on),
      scaffold_down_on: str(project.scaffold_down_on),
      products: (Array.isArray(project.products) ? project.products : []) as string[],
    },
    office: { phone: HELIAXIS_COMPANY.phone, email: HELIAXIS_COMPANY.email, owner: firstNameOf((owner as { full_name?: string } | null)?.full_name) || null },
    team: live.map((t) => ({
      trade: t.trade,
      title: t.trade === 'other' ? t.trade_label || TRADE_LABEL.other : TRADE_LABEL[t.trade],
      name: firstNameOf(nameOf.get(t.contact_id)) || TRADE_LABEL[t.trade],
      status: t.status,
      status_label: STATUS_LABEL[t.status] ?? t.status,
      starts_on: t.starts_on,
      me: t.id === a.id,
    })),
    access,
    system: { kwp: num(sys.kwp), panel_count: num(sys.panel_count), panel_model: str(sys.panel_model), inverter_model: str(sys.inverter_model), battery_model: str(sys.battery_model) },
    design,
    sides,
    files: files.map((f) => ({ id: f.id, name: f.name })),
  };
  const version = createHash('sha256').update(canonicalJson(details)).digest('hex').slice(0, 16);
  const strip = jobStrip({
    scaffold: live.filter((t) => t.trade === 'scaffolder').map((t) => ({ status: t.status, tagged: yesNo(answersOf(t).SC3), struck: t.status === 'done' })),
    roof: live.filter((t) => t.trade === 'roofer').map((t) => ({ status: t.status })),
    electrics: live.filter((t) => t.trade === 'electrician').map((t) => ({ status: t.status })),
    scaffold_up_on: str(project.scaffold_up_on),
    handover_at: str(project.handover_at),
  });
  return {
    version,
    at: new Date().toISOString(),
    ...details,
    assignment: {
      ...details.assignment,
      status: a.status,
      rev: a.rev,
      answers: a.answers,
      flags: a.flags,
      signoffs: ((signoffs ?? []) as { stage: Stage; signed_at: string; signed_name: string }[]).map((s) => ({ stage: s.stage, signed_at: s.signed_at, signed_name: s.signed_name })),
    },
    strip,
    files,
    skipped,
    photos: held,
    po: po ? packPo(po) : null,
    reads: (reads ?? []) as SitePack['reads'],
    settings: { locationStamps: (await getSiteSettings()).locationStamps },
    ...(a.trade === 'electrician' ? { eic: await eicFacts(db, a, project) } : {}),
  };
}
