'use client';

import { siteFetch, type Outcome } from './client';
import { changed, flushDraft, getDraft, putRec, updatePack, type OutboxRecord } from './offline';
import type { SignoffReply } from './pack-shared';
import { downloadPack } from './packs';
import { registerSender, drainSoon } from './sync';
import type { Stage } from './types';

/**
 * Signing off on the phone (P10). The sign-off is a real sign-off the moment it's made, with or
 * without signal: it goes on the outbox behind the answers, and the sync sends it last, once every
 * photo for the job is up (sync.ts, the 'signoff' sender). Its op_id makes a retry find the same
 * sign-off and the same PO.
 */
export type SignoffPayload = { stage: Stage; name: string; signature: string; declaration: string; signed_at: string; rev: number };

export async function queueSignoff(assignmentId: string, p: Omit<SignoffPayload, 'signed_at' | 'rev'>): Promise<string> {
  // Every answer typed so far goes first.
  await flushDraft(assignmentId);
  const d = await getDraft(assignmentId);
  const op: OutboxRecord = {
    op_id: crypto.randomUUID(),
    assignmentId,
    kind: 'signoff',
    payload: { ...p, signed_at: new Date().toISOString(), rev: d.baseRev } satisfies SignoffPayload,
    createdAt: new Date().toISOString(),
    tries: 0,
  };
  // Signing again after the server turned it down: the old list goes.
  await updatePack(assignmentId, (r) => ({ ...r, gate: undefined }));
  await putRec('outbox', op);
  changed();
  drainSoon(0);
  return op.op_id;
}

/** The reply onto the phone's copy: the sign-off, the status and the PO, so the done screen shows them. */
async function applyReply(id: string, r: SignoffReply) {
  await updatePack(id, (p) => ({
    ...p,
    gate: undefined,
    poGoesAt: r.goes_at,
    pack: {
      ...p.pack,
      po: r.po ?? p.pack.po,
      assignment: {
        ...p.pack.assignment,
        status: r.status,
        signoffs: [...p.pack.assignment.signoffs.filter((s) => s.stage !== r.signoff.stage), { stage: r.signoff.stage, signed_at: r.signoff.signed_at, signed_name: r.signoff.signed_name }],
      },
    },
  }));
}

const PO_SETTLE_MS = 8000;

registerSender('signoff', {
  rank: 100,
  afterPhotos: true,
  async send(op) {
    const p = op.payload as SignoffPayload;
    const r = await siteFetch<SignoffReply>(`/api/site/jobs/${op.assignmentId}/signoff`, { body: { op_id: op.op_id, ...p }, job: op.assignmentId, timeoutMs: 40_000 });
    if (r.ok) {
      await applyReply(op.assignmentId, r.data);
      // The PO is issued just after the reply: a fresh pack a few seconds on brings it, and its PDF.
      if (r.data.po_next === 'sending') setTimeout(() => void downloadPack(op.assignmentId), PO_SETTLE_MS);
      return r;
    }
    // Turned down by the server's gate (something it hasn't got): the form opens again with the list,
    // and this sign-off is done with. Reopened by the office: the same, with nothing listed.
    if (r.kind === 'error' && (r.data.error === 'gate' || r.data.error === 'reopened')) {
      const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
      const missing = list(r.data.missing).map((m) => ({ label: String(m.label ?? ''), key: String(m.key ?? ''), step: String(m.step ?? '') }));
      const stops = list(r.data.stops).map((f) => ({ label: String(f.text ?? ''), key: String(f.key ?? ''), step: '' }));
      await updatePack(op.assignmentId, (x) => ({ ...x, gate: { stage: p.stage, message: r.message, missing: [...stops, ...missing], at: new Date().toISOString() } }));
      return { ok: true, status: r.status, data: r.data } satisfies Outcome<unknown>;
    }
    return r;
  },
});
