import 'server-only';
import { handoverDocPrint, packPrint } from '@/lib/handover/server';
import { certificatePrint } from '@/lib/site/eic/server';
import { electricianDocPrint, photoRecordPrint } from '@/lib/site/electrician-docs';
import { labourPoPrint } from '@/lib/site/labour-po';
import { tradeReportPrint } from '@/lib/site/reports';
import type { Db } from '@/lib/site/server';
import { hasPrintVersion, printName } from './print-shared';
import type { Reprint, StoredRef } from './store';

/**
 * The print version of a stored generated document (print-shared.ts): made on request with the
 * kit's 'print' variant from exactly what the stored copy was made from (each maker checks its inputs
 * hash), never stored or sent. Every document the app makes: the labour PO, the trade reports, the
 * electrician's documents and photo record, the EIC and Minor Works sheets, the handover pack's own
 * documents and the combined pack.
 */

/** A stored document as the routes read it (crm_documents). */
export type PrintDoc = { id: string; project_id: string | null; name: string; generated_key: string | null; inputs_hash: string | null; created_at: string; source?: string | null };

export type PrintResult = { ok: true; bytes: Uint8Array; name: string } | { ok: false; status: 404 | 409; error: string };

export const NO_PRINT = 'There’s no print version of this document: open it as it is.';
export const PRINT_CHANGED = 'This document has changed since this copy was made, so there’s no print version of it yet. Make the document again, then print it.';

/** The print version of one stored document, by its generated key. */
async function reprint(db: Db, doc: PrintDoc): Promise<Reprint> {
  const key = doc.generated_key;
  if (!key || !doc.project_id || !hasPrintVersion(key)) return null;
  const ref: StoredRef = { projectId: doc.project_id, key, hash: doc.inputs_hash, madeAt: doc.created_at };
  if (key === 'PACK') return packPrint(db, ref, (row) => reprint(db, row));
  if (/^PO-\d+$/.test(key)) return labourPoPrint(db, ref);
  if (key === 'RF_REPORT' || key === 'SC_REPORT') return tradeReportPrint(db, ref);
  if (key === 'EP_RECORD') return photoRecordPrint(db, ref);
  if (/^(EIC|MEIWC)/.test(key)) return certificatePrint(db, ref);
  return (await electricianDocPrint(db, ref)) ?? handoverDocPrint(db, ref);
}

export async function printVersion(db: Db, doc: PrintDoc): Promise<PrintResult> {
  const r = await reprint(db, doc);
  if (r instanceof Uint8Array) return { ok: true, bytes: r, name: printName(doc.name) };
  return r === 'changed' ? { ok: false, status: 409, error: PRINT_CHANGED } : { ok: false, status: 404, error: NO_PRINT };
}

/** The print version as the browser gets it: the PDF to open (?download=1 to save it), or the reason in plain words. */
export function printResponse(r: PrintResult, download = false): Response {
  if (!r.ok) return new Response(r.error, { status: r.status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  return new Response(Buffer.from(r.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      // The name as it is for browsers that read filename*, in plain letters for the rest.
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${r.name.replace(/[^\x20-\x7e]/g, '-').replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(r.name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
