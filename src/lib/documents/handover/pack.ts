import 'server-only';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import type { Group, SlotCode } from '@/lib/handover/slots';
import { A4 } from '../pdf-kit';
import { makeContents, type ContentsInput, type ContentsLine } from './contents';

/**
 * The combined handover pack (SPEC 4.7, D22): the cover letter, then the contents page, then every
 * document in customer order, as one PDF. Uploads are merged with pdf-lib's copyPages; photos become
 * A4 pages. Signed, password-protected or damaged PDFs, Word and Excel files are never merged: they
 * stay separate files in the portal and the contents says so. Page numbers are never stamped onto
 * anyone else's document. Over 20 MB, the manufacturers' manuals are left separate first.
 */

/** Aim for a pack a phone opens easily (D22). */
export const PACK_LIMIT_BYTES = 20 * 1024 * 1024;

export type PackPart = {
  slot: SlotCode;
  title: string;
  group: Exclude<Group, 'cover'>;
  order: number;
  docId: string;
  name: string;
  mime: string | null;
  /** From the product library (a manual or datasheet): the first to stay separate when the pack is too big. */
  manual?: boolean;
  bytes: Uint8Array | null;
};
export type PackEntry = {
  slot: SlotCode;
  document_id: string;
  title: string;
  first_page?: number;
  pages?: number;
  separate?: 'signed' | 'protected' | 'damaged' | 'not_pdf' | 'size' | 'missing';
};
export type PackInput = Omit<ContentsInput, 'lines'> & {
  cover: Uint8Array | null;
  parts: PackPart[];
  /** Items still to come: "To follow" on the contents page. */
  follow: { slot: SlotCode; title: string; group: Exclude<Group, 'cover'>; order: number }[];
  /** Stop before this time (Date.now()). */
  deadline?: number;
  limit?: number;
  /** Parts left as separate files whatever they are (the print version keeps the stored pack's), by docId. */
  separate?: Map<string, NonNullable<PackEntry['separate']>>;
};
export type PackResult = { bytes: Uint8Array; pages: number; contents: PackEntry[]; contentsPages: number };

/** The pack's subject when a version adds documents: "What's new in version 2: Adds your MCS certificate; …". */
const CHANGES_LEAD = (version: number) => `What’s new in version ${version}: `;

/** What a stored pack's version added, from its subject (none for a first version, or a pack from before this was kept). */
export async function packChanges(bytes: Uint8Array): Promise<string[]> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const m = /^What’s new in version \d+: (.+)$/.exec(doc.getSubject() ?? '');
    return m ? m[1].split('; ') : [];
  } catch {
    return [];
  }
}

const JPEG = /^image\/jpe?g$/i;
const PNG = /^image\/png$/i;

/** Any signature dictionary (they carry the /ByteRange the signature covers), as pdf-engine checks. */
function isSigned(doc: PDFDocument): boolean {
  const range = PDFName.of('ByteRange');
  return doc.context.enumerateIndirectObjects().some(([, obj]) => obj instanceof PDFDict && obj.has(range));
}

type Ready = { part: PackPart; doc: PDFDocument; pages: number } | { part: PackPart; separate: NonNullable<PackEntry['separate']> };

/** One part as pages to merge, or why it stays a separate file. */
async function prepare(part: PackPart): Promise<Ready> {
  if (!part.bytes) return { part, separate: 'missing' };
  const mime = part.mime ?? '';
  if (JPEG.test(mime) || PNG.test(mime)) {
    try {
      const doc = await PDFDocument.create();
      const img = JPEG.test(mime) ? await doc.embedJpg(part.bytes) : await doc.embedPng(part.bytes);
      const page = doc.addPage(A4);
      const m = 28;
      const s = Math.min((A4[0] - 2 * m) / img.width, (A4[1] - 2 * m) / img.height);
      page.drawImage(img, { x: (A4[0] - img.width * s) / 2, y: (A4[1] - img.height * s) / 2, width: img.width * s, height: img.height * s });
      return { part, doc, pages: 1 };
    } catch {
      return { part, separate: 'damaged' };
    }
  }
  if (mime !== 'application/pdf') return { part, separate: 'not_pdf' };
  try {
    const doc = await PDFDocument.load(part.bytes, { ignoreEncryption: true, updateMetadata: false });
    if (doc.isEncrypted) return { part, separate: 'protected' };
    if (isSigned(doc)) return { part, separate: 'signed' };
    const pages = doc.getPageCount();
    return pages ? { part, doc, pages } : { part, separate: 'damaged' };
  } catch {
    return { part, separate: 'damaged' };
  }
}

export async function buildPack(p: PackInput): Promise<PackResult> {
  const deadline = p.deadline ?? Date.now() + 45_000;
  const limit = p.limit ?? PACK_LIMIT_BYTES;
  const ready: Ready[] = [];
  for (const part of [...p.parts].sort((a, b) => a.order - b.order)) {
    if (Date.now() > deadline) throw new Error('Building the pack took too long. Try again.');
    const kept = p.separate?.get(part.docId);
    ready.push(kept ? { part, separate: kept } : await prepare(part));
  }

  // Too big for a phone: the largest manuals stay separate first, then anything else that's huge.
  const size = (r: Ready) => ('doc' in r ? (r.part.bytes?.length ?? 0) : 0);
  let total = (p.cover?.length ?? 0) + ready.reduce((n, r) => n + size(r), 0);
  const byWeight = ready
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => 'doc' in r)
    .sort((a, b) => Number(!!b.r.part.manual) - Number(!!a.r.part.manual) || size(b.r) - size(a.r));
  for (const { r, i } of byWeight) {
    if (total <= limit) break;
    total -= size(r);
    ready[i] = { part: r.part, separate: 'size' };
  }

  const coverDoc = p.cover ? await PDFDocument.load(p.cover).catch(() => null) : null;
  const coverPages = coverDoc?.getPageCount() ?? 0;

  // The contents is made twice: once to count its pages, then with the real page numbers.
  const lines = (contentsPages: number) => {
    let at = coverPages + contentsPages + 1;
    const out: ContentsLine[] = [];
    const entries: PackEntry[] = [];
    const seen = new Set<string>();
    for (const r of ready) {
      const key = `${r.part.slot}:${r.part.title}`;
      if ('doc' in r) {
        entries.push({ slot: r.part.slot, document_id: r.part.docId, title: r.part.name, first_page: at, pages: r.pages });
        if (!seen.has(key)) out.push({ title: r.part.title, group: r.part.group, order: r.part.order, page: at, status: 'in' });
        at += r.pages;
      } else {
        entries.push({ slot: r.part.slot, document_id: r.part.docId, title: r.part.name, separate: r.separate });
        if (!seen.has(key)) out.push({ title: r.part.title, group: r.part.group, order: r.part.order, page: null, status: 'separate' });
      }
      seen.add(key);
    }
    for (const f of p.follow) out.push({ title: f.title, group: f.group, order: f.order, page: null, status: 'follow' });
    return { out, entries };
  };
  const first = await makeContents({ ...p, lines: lines(1).out });
  const contentsPages = (await PDFDocument.load(first)).getPageCount();
  const { out, entries } = lines(contentsPages);
  const contents = await makeContents({ ...p, lines: out });

  const pack = await PDFDocument.create();
  pack.setTitle(`${p.ref ? `${p.ref} ` : ''}Handover pack`);
  // What's new in this version, kept with the file so its print version says the same (packChanges).
  pack.setSubject(p.changes.length ? `${CHANGES_LEAD(p.version)}${p.changes.join('; ')}` : `Handover pack version ${p.version}`);
  pack.setAuthor('Heliaxis Limited');
  pack.setCreator('Heliaxis');
  pack.setProducer('Heliaxis');
  const add = async (doc: PDFDocument) => {
    for (const pg of await pack.copyPages(doc, doc.getPageIndices())) pack.addPage(pg);
  };
  if (coverDoc) await add(coverDoc);
  await add(await PDFDocument.load(contents));
  for (const r of ready) {
    if (Date.now() > deadline) throw new Error('Building the pack took too long. Try again.');
    if ('doc' in r) await add(r.doc);
  }
  const bytes = await pack.save({ useObjectStreams: true });
  return { bytes, pages: pack.getPageCount(), contents: entries, contentsPages };
}
