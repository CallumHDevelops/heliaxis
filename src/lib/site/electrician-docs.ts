import 'server-only';
import { PDFDocument } from 'pdf-lib';
import { ukDay } from '@/lib/bank-holidays';
import { CRM_BUCKET, DOCS_BUCKET } from '@/lib/crm/server';
import { A4, docFileName, stampWords } from '@/lib/documents/pdf-kit';
import type { ElectricianDocInput } from '@/lib/documents/site/common';
import { F43_TITLE, makeF43 } from '@/lib/documents/site/f43';
import { F44_TITLE, makeF44, makeF44A } from '@/lib/documents/site/f44';
import { F74_TITLE, F75_TITLE, makeF74, makeF75 } from '@/lib/documents/site/f74';
import { makePhotoRecord, type RecordDeclaration, type RecordSlot } from '@/lib/documents/site/photo-record';
import { makeEvRecord, makeHpRecord } from '@/lib/documents/site/records';
import { saveGenerated, type SaveResult } from '@/lib/documents/store';
import { tradeFiles } from './electrician';
import { serverCtx } from './form-ctx';
import { schemaFor } from './forms';
import { routeOf as certRouteOf } from './forms/electrician/cert';
import { EV_TITLE } from './forms/electrician/ev';
import { F44A_TITLE } from './forms/electrician/f44a';
import { HP_TITLE } from './forms/electrician/heatpump';
import { SCAN_KEYS } from './forms/electrician/serials';
import { captures } from './forms/electrician/shared';
import type { Field } from './forms/types';
import { isPutRightSlot } from './review-shared';
import { readAssignment, type AssignmentRow, type Db } from './server';

/**
 * The electrician's paperwork (SPEC 2.13 item 6, 2.14), made after the sign-off's reply and stored
 * against the job with saveGenerated: F43, F44, F44A (solar), F74 and F75 (battery), the EV and heat
 * pump records, each in its handover pack item, held back until the pack goes (release with_pack).
 * A certificate uploaded as photos of its pages becomes one PDF in CC21. The photo record is made
 * only when the office asks. Each is a new version only when what it's made from changed.
 */

type DocDef = {
  key: string;
  label: string;
  title: string;
  /** The handover pack item (Unit 4's catalogue): F43… or CCMH for the records. */
  slot: string;
  section: string;
  products: string[];
  make: (d: ElectricianDocInput) => Promise<Uint8Array>;
};

export const ELECTRICIAN_DOCS: DocDef[] = [
  { key: 'F43', label: 'F43', title: F43_TITLE, slot: 'F43', section: 'f43', products: ['solar'], make: makeF43 },
  { key: 'F44', label: 'F44', title: F44_TITLE, slot: 'F44', section: 'f44', products: ['solar'], make: makeF44 },
  { key: 'F44A', label: 'F44A', title: F44A_TITLE, slot: 'F44A', section: 'f44a', products: ['solar'], make: makeF44A },
  { key: 'F74', label: 'F74', title: F74_TITLE, slot: 'F74', section: 'f74', products: ['battery'], make: makeF74 },
  { key: 'F75', label: 'F75', title: F75_TITLE, slot: 'F75', section: 'f74', products: ['battery'], make: makeF75 },
  { key: 'EV_REC', label: '', title: EV_TITLE, slot: 'CCMH', section: 'ev', products: ['ev'], make: makeEvRecord },
  { key: 'HP_REC', label: '', title: HP_TITLE, slot: 'CCMH', section: 'heatpump', products: ['heatpump'], make: makeHpRecord },
];
/** Every generated document key an electrician's sign-off can make (the review drawer lists them). */
export const ELECTRICIAN_DOC_KEYS = [...ELECTRICIAN_DOCS.map((d) => d.key), 'CERT_OWN', 'EP_RECORD'];

async function download(db: Db, bucket: string, path: string): Promise<Uint8Array | null> {
  const { data } = await db.storage.from(bucket).download(path);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

/** What every document is made from: the job's merge fields, the sign-off, and the answers in their context. */
export async function electricianInput(db: Db, a: AssignmentRow, opts: { draft?: boolean } = {}): Promise<{ input: ElectricianDocInput; inputs: Record<string, unknown>; signoffId: string | null } | null> {
  const [{ data: p }, { data: contact }, { data: so }] = await Promise.all([
    db.from('crm_projects').select('*').eq('id', a.project_id).maybeSingle(),
    db.from('site_contacts').select('name, company').eq('id', a.contact_id).maybeSingle(),
    db.from('site_signoffs').select('*').eq('assignment_id', a.id).eq('stage', 'main').maybeSingle(),
  ]);
  if (!p) return null;
  if (!so && !opts.draft) return null;
  const project = p as Record<string, unknown>;
  const { data: cust } = await db.from('enquiries').select('name').eq('id', String(project.enquiry_id ?? '')).maybeSingle();
  const ctx = await serverCtx(db, a);
  const signoff = so as { id: string; signed_name: string; signed_at: string; signature_path: string } | null;
  const person = contact as { name?: string; company?: string | null } | null;
  const address = [...String(project.address ?? '').split(/\n/).map((l) => l.trim()).filter(Boolean), String(project.postcode ?? '').trim()].filter(Boolean);
  const signedAt = signoff?.signed_at ?? new Date().toISOString();
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
  };
  // The hash: what the documents print from (not the signature image's bytes, which never change).
  const inputs = { values: ctx.values, design: ctx.design, system: ctx.system, products: ctx.products, el: ctx.el ?? null, jobRef: input.jobRef, address, customer: input.customer, engineer: input.engineer, company: input.company, date: input.date, signoff: signoff?.id ?? null };
  return { input, inputs, signoffId: signoff?.id ?? null };
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

/** Make and store the electrician's documents (after the sign-off, and again by the cron if it failed). */
export async function saveElectricianDocs(db: Db, assignmentId: string): Promise<SaveResult[]> {
  const a = await readAssignment(db, assignmentId);
  if (!a || a.trade !== 'electrician') return [];
  const built = await electricianInput(db, a);
  if (!built) return [];
  const { input, inputs } = built;
  const products = input.ctx.products;
  const out: SaveResult[] = [];
  for (const d of ELECTRICIAN_DOCS) {
    if (!a.forms.includes(d.section) || !d.products.some((p) => products.includes(p))) continue;
    const bytes = await d.make(input);
    out.push(
      await saveGenerated(db, a.project_id, {
        key: d.key,
        name: docFileName(input.jobRef, d.label, d.title),
        bytes,
        inputs: { doc: d.key, ...inputs },
        category: 'commissioning',
        slot: d.slot,
        release: 'with_pack',
        visible: false,
      })
    );
  }
  // Their own certificate, as photos of its pages (a PDF they uploaded is filed already).
  if (certRouteOf(input.ctx) === 'own') {
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
          slot: 'CC21',
          release: 'with_pack',
          visible: false,
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
  const built = await electricianInput(db, a, { draft: false });
  const input = built?.input ?? (await electricianInput(db, a, { draft: true }))?.input;
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
  const bytes = await makePhotoRecord(input, slots, serials, declarations);
  return saveGenerated(db, a.project_id, {
    key: 'EP_RECORD',
    name: docFileName(input.jobRef, '', 'Electrician photo record'),
    bytes,
    inputs: { photos: photos.map((x) => x.id), serials, declarations: declarations.map((x) => [x.title, x.text, x.at]) },
    category: 'commissioning',
    visible: false,
    by,
  });
}
