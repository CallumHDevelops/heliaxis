import 'server-only';
import { PDFDocument } from 'pdf-lib';
import { ukDay } from '@/lib/bank-holidays';
import { CRM_BUCKET, DOCS_BUCKET } from '@/lib/crm/server';
import { EIC_REVISION, eicPdf, type Attachment, type SigImage } from '@/lib/documents/eic/eic';
import { meiwcPdf } from '@/lib/documents/eic/meiwc';
import { docFileName, MissingAnswer } from '@/lib/documents/pdf-kit';
import { currentGenerated, isOutOfDate, saveGenerated, type GeneratedDoc } from '@/lib/documents/store';
import { IET_GUIDANCE } from '../fixed/iet-guidance';
import { IET_MEIWC } from '../fixed/iet-meiwc';
import { EIC_CHECKED_AGAINST_A4 } from '../fixed/iet-eic';
import { serverCtx } from '../form-ctx';
import { certMissing, designOf, type DesignSign } from '../forms/electrician/eic';
import { editionOf, officeRoute, routeOf, type CertRoute } from '../forms/electrician/eic-model';
import { meiwcList } from '../forms/electrician/meiwc';
import type { FormCtx } from '../forms/types';
import type { Missing } from '../rules';
import { readAssignment, type AssignmentRow, type Db } from '../server';

/**
 * The certificate on the server: what it's made from (the answers, the signatures as they reached
 * the server, the office's design signature), the PDFs (the EIC, or a Minor Works sheet per circuit)
 * and where they're filed (SPEC 3.3):
 *
 * - The EIC is final once the electrician has signed off and, for the three-part EIC, the office has
 *   signed the design part. Final: generated key EIC (EIC2 for a second electrician), handover slot
 *   HX-HO-04, held until the pack is sent (release 'with_pack'), the battery location statement
 *   (HX-BAT-04) appended when there is one. Before
 *   that it's a draft (EIC_DRAFT): on the job's Docs, never in the pack or the customer's portal.
 * - Minor Works sheets (MEIWC-1, -2…) are filed as certificates but not into HX-HO-04 while their wording
 *   is unverified: the electrician's own signed Minor Works goes there instead.
 * - Their own certificate (route 'own') is Unit 2's upload; nothing is made here.
 */

export const SIG_SLOTS = ['eic_sig_con', 'eic_sig_ins', 'eic_sig_one'] as const;
/** Photos the form asks to be attached, printed on continuation sheets: the risk assessment (C), the main switch's settings (G). */
export const ATTACH_SLOTS = ['eic_exc_ra', 'eic_ms_settings'] as const;
const SIGNED_URL_SECONDS = 600;

type Photo = { id: string; slot: string; storage_path: string; taken_at: string | null; created_at: string };

async function download(db: Db, bucket: string, path: string): Promise<Uint8Array | null> {
  const { data } = await db.storage.from(bucket).download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/** The generated keys for this assignment's certificate: EIC / EIC2…, from its reference. */
export function certKey(ref: string | null): string {
  return /-(EIC\d*)$/.exec(ref ?? '')?.[1] ?? 'EIC';
}

export type CertificateData = {
  a: AssignmentRow;
  ctx: FormCtx;
  route: CertRoute;
  ref: string | null;
  key: string;
  jobRef: string | null;
  address: string;
  issued: string;
  signoff: { id: string; signed_at: string; signed_name: string } | null;
  photos: Partial<Record<(typeof SIG_SLOTS)[number], Photo>>;
  /** Every photo in each attachment slot, oldest first. */
  attached: Partial<Record<(typeof ATTACH_SLOTS)[number], Photo[]>>;
  design: DesignSign | null;
};

/** Everything the certificate is made from, as the server holds it. */
export async function certificateData(db: Db, a: AssignmentRow): Promise<CertificateData> {
  const [ctx, { data: p }, { data: so }, { data: ph }] = await Promise.all([
    serverCtx(db, a),
    db.from('crm_projects').select('project_ref, address, postcode').eq('id', a.project_id).maybeSingle(),
    db.from('site_signoffs').select('id, signed_at, signed_name').eq('assignment_id', a.id).eq('stage', 'main').maybeSingle(),
    db.from('crm_photos').select('id, slot, storage_path, taken_at, created_at').eq('assignment_id', a.id).in('slot', [...SIG_SLOTS, ...ATTACH_SLOTS]).order('created_at'),
  ]);
  const photos: CertificateData['photos'] = {};
  const attached: CertificateData['attached'] = {};
  for (const x of (ph ?? []) as Photo[]) {
    if ((ATTACH_SLOTS as readonly string[]).includes(x.slot)) (attached[x.slot as (typeof ATTACH_SLOTS)[number]] ??= []).push(x);
    // The latest signature in each place (an earlier one taken off and signed again is gone already).
    else photos[x.slot as (typeof SIG_SLOTS)[number]] = x;
  }
  const project = (p ?? {}) as { project_ref?: string | null };
  const signoff = (so as CertificateData['signoff']) ?? null;
  return {
    a,
    ctx,
    route: routeOf(ctx),
    ref: ctx.eic?.ref ?? null,
    key: certKey(ctx.eic?.ref ?? null),
    jobRef: project.project_ref ?? null,
    address: ctx.address,
    issued: ukDay(signoff?.signed_at ?? new Date()),
    signoff,
    photos,
    attached,
    design: designOf(ctx),
  };
}

/** The electrician's parts are in, they've signed off, and (three-part EIC) the design part is signed. */
export const isFinal = (d: CertificateData) => !!d.signoff && !certMissing(d.ctx).length && (d.route !== 'eic' || !!d.design);

/** What a certificate's inputs hash is made from: its own answers, the signatures and the design part. */
function inputsOf(d: CertificateData, extra: Record<string, unknown> = {}) {
  const answers = Object.fromEntries(Object.entries(d.ctx.values).filter(([k]) => k.startsWith('eic_')));
  return {
    route: d.route,
    ref: d.ref,
    address: d.address,
    issued: d.issued,
    edition: editionOf(d.ctx),
    answers,
    photos: Object.fromEntries(Object.entries(d.photos).map(([k, x]) => [k, x?.id ?? null])),
    attached: Object.fromEntries(Object.entries(d.attached).map(([k, xs]) => [k, (xs ?? []).map((x) => x.id)])),
    signoff: d.signoff?.id ?? null,
    // The form it's printed on: a change of wording or layout makes it out of date (Make it again).
    wording: { a4: EIC_CHECKED_AGAINST_A4, layout: EIC_REVISION, guidance: IET_GUIDANCE.verified, meiwc: IET_MEIWC.verified },
    ...extra,
  };
}

async function sigOf(db: Db, x: Photo | undefined): Promise<SigImage> {
  if (!x) return { png: null, at: null };
  return { png: await download(db, CRM_BUCKET, x.storage_path), at: x.taken_at ?? x.created_at };
}

export type Made = { key: string; name: string; bytes: Uint8Array; inputs: unknown; final: boolean; missing: string | null };

/** The EIC as it stands (final when it can be; a draft otherwise, or when a must turns out empty). */
export async function makeEic(db: Db, d: CertificateData, statement: GeneratedDoc | null = null): Promise<Made> {
  const [con, ins, one, designPng, attachments] = await Promise.all([
    sigOf(db, d.photos.eic_sig_con),
    sigOf(db, d.photos.eic_sig_ins),
    sigOf(db, d.photos.eic_sig_one),
    d.design ? download(db, DOCS_BUCKET, d.design.path) : Promise.resolve(null),
    attachmentsOf(db, d),
  ]);
  const input = {
    route: d.route === 'eic_single' ? ('eic_single' as const) : ('eic' as const),
    ref: d.ref,
    jobRef: d.jobRef,
    issued: d.issued,
    edition: editionOf(d.ctx),
    values: d.ctx.values,
    address: d.address,
    sig: { con, ins, one },
    design: d.design ? { ...d.design, png: designPng } : null,
    attachments,
  };
  // One form for both routes: a single signatory signs in each place (the form's Note 3).
  const title = 'Electrical Installation Certificate';
  let final = isFinal(d);
  let missing: string | null = null;
  let bytes: Uint8Array;
  try {
    bytes = await eicPdf({ ...input, draft: !final });
  } catch (e) {
    if (!(e instanceof MissingAnswer)) throw e;
    // A must the gate didn't hold (the job's address cleared since): a draft, saying what's missing.
    final = false;
    missing = e.label;
    bytes = await eicPdf({ ...input, draft: true });
  }
  if (final && statement) bytes = await appendPdf(db, bytes, statement.storage_path);
  return { key: final ? d.key : `${d.key}_DRAFT`, name: docFileName(d.jobRef, d.key, `${title}${final ? '' : ' (draft)'}`), bytes, inputs: inputsOf(d, { design: d.design, statement: statement?.inputs_hash ?? null }), final, missing };
}

/** The Minor Works sheets, one per circuit. */
export async function makeMeiwcs(db: Db, d: CertificateData): Promise<Made[]> {
  const sig = await sigOf(db, d.photos.eic_sig_one);
  const out: Made[] = [];
  for (const m of meiwcList(d.ctx)) {
    const input = { ref: m.ref, jobRef: d.jobRef, issued: d.issued, edition: editionOf(d.ctx), values: d.ctx.values, address: d.address, circuit: m.circuit, name: m.name, sig };
    let final = !!d.signoff && !certMissing(d.ctx).length;
    let missing: string | null = null;
    let bytes: Uint8Array;
    try {
      bytes = await meiwcPdf({ ...input, draft: !final });
    } catch (e) {
      if (!(e instanceof MissingAnswer)) throw e;
      final = false;
      missing = e.label;
      bytes = await meiwcPdf({ ...input, draft: true });
    }
    const key = d.key === 'EIC' ? m.key : m.key.replace('MEIWC', `MEIWC${d.key.slice(3)}`);
    const title = IET_MEIWC.verified ? `Minor Works ${m.name}` : `Minor Works data sheet ${m.name}`;
    out.push({ key, name: docFileName(d.jobRef, '', title), bytes, inputs: inputsOf(d, { circuit: m.circuit.id }), final, missing });
  }
  return out;
}

/** The attached photos as the server holds them (a photo that can't be read is left out). */
async function attachmentsOf(db: Db, d: CertificateData): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const slot of ATTACH_SLOTS) {
    for (const x of d.attached[slot] ?? []) {
      const bytes = await download(db, CRM_BUCKET, x.storage_path);
      if (bytes) out.push({ slot, bytes });
    }
  }
  return out;
}

/** Another PDF's pages after this one's (the battery location statement after the EIC). The EIC alone when it can't be read. */
async function appendPdf(db: Db, bytes: Uint8Array, path: string): Promise<Uint8Array> {
  const extra = await download(db, DOCS_BUCKET, path);
  if (!extra) return bytes;
  try {
    const doc = await PDFDocument.load(bytes);
    const add = await PDFDocument.load(extra);
    for (const pg of await doc.copyPages(add, add.getPageIndices())) doc.addPage(pg);
    return await doc.save();
  } catch {
    return bytes;
  }
}

/**
 * Make and file the certificate (after the electrician's sign-off, and again when the office signs the
 * design part): a new version only when what it's made from changed (saveGenerated). The final EIC
 * archives the draft. Returns what was filed.
 */
export async function saveCertificate(
  db: Db,
  assignmentId: string,
  by: string | null = null,
  opt: { force?: boolean } = {}
): Promise<{ route: CertRoute; saved: { key: string; status: string; final: boolean; missing: string | null }[] } | null> {
  const a = await readAssignment(db, assignmentId);
  if (!a || a.trade !== 'electrician' || a.status === 'cancelled') return null;
  const d = await certificateData(db, a);
  if (d.route === 'own') return { route: d.route, saved: [] };
  const saved: { key: string; status: string; final: boolean; missing: string | null }[] = [];
  if (d.route === 'meiwc') {
    for (const m of await makeMeiwcs(db, d)) {
      const r = await saveGenerated(db, a.project_id, {
        key: m.key,
        name: m.name,
        bytes: m.bytes,
        inputs: m.inputs,
        category: 'certificate',
        slot: m.final && IET_MEIWC.verified ? 'HX-HO-04' : null,
        release: m.final && IET_MEIWC.verified ? 'with_pack' : 'now',
        visible: false,
        force: opt.force,
        by,
      });
      saved.push({ key: m.key, status: r.status, final: m.final, missing: m.missing });
    }
    return { route: d.route, saved };
  }
  const statement = await currentGenerated(db, a.project_id, 'HX-BAT-04');
  const m = await makeEic(db, d, statement);
  const r = await saveGenerated(db, a.project_id, {
    key: m.key,
    name: m.name,
    bytes: m.bytes,
    inputs: m.inputs,
    category: 'certificate',
    slot: m.final ? 'HX-HO-04' : null,
    release: m.final ? 'with_pack' : 'now',
    visible: false,
    force: opt.force,
    by,
  });
  saved.push({ key: m.key, status: r.status, final: m.final, missing: m.missing });
  // The final certificate replaces the draft on the job's documents (kept, archived).
  if (m.final && r.status === 'saved') {
    const draft = await currentGenerated(db, a.project_id, `${d.key}_DRAFT`);
    if (draft) await db.from('crm_documents').update({ archived_at: new Date().toISOString(), archived_by: by, visible: false }).eq('id', draft.id);
  }
  return { route: d.route, saved };
}

/* ── Where it stands (the Site tab, the handover pack's HX-HO-04, the gate) ─── */

export type CertState = 'own' | 'not_started' | 'in_progress' | 'to_sign_off' | 'to_design' | 'complete' | 'data_sheet';
export type CertStatus = {
  route: CertRoute;
  office_route: CertRoute;
  ref: string | null;
  /** The BS 7671 edition it's to ("A4:2026"). */
  edition: string;
  state: CertState;
  /** What the electrician still has to do for it. */
  missing: Missing[];
  signed: { at: string; name: string } | null;
  design: { name: string; signed_at: string; next: string } | null;
  /** The electrician's permitted exceptions (Reg 411.3.3): they print in the design part, so the designer checks them before signing. */
  exceptions: { text: string; photos: number } | null;
  /** The filed certificate; `stale`: what it's made from has changed since (Make it again). */
  doc: { id: string; name: string; version: number; final: boolean; url: string | null; stale: boolean; visible: boolean } | null;
  /** The Minor Works sheets. */
  sheets: { id: string; name: string; url: string | null }[];
  /**
   * Notify building control (SPEC 3.4): who notifies (the electrician through their own scheme, or
   * Heliaxis), the copy fields, and what's been recorded (paperwork.building_regs_on / _ref).
   */
  notify: {
    who: 'self' | 'heliaxis' | null;
    contact_id: string;
    contact: string;
    scheme: string | null;
    scheme_number: string | null;
    address: string;
    work: string | null;
    completed: string | null;
    reference: string | null;
    notified_on: string | null;
    notified_ref: string | null;
  };
};

/** Has what the filed EIC is made from changed since (an answer, a signature, the design part, a draft that can now be final)? */
async function staleness(db: Db, d: CertificateData, doc: GeneratedDoc): Promise<boolean> {
  if (doc.generated_key !== d.key && isFinal(d)) return true;
  const statement = doc.generated_key === d.key ? await currentGenerated(db, d.a.project_id, 'HX-BAT-04') : null;
  return isOutOfDate(doc, inputsOf(d, { design: d.design, statement: statement?.inputs_hash ?? null }));
}

async function linkOf(db: Db, doc: GeneratedDoc | null): Promise<string | null> {
  if (!doc) return null;
  const { data } = await db.storage.from(DOCS_BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS, { download: doc.name });
  return data?.signedUrl ?? null;
}

export async function certificateStatus(db: Db, a: AssignmentRow): Promise<CertStatus> {
  const d = await certificateData(db, a);
  const missing = d.route === 'own' ? [] : certMissing(d.ctx);
  const started = Object.keys(d.ctx.values).some((k) => k.startsWith('eic_') && k !== 'eic_design');
  const final = d.route === 'meiwc' ? null : await currentGenerated(db, a.project_id, d.key);
  const draft = final ? null : d.route === 'meiwc' ? null : await currentGenerated(db, a.project_id, `${d.key}_DRAFT`);
  const sheets: CertStatus['sheets'] = [];
  if (d.route === 'meiwc') {
    for (const m of meiwcList(d.ctx)) {
      const key = d.key === 'EIC' ? m.key : m.key.replace('MEIWC', `MEIWC${d.key.slice(3)}`);
      const doc = await currentGenerated(db, a.project_id, key);
      if (doc) sheets.push({ id: doc.id, name: doc.name, url: await linkOf(db, doc) });
    }
  }
  const state: CertState =
    d.route === 'own'
      ? 'own'
      : !started
        ? 'not_started'
        : missing.length
          ? 'in_progress'
          : !d.signoff
            ? 'to_sign_off'
            : d.route === 'meiwc'
              ? IET_MEIWC.verified
                ? 'complete'
                : 'data_sheet'
              : d.route === 'eic' && !d.design
                ? 'to_design'
                : 'complete';
  const doc = final ?? draft;
  const [{ data: person }, { data: proj }] = await Promise.all([
    db.from('site_contacts').select('name, part_p_by, scheme, scheme_number').eq('id', a.contact_id).maybeSingle(),
    db.from('crm_projects').select('paperwork').eq('id', a.project_id).maybeSingle(),
  ]);
  const pp = (person ?? {}) as { name?: string; part_p_by?: 'self' | 'heliaxis' | null; scheme?: string | null; scheme_number?: string | null };
  const paper = ((proj as { paperwork?: Record<string, unknown> } | null)?.paperwork ?? {}) as Record<string, unknown>;
  const work = typeof d.ctx.values.eic_desc === 'string' ? (d.ctx.values.eic_desc as string) : meiwcList(d.ctx).map((m) => String(m.circuit.work ?? m.name)).join('; ') || null;
  return {
    route: d.route,
    office_route: officeRoute(d.ctx),
    ref: d.ref,
    edition: editionOf(d.ctx),
    state,
    missing,
    signed: d.signoff ? { at: d.signoff.signed_at, name: d.signoff.signed_name } : null,
    design: d.design ? { name: d.design.name, signed_at: d.design.signed_at, next: `${d.design.next_n} ${d.design.next_unit}` } : null,
    exceptions:
      d.ctx.values.eic_exc === 'yes' ? { text: typeof d.ctx.values.eic_exc_what === 'string' ? d.ctx.values.eic_exc_what : '', photos: d.attached.eic_exc_ra?.length ?? 0 } : null,
    doc: doc ? { id: doc.id, name: doc.name, version: doc.version, final: !!final, url: await linkOf(db, doc), stale: await staleness(db, d, doc), visible: doc.visible } : null,
    sheets,
    notify: {
      who: pp.part_p_by ?? null,
      contact_id: a.contact_id,
      contact: pp.name ?? '',
      scheme: pp.scheme ?? null,
      scheme_number: pp.scheme_number ?? null,
      address: d.address,
      work,
      completed: d.signoff ? ukDay(d.signoff.signed_at) : null,
      reference: d.ref,
      notified_on: typeof paper.building_regs_on === 'string' ? paper.building_regs_on : null,
      notified_ref: typeof paper.building_regs_ref === 'string' ? paper.building_regs_ref : null,
    },
  };
}

/** The certificate as it would be made now, for the office to look at (not filed). */
export async function previewCertificate(db: Db, a: AssignmentRow): Promise<{ name: string; bytes: Uint8Array } | null> {
  const d = await certificateData(db, a);
  if (d.route === 'own') return null;
  if (d.route === 'meiwc') {
    const list = await makeMeiwcs(db, d);
    if (!list.length) return null;
    if (list.length === 1) return { name: list[0].name, bytes: list[0].bytes };
    const all = await PDFDocument.create();
    for (const m of list) {
      const one = await PDFDocument.load(m.bytes);
      for (const pg of await all.copyPages(one, one.getPageIndices())) all.addPage(pg);
    }
    return { name: docFileName(d.jobRef, '', 'Minor Works data sheets'), bytes: await all.save() };
  }
  const m = await makeEic(db, d);
  return { name: m.name, bytes: m.bytes };
}
