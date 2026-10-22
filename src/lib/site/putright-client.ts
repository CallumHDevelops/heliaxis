'use client';

import { siteFetch } from './client';
import { changed, clearDraftNotes, putRec, updatePack, type OutboxRecord } from './offline';
import type { ReturnView } from './review-shared';
import { drainSoon, registerSender } from './sync';

/**
 * A Put right on the phone, after a return to site: signed with or without signal, it goes on the
 * outbox and the sync sends it once every photo for the job is up (the photos of the fix first),
 * like a sign-off. The reply puts the return, now waiting for review, on the phone's copy. Turned
 * down (no photo of the fix reached the server, or the office has withdrawn it): the reason is kept
 * for the Put right screen and this one is done with.
 */
export type PutRightPayload = { n: number; note: string; name: string; signature: string; declaration: string; signed_at: string };

/** Where the Put right screen keeps what they did and their name while they type (the job's draft, offline.ts setDraftNote). */
export const putRightNoteKeys = (n: number) => ({ note: `put-right-${n}:note`, name: `put-right-${n}:name`, prefix: `put-right-${n}:` });

export async function queuePutRight(assignmentId: string, p: Omit<PutRightPayload, 'signed_at'>): Promise<string> {
  const op: OutboxRecord = {
    op_id: crypto.randomUUID(),
    assignmentId,
    kind: 'put-right',
    payload: { ...p, signed_at: new Date().toISOString() } satisfies PutRightPayload,
    createdAt: new Date().toISOString(),
    tries: 0,
  };
  await updatePack(assignmentId, (r) => ({ ...r, putRightGate: undefined }));
  await putRec('outbox', op);
  changed();
  drainSoon(0);
  return op.op_id;
}

registerSender('put-right', {
  rank: 100,
  afterPhotos: true,
  async send(op) {
    const p = op.payload as PutRightPayload;
    const r = await siteFetch<{ return: ReturnView }>(`/api/site/jobs/${op.assignmentId}/put-right`, { body: { op_id: op.op_id, ...p }, job: op.assignmentId, timeoutMs: 40_000 });
    if (r.ok) {
      const ret = r.data.return;
      await updatePack(op.assignmentId, (x) => ({ ...x, putRightGate: undefined, pack: { ...x.pack, returns: [...(x.pack.returns ?? []).filter((y) => y.id !== ret.id), ret].sort((a, b) => a.n - b.n) } }));
      // It's with Heliaxis: the words kept while typing go (until now a turned-down one could be signed again with them).
      await clearDraftNotes(op.assignmentId, putRightNoteKeys(p.n).prefix).catch(() => {});
      return r;
    }
    if (r.kind === 'error' && !r.retry) {
      await updatePack(op.assignmentId, (x) => ({ ...x, putRightGate: { n: p.n, message: r.message, at: new Date().toISOString() } }));
      return { ok: true, status: r.status, data: r.data };
    }
    return r;
  },
});
