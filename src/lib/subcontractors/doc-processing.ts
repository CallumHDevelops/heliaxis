import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOC_CATEGORIES, safeFileName } from './documents';
import { buildPdf, EngineError, type EngineInput } from './pdf-engine';
import { DOCS_BUCKET, logEvent } from './server';
import type { DocumentRow, OriginalFile } from './types';

/**
 * Turning uploads into one compact PDF (the engine is pdf-engine.ts).
 *
 * The browser puts each file straight into storage (signed upload URLs — Vercel caps request
 * bodies), then the server downloads them, builds the PDF, stores it beside them and records
 * it. What was uploaded is kept until the document is approved, so a bad conversion can
 * always be checked against it; approving deletes it (the approved PDF is the record).
 *
 * Every delete goes through removeUnreferenced(): a path another document still points at
 * is never removed, whatever the caller was told.
 */

export const MAX_FILES = 10;
const PDF = 'application/pdf';
const EXT: Record<string, string> = { [PDF]: 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

/** Identify a file by its magic bytes — the browser's declared type can't be trusted. */
export function sniffType(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 5) === '%PDF-') return PDF;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) return 'image/heic';
  return null;
}

/** The stored-file fields of a document row. */
export type StoredFile = Pick<
  DocumentRow,
  'storage_path' | 'file_name' | 'mime' | 'size_bytes' | 'original_files' | 'original_bytes' | 'processed_at' | 'processing_note'
>;

const baseName = (name: string) => (name.lastIndexOf('.') > 0 ? name.slice(0, name.lastIndexOf('.')) : name).trim() || 'document';
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
/** The name a file is shown / downloaded as, with the extension its bytes actually are. */
const nameFor = (name: string, mime: string) => `${baseName(name)}.${EXT[mime] ?? 'bin'}`;

async function download(path: string) {
  const { data, error } = await createAdminClient().storage.from(DOCS_BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function storePdf(folder: string, name: string, bytes: Uint8Array) {
  const path = `${folder}/${Date.now()}-${safeFileName(`${baseName(name)}.pdf`)}`;
  const { error } = await createAdminClient().storage.from(DOCS_BUCKET).upload(path, bytes, { contentType: PDF, upsert: false });
  return error ? null : path;
}

/** Only for files nothing can point at yet (a PDF we just stored and failed to record). */
async function removeNew(paths: string[]) {
  if (paths.length) await createAdminClient().storage.from(DOCS_BUCKET).remove(paths);
}

/**
 * Every storage path this firm's documents point at (file + originals), optionally ignoring
 * one document (the one being deleted). null if it couldn't be worked out — then nothing
 * may be deleted. '*' so it works before supabase/portal-v4.sql (no original_files yet).
 */
export async function pathsInUse(subId: string, exceptDocId?: string): Promise<Set<string> | null> {
  const { data, error } = await createAdminClient().from('subcontractor_documents').select('*').eq('subcontractor_id', subId);
  if (error) return null;
  const set = new Set<string>();
  for (const d of (data ?? []) as DocumentRow[]) {
    if (d.id === exceptDocId) continue;
    set.add(d.storage_path);
    for (const o of d.original_files ?? []) set.add(o.path);
  }
  return set;
}

/** Delete files in this firm's folder that no (other) document points at. */
export async function removeUnreferenced(subId: string, paths: (string | null | undefined)[], exceptDocId?: string) {
  const list = paths.filter((p): p is string => !!p && p.startsWith(`${subId}/`));
  if (!list.length) return;
  const inUse = await pathsInUse(subId, exceptDocId);
  if (!inUse) return;
  const orphans = [...new Set(list)].filter((p) => !inUse.has(p));
  if (orphans.length) await createAdminClient().storage.from(DOCS_BUCKET).remove(orphans);
}

/**
 * New upload: `files` are fresh uploads in the firm's folder that no document points at (the
 * route checks). Returns what to record, or a message for the firm; on failure nothing it
 * uploaded is left behind. `deadlineMs` is when the conversion must give up (the request
 * started earlier — downloads count too).
 */
export async function processUpload(
  files: { path: string; name: string; size: number }[],
  opts: { deadlineMs: number }
): Promise<{ ok: true; stored: StoredFile } | { ok: false; error: string; status?: number }> {
  const fail = async (error: string, status = 400) => {
    await removeNew(files.map((f) => f.path));
    return { ok: false as const, error, status };
  };
  if (!files.length || files.length > MAX_FILES) return fail(`Upload between 1 and ${MAX_FILES} files at a time.`);

  const inputs: (EngineInput & { path: string; size: number })[] = [];
  for (const f of files) {
    const bytes = await download(f.path);
    if (!bytes) return fail('An upload did not complete — please try again.');
    const mime = sniffType(bytes.subarray(0, 16));
    if (!mime) return fail(`${f.name} is not a PDF or a photo. Please upload PDFs, JPGs, PNGs, WebP or HEIC.`);
    inputs.push({ bytes, mime, name: nameFor(f.name, mime), path: f.path, size: bytes.length });
  }
  const originals: OriginalFile[] = inputs.map((i) => ({ path: i.path, name: i.name, mime: i.mime, size: i.size }));
  const now = new Date().toISOString();
  const asUploaded = (note: string): StoredFile => ({
    storage_path: inputs[0].path,
    file_name: inputs[0].name,
    mime: inputs[0].mime,
    size_bytes: inputs[0].size,
    original_files: null,
    original_bytes: inputs[0].size,
    processed_at: now,
    processing_note: note,
  });

  let stored: string | null = null;
  try {
    const r = await buildPdf(
      inputs.map(({ bytes, mime, name }) => ({ bytes, mime, name })),
      { deadlineMs: opts.deadlineMs }
    );
    if (r.keptOriginal) return { ok: true, stored: asUploaded(r.note) };
    stored = await storePdf(folderOf(inputs[0].path), inputs[0].name, r.bytes);
    if (!stored) throw new Error('could not store the PDF');
    return {
      ok: true,
      stored: {
        storage_path: stored,
        file_name: `${baseName(inputs[0].name)}.pdf`,
        mime: PDF,
        size_bytes: r.outputBytes,
        original_files: originals,
        original_bytes: r.inputBytes,
        processed_at: now,
        processing_note: r.note,
      },
    };
  } catch (e) {
    if (stored) await removeNew([stored]);
    // One file that couldn't be converted is still worth keeping as it came; several can't be one document.
    if (inputs.length === 1) return { ok: true, stored: asUploaded('Kept as uploaded (couldn’t convert)') };
    if (e instanceof EngineError) return fail(e.message);
    console.error('[doc-processing] build failed', e);
    return fail('Those files could not be combined — please upload them one at a time.', 500);
  }
}

export type OptimiseOutcome = { outcome: 'converted' | 'kept' | 'retry'; saved: number; note: string };

/**
 * An existing document (uploaded before conversion existed): convert / compress its file in
 * place. Approved documents lose the old file at once (approval already happened); others
 * keep it as the original until they're approved. Approved documents RAMS has already pulled
 * are left alone — the pull ledger fingerprints those exact bytes.
 * `fullBudget` false = it was given less than the engine's full time, so running out of time
 * means "try again next batch", not "can't be compressed".
 */
export async function optimiseStoredDocument(
  doc: DocumentRow,
  opts: { deadlineMs: number; fullBudget: boolean; actor: string }
): Promise<OptimiseOutcome> {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const keep = async (note: string): Promise<OptimiseOutcome> => {
    await db.from('subcontractor_documents').update({ processed_at: now, processing_note: note }).eq('id', doc.id).is('processed_at', null);
    return { outcome: 'kept', saved: 0, note };
  };
  const retry = (note: string): OptimiseOutcome => ({ outcome: 'retry', saved: 0, note });

  if (doc.status === 'approved') {
    const { count, error } = await db
      .from('subcontractor_document_pulls')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', doc.id);
    if (error) return retry('Could not check RAMS pulls');
    if (count) return keep('Kept as uploaded (already sent to RAMS)');
  }

  const bytes = await download(doc.storage_path);
  if (!bytes) return keep('File missing from storage');
  const mime = sniffType(bytes.subarray(0, 16));
  if (!mime) return keep('Kept as uploaded (unrecognised file)');

  let r;
  try {
    r = await buildPdf([{ bytes, mime, name: doc.file_name }], { deadlineMs: opts.deadlineMs });
  } catch {
    return opts.fullBudget ? keep('Kept as uploaded (couldn’t convert)') : retry('Out of time this batch');
  }
  if (r.keptOriginal) return !opts.fullBudget && /ran out of time/.test(r.note) ? retry('Out of time this batch') : keep(r.note);

  const path = await storePdf(folderOf(doc.storage_path), doc.file_name, r.bytes);
  if (!path) return retry('Could not store the PDF');
  const approved = doc.status === 'approved';
  const newName = `${baseName(doc.file_name)}.pdf`;
  // Only swap if nobody changed the file or its review status meanwhile (approving / resetting
  // decides whether the old file is kept as the original).
  const { data: updated } = await db
    .from('subcontractor_documents')
    .update({
      storage_path: path,
      file_name: newName,
      mime: PDF,
      size_bytes: r.outputBytes,
      original_files: approved ? null : [{ path: doc.storage_path, name: nameFor(doc.file_name, mime), mime, size: bytes.length }],
      original_bytes: r.inputBytes,
      processed_at: now,
      processing_note: r.note,
    })
    .eq('id', doc.id)
    .eq('storage_path', doc.storage_path)
    .eq('status', doc.status)
    .select('id');
  if (!updated?.length) {
    await removeNew([path]);
    return retry('Changed while processing');
  }
  if (approved) await removeUnreferenced(doc.subcontractor_id, [doc.storage_path]);
  await logEvent(doc.subcontractor_id, opts.actor, 'document_converted', {
    file: newName,
    from: doc.file_name,
    status: doc.status,
    note: r.note,
  });
  return { outcome: 'converted', saved: Math.max(0, bytes.length - r.outputBytes), note: r.note };
}

/** Approved: the PDF is the record, so what was originally uploaded goes. */
export async function discardOriginals(doc: Pick<DocumentRow, 'id' | 'subcontractor_id' | 'storage_path' | 'original_files'>) {
  if (!doc.original_files) return;
  const { error } = await createAdminClient().from('subcontractor_documents').update({ original_files: null }).eq('id', doc.id);
  if (error) return;
  await removeUnreferenced(
    doc.subcontractor_id,
    doc.original_files.map((o) => o.path).filter((p) => p !== doc.storage_path)
  );
}

/** Every storage object a document owns (its file and any originals) — for deleting it. */
export function documentPaths(doc: Pick<DocumentRow, 'storage_path' | 'original_files'>) {
  return [doc.storage_path, ...(doc.original_files ?? []).map((o) => o.path)].filter((p, i, a) => !!p && a.indexOf(p) === i);
}

/**
 * Daily backstop: files in firms' document folders that no document points at and that are
 * over a day old — uploads abandoned part-way (lost signal, a killed request). Mostly ID and
 * card photos, so they shouldn't linger. Bounded by `budgetMs`.
 */
export async function sweepOrphanFiles(budgetMs = 15_000) {
  const started = Date.now();
  const db = createAdminClient();
  const { data: subs, error } = await db.from('subcontractors').select('id');
  if (error) throw new Error(error.message);
  const cutoff = Date.now() - 86_400_000;
  let removed = 0;
  let checked = 0;
  for (const { id } of (subs ?? []) as { id: string }[]) {
    if (Date.now() - started > budgetMs) break;
    const inUse = await pathsInUse(id);
    if (!inUse) continue;
    for (const cat of DOC_CATEGORIES) {
      const { data: objects } = await db.storage.from(DOCS_BUCKET).list(`${id}/${cat.key}`, { limit: 1000 });
      const stale = (objects ?? [])
        .filter((o) => o.id && o.created_at && new Date(o.created_at).getTime() < cutoff)
        .map((o) => `${id}/${cat.key}/${o.name}`)
        .filter((p) => !inUse.has(p));
      checked += objects?.length ?? 0;
      if (stale.length) {
        await db.storage.from(DOCS_BUCKET).remove(stale);
        removed += stale.length;
      }
    }
  }
  return { checked, removed };
}
