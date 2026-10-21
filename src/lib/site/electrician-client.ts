'use client';

import { siteFetch, type Outcome } from './client';
import type { CustomerSignKind, TradeFile } from './electrician-shared';
import { byJob, changed, delRec, putRec, updatePack, type OutboxRecord } from './offline';
import { drainSoon, registerSender } from './sync';

/**
 * The electrician's outbox items (sync.ts registerSender), kept on the phone until the server has
 * them, like photos:
 *
 * - 'file': a certificate PDF from their scheme's software (the file itself is on the outbox), sent
 *   as prepare (a signed link) → straight to storage → save. Before the sign-off, which waits for it.
 * - 'file-delete': one taken off again.
 * - 'customer-sign': the customer's signature for one document (P15), after the sign-off.
 */

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const PDF = ['application/pdf'];

export type FilePayload = { client_id: string; slot: string; name: string; mime: string; size: number; blob: Blob };

/** A file picked for a slot: kept on the phone and queued to send. */
export async function queueFile(assignmentId: string, slot: string, file: File): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!PDF.includes(file.type)) return { ok: false, message: 'That isn’t a PDF. Take a photo of each page instead.' };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: 'That file is over 15 MB. Take a photo of each page instead.' };
  const payload: FilePayload = { client_id: crypto.randomUUID(), slot, name: file.name.slice(0, 120) || 'certificate.pdf', mime: file.type, size: file.size, blob: file };
  const op: OutboxRecord = { op_id: crypto.randomUUID(), assignmentId, kind: 'file', payload, createdAt: new Date().toISOString(), tries: 0 };
  await putRec('outbox', op);
  changed();
  drainSoon(0);
  return { ok: true };
}

/** Files waiting on this phone, by slot (they count for the gate from the moment they're picked). */
export async function waitingFiles(assignmentId: string): Promise<(FilePayload & { op_id: string; failed?: string })[]> {
  return (await byJob<OutboxRecord>('outbox', assignmentId)).filter((o) => o.kind === 'file').map((o) => ({ ...(o.payload as FilePayload), op_id: o.op_id, failed: o.failed }));
}

/** Take a file off: still on the phone, it just goes; on the server, its delete is queued. */
export async function removeFile(assignmentId: string, f: { op_id?: string; client_id: string | null; id?: string }) {
  if (f.op_id) await delRec('outbox', f.op_id);
  else if (f.client_id) {
    await putRec('outbox', { op_id: crypto.randomUUID(), assignmentId, kind: 'file-delete', payload: { client_id: f.client_id }, createdAt: new Date().toISOString(), tries: 0 } satisfies OutboxRecord);
    await updatePack(assignmentId, (p) => (p.pack.electrician ? { ...p, pack: { ...p.pack, electrician: { ...p.pack.electrician, uploads: p.pack.electrician.uploads.filter((u) => u.client_id !== f.client_id) } } } : p));
  }
  changed();
  drainSoon(0);
}

async function put(url: string, blob: Blob, mime: string): Promise<'ok' | 'offline' | 'error'> {
  try {
    const r = await fetch(url, { method: 'PUT', body: blob, headers: { 'content-type': mime, 'x-upsert': 'true' }, credentials: 'omit' });
    return r.ok ? 'ok' : 'error';
  } catch {
    return 'offline';
  }
}

registerSender('file', {
  rank: 15,
  async send(op) {
    const p = op.payload as FilePayload;
    const job = op.assignmentId;
    const meta = { client_id: p.client_id, slot: p.slot, name: p.name, mime: p.mime, size: p.size };
    // The link is null when the file has arrived already (the server never overwrites one).
    const prep = await siteFetch<{ url: string | null }>(`/api/site/jobs/${job}/files`, { body: { action: 'prepare', ...meta }, job });
    if (!prep.ok) return prep;
    const up = prep.data.url ? await put(prep.data.url, p.blob, p.mime) : 'ok';
    if (up !== 'ok') return up === 'offline' ? { ok: false, kind: 'offline' } : { ok: false, kind: 'error', status: 502, message: 'The file didn’t upload. It will try again.', data: {}, retry: true };
    const save = await siteFetch<{ file: TradeFile }>(`/api/site/jobs/${job}/files`, { body: { action: 'save', ...meta }, job });
    if (save.ok) {
      // On the server now: the pack's list carries it from here (so it still counts once it leaves the outbox).
      await updatePack(job, (x) =>
        x.pack.electrician ? { ...x, pack: { ...x.pack, electrician: { ...x.pack.electrician, uploads: [...x.pack.electrician.uploads.filter((u) => u.client_id !== p.client_id), save.data.file] } } } : x
      );
    }
    return save;
  },
});

registerSender('file-delete', {
  rank: 20,
  send: (op) => siteFetch(`/api/site/jobs/${op.assignmentId}/files`, { body: { action: 'delete', client_id: op.payload.client_id }, job: op.assignmentId }),
});

/* ── The customer's signatures (P15) ─────────────────────────────────────────── */

export type CustomerSignPayload = { kind: CustomerSignKind; name: string; signature: string; declaration: string; signed_at: string };

export async function queueCustomerSign(assignmentId: string, p: Omit<CustomerSignPayload, 'signed_at'>) {
  const op: OutboxRecord = { op_id: crypto.randomUUID(), assignmentId, kind: 'customer-sign', payload: { ...p, signed_at: new Date().toISOString() } satisfies CustomerSignPayload, createdAt: new Date().toISOString(), tries: 0 };
  await putRec('outbox', op);
  changed();
  drainSoon(0);
}

/** Signatures taken on this phone and not yet sent, by document. */
export async function waitingSigns(assignmentId: string): Promise<CustomerSignPayload[]> {
  return (await byJob<OutboxRecord>('outbox', assignmentId)).filter((o) => o.kind === 'customer-sign' && !o.failed).map((o) => o.payload as CustomerSignPayload);
}

registerSender('customer-sign', {
  // After the sign-off (100): the server keeps it with the electrician's sign-off.
  rank: 110,
  afterPhotos: true,
  async send(op) {
    const p = op.payload as CustomerSignPayload;
    const r: Outcome<{ kind: CustomerSignKind; name: string; signed_at: string }> = await siteFetch(`/api/site/jobs/${op.assignmentId}/customer-sign`, { body: { op_id: op.op_id, ...p }, job: op.assignmentId });
    if (r.ok) {
      await updatePack(op.assignmentId, (x) =>
        x.pack.electrician ? { ...x, pack: { ...x.pack, electrician: { ...x.pack.electrician, customer: { ...x.pack.electrician.customer, [r.data.kind]: { name: r.data.name, signed_at: r.data.signed_at } } } } } : x
      );
    }
    return r;
  },
});
