import 'server-only';
import { constants as zlibConstants, inflateSync } from 'zlib';
import sharp from 'sharp';
import { MAX_TOTAL_UPLOAD_BYTES } from './documents';
import {
  ParseSpeeds,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  type PDFContext,
  type PDFObject,
} from 'pdf-lib';

/**
 * Turns whatever a subcontractor uploads from their phone — photos of ID and
 * cards, scanned certificates, insurance PDFs — into ONE compact PDF.
 *
 * - Photos become one A4 page each: rotated upright, shrunk to 2000 px, saved
 *   as a modest JPEG. Re-encoding drops all metadata, which is deliberate: it
 *   strips the GPS location phones write into every photo.
 * - PDFs keep their text and layout; only the big photos/scans inside them are
 *   re-compressed, and only when that genuinely saves space.
 * - A single PDF is never refused: if it's encrypted, digitally signed, damaged
 *   or already compact we hand back the exact bytes that were uploaded.
 */

export type EngineInput = { bytes: Uint8Array; mime: string; name: string };

export type EngineResult = {
  /** The PDF to store. */
  bytes: Uint8Array;
  pages: number;
  /** Sum of input sizes. */
  inputBytes: number;
  outputBytes: number;
  /** True if any image was turned into a PDF page or several files were merged. */
  converted: boolean;
  /** True ONLY for a single PDF input returned byte-for-byte unchanged. */
  keptOriginal: boolean;
  /** Short human summary, e.g. "2 photos → 2-page PDF · 7.9 MB → 612 KB". */
  note: string;
};

/** A problem the subcontractor can act on — the message is shown to them as-is. */
export class EngineError extends Error {
  name = 'EngineError';
}

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = MAX_TOTAL_UPLOAD_BYTES; // shared with the portal's upload form
const DEFAULT_BUDGET_MS = 40_000;

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const MARGIN = 24;

/** Long edge for photos and embedded scans: plenty to read a certificate, a fraction of a 12 MP photo. */
const MAX_EDGE = 2000;
const JPEG_OPTIONS = { quality: 72, mozjpeg: true } as const;
/** A re-encode (or a whole re-saved PDF) only counts if it's under 90% of the old size. */
const WORTHWHILE = 0.9;
/** Embedded images smaller than this aren't worth decoding (logos, signatures, icons). */
const MIN_IMAGE_BYTES = 16 * 1024;
/** Most decoded pixel data we'll hold for one embedded image (~8000 x 8000 RGB). */
const MAX_RAW_BYTES = 200 * 1024 * 1024;
/**
 * Printable junk between a PDF's objects we'll let pdf-lib crawl through. pdf-lib's synchronous
 * skipJibberish spends ~55–60 µs on every printable byte it crawls (measured), so this cap of
 * 32 KB bounds that blocking crawl to ~2 s; anything past it is refused before pdf-lib is handed
 * the file. junkBetweenObjects counts ALL such bytes in every gap (see there).
 */
const MAX_JUNK_BYTES = 32 * 1024;

const PDF_MIME = 'application/pdf';
const HEIC_MIMES = new Set(['image/heic', 'image/heif']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', ...HEIC_MIMES]);

// pdf-lib pauses every 1,500 objects when parsing/saving at this speed. That costs ~1 ms a
// pause, and it's what lets the deadline timer interrupt a slow parse or save. Encrypted
// files are parsed (to count pages) but we check isEncrypted ourselves and never rewrite them.
const LOAD_OPTIONS = { updateMetadata: false, ignoreEncryption: true, parseSpeed: ParseSpeeds.Fast } as const;
const SAVE_OPTIONS = { useObjectStreams: true, addDefaultPage: false, objectsPerTick: ParseSpeeds.Fast } as const;

const TOO_SLOW = 'That took too long — try fewer or smaller files.';
const BAD_PDF_IN_MERGE = 'One of the PDFs is password-protected or damaged — upload it on its own.';

/**
 * Build the one PDF to store for an upload of 1–10 files (in the order given).
 * `deadlineMs` is an absolute Date.now() time; by default 40 s from now.
 * Throws EngineError with a message for the subcontractor.
 */
export async function buildPdf(files: EngineInput[], opts: { deadlineMs?: number } = {}): Promise<EngineResult> {
  const deadline = opts.deadlineMs ?? Date.now() + DEFAULT_BUDGET_MS;

  if (!Array.isArray(files) || files.length === 0) throw new EngineError('Choose at least one file to upload.');
  if (files.length > MAX_FILES) {
    throw new EngineError(`You can upload up to ${MAX_FILES} files at once — please split them into separate uploads.`);
  }
  const inputs = files.map((f) => ({ ...f, mime: String(f.mime || '').trim().toLowerCase() }));
  for (const f of inputs) {
    if (!(f.bytes instanceof Uint8Array) || f.bytes.length === 0) {
      throw new EngineError(`"${shortName(f.name)}" is empty — please choose it again.`);
    }
    if (f.mime !== PDF_MIME && !IMAGE_MIMES.has(f.mime)) {
      throw new EngineError(`"${shortName(f.name)}" isn't a PDF or a photo. Please upload a PDF, JPG, PNG, WebP or HEIC.`);
    }
  }
  const inputBytes = inputs.reduce((n, f) => n + f.bytes.length, 0);
  if (inputBytes > MAX_TOTAL_BYTES) {
    throw new EngineError('Those files add up to more than 80 MB — please upload fewer at a time, or smaller copies.');
  }

  if (inputs.length === 1 && inputs[0].mime === PDF_MIME) return singlePdf(inputs[0], deadline);
  return assemble(inputs, inputBytes, deadline);
}

// ---------- one PDF on its own ----------

async function singlePdf(file: EngineInput, deadline: number): Promise<EngineResult> {
  const size = file.bytes.length;
  // The upload route has already sniffed the bytes, so this only catches callers that didn't.
  if (!looksLikePdf(file.bytes)) {
    throw new EngineError(`"${shortName(file.name)}" isn't a valid PDF. Please upload a PDF, JPG, PNG, WebP or HEIC.`);
  }

  const outcome = await compressPdf(file.bytes, deadline, true);
  if (outcome.kind !== 'compressed') {
    return {
      bytes: file.bytes,
      pages: outcome.pages,
      inputBytes: size,
      outputBytes: size,
      converted: false,
      keptOriginal: true,
      note: `PDF kept as uploaded · ${outcome.why}`,
    };
  }
  return {
    bytes: outcome.bytes,
    pages: outcome.doc.getPageCount(),
    inputBytes: size,
    outputBytes: outcome.bytes.length,
    converted: false,
    keptOriginal: false,
    note: `PDF compressed · ${formatSize(size)} → ${formatSize(outcome.bytes.length)}`,
  };
}

// ---------- photos, or several files merged ----------

async function assemble(inputs: EngineInput[], inputBytes: number, deadline: number): Promise<EngineResult> {
  const out = await PDFDocument.create({ updateMetadata: false });

  // One file at a time, in the order they were chosen, so only one decoded photo is in memory.
  for (const file of inputs) {
    if (Date.now() > deadline) throw new EngineError(TOO_SLOW);

    if (file.mime !== PDF_MIME) {
      const photo = await photoToJpeg(file);
      const image = await out.embedJpg(photo.jpeg);
      const [pageW, pageH] = photo.width > photo.height ? [A4_PORTRAIT[1], A4_PORTRAIT[0]] : A4_PORTRAIT;
      const scale = Math.min((pageW - 2 * MARGIN) / photo.width, (pageH - 2 * MARGIN) / photo.height);
      const w = photo.width * scale;
      const h = photo.height * scale;
      out.addPage([pageW, pageH]).drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
      continue;
    }

    // Merging rewrites every page anyway, so a signature can't survive it: compress regardless.
    const outcome = await compressPdf(file.bytes, deadline, false);
    if (outcome.kind === 'unreadable') throw new EngineError(BAD_PDF_IN_MERGE);
    if (outcome.kind === 'timeout') throw new EngineError(TOO_SLOW);
    // Not worth compressing (or it went wrong): start again from the bytes as uploaded.
    let source: PDFDocument;
    try {
      source = outcome.kind === 'compressed' ? outcome.doc : await beforeDeadline(PDFDocument.load(file.bytes, LOAD_OPTIONS), deadline);
    } catch (e) {
      throw new EngineError(e instanceof OutOfTime ? TOO_SLOW : BAD_PDF_IN_MERGE);
    }
    // All pages in one call so fonts and images shared between pages are copied once.
    const copied = await out.copyPages(source, source.getPageIndices());
    for (const page of copied) out.addPage(page);
  }

  const pages = out.getPageCount();
  const bytes = await out.save(SAVE_OPTIONS);
  // Belt and braces: what we store must open again with every page present.
  try {
    const check = await PDFDocument.load(bytes, LOAD_OPTIONS);
    if (check.getPageCount() !== pages) throw new Error('page count changed');
  } catch {
    throw new EngineError('Something went wrong combining those files — please try uploading them one at a time.');
  }

  return {
    bytes,
    pages,
    inputBytes,
    outputBytes: bytes.length,
    converted: true,
    keptOriginal: false,
    note: `${describeInputs(inputs)} → ${pages}-page PDF · ${formatSize(inputBytes)} → ${formatSize(bytes.length)}`,
  };
}

/** Phone photo → upright, white-backed, metadata-free JPEG no bigger than 2000 px. */
async function photoToJpeg(file: EngineInput): Promise<{ jpeg: Uint8Array; width: number; height: number }> {
  const unreadable = () =>
    new EngineError(`We couldn't read "${shortName(file.name)}" as a photo — try saving it as a JPG or PDF and upload it again.`);
  const input = asBuffer(file.bytes);

  let image: sharp.Sharp | null = null;
  if (HEIC_MIMES.has(file.mime)) {
    // sharp's bundled libvips can't decode HEVC, so iPhone photos go through libheif first.
    // libheif applies the photo's own rotation, so the pixels arrive upright.
    const decode = await heicDecoder();
    if (decode) {
      try {
        const { width, height, data } = await decode({ buffer: input });
        image = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
      } catch {
        // Not really HEVC (e.g. a JPEG renamed .heic) — sharp gets a go below.
      }
    }
  }
  image ??= sharp(input, { failOn: 'error' });

  try {
    const { data, info } = await image
      .rotate() // honour EXIF orientation before it's stripped
      .flatten({ background: '#ffffff' })
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .jpeg(JPEG_OPTIONS)
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  } catch {
    throw unreadable();
  }
}

type HeicDecode = (input: { buffer: Buffer }) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>;

/**
 * heic-decode carries a ~2 MB WebAssembly build of libheif, so it's only loaded when a HEIC
 * arrives. Null if it won't load — logged, because that's a deployment problem, not the user's.
 */
async function heicDecoder(): Promise<HeicDecode | null> {
  try {
    // @ts-expect-error -- heic-decode ships without type declarations
    const mod = await import('heic-decode');
    return (mod.default ?? mod) as HeicDecode;
  } catch (e) {
    console.error('[pdf-engine] heic-decode failed to load', e);
    return null;
  }
}

// ---------- compressing an existing PDF ----------

/** `why` finishes the note "PDF kept as uploaded · …"; `pages` is 0 when unknown. */
type PdfOutcome =
  /** Smaller by at least 10%, and re-parsed to prove it opens with every page. */
  | { kind: 'compressed'; bytes: Uint8Array; doc: PDFDocument }
  /** Parsed fine, but compressing wasn't worth it, wasn't safe, or failed — use the original bytes. */
  | { kind: 'original'; pages: number; why: string }
  /** Ran out of time part-way through. */
  | { kind: 'timeout'; pages: number; why: string }
  /** Encrypted, damaged, or not a PDF pdf-lib can read. */
  | { kind: 'unreadable'; pages: number; why: string };

const DAMAGED = "couldn't be read";
const TIMED_OUT = 'ran out of time';
const NO_GAIN = 'already compact';
const FAILED = "couldn't be compressed";

async function compressPdf(bytes: Uint8Array, deadline: number, keepSigned: boolean): Promise<PdfOutcome> {
  if (junkBetweenObjects(bytes) > MAX_JUNK_BYTES) return { kind: 'unreadable', pages: 0, why: DAMAGED };
  let doc: PDFDocument;
  try {
    doc = await beforeDeadline(PDFDocument.load(bytes, LOAD_OPTIONS), deadline);
  } catch (e) {
    return e instanceof OutOfTime ? { kind: 'timeout', pages: 0, why: TIMED_OUT } : { kind: 'unreadable', pages: 0, why: DAMAGED };
  }
  let pages = 0;
  try {
    pages = doc.getPageCount();
  } catch {
    // a broken page tree — treated as unreadable below
  }
  // Rewriting an encrypted file would need its password; a page-less one has nothing to keep.
  if (doc.isEncrypted) return { kind: 'unreadable', pages, why: 'password-protected' };
  if (pages < 1) return { kind: 'unreadable', pages, why: DAMAGED };
  // pdf-lib's getPageCount silently skips any page whose dict omits /Type /Page, so a rewrite
  // (or a merge) would drop it. Cross-check against a walk of the page tree's /Kids; on a
  // mismatch leave the file alone — single uploads keep the original (and report the real
  // count), merges fall through to the "damaged" error rather than lose a page.
  const trueCount = pageTreeLeafCount(doc);
  if (trueCount !== null && trueCount !== pages) return { kind: 'unreadable', pages: trueCount, why: DAMAGED };
  // Re-saving moves every byte, which breaks a digital signature — and with it the proof
  // that an insurer's or awarding body's certificate is genuine.
  if (keepSigned && isSigned(doc.context)) return { kind: 'original', pages, why: 'digitally signed' };

  try {
    return await beforeDeadline(shrinkAndSave(doc, bytes.length, pages, deadline), deadline);
  } catch (e) {
    return e instanceof OutOfTime ? { kind: 'timeout', pages, why: TIMED_OUT } : { kind: 'original', pages, why: FAILED };
  }
}

/** Any signature dictionary (they carry the /ByteRange the signature covers). */
function isSigned(ctx: PDFContext): boolean {
  return ctx.enumerateIndirectObjects().some(([, obj]) => obj instanceof PDFDict && obj.has(N.ByteRange));
}

/**
 * Pages in the document by walking the page tree's /Kids and counting every leaf — a node is a
 * leaf when it has no /Kids. Unlike pdf-lib's getPageCount this counts pages whose dict omits
 * /Type /Page. Returns null if the tree can't be trusted (no root, cyclic, or absurdly large),
 * so a caller only acts on a clear, finite mismatch.
 */
function pageTreeLeafCount(doc: PDFDocument): number | null {
  const ctx = doc.context;
  const catalog = ctx.lookup(ctx.trailerInfo.Root);
  if (!(catalog instanceof PDFDict)) return null;
  const rootPages = ctx.lookup(catalog.get(N.Pages));
  if (!(rootPages instanceof PDFDict)) return null;

  const seen = new Set<string>();
  let leaves = 0;
  let nodes = 0;
  const MAX_NODES = 200_000;
  const walk = (node: PDFObject | undefined): boolean => {
    if (++nodes > MAX_NODES) return false;
    if (!(node instanceof PDFDict)) return false;
    const kids = ctx.lookup(node.get(N.Kids));
    if (!(kids instanceof PDFArray)) {
      leaves++; // a leaf page (intermediate /Pages nodes always carry /Kids)
      return true;
    }
    for (let i = 0, n = kids.size(); i < n; i++) {
      const ref = kids.get(i);
      if (ref instanceof PDFRef) {
        const key = String(ref);
        if (seen.has(key)) return false; // a cycle — don't trust the count
        seen.add(key);
      }
      if (!walk(ctx.lookup(ref))) return false;
    }
    return true;
  };
  return walk(rootPages) ? leaves : null;
}

async function shrinkAndSave(doc: PDFDocument, originalSize: number, pages: number, deadline: number): Promise<PdfOutcome> {
  if (!(await shrinkImages(doc.context, deadline))) return { kind: 'timeout', pages, why: TIMED_OUT };
  const out = await doc.save(SAVE_OPTIONS);
  if (out.length >= originalSize * WORTHWHILE) return { kind: 'original', pages, why: NO_GAIN };
  // Prove the new file opens, with every page, before anyone relies on it.
  const check = await PDFDocument.load(out, LOAD_OPTIONS);
  if (check.getPageCount() !== pages) return { kind: 'original', pages, why: FAILED };
  return { kind: 'compressed', bytes: out, doc: check };
}

/**
 * How much printable junk sits between a PDF's objects — the bytes pdf-lib's synchronous
 * skipJibberish would crawl one at a time (~55–60 µs each, with no pause a timer could
 * interrupt), so even a few tens of KB costs seconds. Real PDFs have next to none.
 *
 * Every byte in the gaps between objects is junk EXCEPT the structures pdf-lib parses properly:
 * cross-reference tables, 'trailer <<…>>', 'startxref N', '%%EOF', comments and whitespace,
 * which are stripped before counting. Object bodies are skipped whole — including stream data,
 * stepped over by a direct /Length (so an uncompressed stream that happens to contain the text
 * 'endobj' or 'endstream' can't be mistaken for the object's end).
 *
 * Residual risk: a stream whose /Length is indirect or absent is skipped by searching for
 * 'endstream', which binary data could in theory contain (pdf-lib has the same limitation); and
 * the structure strippers mirror — but can't perfectly reproduce — pdf-lib's own leniency, so
 * the count is a close estimate of pdf-lib's crawl, not an exact byte match. Both only ever risk
 * under-counting a pathological file by a little; the 32 KB cap leaves ample headroom.
 */
function junkBetweenObjects(bytes: Uint8Array): number {
  const buf = asBuffer(bytes);
  let junk = 0;
  let gapFrom = 0; // start of the current stretch between objects
  let pos = 0;
  while (pos < buf.length && junk <= MAX_JUNK_BYTES) {
    const objAt = buf.indexOf('obj', pos);
    if (objAt < 0) break;
    const start = objectHeaderStart(buf, objAt);
    if (start < 0) {
      // "obj" that isn't an "N G obj" header (e.g. inside 'endobj', or junk): leave it in the
      // gap to be counted, and keep scanning past it.
      pos = objAt + 3;
      continue;
    }
    junk += gapJunk(buf, gapFrom, start);
    const after = skipObjectBody(buf, objAt + 3); // just past the object's matching 'endobj'
    gapFrom = after;
    pos = after;
  }
  if (junk <= MAX_JUNK_BYTES) junk += gapJunk(buf, gapFrom, buf.length);
  return junk;
}

/** Index of the "12" in "12 0 obj" ending at `objAt`, or -1 if it isn't an object header. */
function objectHeaderStart(buf: Buffer, objAt: number): number {
  const isSpace = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09 || b === 0x0c || b === 0x00;
  const isDigit = (b: number) => b >= 0x30 && b <= 0x39;
  let i = objAt - 1;
  const skip = (test: (b: number) => boolean) => {
    const from = i;
    while (i >= 0 && test(buf[i])) i--;
    return from - i;
  };
  if (!skip(isSpace) || !skip(isDigit) || !skip(isSpace) || !skip(isDigit)) return -1;
  return i + 1;
}

/**
 * From just after an object's "obj", the offset just past its matching "endobj", stepping over
 * any stream's data so bytes inside it are never read as 'endobj'/'endstream'.
 */
function skipObjectBody(buf: Buffer, from: number): number {
  let i = from;
  while (i < buf.length) {
    const endobj = buf.indexOf('endobj', i);
    const limit = endobj < 0 ? buf.length : endobj;
    const streamAt = findStreamKeyword(buf, i, limit);
    if (streamAt < 0) return endobj < 0 ? buf.length : endobj + 6; // no stream before the end
    i = skipStreamData(buf, streamAt, from); // past 'endstream'; loop on for the real 'endobj'
  }
  return buf.length;
}

/** First real "stream" keyword in [from, to) (not the tail of "endstream"), or -1. */
function findStreamKeyword(buf: Buffer, from: number, to: number): number {
  for (let at = buf.indexOf('stream', from); at >= 0 && at < to; at = buf.indexOf('stream', at + 6)) {
    // "endstream" = "end" + "stream"; skip those.
    if (at >= 3 && buf[at - 3] === 0x65 && buf[at - 2] === 0x6e && buf[at - 1] === 0x64) continue;
    return at;
  }
  return -1;
}

/** Given the "stream" keyword at `streamAt`, the offset just past its "endstream". */
function skipStreamData(buf: Buffer, streamAt: number, objFrom: number): number {
  let dataStart = streamAt + 6;
  if (buf[dataStart] === 0x0d) dataStart++; // CR
  if (buf[dataStart] === 0x0a) dataStart++; // LF
  // A direct /Length in this object's dict says exactly where the data ends; jump past it so the
  // search for 'endstream' starts beyond any lookalike bytes in the data itself.
  const len = directLength(buf, objFrom, streamAt);
  if (len !== null && dataStart + len <= buf.length) {
    const es = buf.indexOf('endstream', dataStart + len);
    if (es >= 0) return es + 9;
  }
  const es = buf.indexOf('endstream', dataStart);
  return es < 0 ? buf.length : es + 9;
}

/** A direct "/Length N" in [from, to) (ignores an indirect "/Length N G R"); null if none. */
function directLength(buf: Buffer, from: number, to: number): number | null {
  const isDigit = (b: number) => b >= 0x30 && b <= 0x39;
  const isWs = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09 || b === 0x0c || b === 0x00;
  for (let at = buf.indexOf('/Length', from); at >= 0 && at + 7 < to; at = buf.indexOf('/Length', at + 7)) {
    let i = at + 7;
    if (!isWs(buf[i])) continue; // "/LengthX" — a different key
    while (i < to && isWs(buf[i])) i++;
    const numStart = i;
    while (i < to && isDigit(buf[i])) i++;
    if (i === numStart) continue;
    const value = Number(buf.toString('latin1', numStart, i));
    // Distinguish a direct number from an indirect reference "N G R".
    let j = i;
    while (j < to && isWs(buf[j])) j++;
    const genStart = j;
    while (j < to && isDigit(buf[j])) j++;
    if (j > genStart) {
      while (j < to && isWs(buf[j])) j++;
      if (buf[j] === 0x52) continue; // "R" → indirect, can't resolve cheaply
    }
    return Number.isSafeInteger(value) ? value : null;
  }
  return null;
}

/** Keyword match at `i` (ASCII). */
function matchAt(buf: Buffer, i: number, kw: string): boolean {
  if (i + kw.length > buf.length) return false;
  for (let k = 0; k < kw.length; k++) if (buf[i + k] !== kw.charCodeAt(k)) return false;
  return true;
}

/**
 * Printable bytes pdf-lib would crawl through in the gap [from, to), with the structures it
 * parses properly removed: xref tables, trailer dicts, startxref, %%EOF, comments, whitespace.
 */
function gapJunk(buf: Buffer, from: number, to: number): number {
  const isDigit = (b: number) => b >= 0x30 && b <= 0x39;
  const isWs = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09 || b === 0x0c || b === 0x00;
  const skipWs = (i: number) => { while (i < end && isWs(buf[i])) i++; return i; };
  const skipInt = (i: number) => { const s = i; while (i < end && isDigit(buf[i])) i++; return i > s ? i : -1; };

  let junk = 0;
  let i = Math.max(from, 0);
  const end = Math.min(to, buf.length);
  while (i < end && junk <= MAX_JUNK_BYTES) {
    const b = buf[i];
    if (isWs(b)) { i++; continue; }
    if (b === 0x25) { // '%' comment (covers "%%EOF") → to end of line
      while (i < end && buf[i] !== 0x0a && buf[i] !== 0x0d) i++;
      continue;
    }
    if (matchAt(buf, i, 'startxref')) { // 'startxref' N
      const n = skipInt(skipWs(i + 9));
      i = n < 0 ? i + 9 : n;
      continue;
    }
    if (matchAt(buf, i, 'xref')) { // classic cross-reference table
      i = skipXrefTable(buf, i + 4, end, skipWs, skipInt);
      continue;
    }
    if (matchAt(buf, i, 'trailer')) { // 'trailer' <<…>>
      const j = skipWs(i + 7);
      i = buf[j] === 0x3c && buf[j + 1] === 0x3c ? skipDict(buf, j, end) : i + 7;
      continue;
    }
    if (b < 0x7f) junk++; // a printable byte with no structural meaning → pdf-lib crawls it
    i++;
  }
  return junk;
}

/** Skip a classic xref table's subsections ("start count" headers + 20-byte-ish entries). */
function skipXrefTable(
  buf: Buffer,
  from: number,
  end: number,
  skipWs: (i: number) => number,
  skipInt: (i: number) => number,
): number {
  let i = from;
  for (;;) {
    let j = skipWs(i);
    const afterStart = skipInt(j);
    if (afterStart < 0) break; // not a "start count" header → table done
    j = skipWs(afterStart);
    const afterCountPos = skipInt(j);
    if (afterCountPos < 0) break;
    const count = Number(buf.toString('latin1', skipWs(afterStart), afterCountPos));
    i = afterCountPos;
    if (!Number.isSafeInteger(count) || count < 0) break;
    for (let e = 0; e < count; e++) {
      // each entry: offset gen (n|f) — read as tokens, tolerant of whitespace variations
      let k = skipWs(i);
      const a = skipInt(k);
      if (a < 0) return i;
      k = skipWs(a);
      const b = skipInt(k);
      if (b < 0) return i;
      k = skipWs(b);
      if (buf[k] !== 0x6e && buf[k] !== 0x66) return i; // not 'n'/'f' → stop, count the rest
      i = k + 1;
    }
  }
  return i;
}

/** Skip a balanced "<<…>>" dictionary starting at `at`; returns the offset just past it. */
function skipDict(buf: Buffer, at: number, end: number): number {
  let depth = 0;
  let i = at;
  while (i < end) {
    if (buf[i] === 0x3c && buf[i + 1] === 0x3c) { depth++; i += 2; continue; }
    if (buf[i] === 0x3e && buf[i + 1] === 0x3e) { depth--; i += 2; if (depth === 0) return i; continue; }
    i++;
  }
  return end;
}

class OutOfTime extends Error {}

/**
 * Settle with `work`, or reject with OutOfTime at the deadline. pdf-lib can't be cancelled, so
 * abandoned work finishes in the background — but the upload gets its answer in time.
 */
async function beforeDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new OutOfTime()), Math.max(0, deadline - Date.now()));
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

type ImagePlan = {
  width: number;
  height: number;
  channels: 1 | 3;
  filter: 'DCT' | 'Flate';
  /** 1 = none, 10–15 = PNG row filters (Flate only). */
  predictor: number;
};

/**
 * Re-encode the big raster images inside a PDF, in place. Returns false if the
 * deadline passed before every candidate was looked at.
 */
async function shrinkImages(ctx: PDFContext, deadline: number): Promise<boolean> {
  const objects = ctx.enumerateIndirectObjects();

  // Soft masks are alpha channels for another image: JPEG artefacts there show
  // up as halos, so they're left exactly as they are.
  const softMasks = new Set<string>();
  for (const [, obj] of objects) {
    const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    const smask = dict?.get(N.SMask);
    if (smask instanceof PDFRef) softMasks.add(String(smask));
  }

  for (const [ref, obj] of objects) {
    if (!(obj instanceof PDFRawStream) || softMasks.has(String(ref))) continue;
    let plan: ImagePlan | null = null;
    try {
      plan = planImage(ctx, obj);
    } catch {
      plan = null;
    }
    if (!plan) continue;
    if (Date.now() > deadline) return false;
    try {
      await shrinkImage(ctx, ref, obj, plan);
    } catch {
      // A bad image just stays as it was.
    }
  }
  return true;
}

/** Decide whether we know how to decode this stream safely. Null = leave it alone. */
function planImage(ctx: PDFContext, stream: PDFRawStream): ImagePlan | null {
  const d = stream.dict;
  if (ctx.lookup(d.get(N.Subtype)) !== N.Image) return null;
  if (stream.contents.length < MIN_IMAGE_BYTES) return null;
  // Stencil masks, inverted/remapped samples and colour-key masks all change what
  // the samples mean; re-encoding those risks changing how the page looks.
  if (d.has(N.ImageMask) || d.has(N.Decode)) return null;
  if (ctx.lookup(d.get(N.Mask)) instanceof PDFArray) return null;
  // A soft mask with /Matte must match the image's exact size, so we can't resize.
  const smask = ctx.lookup(d.get(N.SMask));
  if (smask instanceof PDFStream && smask.dict.has(N.Matte)) return null;

  if (num(ctx, d.get(N.BitsPerComponent)) !== 8) return null;
  const width = num(ctx, d.get(N.Width));
  const height = num(ctx, d.get(N.Height));
  if (!isDimension(width) || !isDimension(height)) return null;
  const channels = colourChannels(ctx, d.get(N.ColorSpace));
  if (!channels) return null;
  if (width * height * channels > MAX_RAW_BYTES) return null;

  const filter = singleFilter(ctx, d.get(N.Filter));
  if (!filter) return null;
  const parms = decodeParms(ctx, d.get(N.DecodeParms));
  if (parms === 'unsupported') return null;

  let predictor = 1;
  if (filter === 'DCT') {
    // An explicit ColorTransform overrides how the JPEG's colours are read; not worth the risk.
    if (parms?.has(N.ColorTransform)) return null;
  } else if (parms) {
    predictor = num(ctx, parms.get(N.Predictor)) ?? 1;
    if (predictor >= 10 && predictor <= 15) {
      // PNG predictors: the row layout must describe exactly this image.
      const colors = num(ctx, parms.get(N.Colors)) ?? 1;
      const bpc = num(ctx, parms.get(N.BitsPerComponent)) ?? 8;
      const columns = num(ctx, parms.get(N.Columns)) ?? 1;
      if (colors !== channels || bpc !== 8 || columns !== width) return null;
    } else if (predictor !== 1) {
      return null; // TIFF predictor 2 and anything unknown
    }
  }
  return { width, height, channels, filter, predictor };
}

async function shrinkImage(ctx: PDFContext, ref: PDFRef, stream: PDFRawStream, plan: ImagePlan): Promise<void> {
  let image: sharp.Sharp;
  if (plan.filter === 'DCT') {
    const jpeg = asBuffer(stream.contents);
    // The JPEG itself must agree with the PDF's description of it (no CMYK in disguise).
    const meta = await sharp(jpeg).metadata();
    if (meta.width !== plan.width || meta.height !== plan.height || meta.channels !== plan.channels) return;
    // The PDF's /ColorSpace — not the JPEG's own ICC profile — governs how these samples are
    // shown, so ignore the embedded profile. (A Display-P3 tag would otherwise shift every
    // colour on re-encode: measured MAD 7.5, max 82.) Photo uploads still convert to sRGB.
    image = sharp(jpeg, { failOn: 'error', ignoreIcc: true });
  } else {
    const raw = inflateImage(stream.contents, plan);
    if (!raw) return;
    image = sharp(raw, { raw: { width: plan.width, height: plan.height, channels: plan.channels } });
  }

  if (Math.max(plan.width, plan.height) > MAX_EDGE) image = image.resize(MAX_EDGE, MAX_EDGE, { fit: 'inside' });
  image = plan.channels === 1 ? image.grayscale().toColourspace('b-w') : image.toColourspace('srgb');
  const { data, info } = await image.jpeg(JPEG_OPTIONS).toBuffer({ resolveWithObject: true });

  if (data.length >= stream.contents.length * WORTHWHILE) return;
  if (info.channels !== plan.channels) return;

  // Same dictionary (keeps /SMask, /Intent, /Interpolate…), new pixels.
  const d = stream.dict;
  d.set(N.Filter, N.DCTDecode);
  d.delete(N.DecodeParms);
  d.delete(N.DL);
  d.set(N.Width, PDFNumber.of(info.width));
  d.set(N.Height, PDFNumber.of(info.height));
  d.set(N.ColorSpace, plan.channels === 1 ? N.DeviceGray : N.DeviceRGB);
  d.set(N.BitsPerComponent, PDFNumber.of(8));
  ctx.assign(ref, PDFRawStream.of(d, data)); // /Length is rewritten on save
}

/** Inflate a Flate image and undo any PNG row filters. Null if it doesn't add up. */
function inflateImage(contents: Uint8Array, plan: ImagePlan): Buffer | null {
  const rowBytes = plan.width * plan.channels;
  const filtered = plan.predictor >= 10;
  const expected = (filtered ? rowBytes + 1 : rowBytes) * plan.height;
  // Sync flush tolerates a missing end-of-stream marker; the output cap stops a zip bomb.
  const raw = inflateSync(contents, {
    finishFlush: zlibConstants.Z_SYNC_FLUSH,
    maxOutputLength: Math.ceil(expected * 1.1) + 4096,
  });
  if (raw.length < expected) return null;
  return filtered ? unfilterPngRows(raw, rowBytes, plan.height, plan.channels) : raw.subarray(0, expected);
}

/** Reverse PNG row filtering (None/Sub/Up/Average/Paeth). `bpp` = bytes per pixel. */
function unfilterPngRows(src: Uint8Array, rowBytes: number, rows: number, bpp: number): Buffer | null {
  const out = Buffer.alloc(rowBytes * rows);
  for (let y = 0; y < rows; y++) {
    const type = src[y * (rowBytes + 1)];
    const s = y * (rowBytes + 1) + 1; // first data byte of this row in the input
    const o = y * rowBytes; // first byte of this row in the output
    const p = o - rowBytes; // previous output row (only read when y > 0)
    switch (type) {
      case 0:
        out.set(src.subarray(s, s + rowBytes), o);
        break;
      case 1:
        for (let x = 0; x < rowBytes; x++) out[o + x] = src[s + x] + (x >= bpp ? out[o + x - bpp] : 0);
        break;
      case 2:
        for (let x = 0; x < rowBytes; x++) out[o + x] = src[s + x] + (y > 0 ? out[p + x] : 0);
        break;
      case 3:
        for (let x = 0; x < rowBytes; x++) {
          const left = x >= bpp ? out[o + x - bpp] : 0;
          const up = y > 0 ? out[p + x] : 0;
          out[o + x] = src[s + x] + ((left + up) >> 1);
        }
        break;
      case 4:
        for (let x = 0; x < rowBytes; x++) {
          const left = x >= bpp ? out[o + x - bpp] : 0;
          const up = y > 0 ? out[p + x] : 0;
          const upLeft = y > 0 && x >= bpp ? out[p + x - bpp] : 0;
          out[o + x] = src[s + x] + paeth(left, up, upLeft);
        }
        break;
      default:
        return null; // corrupt row
    }
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// ---------- reading PDF dictionaries ----------

const N = {
  Subtype: PDFName.of('Subtype'),
  Image: PDFName.of('Image'),
  ImageMask: PDFName.of('ImageMask'),
  Decode: PDFName.of('Decode'),
  Mask: PDFName.of('Mask'),
  SMask: PDFName.of('SMask'),
  Matte: PDFName.of('Matte'),
  BitsPerComponent: PDFName.of('BitsPerComponent'),
  Width: PDFName.of('Width'),
  Height: PDFName.of('Height'),
  ColorSpace: PDFName.of('ColorSpace'),
  DeviceRGB: PDFName.of('DeviceRGB'),
  DeviceGray: PDFName.of('DeviceGray'),
  ICCBased: PDFName.of('ICCBased'),
  N: PDFName.of('N'),
  Filter: PDFName.of('Filter'),
  DCTDecode: PDFName.of('DCTDecode'),
  FlateDecode: PDFName.of('FlateDecode'),
  DecodeParms: PDFName.of('DecodeParms'),
  DL: PDFName.of('DL'),
  ColorTransform: PDFName.of('ColorTransform'),
  Predictor: PDFName.of('Predictor'),
  ByteRange: PDFName.of('ByteRange'),
  Colors: PDFName.of('Colors'),
  Columns: PDFName.of('Columns'),
  Pages: PDFName.of('Pages'),
  Kids: PDFName.of('Kids'),
};

function num(ctx: PDFContext, v: PDFObject | undefined): number | undefined {
  const r = ctx.lookup(v);
  return r instanceof PDFNumber ? r.asNumber() : undefined;
}

function isDimension(n: number | undefined): n is number {
  return n !== undefined && Number.isInteger(n) && n > 0 && n <= 65535;
}

/** 3 for RGB, 1 for grey (device or ICC-based); null for anything else (CMYK, Indexed, Lab…). */
function colourChannels(ctx: PDFContext, v: PDFObject | undefined): 1 | 3 | null {
  const cs = ctx.lookup(v);
  if (cs === N.DeviceRGB) return 3;
  if (cs === N.DeviceGray) return 1;
  if (cs instanceof PDFArray && cs.size() === 2 && ctx.lookup(cs.get(0)) === N.ICCBased) {
    const profile = ctx.lookup(cs.get(1));
    const n = profile instanceof PDFStream ? num(ctx, profile.dict.get(N.N)) : undefined;
    if (n === 1 || n === 3) return n;
  }
  return null;
}

/** DCT or Flate, on their own (a one-element array counts); anything else → null. */
function singleFilter(ctx: PDFContext, v: PDFObject | undefined): 'DCT' | 'Flate' | null {
  let f = ctx.lookup(v);
  if (f instanceof PDFArray) f = f.size() === 1 ? ctx.lookup(f.get(0)) : undefined;
  if (f === N.DCTDecode) return 'DCT';
  if (f === N.FlateDecode) return 'Flate';
  return null;
}

/** The single filter's parameters: a dict, undefined (none), or 'unsupported'. */
function decodeParms(ctx: PDFContext, v: PDFObject | undefined): PDFDict | undefined | 'unsupported' {
  let p = ctx.lookup(v);
  if (p instanceof PDFArray) p = p.size() === 1 ? ctx.lookup(p.get(0)) : undefined;
  if (p === undefined || p === PDFNull) return undefined;
  return p instanceof PDFDict ? p : 'unsupported';
}

// ---------- small helpers ----------

/** PDF readers accept up to 1 KB of junk before the header; anything else isn't a PDF. */
function looksLikePdf(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.length, 1024));
  return head.includes('%PDF-');
}

/** A Buffer view over the same memory (no copy). */
function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function shortName(name: string): string {
  const n = String(name || 'file').trim() || 'file';
  return n.length > 60 ? `${n.slice(0, 57)}…` : n;
}

/** "1 PDF + 2 photos", "3 photos", "Photo". */
function describeInputs(inputs: EngineInput[]): string {
  const pdfs = inputs.filter((f) => f.mime === PDF_MIME).length;
  const photos = inputs.length - pdfs;
  if (inputs.length === 1) return pdfs ? 'PDF' : 'Photo';
  const parts: string[] = [];
  if (pdfs) parts.push(`${pdfs} ${pdfs === 1 ? 'PDF' : 'PDFs'}`);
  if (photos) parts.push(`${photos} ${photos === 1 ? 'photo' : 'photos'}`);
  return parts.join(' + ');
}

/** "612 KB", "7.9 MB". */
function formatSize(bytes: number): string {
  if (bytes >= 1000 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
