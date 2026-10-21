import 'server-only';
import { PDFDocument } from 'pdf-lib';
import { ukDay } from '@/lib/bank-holidays';
import { CRM_BUCKET, DOCS_BUCKET } from '@/lib/crm/server';
import { A4, docFileName, stampWords, type Variant } from '@/lib/documents/pdf-kit';
import type { ElectricianDocInput } from '@/lib/documents/site/common';
import { BAT_INSPECT_TITLE, BAT_TESTS_TITLE, makeBatteryInspection, makeBatteryTests } from '@/lib/documents/site/battery';
import { makePhotoRecord, type RecordDeclaration, type RecordSlot } from '@/lib/documents/site/photo-record';
import { PV_INSPECT_TITLE, makePvInspect } from '@/lib/documents/site/pv-inspect';
import { PV_SWITCHON_TITLE, makePvSwitchOn } from '@/lib/documents/site/pv-switch-on';
import { PV_TEST_TITLE, makePvTests } from '@/lib/documents/site/pv-tests';
import { makeEvRecord, makeHpRecord } from '@/lib/documents/site/records';
import { inputsHash, saveGenerated, type Reprint, type SaveResult, type StoredRef } from '@/lib/documents/store';
import { tradeFiles } from './electrician';
import { serverCtx } from './form-ctx';
import { schemaFor } from './forms';
import { routeOf as certRouteOf } from './forms/electrician/cert';
import { EV_TITLE } from './forms/electrician/ev';
import { HP_TITLE } from './forms/electrician/heatpump';
import { SCAN_KEYS } from './forms/electrician/serials';
import { captures } from './forms/electrician/shared';
import type { Field } from './forms/types';
import { isPutRightSlot } from './review-shared';
import { readAssignment, type AssignmentRow, type Db } from './server';

/**
 * The electrician's paperwork (SPEC 2.13 item 6, 2.14), made after the sign-off's reply and stored
 * against the job with saveGenerated: HX-PV-01 to HX-PV-03 (solar), HX-BAT-01 and HX-BAT-02
 * (battery), the EV and heat pump records (HX-EV-01, HX-HP-01), each in its handover pack item, held
 * back until the pack goes (release with_pack). File names carry the title, not the code. A
 * certificate uploaded as photos of its pages becomes one PDF in HX-HO-04. The photo record is made
 * only when the office asks. Each is a new version only when what it's made from changed.
 */

type DocDef = {
  /** The generated document's key, its code (HX-PV-01…). */
  key: string;
  title: string;
  /** The handover pack item (handover/slots.ts): its own code, or HX-HO-19 for the EV and heat pump records. */
  slot: string;
  section: string;
  products: string[];
  make: (d: ElectricianDocInput) => Promise<Uint8Array>;
};

export const ELECTRICIAN_DOCS: DocDef[] = [
  { key: 'HX-PV-01', title: PV_INSPECT_TITLE, slot: 'HX-PV-01', section: 'pvinspect', products: ['solar'], make: makePvInspect },
  { key: 'HX-PV-02', title: PV_TEST_TITLE, slot: 'HX-PV-02', section: 'pvtests', products: ['solar'], make: makePvTests },
  { key: 'HX-PV-03', title: PV_SWITCHON_TITLE, slot: 'HX-PV-03', section: 'pvswitchon', products: ['solar'], make: makePvSwitchOn },
  { key: 'HX-BAT-01', title: BAT_INSPECT_TITLE, slot: 'HX-BAT-01', section: 'battery', products: ['battery'], make: makeBatteryInspection },
  { key: 'HX-BAT-02', title: BAT_TESTS_TITLE, slot: 'HX-BAT-02', section: 'battery', products: ['battery'], make: makeBatteryTests },
  { key: 'HX-EV-01', title: EV_TITLE, slot: 'HX-HO-19', section: 'ev', products: ['ev'], make: makeEvRecord },
  { key: 'HX-HP-01', title: HP_TITLE, slot: 'HX-HO-19', section: 'heatpump', products: ['heatpump'], make: makeHpRecord },
];
/** Answers the office writes on the assignment (eic/design.ts), not the electrician: left out of what their documents are hashed on. */
const OFFICE_KEYS = ['eic_design'];
/** The one document that prints the job's Building Control reference (the PV inspection's Paperwork note). */
const PRINTS_BUILDING_REF = new Set(['HX-PV-01']);
/**
 * What one document is hashed on: the shared inputs, with the Building Control reference only for the
 * document that prints it. The office records that reference after the sign-off, so the others never
 * go out of date for it, and their print versions still open.
 */
const docInputs = (key: string, inputs: Record<string, unknown>) => ({ doc: key, ...inputs, buildingRef: PRINTS_BUILDING_REF.has(key) ? (inputs.buildingRef ?? null) : null });
/** Every generated document key an electrician's sign-off can make (the review drawer lists them). */
export const ELECTRICIAN_DOC_KEYS = [...ELECTRICIAN_DOCS.map((d) => d.key), 'CERT_OWN', 'EP_RECORD'];

async function download(db: Db, bucket: string, path: string): Promise<Uint8Array | null> {
  const { data } = await db.storage.from(bucket).download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/**
 * What every document is made from: the job's merge fields, the sign-off, and the answers in their
 * context. `asOf`: when a draft (not signed yet) is dated, now unless said.
 */
export async function electricianInput(
  db: Db,
  a: AssignmentRow,
  opts: { draft?: boolean; asOf?: Date } = {}
): Promise<{ input: ElectricianDocInput; inputs: Record<string, unknown>; signoffId: string | null } | null> {
  const [{ data: p }, { data: contact }, { data: so }] = await Promise.all([
    db.from('crm_projects').select('*').eq('id', a.project_id).maybeSingle(),
    db.from('site_contacts').select('name, company').eq('id', a.contact_id).maybeSingle(),
    db.from('site_signoffs').select('*').eq('assignment_id', a.id).eq('stage', 'main').maybeSingle(),
  ]);
  if (!p) return null;
  if (!so && !opts.draft) return null;
  const project = p as Record<string, unknown>;
  const paper = (project.paperwork ?? {}) as Record<string, unknown>;
  const { data: cust } = await db.from('enquiries').select('name').eq('id', String(project.enquiry_id ?? '')).maybeSingle();
  const ctx = await serverCtx(db, a);
  const signoff = so as { id: string; signed_name: string; signed_at: string; signature_path: string; declaration?: string | null } | null;
  const person = contact as { name?: string; company?: string | null } | null;
  const address = [...String(project.address ?? '').split(/\n/).map((l) => l.trim()).filter(Boolean), String(project.postcode ?? '').trim()].filter(Boolean);
  const signedAt = signoff?.signed_at ?? (opts.asOf ?? new Date()).toISOString();
  const input: ElectricianDocInput = {
    jobRef: (project.project_ref as string | null) ?? null,
    address,
    customer: (cust as { name?: string } | null)?.name ?? null,
    engineer: signoff?.signed_name ?? person?.name ?? 'Not signed yet',
    company: person?.company && person.company !== (signoff?.signed_name ?? person?.name) ? person.company : null,
    date: ukDay(new Date(signedAt)),
    signedAt,
    signature: signoff ? await download(db, DOCS_BUCKET, signoff.signature_path) : null,
    ctx,
    draft: opts.draft || !signoff,
    declaration: signoff?.declaration ?? null,
    buildingRef: typeof paper.building_regs_ref === 'string' && paper.building_regs_ref.trim() ? paper.building_regs_ref.trim() : null,
  };
  // The hash: what the documents print from (not the signature image's bytes, which never change),
  // and not the office's own answers kept beside the electrician's (the EIC's design part): none of
  // these documents prints them, so signing the design part doesn't put them out of date.
  const values = Object.fromEntries(Object.entries(ctx.values).filter(([k]) => !OFFICE_KEYS.includes(k)));
  const inputs = { values, design: ctx.design, system: ctx.system, products: ctx.products, el: ctx.el ?? null, jobRef: input.jobRef, address, customer: input.customer, engineer: input.engineer, company: input.company, date: input.date, signoff: signoff?.id ?? null, buildingRef: input.buildingRef };
  return { input, inputs, signoffId: signoff?.id ?? null };
}

/** The job's electricians, for finding whose stored document a print version is asked for. */
async function electriciansOn(db: Db, projectId: string): Promise<AssignmentRow[]> {
  const { data } = await db.from('site_assignments').select('id').eq('project_id', projectId).eq('trade', 'electrician');
  const out: AssignmentRow[] = [];
  for (const row of (data ?? []) as { id: string }[]) {
    const a = await readAssignment(db, row.id);
    if (a) out.push(a);
  }
  return out;
}

/**
 * The print version of a stored electrician's document (HX-PV-01 to 03, HX-BAT-01 and 02, the EV and
 * heat pump records): made again from the answers it was made from (they hash to the stored copy's).
 */
export async function electricianDocPrint(db: Db, ref: StoredRef): Promise<Reprint> {
  const d = ELECTRICIAN_DOCS.find((x) => x.key === ref.key);
  if (!d) return null;
  let changed = false;
  for (const a of await electriciansOn(db, ref.projectId)) {
    const built = await electricianInput(db, a);
    if (!built) continue;
    // As the job is now, or (the PV inspection) as it was made before the office recorded the
    // Building Control reference: the stored copy says "Heliaxis will notify them", and so does its print version.
    const tries = [built, ...(built.input.buildingRef ? [{ input: { ...built.input, buildingRef: null }, inputs: { ...built.inputs, buildingRef: null } }] : [])];
    for (const t of tries) if (inputsHash(docInputs(d.key, t.inputs)) === ref.hash) return d.make({ ...t.input, variant: 'print' });
    changed = true;
  }
  return changed ? 'changed' : null;
}

/** Pages of an uploaded certificate (photos) as one PDF, a page each, fitted to A4. */
async function pagesPdf(images: { bytes: Uint8Array; mime: string }[], title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor('Heliaxis Limited');
  for (const im of images) {
    const img = await (im.mime === 'image/png' ? doc.embedPng(im.bytes) : doc.embedJpg(im.bytes)).catch(() => null);
    if (!img) continue;
    const page = doc.addPage(A4);
    const m = 28;
    const s = Math.min((A4[0] - 2 * m) / img.width, (A4[1] - 2 * m) / img.height);
    page.drawImage(img, { x: (A4[0] - img.width * s) / 2, y: (A4[1] - img.height * s) / 2, width: img.width * s, height: img.height * s });
  }
  return doc.save();
}

/**
 * Make and store the electrician's documents (after the sign-off, and again by the cron if it
 * failed). `force`: the handover items the office pressed Regenerate on (HX-PV-02…), made again even
 * though the customer has the old version (only those); `by`: who pressed it.
 */
export async function saveElectricianDocs(db: Db, assignmentId: string, opts: { force?: string[]; by?: string | null } = {}): Promise<SaveResult[]> {
  const a = await readAssignment(db, assignmentId);
  if (!a || a.trade !== 'electrician') return [];
  const built = await electricianInput(db, a);
  if (!built) return [];
  const { input, inputs } = built;
  const products = input.ctx.products;
  const out: SaveResult[] = [];
  for (const d of ELECTRICIAN_DOCS) {
    if (!a.forms.includes(d.section) || !d.products.some((p) => products.includes(p))) continue;
    if (opts.force && !opts.force.includes(d.slot)) continue;
    const bytes = await d.make(input);
    out.push(
      await saveGenerated(db, a.project_id, {
        key: d.key,
        name: docFileName(input.jobRef, '', d.title),
        bytes,
        inputs: docInputs(d.key, inputs),
        category: 'commissioning',
        slot: d.slot,
        release: 'with_pack',
        visible: false,
        force: !!opts.force?.includes(d.slot),
        by: opts.by ?? null,
      })
    );
  }
  // Their own certificate, as photos of its pages (a PDF they uploaded is filed already).
  if (certRouteOf(input.ctx) === 'own' && (!opts.force || opts.force.includes('HX-HO-04'))) {
    const pdfs = (await tradeFiles(db, a)).filter((f) => f.slot === 'CERT_FILE');
    const { data: ph } = await db.from('crm_photos').select('id, storage_path').eq('assignment_id', a.id).eq('slot', 'CERT_FILE').order('created_at');
    const photos = (ph ?? []) as { id: string; storage_path: string }[];
    if (!pdfs.length && photos.length) {
      const images: { bytes: Uint8Array; mime: string }[] = [];
      for (const x of photos) {
        const bytes = await download(db, CRM_BUCKET, x.storage_path);
        if (bytes) images.push({ bytes, mime: /\.png$/i.test(x.storage_path) ? 'image/png' : 'image/jpeg' });
      }
      const no = typeof input.ctx.values.CERT_NO === 'string' ? input.ctx.values.CERT_NO.trim() : '';
      const title = `Electrical certificate${no ? ` ${no}` : ''}`;
      out.push(
        await saveGenerated(db, a.project_id, {
          key: 'CERT_OWN',
          name: docFileName(input.jobRef, '', title),
          bytes: await pagesPdf(images, title),
          inputs: { photos: photos.map((x) => x.id), no },
          category: 'certificate',
          slot: 'HX-HO-04',
          release: 'with_pack',
          visible: false,
          force: !!opts.force?.includes('HX-HO-04'),
          by: opts.by ?? null,
        })
      );
    }
  }
  return out;
}

/** The photo record, when the office asks for it (Site tab): every slot with its instruction, and the serials. */
export async function savePhotoRecord(db: Db, assignmentId: string, by: string | null): Promise<SaveResult | null> {
  const a = await readAssignment(db, assignmentId);
  if (!a || a.trade !== 'electrician') return null;
  const r = await photoRecord(db, a);
  if (!r) return null;
  return saveGenerated(db, a.project_id, { key: 'EP_RECORD', name: r.name, bytes: r.bytes, inputs: r.inputs, category: 'commissioning', visible: false, by });
}

/** The print version of a stored photo record (EP_RECORD): made again from the photos and serials it was made from. */
export async function photoRecordPrint(db: Db, ref: StoredRef): Promise<Reprint> {
  let changed = false;
  for (const a of await electriciansOn(db, ref.projectId)) {
    const r = await photoRecord(db, a, { variant: 'print', asOf: new Date(ref.madeAt) });
    if (!r) continue;
    if (inputsHash(r.inputs) === ref.hash) return r.bytes;
    changed = true;
  }
  return changed ? 'changed' : null;
}

/**
 * The photo record as a PDF and what it's made from (savePhotoRecord stores it). `variant`: 'digital'
 * (the default, the stored copy) or 'print'; `asOf`: when one not signed off yet is dated.
 */
async function photoRecord(db: Db, a: AssignmentRow, opts: { variant?: Variant; asOf?: Date } = {}): Promise<{ bytes: Uint8Array; name: string; inputs: unknown } | null> {
  const built = await electricianInput(db, a, { draft: false });
  const input = built?.input ?? (await electricianInput(db, a, { draft: true, asOf: opts.asOf }))?.input;
  if (!input) return null;
  const { data: ph } = await db.from('crm_photos').select('id, slot, storage_path, taken_at').eq('assignment_id', a.id).order('created_at');
  const photos = (ph ?? []) as { id: string; slot: string | null; storage_path: string; taken_at: string | null }[];
  const fields = schemaFor(a).flatMap((f) => f.steps.flatMap((s) => s.fields)).filter((f): f is Field => f.type === 'PHOTOS');
  const slots: RecordSlot[] = [];
  for (const f of fields) {
    const mine = photos.filter((x) => x.slot === f.key);
    if (!mine.length) continue;
    const items = [];
    for (const x of mine) {
      const bytes = await download(db, CRM_BUCKET, x.storage_path);
      if (bytes) items.push({ bytes, mime: /\.png$/i.test(x.storage_path) ? 'image/png' : 'image/jpeg', caption: f.label, sub: x.taken_at ? `Taken ${stampWords(x.taken_at)}` : null });
    }
    slots.push({ title: f.label, instruction: f.hint ?? null, photos: items });
  }
  // A put right's photos after a return to site (PR:<n>), each return its own section.
  for (const slot of [...new Set(photos.map((x) => x.slot ?? '').filter(isPutRightSlot))].sort()) {
    const items = [];
    for (const x of photos.filter((p) => p.slot === slot)) {
      const bytes = await download(db, CRM_BUCKET, x.storage_path);
      if (bytes) items.push({ bytes, mime: /\.png$/i.test(x.storage_path) ? 'image/png' : 'image/jpeg', caption: 'Photos of the fix', sub: x.taken_at ? `Taken ${stampWords(x.taken_at)}` : null });
    }
    slots.push({ title: `Put right ${slot.slice(3)}`, instruction: null, photos: items });
  }
  const serials = SCAN_KEYS.map((k) => {
    const list = captures(input.ctx.values[k.key]);
    return { what: `${k.what[0].toUpperCase()}${k.what.slice(1)} serial${list.length === 1 ? '' : 's'}`, serials: list.filter((x) => !x.unread).map((x) => x.s), unread: list.filter((x) => x.unread).length };
  }).filter((s) => s.serials.length || s.unread);
  // The declarations as signed: the sign-off's, then each put right's.
  const [{ data: so }, { data: rt }] = await Promise.all([
    db.from('site_signoffs').select('signed_name, signed_at, declaration, signature_path').eq('assignment_id', a.id).eq('stage', 'main').maybeSingle(),
    db.from('site_returns').select('n, fixed_name, fixed_at, fixed_declaration, fixed_signature_path').eq('assignment_id', a.id).order('n'),
  ]);
  const declarations: RecordDeclaration[] = [];
  const signed = so as { signed_name: string; signed_at: string; declaration: string; signature_path: string } | null;
  if (signed) declarations.push({ title: 'Sign-off', text: signed.declaration, name: signed.signed_name, at: signed.signed_at, signature: await download(db, DOCS_BUCKET, signed.signature_path) });
  for (const r of (rt ?? []) as { n: number; fixed_name: string | null; fixed_at: string | null; fixed_declaration: string | null; fixed_signature_path: string | null }[]) {
    if (r.fixed_declaration) declarations.push({ title: `Put right ${r.n}`, text: r.fixed_declaration, name: r.fixed_name ?? '', at: r.fixed_at, signature: r.fixed_signature_path ? await download(db, DOCS_BUCKET, r.fixed_signature_path) : null });
  }
  const bytes = await makePhotoRecord({ ...input, variant: opts.variant }, slots, serials, declarations);
  return {
    bytes,
    name: docFileName(input.jobRef, '', 'Electrician photo record'),
    inputs: { photos: photos.map((x) => x.id), serials, declarations: declarations.map((x) => [x.title, x.text, x.at]) },
  };
}
